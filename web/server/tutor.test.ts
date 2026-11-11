// The tutor's pure parts: prompts, context scrubbing, the before/after
// problem diff, the history store and the auto-commit. Nothing here spawns
// `claude`; the store and the commits run against temp directories.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { after, before, test } from "node:test";
import type { Content } from "../shared/content.ts";
import { startersFor } from "../src/tutor/starters.ts";
import { contextNote, fixPrompt, historyPrompt, newProblems, remainingNote, sanitizeContext, systemPrompt } from "./chat.ts";
import { commitContent, commitSubject, contentDirty } from "./commit.ts";
import { REPO_ROOT } from "./loader.ts";
import { appendHistory, clearHistory, dataDir, getModel, readHistory, setModel } from "./store.ts";

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "fret-not-tutor-"));
const realData = path.join(REPO_ROOT, "data");

before(() => {
  process.env.FRET_DATA_DIR = path.join(tmp, "data");
  // A precondition, not a test: if the override did not take, stop the file
  // before anything writes to the real data/.
  if (dataDir() === realData || !dataDir().startsWith(tmp)) throw new Error("FRET_DATA_DIR override did not take");
});
after(() => {
  delete process.env.FRET_DATA_DIR;
  fs.rmSync(tmp, { recursive: true, force: true });
});

const content: Content = {
  tracks: [{ id: "core", title: "How music works", summary: "" }, { id: "guitar", title: "Guitar", summary: "", instrument: "guitar" }],
  levels: [
    { id: 0, title: "Sound", summary: "", status: "written", topics: [] },
    { id: 4, title: "Keys and harmony", summary: "", status: "outline", topics: ["Cadences"] },
  ],
  concepts: [{ id: "octave", title: "The octave", level: 0, track: "core", requires: [] }],
  instruments: [],
  lessons: [{ id: "core-0-octave", title: "The octave", track: "core", level: 0, order: 7, concepts: ["octave"], summary: "s", blocks: [], exercises: [], file: "lessons/core/0-07-octave.md" }],
  problems: [{ file: "lessons/core/0-99-x.md", message: "unknown widget type \"foo\"" }],
};

