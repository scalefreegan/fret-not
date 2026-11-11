// A whole tutor turn, end to end, against a stand-in `claude` on PATH: the
// real handler, the real worktree/commit/fast-forward code, a throwaway git
// repo and temp data. No real CLI is spawned and nothing touches this repo's
// content/, data/ or git.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import http from "node:http";
import type { AddressInfo } from "node:net";
import os from "node:os";
import path from "node:path";
import { after, before, beforeEach, test } from "node:test";
import type { ChatMessage } from "../shared/wire.ts";
import { reapOnSignal } from "../../scripts/claude.mjs";
import { handleChat, recoverInterruptedTurn, tutorBusy } from "./chat.ts";
import { gitRoot, openWorkspace, STALE_MS, workspaceBase, writable } from "./turn.ts";
import { contentDir, loadContent, REPO_ROOT } from "./loader.ts";
import { HttpError, sendJson } from "./sse.ts";
import { dataDir, readHistory } from "./store.ts";

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "fret-not-run-"));
const repo = path.join(tmp, "repo");
const content = path.join(repo, "content");
const planFile = path.join(tmp, "plan.json");
const saved = { PATH: process.env.PATH, TMPDIR: process.env.TMPDIR, GIT_CONFIG_GLOBAL: process.env.GIT_CONFIG_GLOBAL, GIT_CONFIG_NOSYSTEM: process.env.GIT_CONFIG_NOSYSTEM };
let server: http.Server;
let base = "";

const CURRICULUM = `tracks:
  - { id: core, title: Core }
levels:
  - { id: 0, title: Zero }
concepts:
  - { id: alpha, title: Alpha, level: 0 }
  - { id: beta, title: Beta, level: 0 }
`;
const lesson = (id: string, concept: string, body = "Some prose.") => `---
id: ${id}
title: ${id}
track: core
level: 0
order: 1
concepts: [${concept}]
summary: About ${concept}.
---
${body}
`;
const ALPHA = "lessons/core/0-01-alpha.md";
const BETA = "lessons/core/0-02-beta.md";

/** One step per invocation of the stand-in CLI, in order. */
interface Step {
  /** Files the agent writes under content/ in ITS working directory (each
   *  is announced as a Write tool call in the stream first, as the real CLI
   *  does). */
  write?: Record<string, string>;
  /** Files the agent removes (announced as an Edit call on that path). */
  remove?: string[];
  /** Files the agent writes relative to its working directory's root — what
   *  the sandbox is there to refuse. */
  writeRoot?: Record<string, string>;
  /** Changes the OWNER makes in the real repository while the run is going
   *  (paths relative to the repository). */
  owner?: Record<string, string>;
  /** git commands the owner runs in the real repository meanwhile. */
  ownerGit?: string[][];
  /** Announce the tool calls but print the old single-envelope output. */
  legacyOutput?: boolean;
  reply?: string;
  exit?: number;
  stderr?: string;
  /** After writing, never exit: the test cancels the request. */
  hang?: boolean;
}
function plan(...steps: Step[]): void {
  fs.writeFileSync(planFile, JSON.stringify({ next: 0, steps, prompts: [], calls: [] }));
}
const promptsSeen = (): string[] => (JSON.parse(fs.readFileSync(planFile, "utf8")) as { prompts: string[] }).prompts;
/** Where each run of the stand-in was started, and with what arguments. */
const callsSeen = (): { cwd: string; argv: string[] }[] => (JSON.parse(fs.readFileSync(planFile, "utf8")) as { calls: { cwd: string; argv: string[] }[] }).calls;

const git = (...args: string[]) => execFileSync("git", args, { cwd: repo, encoding: "utf8" });
const read = (rel: string) => fs.readFileSync(path.join(content, rel), "utf8");
const write = (rel: string, text: string) => {
  fs.mkdirSync(path.dirname(path.join(content, rel)), { recursive: true });
  fs.writeFileSync(path.join(content, rel), text);
};
const commits = () => git("log", "--format=%s").trim().split("\n");
const lastCommitFiles = () => git("show", "--name-status", "--format=", "HEAD").trim().split("\n").sort();
const status = () => git("status", "--porcelain", "--untracked-files=all").trimEnd().split("\n").filter(Boolean).sort();

interface Event {
  event: string;
  data: Record<string, unknown>;
}
function parseSse(text: string): Event[] {
  return text
    .split("\n\n")
    .filter((b) => b.trim())
    .map((b) => {
      const event = /^event: (.*)$/m.exec(b)?.[1] ?? "";
      const data = JSON.parse(/^data: (.*)$/m.exec(b)?.[1] ?? "{}") as Record<string, unknown>;
      return { event, data };
    });
}
async function chat(message: string, context?: unknown): Promise<{ status: number; events: Event[] }> {
  const res = await fetch(`${base}/api/chat`, { method: "POST", body: JSON.stringify({ message, context }), headers: { "Content-Type": "application/json" }, signal: AbortSignal.timeout(20_000) });
  if (res.status !== 200) return { status: res.status, events: [] };
  return { status: 200, events: parseSse(await res.text()).filter((e) => e.event !== "heartbeat") };
}
const names = (events: Event[]) => events.map((e) => e.event);
const of = (events: Event[], name: string) => events.find((e) => e.event === name)?.data ?? {};
async function until(what: string, cond: () => boolean, ms = 10_000): Promise<void> {
  const end = Date.now() + ms;
  while (!cond()) {
    if (Date.now() > end) throw new Error(`timed out waiting for ${what}`);
    await new Promise((r) => setTimeout(r, 20));
  }
}

