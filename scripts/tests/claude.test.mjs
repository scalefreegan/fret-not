// The sandbox the embedded agent runs in, pinned at the argv level — no
// spawn. buildArgs() is pure, so what this checks is exactly what
// startClaude() hands to `claude`.
//   node --test scripts/tests/claude.test.mjs

import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { buildArgs, childEnv, classifyExit, contentDenials, contentGrants, DEFAULT_MODEL, DENIED, reapOnSignal, REPO_ROOT, resultEnvelope, startClaude, sweepPromptDirs, toolWrites, TOOLS } from "../claude.mjs";

/** The values following every occurrence of a flag, up to the next `--flag`. */
function valuesOf(args, flag) {
  const out = [];
  for (let i = 0; i < args.length; i++) {
    if (args[i] !== flag) continue;
    for (let j = i + 1; j < args.length && !args[j].startsWith("--"); j++) out.push(args[j]);
  }
  return out;
}

test("content grants are absolute, inside the repo, and use the //abs/** rule syntax", () => {
  const grants = contentGrants();
  const dir = path.join(REPO_ROOT, "content");
  assert.ok(path.isAbsolute(dir));
  // `//` is the filesystem root in a rule, so the absolute path follows it
  // without its own leading slash — `//Users/…`, never `///Users/…`.
  assert.deepEqual(grants, [`Edit(//${dir.slice(1)}/**)`, `Write(//${dir.slice(1)}/**)`]);
  for (const g of grants) assert.ok(!g.includes("///"), g);
  // Each rule's path, with the tool name and `//` turned back into `/`, is
  // absolute and inside the repo.
  for (const g of grants) {
    const p = g.replace(/^\w+\(\/\//, "/").replace(/\/\*\*\)$/, "");
    assert.ok(path.isAbsolute(p), g);
    assert.ok(!path.relative(REPO_ROOT, p).startsWith(".."), `${g} escapes the repo`);
  }
});

test("a content directory outside the repo is refused at spawn time", () => {
  assert.throws(() => contentGrants("/tmp/elsewhere"), /inside the repo/);
  assert.throws(() => contentGrants("../sibling/content", REPO_ROOT), /inside the repo/);
  assert.throws(() => contentGrants(REPO_ROOT), /inside the repo/); // the repo itself is not "under content"
});

test("argv: tools, grants, denials, permissions, model, output format", () => {
  const args = buildArgs({ prompt: "hi", systemPrompt: "SYS", mcpConfigPath: "/tmp/x/mcp.json" });
  const content = path.join(REPO_ROOT, "content");

  // The prompt is never an argument (it goes in on stdin): `-p` is followed
  // straight by the next flag, and the prompt text appears nowhere in argv.
  assert.deepEqual(args.slice(0, 2), ["-p", "--output-format"]);
  assert.ok(!args.includes("hi"));
  // The run is read as a stream (for the agent's tool calls), which print
  // mode only allows together with --verbose.
  assert.deepEqual(valuesOf(args, "--output-format"), ["stream-json"]);
  assert.ok(args.includes("--verbose"));
  assert.deepEqual(valuesOf(args, "--max-turns"), ["25"]);
  assert.deepEqual(valuesOf(args, "--model"), [DEFAULT_MODEL]);
  assert.deepEqual(valuesOf(args, "--append-system-prompt"), ["SYS"]);
  assert.ok(args.includes("--restricted"), "--restricted confines the file tools to cwd and ignores the user's settings");
  assert.deepEqual(valuesOf(args, "--permission-prompts"), ["none"]);
  assert.ok(args.includes("--no-session-persistence"));
  assert.deepEqual(valuesOf(args, "--mcp-config"), ["/tmp/x/mcp.json"]);
  assert.ok(args.includes("--strict-mcp-config"), "an empty strict MCP config: no inherited servers");

  // The structural layer: only these five built-ins exist for the run.
  assert.deepEqual(valuesOf(args, "--tools"), ["Read,Glob,Grep,Edit,Write"]);
  assert.deepEqual(TOOLS, ["Read", "Glob", "Grep", "Edit", "Write"]);

  // Grants: unscoped Read/Glob/Grep (cwd-confined by --restricted); Edit and
  // Write ONLY under content/.
  const allowed = valuesOf(args, "--allowedTools");
  assert.deepEqual(allowed, ["Read", "Glob", "Grep", `Edit(//${content.slice(1)}/**)`, `Write(//${content.slice(1)}/**)`]);
  assert.ok(!allowed.includes("Edit") && !allowed.includes("Write"), "an unscoped Edit/Write grant would cover the whole repo");

  // Denials: the named dangerous tools, as a second layer behind --tools.
  const denied = valuesOf(args, "--disallowedTools");
  const base = `//${content.slice(1)}`;
  // A `.git` directory's contents, and a file named `.git` (a gitlink).
  const gitRules = ["Edit", "Write"].flatMap((t) => [`${t}(${base}/.git)`, `${t}(${base}/**/.git)`, `${t}(${base}/.git/**)`, `${t}(${base}/**/.git/**)`]);
  assert.deepEqual(contentDenials(), gitRules);
  // …followed by the paths inside the grant that stay closed: no nested
  // repository under content/.
  assert.deepEqual(denied, [...DENIED, ...gitRules]);
  for (const t of ["Bash", "WebFetch", "WebSearch", "NotebookEdit", "Task", "Agent"]) assert.ok(denied.includes(t), t);
  assert.ok(!denied.includes("ToolSearch"), "denying ToolSearch inverts (Atlas measured it serving every deferred tool)");

  // What must never appear.
  for (const bad of ["--dangerously-skip-permissions", "--allow-dangerously-skip-permissions", "bypassPermissions"]) {
    assert.ok(!args.includes(bad), bad);
  }
});

test("argv: a model outside the offered list is refused", () => {
  assert.throws(() => buildArgs({ prompt: "x", model: "claude-3-haiku" }), /unknown model/);
  assert.doesNotThrow(() => buildArgs({ prompt: "x", model: "claude-opus-5-5" }));
  assert.doesNotThrow(() => buildArgs({ prompt: "x", model: "claude-fable-5-2" }));
});

test("child env drops the API key and the parent-session markers, keeps the rest", () => {
  const env = childEnv({ PATH: "/usr/bin", HOME: "/Users/x", ANTHROPIC_API_KEY: "sk-ant-secret", CLAUDECODE: "1", CLAUDE_CODE_SESSION_ID: "abc" });
  assert.deepEqual(env, { PATH: "/usr/bin", HOME: "/Users/x" });
});

test("classifyExit: success envelope, is_error envelope, non-zero exit", () => {
  const ok = classifyExit({ code: 0, stdout: JSON.stringify({ result: "done", is_error: false, total_cost_usd: 0.01 }), stderr: "" });
  assert.equal(ok.ok, true);
  assert.equal(ok.text, "done");
  assert.equal(ok.raw.total_cost_usd, 0.01);

  const maxTurns = classifyExit({ code: 1, stdout: JSON.stringify({ is_error: true, subtype: "error_max_turns", errors: ["Reached max turns (25)"] }), stderr: "" });
  assert.equal(maxTurns.ok, false);
  assert.match(maxTurns.message, /max turns/);

  const login = classifyExit({ code: 1, stdout: "", stderr: "Not logged in. Please run /login" });
  assert.equal(login.ok, false);
  assert.match(login.message, /sign-in has expired/);
});

test("the stream: which files a line asks to write, and where the result is", () => {
  const use = (name, input) => ({ type: "tool_use", id: "t1", name, input });
  const line = (...content) => JSON.stringify({ type: "assistant", message: { content } });
  assert.deepEqual(toolWrites(line({ type: "text", text: "I will write it." }, use("Write", { file_path: "/r/content/lessons/a.md", content: "x" }), use("Edit", { file_path: "content/b.md", old_string: "a", new_string: "b" }))), ["/r/content/lessons/a.md", "content/b.md"]);
  assert.deepEqual(toolWrites(line(use("Read", { file_path: "/r/docs/CONTENT.md" }), use("Grep", { pattern: "x" }))), [], "reading is not writing");
  assert.deepEqual(toolWrites(line(use("Write", {}), use("Write", { file_path: 7 }), use("constructor", { file_path: "/x" }))), []);
  // A tool RESULT that quotes a tool call, and anything that is not JSON, is not a call.
  assert.deepEqual(toolWrites(JSON.stringify({ type: "user", message: { content: [use("Write", { file_path: "/x" })] } })), []);
  assert.deepEqual(toolWrites("not json"), []);
  assert.deepEqual(toolWrites(""), []);

  const result = { type: "result", subtype: "success", is_error: false, result: "the reply", total_cost_usd: 0.02, num_turns: 3 };
  const stream = [JSON.stringify({ type: "system", subtype: "init" }), line(use("Write", { file_path: "/x" })), JSON.stringify(result), ""].join("\n");
  assert.deepEqual(resultEnvelope(stream), result);
  assert.deepEqual(resultEnvelope(JSON.stringify({ result: "single", is_error: false })), { result: "single", is_error: false }, "the plain json format still reads");
  assert.equal(resultEnvelope(line(use("Write", { file_path: "/x" })) + "\n{\"type\":\"resu"), null, "a run cut off before its result has none");
  const ok = classifyExit({ code: 0, stdout: stream, stderr: "" });
  assert.equal(ok.ok, true);
  assert.equal(ok.text, "the reply");
  assert.equal(ok.raw.num_turns, 3);
  const failed = classifyExit({ code: 1, stdout: [JSON.stringify({ type: "system" }), JSON.stringify({ type: "result", is_error: true, subtype: "error_max_turns", errors: ["Reached max turns (25)"] })].join("\n"), stderr: "" });
  assert.match(failed.message, /max turns/);
});

test("argv: the tool-less profile has no tools and grants nothing", () => {
  // `--tools ""` removes every built-in, and no --allowedTools grant (not
  // even Read) goes out. The rest of the sandbox — restricted, no prompts,
  // the denials — stays.
  const args = buildArgs({ prompt: "hi", tools: "none", maxTurns: 1 });
  assert.deepEqual(valuesOf(args, "--tools"), [""]);
  assert.ok(!args.includes("--allowedTools"));
  assert.ok(!args.some((a) => /^(Edit|Write)\(/.test(a)));
  assert.ok(args.includes("--restricted"));
  assert.deepEqual(valuesOf(args, "--permission-prompts"), ["none"]);
  assert.deepEqual(valuesOf(args, "--max-turns"), ["1"]);
  assert.ok(args.includes("--disallowedTools"));
  assert.throws(() => buildArgs({ prompt: "x", tools: "all" }), /unknown tool profile/);
});

test("argv: the read-only profile can look but has no write tool, granted or otherwise", () => {
  // A content directory is not even consulted: one outside the repo (which
  // the "content" profile refuses) changes nothing here.
  const args = buildArgs({ tools: "read", contentDir: "/somewhere/else", repoRoot: REPO_ROOT });
  assert.deepEqual(valuesOf(args, "--tools"), ["Read,Glob,Grep"]);
  assert.deepEqual(valuesOf(args, "--allowedTools"), ["Read", "Glob", "Grep"]);
  assert.ok(!args.some((a) => /^(Edit|Write)\(/.test(a)));
  const denied = valuesOf(args, "--disallowedTools");
  for (const tool of [...DENIED, "Edit", "Write", "MultiEdit"]) assert.ok(denied.includes(tool), tool);
  assert.ok(args.includes("--restricted"));
  assert.deepEqual(valuesOf(args, "--permission-prompts"), ["none"]);
});

/* ---- startClaude against a stand-in `claude` on PATH: no real CLI, no cost ---- */

/** A temp dir holding an executable named `claude` that reports what it was
 *  given, put first on PATH for the duration of `run`; TMPDIR is redirected
 *  too, so the wrapper's own temp directories can be counted. */
async function withFakeClaude(run) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "fret-not-fake-claude-"));
  const bin = path.join(dir, "bin");
  const tmp = path.join(dir, "tmp");
  fs.mkdirSync(bin);
  fs.mkdirSync(tmp);
  fs.writeFileSync(path.join(bin, "claude"), `#!${process.execPath}
const chunks = [];
process.stdin.on("data", (c) => chunks.push(c));
process.stdin.on("end", () => {
  const stdin = Buffer.concat(chunks).toString("utf8");
  const argv = process.argv.slice(2);
  if (stdin === "STREAM") {
    // Two tool calls, split across chunks mid-line, then never finish.
    const use = (p) => JSON.stringify({ type: "assistant", message: { content: [{ type: "tool_use", id: "t", name: "Write", input: { file_path: p } }] } }) + "\\n";
    const text = use("a.md") + use("/abs/b.md");
    process.stdout.write(text.slice(0, 40));
    setTimeout(() => process.stdout.write(text.slice(40)), 30);
    setInterval(() => {}, 1000);
    return;
  }
  process.stdout.write(JSON.stringify({ result: JSON.stringify({ stdinBytes: Buffer.byteLength(stdin), head: stdin.slice(0, 20), tail: stdin.slice(-5), argvBytes: argv.join(" ").length, sys: argv[argv.indexOf("--append-system-prompt") + 1] }), total_cost_usd: 0, num_turns: 1 }));
});
`, { mode: 0o755 });
  const saved = { PATH: process.env.PATH, TMPDIR: process.env.TMPDIR };
  process.env.PATH = `${bin}${path.delimiter}${saved.PATH}`;
  process.env.TMPDIR = tmp;
  try {
    await run({ tmp });
  } finally {
    process.env.PATH = saved.PATH;
    if (saved.TMPDIR === undefined) delete process.env.TMPDIR;
    else process.env.TMPDIR = saved.TMPDIR;
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

test("the prompt reaches the CLI on stdin, however long, and the temp directory is removed", async () => {
  await withFakeClaude(async ({ tmp }) => {
    // 1.5 MB of a three-byte character: as an argument this is E2BIG on macOS
    // (the limit is about 1 MB for the whole argument list).
    const prompt = `START ${"♯".repeat(500_000)} END`;
    const { result } = startClaude({ prompt, systemPrompt: "SYS", timeoutSec: 30 });
    const run = await result;
    const seen = JSON.parse(run.text);
    assert.equal(seen.stdinBytes, Buffer.byteLength(prompt));
    assert.equal(seen.head, prompt.slice(0, 20));
    assert.equal(seen.tail, prompt.slice(-5));
    assert.equal(seen.sys, "SYS");
    assert.ok(seen.argvBytes < 5000, `argv stays small whatever the prompt: ${seen.argvBytes}`);
    assert.equal(run.costUsd, 0);
    assert.deepEqual(fs.readdirSync(tmp), [], "no fret-not-mcp-* directory left behind");
  });
});

test("a spawn that fails before the child exists leaves no temp directory", async () => {
  await withFakeClaude(async ({ tmp }) => {
    assert.throws(() => startClaude({ prompt: "x", model: "claude-3-haiku" }), /unknown model/);
    assert.throws(() => startClaude({ prompt: "x", contentDir: "/tmp/elsewhere" }), /inside the repo/);
    assert.throws(() => startClaude({ prompt: "x", cwd: "\0bad" }));
    assert.deepEqual(fs.readdirSync(tmp), []);
    // And when the CLI is simply not installed, the failure is a sentence and
    // the directory still goes.
    const saved = process.env.PATH;
    process.env.PATH = path.join(tmp, "nowhere");
    try {
      await assert.rejects(startClaude({ prompt: "x", timeoutSec: 30 }).result, /CLI not found in PATH/);
    } finally {
      process.env.PATH = saved;
    }
    assert.deepEqual(fs.readdirSync(tmp), []);
  });
});

test("the agent's writes are reported as they appear in the stream, even when the run is then killed", async () => {
  await withFakeClaude(async ({ tmp }) => {
    const seen = [];
    const { result, kill } = startClaude({ prompt: "STREAM", cwd: tmp, contentDir: path.join(REPO_ROOT, "content"), timeoutSec: 30, onWrite: (p) => { seen.push(p); if (seen.length === 2) kill(); } });
    await assert.rejects(result, /cancelled/);
    assert.deepEqual(seen, [path.join(tmp, "a.md"), "/abs/b.md"], "relative paths are resolved against the run's working directory");
  });
});

test("a fatal signal runs the undo hooks after the kills and before returning", () => {
  const order = [];
  const timer = reapOnSignal(143, { exit: () => {}, graceMs: 10_000, kills: new Set([() => order.push("kill")]), hooks: new Set([() => order.push("hook"), () => { throw new Error("a hook failing"); }, () => order.push("hook 2")]) });
  clearTimeout(timer);
  assert.deepEqual(order, ["kill", "hook", "hook 2"]);
});

test("a fatal signal kills live agents and exits only after a grace period", async () => {
  const killed = [];
  const exits = [];
  const timer = reapOnSignal(143, { exit: (c) => exits.push(c), graceMs: 30, kills: new Set([() => killed.push("a"), () => { throw new Error("gone"); }, () => killed.push("c")]) });
  assert.deepEqual(killed, ["a", "c"], "every agent is killed at once, one failing kill does not stop the rest");
  assert.deepEqual(exits, [], "no immediate exit: Vite's own shutdown gets to run");
  assert.equal(timer.hasRef(), false, "the fallback timer does not keep the process alive");
  await new Promise((r) => setTimeout(r, 80));
  assert.deepEqual(exits, [143]);
});

test("old per-run temp directories are swept by name and age; nothing else is touched", () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "fret-not-sweep-"));
  try {
    const old = path.join(tmp, "fret-not-mcp-old"), fresh = path.join(tmp, "fret-not-mcp-fresh"), other = path.join(tmp, "someone-elses");
    for (const d of [old, fresh, other]) { fs.mkdirSync(d); fs.writeFileSync(path.join(d, "prompt.txt"), "the transcript"); }
    fs.writeFileSync(path.join(tmp, "fret-not-mcp-a-file"), "not a directory");
    const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60_000);
    for (const d of [old, other, path.join(tmp, "fret-not-mcp-a-file")]) fs.utimesSync(d, twoHoursAgo, twoHoursAgo);
    assert.equal(sweepPromptDirs({ tmp }), 1);
    assert.deepEqual(fs.readdirSync(tmp).sort(), ["fret-not-mcp-a-file", "fret-not-mcp-fresh", "someone-elses"]);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});