test("system prompt: the two jobs, the sandbox rules, and the curriculum as it is", () => {
  const p = systemPrompt(content, "/repo");
  assert.match(p, /adult beginner/);
  assert.match(p, /docs\/CONTENT\.md/);
  assert.match(p, /docs\/CONTENT-REFERENCE\.md/);
  assert.match(p, /only under content\//);
  assert.match(p, /Never change the `id`/);
  assert.match(p, /public domain/);
  assert.match(p, /content\/curriculum\.yaml FIRST/);
  assert.match(p, /no shell/);
  assert.match(p, /Do not run git/);
  assert.match(p, /Changed:/);
  assert.match(p, /never tell the learner whether an answer/); // it does not grade
  assert.match(p, /core-0-octave \[core\] "The octave" — content\/lessons\/core\/0-07-octave\.md/);
  assert.match(p, /Level 4 — "Keys and harmony" \(outline only/);
  assert.match(p, /· Cadences/);
  assert.match(p, /octave \(L0, core\)/);
  assert.match(p, /currently refuses[\s\S]*0-99-x\.md: unknown widget/);
  assert.match(p, /\(\/repo\)/);
  assert.doesNotMatch(systemPrompt({ ...content, problems: [] }), /currently refuses/);
});

test("context is rebuilt field by field, never trusted", () => {
  assert.deepEqual(sanitizeContext(undefined), { page: "home" });
  assert.deepEqual(sanitizeContext({ page: "nope", lab: 3 }), { page: "home" });
  const ctx = sanitizeContext({
    page: "lesson",
    lesson: { id: "core-0-octave", title: "The\noctave  ", file: "lessons/core/0-07-octave.md", concepts: ["octave", "BAD ID", 7] },
    recent: [...Array.from({ length: 14 }, (_, i) => ({ prompt: `q${i}`, concept: "octave", correct: i % 2 === 0, explain: "e" })), "junk", { prompt: "" }],
    extra: "ignored",
  });
  assert.deepEqual(ctx.lesson, { id: "core-0-octave", title: "The octave", file: "lessons/core/0-07-octave.md", concepts: ["octave"] });
  // Non-objects go first, then the last ten are kept, then any without a
  // prompt are dropped: q5…q13.
  assert.equal(ctx.recent?.length, 9);
  assert.equal(ctx.recent?.[0].prompt, "q5");
  assert.equal(ctx.recent?.at(-1)?.prompt, "q13");
  assert.equal(ctx.recent?.at(-1)?.correct, false);
  assert.ok(!("extra" in ctx));
  // A file that is not a lesson path is dropped (the hint, not the lesson).
  for (const file of ["../../etc/passwd", "lessons/../../secrets.md", "/abs/lessons/x.md", "web/src/App.tsx", "lessons/core/x.md; rm -rf"]) {
    assert.equal(sanitizeContext({ page: "lesson", lesson: { id: "a", title: "t", file } }).lesson?.file, "", file);
  }
  assert.equal(sanitizeContext({ page: "lesson", lesson: { id: "Bad Id", title: "t", file: "lessons/x.md" } }).lesson, undefined);
  assert.equal(sanitizeContext({ page: "lab", lab: "x".repeat(500) }).lab?.length, 60);
});

test("context note and history prompt", () => {
  const ctx = sanitizeContext({
    page: "lesson",
    lesson: { id: "core-0-octave", title: "The octave", file: "lessons/core/0-07-octave.md", concepts: ["octave"] },
    recent: [{ prompt: "Which is higher?", concept: "octave", correct: false, explain: "The second, by an octave." }],
  });
  const note = contextNote(ctx);
  assert.match(note, /on a lesson/);
  assert.match(note, /core-0-octave "The octave" — file content\/lessons\/core\/0-07-octave\.md — concepts: octave/);
  assert.match(note, /WRONG \[octave\] "Which is higher\?" → shown afterwards: "The second, by an octave\."/);
  assert.match(contextNote({ page: "lab", lab: "Sound lab" }), /Lab explorer open: Sound lab/);

  const p = historyPrompt(
    [
      { role: "user", text: "hi", ts: "" },
      { role: "assistant", text: "hello", ts: "" },
      { role: "commit", text: "abc1234: added lesson x", ts: "" },
      { role: "note", text: "refused: y", ts: "" },
    ],
    "why?",
    ctx,
    "2026-11-10",
  );
  assert.match(p, /^Conversation so far:\n\n\[USER\]\nhi\n\n\[ASSISTANT\]\nhello\n\n\[SYSTEM\]\nCommitted abc1234: added lesson x\n\n\[SYSTEM\]\nrefused: y\n\n---/);
  assert.match(p, /\[CONTEXT\]\nThe learner is on a lesson\.[\s\S]*\[USER\]\nwhy\?\n\n\[ASSISTANT\]\nRespond to the latest user message\. Today is 2026-11-10\.$/);
  assert.doesNotMatch(historyPrompt([], "x", { page: "home" }), /Conversation so far/);
});

test("problem diff: only what the turn introduced", () => {
  const a = { file: "lessons/a.md", message: "bad widget" };
  const b = { file: "lessons/b.md", message: "bad widget" };
  const a2 = { file: "lessons/a.md", message: "another" };
  assert.deepEqual(newProblems([a], [a]), []);
  assert.deepEqual(newProblems([a], [a, b, a2]), [b, a2]);
  assert.deepEqual(newProblems([a, b], []), []); // the turn fixed old problems: nothing to answer for
  assert.deepEqual(newProblems([], [a]), [a]);

  const fix = fixPrompt([{ role: "user", text: "add a lesson", ts: "" }, { role: "assistant", text: "Done.\nChanged: added x.", ts: "" }], [b, a2]);
  assert.match(fix, /REFUSES/);
  assert.match(fix, /- content\/lessons\/b\.md: bad widget\n- content\/lessons\/a\.md: another/);
  assert.match(fix, /only follow-up turn/);
  assert.match(fix, /\[ASSISTANT\]\nDone\./);
  const rem = remainingNote([b, a2]);
  assert.match(rem, /2 files/);
  assert.match(rem, /content\/lessons\/b\.md: bad widget/);
  assert.match(remainingNote([a, a2]), /one file/);
});

test("commit subject comes from the Changed: line", () => {
  assert.equal(commitSubject("I added it.\n\nChanged: added lesson core-3-blues-scale (level 3)."), "added lesson core-3-blues-scale (level 3).");
  assert.equal(commitSubject("Changed: first.\nmore prose\n- **Changed:** second thing"), "second thing");
  assert.equal(commitSubject("Just prose with no marker.\nEdited the octave lesson."), "Edited the octave lesson.");
  assert.equal(commitSubject(""), "content edited");
  assert.equal(commitSubject(`Changed: ${"x".repeat(200)}`).length, 72);
});

test("history store: append, read, torn lines, clear, model setting", () => {
  assert.deepEqual(readHistory(), []);
  appendHistory({ role: "user", text: "hi", ts: "t1" });
  appendHistory({ role: "note", text: "refused", ts: "t2" });
  fs.appendFileSync(path.join(dataDir(), "chat.jsonl"), '{"role":"weird","text":"x"}\n{"role":"assistant","text":"tor');
  assert.deepEqual(readHistory(), [{ role: "user", text: "hi", ts: "t1" }, { role: "note", text: "refused", ts: "t2" }]);
  clearHistory();
  clearHistory(); // idempotent
  assert.deepEqual(readHistory(), []);

  assert.equal(getModel(), "claude-sonnet-5-5");
  fs.writeFileSync(path.join(dataDir(), "settings.json"), JSON.stringify({ model: "gpt-9", other: 1 }));
  assert.equal(getModel(), "claude-sonnet-5-5"); // a stale id never reaches the CLI
  assert.equal(setModel("claude-opus-5-5"), "claude-opus-5-5");
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(dataDir(), "settings.json"), "utf8")), { model: "claude-opus-5-5", other: 1 });
  assert.throws(() => setModel("nope"), /unknown model/);
  assert.ok(!fs.existsSync(path.join(realData, "chat.jsonl")) || fs.statSync(path.join(realData, "chat.jsonl")).mtimeMs < Date.now() - 1000, "the real data/ was not written");
});