before(async () => {
  process.env.FRET_DATA_DIR = path.join(tmp, "data");
  process.env.FRET_CONTENT_DIR = content;
  process.env.FRET_REPO_ROOT = repo;
  // Preconditions, not tests: stop before anything can write to the real repo.
  for (const dir of [dataDir(), contentDir(), gitRoot()]) {
    if (!dir.startsWith(tmp + path.sep) || dir.startsWith(REPO_ROOT + path.sep)) throw new Error(`test isolation failed: ${dir}`);
  }

  // git reads no configuration but the test repository's own.
  fs.writeFileSync(path.join(tmp, "gitconfig"), "");
  process.env.GIT_CONFIG_GLOBAL = path.join(tmp, "gitconfig");
  process.env.GIT_CONFIG_NOSYSTEM = "1";

  // The stand-in CLI: reads its prompt from stdin, performs the next step of
  // the plan against content/ in ITS OWN working directory (the worktree, on
  // a turn that may write), prints the JSON envelope.
  const bin = path.join(tmp, "bin");
  fs.mkdirSync(bin);
  fs.mkdirSync(path.join(tmp, "tmp"));
  fs.writeFileSync(path.join(bin, "claude"), `#!${process.execPath}
const fs = require("node:fs"), path = require("node:path");
const chunks = [];
process.stdin.on("data", (c) => chunks.push(c));
process.stdin.on("end", () => {
  const planFile = ${JSON.stringify(planFile)};
  const plan = JSON.parse(fs.readFileSync(planFile, "utf8"));
  const step = plan.steps[plan.next] || { reply: "(no step planned)" };
  plan.next++;
  plan.prompts.push(Buffer.concat(chunks).toString("utf8"));
  plan.calls.push({ cwd: process.cwd(), argv: process.argv.slice(2) });
  fs.writeFileSync(planFile, JSON.stringify(plan));
  const dir = path.join(process.cwd(), "content");
  const realRepo = ${JSON.stringify(repo)};
  const line = (o) => fs.writeSync(1, JSON.stringify(o) + "\\n");
  const call = (name, rel) => line({ type: "assistant", message: { content: [{ type: "text", text: "working" }, { type: "tool_use", id: "t", name, input: { file_path: path.join(dir, rel) } }] } });
  line({ type: "system", subtype: "init" });
  for (const [rel, text] of Object.entries(step.write || {})) {
    call("Write", rel);
    fs.mkdirSync(path.dirname(path.join(dir, rel)), { recursive: true });
    fs.writeFileSync(path.join(dir, rel), text);
  }
  for (const rel of step.remove || []) { call("Edit", rel); fs.rmSync(path.join(dir, rel), { force: true }); }
  for (const [rel, text] of Object.entries(step.writeRoot || {})) { call("Write", path.join("..", rel)); fs.writeFileSync(path.join(process.cwd(), rel), text); }
  for (const [rel, text] of Object.entries(step.owner || {})) {
    fs.mkdirSync(path.dirname(path.join(realRepo, rel)), { recursive: true });
    fs.writeFileSync(path.join(realRepo, rel), text);
  }
  for (const args of step.ownerGit || []) require("node:child_process").execFileSync("git", args, { cwd: realRepo, stdio: "ignore" });
  if (step.hang) { fs.writeFileSync(planFile + ".hung", String(process.pid)); setInterval(() => {}, 1000); return; }
  if (step.stderr) process.stderr.write(step.stderr);
  if (step.exit) process.exit(step.exit);
  const envelope = { type: "result", subtype: "success", is_error: false, result: step.reply || "", total_cost_usd: 0.01, num_turns: 1 };
  if (step.legacyOutput) process.stdout.write(JSON.stringify(envelope));
  else line(envelope);
});
`, { mode: 0o755 });
  process.env.PATH = `${bin}${path.delimiter}${saved.PATH}`;
  process.env.TMPDIR = path.join(tmp, "tmp");

  server = http.createServer((req, res) => {
    req.url = (req.url ?? "/").replace(/^\/api\/chat/, "") || "/";
    Promise.resolve()
      .then(() => handleChat(req, res))
      .catch((e) => sendJson(res, e instanceof HttpError ? e.status : 500, { error: String((e as Error)?.message || e) }));
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

after(async () => {
  try {
    server?.closeAllConnections();
    await Promise.race([new Promise<void>((resolve) => (server ? server.close(() => resolve()) : resolve())), new Promise<void>((resolve) => setTimeout(resolve, 2000).unref())]);
  } finally {
    process.env.PATH = saved.PATH;
    for (const key of ["TMPDIR", "GIT_CONFIG_GLOBAL", "GIT_CONFIG_NOSYSTEM"] as const) {
      if (saved[key] === undefined) delete process.env[key];
      else process.env[key] = saved[key];
    }
    for (const key of ["FRET_DATA_DIR", "FRET_CONTENT_DIR", "FRET_REPO_ROOT"]) delete process.env[key];
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

// Every test starts from the same committed repo: two valid lessons.
beforeEach(() => {
  fs.rmSync(repo, { recursive: true, force: true });
  fs.rmSync(path.join(tmp, "data"), { recursive: true, force: true });
  fs.rmSync(`${planFile}.hung`, { force: true });
  fs.mkdirSync(repo, { recursive: true });
  git("init", "-q", "-b", "main");
  git("config", "user.email", "test@example.invalid");
  git("config", "user.name", "Test");
  git("config", "commit.gpgsign", "false");
  write("curriculum.yaml", CURRICULUM);
  write(ALPHA, lesson("core-0-alpha", "alpha"));
  write(BETA, lesson("core-0-beta", "beta"));
  fs.writeFileSync(path.join(repo, "app.txt"), "one\n");
  git("add", "-A");
  git("commit", "-q", "-m", "init");
  assert.deepEqual(loadContent().problems, []);
});

/** The owner's own work in progress inside content/: an edit to a tracked
 *  lesson and an untracked draft (which the loader refuses — it is a draft). */
function ownerWork(): { edited: string; draft: string } {
  const edited = lesson("core-0-beta", "beta", "The owner is half-way through rewriting this.");
  const draft = "not a lesson yet, just notes\n";
  write(BETA, edited);
  write("lessons/core/draft.md", draft);
  return { edited, draft };
}

/** Everything about the repository the tutor must not disturb, as one
 *  string: every file's bytes and mode outside .git, the index, every ref,
 *  HEAD, and what `git status` says. */
function fingerprint(): string {
  const files: string[] = [];
  const walk = (abs: string, rel: string) => {
    for (const e of fs.readdirSync(abs, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      if (!rel && e.name === ".git") continue;
      const r = rel ? `${rel}/${e.name}` : e.name;
      if (e.isSymbolicLink()) files.push(`${r} -> ${fs.readlinkSync(path.join(abs, e.name))}`);
      else if (e.isDirectory()) walk(path.join(abs, e.name), r);
      else files.push(`${r} ${fs.statSync(path.join(abs, e.name)).mode.toString(8)} ${fs.readFileSync(path.join(abs, e.name)).toString("base64")}`);
    }
  };
  walk(repo, "");
  const head = (() => {
    try {
      return git("rev-parse", "HEAD");
    } catch {
      return "(no commits)";
    }
  })();
  return [files.join("\n"), git("ls-files", "-s"), git("for-each-ref"), head, fs.readFileSync(path.join(repo, ".git", "HEAD"), "utf8"), status().join("\n")].join("\n--\n");
}
const refs = () => git("for-each-ref", "--format=%(refname)", "refs/tutor").trim().split("\n").filter(Boolean);
const worktrees = () => git("worktree", "list", "--porcelain").split("\n").filter((l) => l.startsWith("worktree ")).length;
/** Directories left in the tutor's own work area. */
const leftovers = () => fs.readdirSync(workspaceBase(repo));
const notes = () => readHistory().filter((m) => m.role === "note").map((m) => m.text);
const NEW = "lessons/core/0-03-more.md";
const addLesson: Step = { write: { [NEW]: lesson("core-0-more", "alpha") }, reply: "I wrote it.\n\nChanged: added lesson core-0-more." };
function nothingLeftBehind(): void {
  assert.deepEqual(leftovers(), [], "no worktree directory left");
  assert.equal(worktrees(), 1, "git knows of no extra worktree");
  assert.equal(tutorBusy(), false);
}

test("a clean content/: the turn's change is committed and fast-forwarded in; the owner's work elsewhere is untouched", async () => {
  // The normal state of this repository: uncommitted work outside content/,
  // modified, untracked, staged, and half-staged.
  fs.writeFileSync(path.join(repo, "app.txt"), "two\n");
  fs.writeFileSync(path.join(repo, "scratch.txt"), "untracked\n");
  fs.writeFileSync(path.join(repo, "staged.txt"), "staged line\n");
  git("add", "staged.txt");
  fs.writeFileSync(path.join(repo, "staged.txt"), "staged line\nunstaged line\n");
  const base = git("rev-parse", "HEAD").trim();

  plan(addLesson);
  const { status: code, events } = await chat("another lesson please", { page: "lesson", lesson: { id: "core-0-alpha", title: "Alpha", file: `content/${ALPHA}`, concepts: ["alpha"] } });
  assert.equal(code, 200);
  assert.deepEqual(names(events), ["start", "message", "commit", "done"]);
  assert.equal(of(events, "done").ok, true);
  assert.equal(of(events, "commit").summary, "added lesson core-0-more.");
  assert.equal(of(events, "commit").hash, git("rev-parse", "--short=7", "HEAD").trim());
  assert.deepEqual(commits(), ["agent: added lesson core-0-more.", "init"]);
  assert.equal(git("rev-parse", "HEAD~1").trim(), base);
  assert.equal(git("symbolic-ref", "HEAD").trim(), "refs/heads/main");
  assert.deepEqual(lastCommitFiles(), [`A\tcontent/${NEW}`]);
  assert.equal(read(NEW), lesson("core-0-more", "alpha"), "the working tree has the file");
  // The owner's own work is exactly as it was.
  assert.deepEqual(status(), [" M app.txt", "?? scratch.txt", "AM staged.txt"].sort());
  assert.equal(git("show", ":staged.txt"), "staged line\n", "what was staged is still what is staged");
  assert.equal(fs.readFileSync(path.join(repo, "app.txt"), "utf8"), "two\n");
  // The agent ran in a worktree outside the repository, scoped to its content/.
  const [call] = callsSeen();
  assert.ok(!call.cwd.startsWith(repo + path.sep) && call.cwd !== repo, call.cwd);
  assert.ok(call.argv.some((a) => a === `Write(/${path.join(call.cwd, "content")}/**)`), call.argv.join(" "));
  assert.match(promptsSeen()[0], /file content\/lessons\/core\/0-01-alpha\.md/);
  assert.match(promptsSeen()[0], /\[USER\]\nanother lesson please/);
  assert.deepEqual(readHistory().map((m) => m.role), ["user", "assistant", "commit"]);
  assert.deepEqual(refs(), [], "an applied commit needs no extra name");
  nothingLeftBehind();
});

test("a turn that changes nothing commits nothing", async () => {
  const was = fingerprint();
  plan({ reply: "An octave is a doubling of frequency." });
  const { events } = await chat("what is an octave?");
  assert.deepEqual(names(events), ["start", "message", "commit", "done"]);
  assert.deepEqual(of(events, "commit"), { skipped: true });
  assert.equal(fingerprint(), was);
  nothingLeftBehind();
});

test("uncommitted work in content/: the turn runs read-only in the repository, says why once, and changes nothing", async () => {
  ownerWork();
  git("add", BETA.replace(/^/, "content/")); // some of it staged, too
  const was = fingerprint();
  plan({ reply: "An octave is a doubling of frequency." }, { reply: "I can't write right now." });
  const first = await chat("what is an octave?");
  assert.deepEqual(names(first.events), ["start", "note", "message", "commit", "done"]);
  const note = String(of(first.events, "note").text);
  assert.match(note, /can answer questions right now but cannot write lessons, because content\/ has changes that are not committed \(content\/lessons\/core\/0-02-beta\.md, content\/lessons\/core\/draft\.md\)/);
  assert.match(note, /git add content && git commit[\s\S]*git stash -u -- content/);
  assert.deepEqual(of(first.events, "commit"), { skipped: true });
  const [call] = callsSeen();
  assert.equal(fs.realpathSync(call.cwd), fs.realpathSync(repo), "a read-only turn reads the working tree itself");
  assert.equal(call.argv[call.argv.indexOf("--tools") + 1], "Read,Glob,Grep");
  assert.ok(!call.argv.some((a) => /^(Edit|Write)\(/.test(a)), "nothing is granted for writing");
  assert.ok(call.argv.slice(call.argv.indexOf("--disallowedTools")).includes("Write"));
  assert.match(call.argv[call.argv.indexOf("--append-system-prompt") + 1], /THIS TURN IS READ-ONLY[\s\S]*not committed/);
  // Asked again straight away: the same note is not repeated.
  const second = await chat("then add a lesson");
  assert.deepEqual(names(second.events), ["start", "message", "commit", "done"]);
  assert.equal(notes().length, 1);
  assert.equal(fingerprint(), was, "byte for byte, index and refs included");
  nothingLeftBehind();
});

test("other states that make a turn read-only: detached HEAD, no commits, a merge in progress, a link, an ignored file", async () => {
  const readOnly = async (re: RegExp) => {
    const was = fingerprint();
    fs.rmSync(path.join(tmp, "data"), { recursive: true, force: true });
    plan({ reply: "Here." });
    const { events } = await chat("hello");
    assert.deepEqual(names(events), ["start", "note", "message", "commit", "done"], String(re));
    assert.match(String(of(events, "note").text), re);
    assert.equal(callsSeen()[0].argv[callsSeen()[0].argv.indexOf("--tools") + 1], "Read,Glob,Grep");
    assert.equal(fingerprint(), was);
    assert.equal(tutorBusy(), false);
  };
  git("checkout", "-q", "--detach");
  await readOnly(/not on a branch \(HEAD is detached\)/);
  git("checkout", "-q", "main");

  fs.writeFileSync(path.join(repo, ".git", "MERGE_HEAD"), `${git("rev-parse", "HEAD").trim()}\n`);
  await readOnly(/a merge is in progress/);
  fs.rmSync(path.join(repo, ".git", "MERGE_HEAD"));

  fs.symlinkSync(path.join(tmp, "elsewhere"), path.join(content, "lessons", "link"));
  await readOnly(/content\/ contains a symbolic link or \.git entry \(content\/lessons\/link\)/);
  fs.rmSync(path.join(content, "lessons", "link"));

  // A file git ignores is still a file the loader reads: not "clean".
  fs.writeFileSync(path.join(repo, ".git", "info", "exclude"), "private.md\n.DS_Store\n");
  write("lessons/core/private.md", "mine\n");
  await readOnly(/not committed \(content\/lessons\/core\/private\.md\)/);
  fs.rmSync(path.join(content, "lessons/core/private.md"));
  // …but Finder's ignored .DS_Store is not in the way.
  write(".DS_Store", "junk");
  assert.equal((await writable(repo, content)).ok, true);
  fs.rmSync(path.join(content, ".DS_Store"));

  git("update-index", "--assume-unchanged", `content/${ALPHA}`);
  await readOnly(/told to skip \(content\/lessons\/core\/0-01-alpha\.md\)/);
  git("update-index", "--no-assume-unchanged", `content/${ALPHA}`);

  // A repository with no commits at all.
  fs.rmSync(path.join(repo, ".git"), { recursive: true, force: true });
  git("init", "-q", "-b", "main");
  await readOnly(/no commits yet/);
  // And no repository.
  fs.rmSync(path.join(repo, ".git"), { recursive: true, force: true });
  const w = await writable(repo, content);
  assert.ok(!w.ok && /not a git repository|inside another git repository/.test(w.reason), JSON.stringify(w));
});

test("when the agent never runs, nothing is committed and nothing is touched", async () => {
  const was = fingerprint();
  plan({ exit: 1, stderr: "Not logged in · Please run /login" });
  const { events } = await chat("hello");
  assert.deepEqual(names(events), ["start", "error", "done"]);
  assert.match(String(of(events, "error").error), /sign-in has expired/);
  assert.match(String(of(events, "error").error), /Your curriculum was not touched and nothing was committed/);
  assert.equal(of(events, "done").ok, false);
  assert.equal(fingerprint(), was);
  assert.deepEqual(readHistory().map((m) => m.role), ["user", "note"]);
  nothingLeftBehind();
});

test("a renamed lesson id or a removed concept goes to the repair turn; a repaired turn is committed", async () => {
  const renamed = lesson("core-0-alpha-renamed", "alpha", "Better prose.");
  plan(
    { write: { [ALPHA]: renamed, "curriculum.yaml": CURRICULUM.replace("  - { id: beta, title: Beta, level: 0 }\n", "") }, reply: "Done.\nChanged: rewrote alpha." },
    { write: { [ALPHA]: lesson("core-0-alpha", "alpha", "Better prose."), "curriculum.yaml": CURRICULUM }, reply: "Fixed the ids.\nChanged: rewrote the alpha lesson's prose." },
  );
  const { events } = await chat("rewrite alpha");
  assert.deepEqual(names(events), ["start", "message", "fixing", "message", "commit", "done"]);
  const problems = (of(events, "fixing").problems as { file: string; message: string }[]).map((p) => `${p.file}: ${p.message}`).join("\n");
  assert.match(problems, /lessons\/core\/0-01-alpha\.md: lesson id "core-0-alpha" no longer exists/);
  assert.match(problems, /curriculum\.yaml: concept id removed or renamed: beta/);
  assert.match(promptsSeen()[1], /REFUSES[\s\S]*lesson id "core-0-alpha" no longer exists/);
  assert.equal(callsSeen()[1].cwd, callsSeen()[0].cwd, "the repair turn works on the same copy");
  assert.deepEqual(commits(), ["agent: rewrote the alpha lesson's prose.", "init"]);
  assert.deepEqual(lastCommitFiles(), [`M\tcontent/${ALPHA}`], "curriculum.yaml ended as it began, so it is not in the commit");
  assert.deepEqual(status(), []);
  assert.deepEqual(loadContent().lessons.map((l) => l.id), ["core-0-alpha", "core-0-beta"]);
  nothingLeftBehind();
});

test("an id still renamed after the repair turn: nothing reaches the repository, the learner is told", async () => {
  const was = fingerprint();
  const renamed = lesson("core-0-alpha-renamed", "alpha");
  plan({ write: { [ALPHA]: renamed }, reply: "Changed: renamed." }, { write: { [ALPHA]: renamed }, reply: "Changed: still renamed." });
  const { events } = await chat("rename alpha");
  assert.deepEqual(names(events), ["start", "message", "fixing", "message", "problems", "commit", "done"]);
  assert.match(String(of(events, "problems").text), /lesson id "core-0-alpha" no longer exists/);
  assert.deepEqual(of(events, "commit"), { skipped: true });
  assert.equal(fingerprint(), was);
  nothingLeftBehind();
});

test("problems left after the repair turn: nothing reaches the repository, nothing is committed, the learner is told", async () => {
  const was = fingerprint();
  const BROKEN = "lessons/core/0-03-broken.md";
  const brokenLesson = lesson("core-0-broken", "no-such-concept");
  plan(
    { write: { [BROKEN]: brokenLesson, [ALPHA]: lesson("core-0-alpha", "alpha", "Edited too.") }, remove: [BETA], reply: "Added.\nChanged: added a lesson." },
    { write: { [BROKEN]: brokenLesson.replace("Some prose.", "Still broken.") }, reply: "Tried.\nChanged: still broken." },
  );
  const { events } = await chat("add a lesson");
  assert.deepEqual(names(events), ["start", "message", "fixing", "message", "problems", "commit", "done"]);
  const told = String(of(events, "problems").text);
  assert.match(told, /thrown away/);
  assert.match(told, /your curriculum was never touched and nothing was committed/);
  assert.match(told, /content\/lessons\/core\/0-03-broken\.md: concept "no-such-concept"/);
  assert.match(told, /lesson id "core-0-beta" no longer exists/);
  assert.deepEqual(of(events, "commit"), { skipped: true });
  assert.equal(fingerprint(), was, "no file, index entry, ref or commit changed");
  assert.deepEqual(readHistory().map((m) => m.role), ["user", "assistant", "assistant", "note"]);
  nothingLeftBehind();
});

test("a file that is not a curriculum file, a dot-file, or a file git ignores: the turn is thrown away", async () => {
  fs.writeFileSync(path.join(repo, ".gitignore"), "secret.md\n");
  git("add", ".gitignore");
  git("commit", "-q", "-m", "ignore");
  for (const stray of ["notes.txt", "lessons/core/picture.png", ".gitattributes", "lessons/.hidden/x.md", "lessons/core/secret.md", "README.md"]) {
    const was = fingerprint();
    fs.rmSync(path.join(tmp, "data"), { recursive: true, force: true });
    plan({ write: { [NEW]: lesson("core-0-more", "alpha"), [stray]: "stray\n" }, reply: "Changed: added a lesson." }, { reply: "I cannot delete it.\nChanged: added a lesson." });
    const { events } = await chat("add a lesson");
    assert.deepEqual(names(events), ["start", "message", "fixing", "message", "problems", "commit", "done"], stray);
    assert.deepEqual([...new Set((of(events, "problems").problems as { file: string }[]).map((p) => p.file))], [stray]);
    assert.equal(fingerprint(), was, stray);
    nothingLeftBehind();
  }
});

test("a write outside content/ in the agent's copy never reaches the repository or the commit", async () => {
  plan({ ...addLesson, writeRoot: { "app.txt": "the agent rewrote the app\n", "new-tool.sh": "#!/bin/sh\n" } });
  const { events } = await chat("add a lesson");
  assert.deepEqual(names(events), ["start", "message", "commit", "done"]);
  assert.deepEqual(lastCommitFiles(), [`A\tcontent/${NEW}`]);
  assert.equal(fs.readFileSync(path.join(repo, "app.txt"), "utf8"), "one\n");
  assert.equal(fs.existsSync(path.join(repo, "new-tool.sh")), false);
  assert.deepEqual(status(), []);
  nothingLeftBehind();
});

test("a repair turn that dies: nothing reaches the repository", async () => {
  const was = fingerprint();
  plan({ write: { [ALPHA]: lesson("core-0-alpha", "missing") }, reply: "Changed: edited alpha." }, { exit: 1, stderr: "Claude AI usage limit reached|1900000000" });
  const { events } = await chat("edit alpha");
  assert.deepEqual(names(events), ["start", "message", "fixing", "error", "done"]);
  assert.match(String(of(events, "error").error), /usage limit reached/);
  assert.match(String(of(events, "error").error), /was in a separate copy and has been thrown away; your curriculum was not touched/);
  assert.equal(fingerprint(), was);
  nothingLeftBehind();
});

test("a cancelled turn leaves nothing and frees the tutor; while it runs the repository is untouched and a second turn is refused", async () => {
  const was = fingerprint();
  plan({ write: { "lessons/core/0-09-half.md": "---\nid: half", [ALPHA]: "truncated mid-wri" }, hang: true });
  const ctrl = new AbortController();
  const pending = fetch(`${base}/api/chat`, { method: "POST", body: JSON.stringify({ message: "write something long" }), headers: { "Content-Type": "application/json" }, signal: ctrl.signal }).then((r) => r.text()).catch(() => "aborted");
  await until("the agent to be mid-run", () => fs.existsSync(`${planFile}.hung`));
  assert.equal(tutorBusy(), true);
  // Mid-run, with the agent's half-written files on disk — in its own copy.
  assert.equal(fs.readFileSync(path.join(callsSeen()[0].cwd, "content", ALPHA), "utf8"), "truncated mid-wri");
  assert.equal(status().join("\n"), "", "the working tree shows nothing of it");
  assert.equal(read(ALPHA), lesson("core-0-alpha", "alpha"));
  assert.equal((await chat("me too")).status, 409);
  assert.equal((await fetch(`${base}/api/chat/history`, { method: "DELETE" })).status, 409);

  ctrl.abort(); // the learner closes the drawer
  assert.equal(await pending, "aborted");
  await until("the tutor to be free again", () => !tutorBusy());
  assert.equal(fingerprint(), was);
  const history: ChatMessage[] = readHistory();
  assert.deepEqual(history.map((m) => m.role), ["user", "note"]);
  assert.match(history[1].text, /did not finish \(cancelled\)\. Whatever it had written so far was in a separate copy and has been thrown away/);
  nothingLeftBehind();

  // And the next turn works.
  plan({ reply: "Here now." });
  assert.deepEqual(names((await chat("hello again")).events), ["start", "message", "commit", "done"]);
});

/** A turn whose commit was kept rather than applied: the note, the ref, and
 *  that nothing of the owner's moved. Returns the ref. */
function assertHeld(events: Event[], reason: RegExp): string {
  assert.deepEqual(names(events), ["start", "message", "note", "commit", "done"]);
  assert.deepEqual(of(events, "commit"), { skipped: true });
  const note = String(of(events, "note").text);
  assert.match(note, /NOT put into your files/);
  assert.match(note, reason);
  const kept = refs();
  assert.equal(kept.length, 1);
  assert.ok(note.includes(`\`git merge --ff-only ${kept[0]}\``), note);
  assert.equal(git("log", "-1", "--format=%s", kept[0]).trim(), "agent: added lesson core-0-more.");
  assert.deepEqual(git("show", "--name-status", "--format=", kept[0]).trim().split("\n"), [`A\tcontent/${NEW}`]);
  assert.equal(fs.existsSync(path.join(content, NEW)), false, "the tutor's file is not in the working tree");
  assert.deepEqual(readHistory().map((m) => m.role), ["user", "assistant", "note"]);
  nothingLeftBehind();
  return kept[0];
}

test("the owner saves a lesson while the tutor works: the tutor's commit is kept under a ref, not applied, and can be taken later", async () => {
  const edited = lesson("core-0-beta", "beta", "The owner edited this during the turn.");
  const head = git("rev-parse", "HEAD").trim();
  plan({ ...addLesson, owner: { [`content/${BETA}`]: edited, "content/lessons/core/draft.md": "a draft\n" } });
  const { events } = await chat("another lesson please");
  const ref = assertHeld(events, /content\/ has changes that are not committed \(content\/lessons\/core\/0-02-beta\.md, content\/lessons\/core\/draft\.md\) — they appeared while the tutor was working/);
  assert.equal(git("rev-parse", "HEAD").trim(), head);
  assert.equal(read(BETA), edited);
  assert.equal(read("lessons/core/draft.md"), "a draft\n");
  assert.deepEqual(status(), [" M content/lessons/core/0-02-beta.md", "?? content/lessons/core/draft.md"]);
  // The note's instructions work: stash, fast-forward, unstash.
  git("stash", "-q", "-u", "--", "content");
  git("merge", "-q", "--ff-only", ref);
  git("stash", "pop", "-q");
  assert.deepEqual(commits(), ["agent: added lesson core-0-more.", "init"]);
  assert.equal(read(NEW), lesson("core-0-more", "alpha"));
  assert.equal(read(BETA), edited);
});

test("the owner creates the very file the tutor is adding: not applied, and the owner's file stands", async () => {
  // The app's own check sees the new file and keeps the commit aside. (If the
  // file appeared in the instant after that check, `git merge --ff-only`
  // itself refuses to overwrite an untracked file; that window is not
  // something a test can hit.)
  plan({ ...addLesson, owner: { [`content/${NEW}`]: "the owner's own new lesson, unsaved elsewhere\n" } });
  const { events } = await chat("another lesson please");
  assert.deepEqual(names(events), ["start", "message", "note", "commit", "done"]);
  assert.match(String(of(events, "note").text), /NOT put into your files/);
  assert.equal(refs().length, 1);
  assert.equal(read(NEW), "the owner's own new lesson, unsaved elsewhere\n");
  assert.deepEqual(commits(), ["init"]);
  nothingLeftBehind();
});

test("the branch moved while the tutor worked (a commit, or a switch): kept under a ref, and a cherry-pick takes it", async () => {
  plan({ ...addLesson, owner: { "app.txt": "the owner's commit\n" }, ownerGit: [["commit", "-q", "-am", "owner commits meanwhile"]] });
  let ref = assertHeld((await chat("another lesson please")).events, /main gained or lost commits while the tutor was working/);
  assert.deepEqual(commits(), ["owner commits meanwhile", "init"]);
  assert.deepEqual(status(), []);
  git("cherry-pick", ref);
  assert.deepEqual(commits(), ["agent: added lesson core-0-more.", "owner commits meanwhile", "init"]);
  git("update-ref", "-d", ref);
  git("reset", "-q", "--hard", "HEAD~1");

  fs.rmSync(path.join(tmp, "data"), { recursive: true, force: true });
  plan({ ...addLesson, ownerGit: [["checkout", "-q", "-b", "side"]] });
  ref = assertHeld((await chat("another lesson please")).events, /was on main when the tutor started and is on side now/);
  assert.equal(git("symbolic-ref", "HEAD").trim(), "refs/heads/side");
  assert.deepEqual(commits(), ["owner commits meanwhile", "init"]);
});

test("git hooks are not run for the tutor's work: a refusing or file-writing hook cannot wedge or half-apply a turn", async () => {
  const hooks = path.join(repo, ".git", "hooks");
  fs.mkdirSync(hooks, { recursive: true });
  const marker = path.join(tmp, "hook-ran");
  for (const name of ["pre-commit", "commit-msg", "prepare-commit-msg"]) fs.writeFileSync(path.join(hooks, name), `#!/bin/sh\necho ${name} >> ${JSON.stringify(marker)}\necho 'hook says no' >&2\nexit 1\n`, { mode: 0o755 });
  for (const name of ["post-checkout", "post-commit", "post-merge", "pre-merge-commit", "reference-transaction"]) fs.writeFileSync(path.join(hooks, name), `#!/bin/sh\necho ${name} >> ${JSON.stringify(marker)}\necho junk > hook-dropping.txt\nexit 0\n`, { mode: 0o755 });
  plan(addLesson);
  const { events } = await chat("another lesson please");
  assert.deepEqual(names(events), ["start", "message", "commit", "done"]);
  assert.deepEqual(commits(), ["agent: added lesson core-0-more.", "init"]);
  assert.equal(fs.existsSync(marker), false, fs.existsSync(marker) ? fs.readFileSync(marker, "utf8") : "");
  assert.deepEqual(status(), []);
  nothingLeftBehind();
});

test("a commit git refuses (no identity): the change is thrown away, said, and nothing reaches the repository", async () => {
  git("config", "--unset", "user.email");
  git("config", "--unset", "user.name");
  git("config", "user.useConfigOnly", "true");
  const was = fingerprint();
  plan(addLesson);
  const { events } = await chat("another lesson please");
  assert.deepEqual(names(events), ["start", "message", "note", "commit", "done"]);
  assert.ok("error" in of(events, "commit"));
  assert.match(String(of(events, "note").text), /could not be committed[\s\S]*thrown away[\s\S]*your curriculum was not touched/);
  assert.equal(fingerprint(), was);
  nothingLeftBehind();
});

test("a worktree a dead server left behind is cleared at the next start, once it is old; the repository was never touched", async () => {
  const was = fingerprint();
  const ready = await writable(repo, content);
  assert.ok(ready.ok);
  // A server died two hours ago mid-turn, and another a minute ago.
  const old = await openWorkspace(ready, Date.now() - 2 * 60 * 60_000);
  const recent = await openWorkspace(ready, Date.now() - 60_000);
  fs.writeFileSync(path.join(old.content, ALPHA), "AGENT HALF WRITTEN");
  fs.writeFileSync(path.join(old.content, "lessons/core/0-09-half.md"), "---\nid: half");
  assert.equal(worktrees(), 3);
  assert.equal(fingerprint(), was, "making a worktree changes no file, index entry or ref");

  assert.deepEqual(recoverInterruptedTurn(), { removed: 1 });
  assert.deepEqual(leftovers(), [recent.id], "the recent one may be another copy's turn in flight: left alone");
  assert.equal(worktrees(), 2);
  assert.ok(STALE_MS > 2 * 600_000, "older than any turn can run");
  // A turn still works beside it.
  plan({ reply: "Here." });
  assert.deepEqual(names((await chat("hello")).events), ["start", "message", "commit", "done"]);
  assert.deepEqual(leftovers(), [recent.id]);
  assert.deepEqual(recoverInterruptedTurn(0), { removed: 1 });
  assert.equal(fingerprint(), was);
  nothingLeftBehind();
  // Things in the work area that are not this app's naming are not touched.
  fs.mkdirSync(path.join(workspaceBase(repo), "something-else"));
  assert.deepEqual(recoverInterruptedTurn(0), { removed: 0 });
  fs.rmSync(path.join(workspaceBase(repo), "something-else"), { recursive: true });
});

test("quitting the app mid-turn deletes the turn's worktree before the process can exit", async () => {
  const was = fingerprint();
  plan({ write: { [ALPHA]: "AGENT HALF WRITTEN", "lessons/core/0-09-half.md": "---\nid: half" }, hang: true });
  const pending = fetch(`${base}/api/chat`, { method: "POST", body: JSON.stringify({ message: "write something long" }), headers: { "Content-Type": "application/json" } }).then((r) => r.text());
  await until("the agent to be mid-run", () => fs.existsSync(`${planFile}.hung`));
  assert.equal(leftovers().length, 1);
  // SIGTERM arrives: the reaper kills the agent and runs the cleanup hook. By
  // the time the handler returns — before anything can call process.exit —
  // the worktree is gone.
  const timer = reapOnSignal(143, { exit: () => {} });
  clearTimeout(timer);
  assert.deepEqual(leftovers(), []);
  assert.equal(worktrees(), 1);
  assert.equal(fingerprint(), was);
  const events = parseSse(await pending).filter((e) => e.event !== "heartbeat");
  assert.deepEqual(names(events), ["start", "error", "done"]);
  assert.match(String(of(events, "error").error), /did not finish \(cancelled\)[\s\S]*Your curriculum was not touched/i);
  assert.deepEqual(readHistory().map((m) => m.role), ["user", "note"], "one note");
  await until("the tutor to be free again", () => !tutorBusy());
  assert.equal(fingerprint(), was);
});

test("the old single-envelope output still yields the reply", async () => {
  plan({ reply: "An octave is a doubling of frequency.", legacyOutput: true });
  const { events } = await chat("what is an octave?");
  assert.deepEqual(names(events), ["start", "message", "commit", "done"]);
  assert.equal(of(events, "message").text, "An octave is a doubling of frequency.");
});

test("GET history returns the newest messages only", async () => {
  fs.mkdirSync(dataDir(), { recursive: true });
  fs.writeFileSync(path.join(dataDir(), "chat.jsonl"), Array.from({ length: 260 }, (_, i) => JSON.stringify({ role: "user", text: `m${i}`, ts: "" })).join("\n") + "\n");
  const res = await fetch(`${base}/api/chat/history`);
  const { messages } = (await res.json()) as { messages: ChatMessage[] };
  assert.equal(messages.length, 200);
  assert.equal(messages[0].text, "m60");
  assert.equal(messages.at(-1)?.text, "m259");
});