test("auto-commit stages content/ only, in a throwaway repo", async () => {
  const repo = path.join(tmp, "repo");
  const dir = path.join(repo, "content");
  fs.mkdirSync(path.join(dir, "lessons"), { recursive: true });
  const git = (...args: string[]) => execFileSync("git", args, { cwd: repo, encoding: "utf8" });
  git("init", "-q", "-b", "main");
  git("config", "user.email", "test@example.invalid");
  git("config", "user.name", "Test");
  git("config", "commit.gpgsign", "false");
  fs.writeFileSync(path.join(repo, "app.txt"), "one\n");
  fs.writeFileSync(path.join(dir, "curriculum.yaml"), "tracks: []\n");
  git("add", "-A");
  git("commit", "-q", "-m", "init");

  assert.equal(await contentDirty({ repoRoot: repo, dir }), false);
  assert.deepEqual(await commitContent("nothing", { repoRoot: repo, dir }), { skipped: true });

  // The tutor edits content/; the user has unrelated work, staged and unstaged.
  fs.writeFileSync(path.join(dir, "lessons", "new.md"), "---\nid: x\n---\nbody\n");
  fs.rmSync(path.join(dir, "curriculum.yaml"));
  fs.writeFileSync(path.join(repo, "app.txt"), "two\n");
  fs.writeFileSync(path.join(repo, "staged.txt"), "mine\n");
  git("add", "staged.txt");
  assert.equal(await contentDirty({ repoRoot: repo, dir }), true);

  const c = await commitContent("Wrote it.\nChanged: added lesson x; `quotes\" $(and) shell; chars`", { repoRoot: repo, dir });
  assert.ok("hash" in c, JSON.stringify(c));
  assert.equal(git("log", "-1", "--format=%s").trim(), "agent: added lesson x; `quotes\" $(and) shell; chars`");
  assert.deepEqual(git("show", "--name-status", "--format=", "HEAD").trim().split("\n").sort(), ["A\tcontent/lessons/new.md", "D\tcontent/curriculum.yaml"]);
  // The user's own work is exactly as it was: still staged, still modified.
  assert.deepEqual(git("status", "--porcelain").trimEnd().split("\n").sort(), [" M app.txt", "A  staged.txt"]);
  assert.equal(await contentDirty({ repoRoot: repo, dir }), false);

  // A content dir outside the repository is refused, not committed around.
  const outside = await commitContent("x", { repoRoot: repo, dir: path.join(tmp, "elsewhere") });
  assert.ok("error" in outside && /outside the repository/.test(outside.error));
});

test("starter prompts fit the page", () => {
  const lesson = { id: "core-0-octave", title: "The octave", file: "lessons/core/0-07-octave.md", concepts: ["octave"] };
  const onLesson = startersFor({ page: "lesson", lesson });
  assert.deepEqual(onLesson.map((s) => s.label), ["Explain this another way", "Three more practice questions", "Write a follow-up lesson on…"]);
  assert.match(onLesson[0].text, /"The octave"/);
  assert.equal(onLesson[2].send, false);
  const missed = startersFor({ page: "lesson", lesson, recent: [{ prompt: "Q1", concept: "octave", correct: false, explain: "" }, { prompt: "Q2", concept: "octave", correct: true, explain: "" }] });
  assert.equal(missed[0].label, "Why was my last answer wrong?");
  assert.match(missed[0].text, /"Q1"/);
  assert.equal(missed.length, 3);
  for (const page of ["home", "review", "lab", "sketchpad", "placement"] as const) {
    const s = startersFor({ page });
    assert.ok(s.length >= 2 && s.length <= 3, page);
  }
});
