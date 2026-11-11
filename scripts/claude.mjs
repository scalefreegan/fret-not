// Headless Claude Code CLI wrapper — the Tutor's runtime (sibling pattern
// from lingo-dojo / travel-guide / wine-guide). Spawns `claude -p`, detached
// so the whole process group can be killed (the CLI spawns children).
//
// The prompt (the whole chat transcript) goes in on STDIN, from a temp file
// opened read-only: `claude -p` with no prompt argument reads its prompt
// there. It is not an argument because macOS caps the argument list at about
// 1 MB (E2BIG) and a long conversation would one day cross it; and it is a
// file rather than a pipe because the CLI stalls waiting on a piped stdin
// that is left open, while a file simply ends.
//
// The run is read as it happens (`--output-format stream-json`): one JSON
// object per line, the last of which is the same result envelope the plain
// `json` format prints. The lines before it carry the agent's tool calls;
// the paths of its Write/Edit calls are collected for the log and the tests.
// (The server does not rely on them: it runs a writing turn in a git worktree
// of its own and asks git what changed there — web/server/turn.ts.)
//
// The permissions are the whole point of this file. The agent may Read its
// working directory and may Write/Edit ONLY under the content directory it
// is given; everything else is closed by three layers (see buildArgs). A
// turn that may not write gets the "read" profile: no Write or Edit tool
// exists for it at all. It runs on the user's Claude Code login, never an
// API key.

import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

/** The same rule as contentDir() in web/server/loader.ts (FRET_CONTENT_DIR
 *  resolved against the repo root, else <repo>/content), repeated here so
 *  this file stays plain ESM with no imports from web/. The server passes
 *  the loader's own value in anyway; this is the default for the tests. */
export function contentRoot() {
  const override = process.env.FRET_CONTENT_DIR;
  return override ? path.resolve(REPO_ROOT, override) : path.join(REPO_ROOT, "content");
}

/* -------------------------------- models --------------------------------- */

/** The models offered for the tutor. `id` is what the CLI's --model accepts.
 *  Sonnet is the default: answers and lesson edits are small. */
export const AGENT_MODELS = [
  { id: "claude-sonnet-5-5", label: "Sonnet 5.5", note: "quick and cheap, the default" },
  { id: "claude-opus-5-5", label: "Opus 5.5", note: "deeper, slower, dearer" },
  { id: "claude-fable-5-2", label: "Fable 5.2", note: "most capable, most expensive" },
];

export const DEFAULT_MODEL = "claude-sonnet-5-5";

export function isAgentModel(id) {
  return AGENT_MODELS.some((m) => m.id === id);
}

/* ------------------------------ failure hints ----------------------------- */

// Recognize known headless-CLI failures so callers can say what to actually do
// ("sign in again", "wait for the limit to reset") instead of a cryptic exit code.
const AUTH_ERROR_RE = /invalid api key|please run \/login|not logged in|log ?in again|login expired|oauth token.{0,40}(expired|revoked|invalid)|authentication[_ ]?error|credentials?.{0,20}(expired|invalid|missing)|unauthorized|re-?authenticate/i;
const LIMIT_ERROR_RE = /usage limit reached|session limit|hit your .{0,20}limit|limit will reset|out of (extra )?usage|rate.?limit(ed|_error)?|\b429\b/i;
const OVERLOAD_ERROR_RE = /overloaded_error|overloaded|529|api.{0,20}(unavailable|internal server error)/i;
const AUTH_FIX = "open a terminal, run `claude`, type `/login` and finish the browser sign-in, then retry here.";

export function failureHint(text) {
  if (AUTH_ERROR_RE.test(text)) return `Claude Code sign-in has expired — ${AUTH_FIX}`;
  if (LIMIT_ERROR_RE.test(text)) {
    // the CLI phrases it "Claude AI usage limit reached|<epoch-seconds>"
    const m = text.match(/limit reached\|(\d{9,13})/);
    const reset = m ? new Date(Number(m[1]) * (m[1].length <= 10 ? 1000 : 1)).toLocaleString() : null;
    return `Claude usage limit reached — not an auth problem. Wait for the limit to reset${reset ? ` (~${reset})` : ""} and retry.`;
  }
  if (OVERLOAD_ERROR_RE.test(text)) return "Claude API is overloaded right now — transient; retry in a minute.";
  return null;
}

/* ------------------------------- the sandbox ------------------------------ */

/**
 * The built-in tools the agent gets AT ALL (`--tools`). This is the structural
 * layer: a tool not named here does not exist for the run, so the list below
 * is a cap, not a race against a registry that grows every CLI release.
 * Read/Glob/Grep for orientation (the repo, docs/CONTENT.md, the existing
 * lessons); Edit/Write for the content, scoped further by CONTENT_GRANTS.
 */
export const TOOLS = ["Read", "Glob", "Grep", "Edit", "Write"];

/** The tools of a read-only turn (the "read" profile). */
export const READ_TOOLS = ["Read", "Glob", "Grep"];

/**
 * Names denied outright (`--disallowedTools`), the second layer behind
 * `--tools`. Bash/WebFetch/WebSearch/NotebookEdit are the ones the brief names;
 * the rest is the Atlas SANDBOX_DENIED list minus the file tools this agent
 * needs. ToolSearch is deliberately NOT here: Atlas measured that denying it
 * makes the CLI serve every deferred tool up front instead of on demand.
 */
export const DENIED = [
  "Bash", "PowerShell", "WebFetch", "WebSearch", "NotebookEdit",
  "Task", "Agent", "Workflow", "SendMessage",
  "EnterWorktree", "ExitWorktree",
  "ReadMcpResourceTool", "ReadMcpResourceDirTool", "ListMcpResourcesTool",
  "TaskCreate", "TaskOutput", "TaskStop",
];

/**
 * Permission grants (`--allowedTools`). Read/Glob/Grep are approved for the
 * working directory (`--restricted` confines the file tools to cwd, which is
 * the repo root). Edit and Write are approved ONLY for paths under the content
 * directory, with the CLI's path-scoped rule syntax: `Edit(//abs/path/**)`,
 * where the leading `//` means an absolute filesystem path, i.e. `//Users/…`
 * (a single `/` would be relative to the project root). An Edit or Write anywhere else
 * would prompt, and with `--permission-prompts none` a prompt is a denial.
 *
 * Throws when the content directory is not an absolute path inside the repo:
 * `--restricted` would refuse writes there anyway, so a misconfigured
 * FRET_CONTENT_DIR should fail loudly at spawn time rather than as a run in
 * which every edit is silently denied.
 */
export function contentGrants(contentDir = contentRoot(), repoRoot = REPO_ROOT) {
  const dir = path.resolve(contentDir);
  const rel = path.relative(repoRoot, dir);
  if (!path.isAbsolute(dir) || !rel || rel.startsWith("..") || path.isAbsolute(rel)) {
    throw new Error(`content directory must be inside the repo (${repoRoot}), got ${contentDir}`);
  }
  // The rule's `//` stands in for the filesystem root, so the path goes in
  // without its own leading slash: `Edit(//Users/x/repo/content/**)`.
  const rulePath = dir.replace(/^\/+/, "");
  return [`Edit(//${rulePath}/**)`, `Write(//${rulePath}/**)`];
}

/**
 * Deny rules inside the grant above: nothing under a `.git` directory in the
 * content tree (a nested repository's config can run commands when git is
 * next used there). `--restricted` already leaves writes to git files to "a
 * person or the configured permission handler", and there is neither, so this
 * is a second lock on the same door; the server also discards a turn that
 * wrote any dot-file (web/server/turn.ts).
 */
export function contentDenials(contentDir = contentRoot(), repoRoot = REPO_ROOT) {
  const grants = contentGrants(contentDir, repoRoot); // validates the directory
  const base = grants[0].slice("Edit(".length, -"/**)".length);
  return ["Edit", "Write"].flatMap((tool) => [`${tool}(${base}/.git/**)`, `${tool}(${base}/**/.git/**)`]);
}

/**
 * The argv for one run — pure, so the test pins the sandbox without spawning.
 *
 *   --restricted           ignores the user's, this repo's and local settings
 *                          files (no hooks, no permission rules from the user's
 *                          own setup), confines the file tools to cwd, and
 *                          refuses bypassPermissions.
 *   --permission-prompts none
 *                          there is nobody to answer a prompt; anything that
 *                          would ask is denied automatically.
 *   --mcp-config <empty> --strict-mcp-config
 *                          only the servers in THIS file load — none — rather
 *                          than every MCP server the user has configured
 *                          globally (mail, calendar on this machine).
 *   --no-session-persistence
 *                          the server keeps the history (data/chat.jsonl);
 *                          nothing to resume, so nothing written under
 *                          ~/.claude/projects per run.
 */
export function buildArgs({ systemPrompt, model = DEFAULT_MODEL, maxTurns = 25, mcpConfigPath, contentDir, repoRoot, tools = "content" }) {
  if (!isAgentModel(model)) throw new Error(`unknown model: ${model}`);
  if (tools !== "content" && tools !== "read" && tools !== "none") throw new Error(`unknown tool profile: ${tools}`);
  // "read" is a turn that may look but not write: Edit and Write are not
  // among its tools, so there is nothing to grant or scope.
  // "none" is a turn with no file access at all: `--tools ""` removes every
  // built-in tool and nothing is granted. Unused today; kept so a future
  // tool-less turn (a quick spoken hint, say) inherits the same sandbox.
  const toolArgs = tools === "none"
    ? ["--tools", ""]
    : tools === "read"
      ? ["--tools", READ_TOOLS.join(","), "--allowedTools", ...READ_TOOLS]
      : ["--tools", TOOLS.join(","), "--allowedTools", "Read", "Glob", "Grep", ...contentGrants(contentDir, repoRoot)];
  const denyPaths = tools === "content" ? contentDenials(contentDir, repoRoot) : [];
  // A profile that cannot write still names the write tools as denied.
  const denyTools = tools === "content" ? DENIED : [...DENIED, "Edit", "Write", "MultiEdit"];
  // `-p` with no prompt argument: the prompt is read from stdin (startClaude).
  // stream-json needs --verbose in print mode.
  const args = [
    "-p",
    "--output-format", "stream-json",
    "--verbose",
    "--max-turns", String(maxTurns),
    "--model", model,
    "--restricted",
    "--permission-prompts", "none",
    "--no-session-persistence",
    ...toolArgs,
    "--disallowedTools", ...denyTools, ...denyPaths,
  ];
  if (systemPrompt) args.push("--append-system-prompt", systemPrompt);
  if (mcpConfigPath) args.push("--mcp-config", mcpConfigPath, "--strict-mcp-config");
  return args;
}

/**
 * The child's environment: the server's, minus anything that would make the
 * CLI bill an API key instead of the Claude Code login (ANTHROPIC_API_KEY),
 * and minus the markers a parent Claude Code session leaves behind (the dev
 * server is often started from inside one), which a nested CLI reads as
 * "I am a child session" and changes its behaviour on.
 */
export function childEnv(env = process.env) {
  const out = {};
  for (const [k, v] of Object.entries(env)) {
    if (k === "ANTHROPIC_API_KEY" || k === "CLAUDECODE" || k.startsWith("CLAUDE_CODE_")) continue;
    out[k] = v;
  }
  return out;
}

/* --------------------------------- running -------------------------------- */

/** The tools that write a file, and where each names it. */
const WRITE_TOOLS = { Write: "file_path", Edit: "file_path", MultiEdit: "file_path", NotebookEdit: "notebook_path" };

/**
 * The file paths one line of the stream asks to write: every Write/Edit tool
 * call in an `assistant` message. The call is reported before it runs (and a
 * denied call is reported too), so this is "may have written", never "did" —
 * the server compares with what actually changed on disk.
 */
export function toolWrites(line) {
  let msg;
  try { msg = JSON.parse(line); } catch { return []; }
  const blocks = msg && msg.type === "assistant" && msg.message && Array.isArray(msg.message.content) ? msg.message.content : [];
  const out = [];
  for (const b of blocks) {
    if (!b || b.type !== "tool_use" || !Object.hasOwn(WRITE_TOOLS, b.name)) continue;
    const p = b.input && b.input[WRITE_TOOLS[b.name]];
    if (typeof p === "string" && p) out.push(p);
  }
  return out;
}

/**
 * The result envelope in a run's stdout: the whole output when it is one JSON
 * object (`--output-format json`), else the last `{"type":"result"}` line of
 * a stream (`stream-json`). null when there is none (the run died first).
 */
export function resultEnvelope(stdout) {
  try {
    const whole = JSON.parse(stdout);
    if (whole && typeof whole === "object" && !Array.isArray(whole)) return whole;
  } catch { /* not a single envelope */ }
  const lines = stdout.split("\n");
  for (let i = lines.length - 1; i >= 0; i--) {
    const line = lines[i].trim();
    if (!line.startsWith("{")) continue;
    try {
      const obj = JSON.parse(line);
      if (obj && obj.type === "result") return obj;
    } catch { /* a torn line */ }
  }
  return null;
}

/**
 * Classify a finished CLI run — pure, so the trickiest branching in this file
 * is testable without spawning anything. Returns
 *   { ok: true, text, raw }  or  { ok: false, message }.
 */
export function classifyExit({ code, stdout, stderr }) {
  // The CLI can exit 0 with is_error inside the JSON wrapper, or exit
  // non-zero with the real message in the wrapper's `result`.
  const wrapper = resultEnvelope(stdout);
  if (code !== 0 || (wrapper && wrapper.is_error)) {
    // ERROR envelopes carry `errors[]`, not `result` — subtypes like
    // error_max_turns say what went wrong ONLY there.
    const envelopeErrors = wrapper && Array.isArray(wrapper.errors)
      ? wrapper.errors.filter((e) => typeof e === "string").join("; ")
      : "";
    const resultText = wrapper && wrapper.result ? String(wrapper.result) : "";
    const hint = failureHint(wrapper ? `${stderr}\n${resultText}` : `${stderr}\n${stdout}`);
    if (hint) return { ok: false, message: hint };
    const detail = stderr.trim() || resultText || envelopeErrors || stdout.trim();
    return {
      ok: false,
      message: detail
        ? `claude exited ${code}: ${detail.slice(0, 800)}`
        : `claude exited ${code} with no error output — most often an expired sign-in: ${AUTH_FIX}`,
    };
  }
  return { ok: true, text: wrapper && typeof wrapper.result === "string" ? wrapper.result : stdout, raw: wrapper };
}

// Agents are spawned detached (own process group), so nothing kills them for
// free when THIS process dies — a SIGTERM'd server (the Mac app's Quit, a
// pkill) would orphan an in-flight agent to keep running (and billing) with
// no owner. Track every live kill handle and reap them on fatal signals.
//
// The set lives on globalThis, not in this module: Vite re-evaluates server
// modules when one is edited, and a fresh module-level Set would forget the
// agents the previous copy started (and arm a second set of handlers).
const reaper = (globalThis.__fretNotReaper ??= { liveKills: new Set(), armed: false, hooks: new Set() });
reaper.hooks ??= new Set();
const liveKills = reaper.liveKills;

/**
 * Register a SYNCHRONOUS function to run on a fatal signal, after the live
 * agents have been killed and before anything can end the process. The
 * server uses it to delete a half-finished tutor turn's worktree: Vite's own
 * SIGTERM handler exits as soon as the HTTP server has closed, and an async
 * cleanup would lose that race. Returns a function that removes the hook.
 */
export function onFatalSignal(hook) {
  reaper.hooks.add(hook);
  return () => reaper.hooks.delete(hook);
}

/** Block this thread for `ms` (signal handlers here must finish their work
 *  before returning; see onFatalSignal). */
export function sleepSync(ms) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

/** After SIGKILLing agents: how long to let the kernel finish with them
 *  before the hooks read what they left on disk. */
const KILL_SETTLE_MS = 150;

/** How long the process is given to shut down by itself after a fatal signal
 *  before the reaper ends it. */
export const REAP_GRACE_MS = 2000;

/**
 * What a fatal signal does: kill every live agent now, then make sure the
 * process ends — but not by calling process.exit() on the spot. Vite has its
 * own SIGTERM handler that closes the server cleanly and exits; exiting here
 * first would cut that short. So the exit is a fallback on an unref'd timer:
 * if something else ends the process in time it never fires, and it does not
 * itself keep the process alive.
 */
export function reapOnSignal(code, { exit = (c) => process.exit(c), graceMs = REAP_GRACE_MS, kills = liveKills, hooks = reaper.hooks } = {}) {
  const had = kills.size > 0;
  for (const kill of kills) {
    try { kill(); } catch { /* group already gone */ }
  }
  if (hooks.size) {
    // SIGKILL cannot be caught, so the agents stop at once; give the kernel a
    // moment to finish tearing them down, then let the server clean up after
    // them — synchronously, before this handler returns and anything else
    // gets to end the process.
    if (had) sleepSync(KILL_SETTLE_MS);
    for (const hook of hooks) {
      try { hook(); } catch (e) { console.error(`[fret-not] shutdown hook failed: ${String(e?.message || e)}`); }
    }
  }
  const timer = setTimeout(() => exit(code), graceMs);
  timer.unref?.();
  return timer;
}

function armReaper() {
  if (reaper.armed) return;
  reaper.armed = true;
  for (const [sig, code] of [["SIGTERM", 143], ["SIGINT", 130], ["SIGHUP", 129]]) {
    process.on(sig, () => { reapOnSignal(code); });
  }
}

/**
 * Start a headless agent run. Returns { result, kill, pid } — `result`
 * resolves to
 *   { text, costUsd, numTurns, durationMs, usage, permissionDenials, writes, raw }
 * where `text` is the agent's final reply (from the stream's result line),
 * `writes` the absolute paths its Write/Edit calls named, and `kill()`
 * SIGKILLs the process group. `signal` (an AbortSignal) does the same when it
 * fires — wire it to request-close.
 *
 * `onWrite(absPath)` is called as each Write/Edit call appears in the stream
 * — while the run is still going, so the caller knows what the agent touched
 * even if the run is then killed and `result` rejects.
 */
export function startClaude({ prompt, systemPrompt, model, cwd = REPO_ROOT, signal, maxTurns = 25, timeoutSec = 600, tools = "content", contentDir, repoRoot, onWrite }) {
  const chosen = model ?? DEFAULT_MODEL;
  // Say which model actually went out: a setting that silently failed to
  // apply is otherwise invisible until the bill.
  console.log(`[fret-not] claude: spawning ${chosen} (${tools === "none" ? "no tools" : tools === "read" ? "read-only tools" : "content tools"}, max ${maxTurns} turns, ${timeoutSec}s timeout)`);

  // An EMPTY MCP config under --strict-mcp-config: see buildArgs.
  let mcpDir = fs.mkdtempSync(path.join(os.tmpdir(), "fret-not-mcp-"));
  const mcpConfigPath = path.join(mcpDir, "mcp.json");
  fs.writeFileSync(mcpConfigPath, JSON.stringify({ mcpServers: {} }), { mode: 0o600 });
  const cleanupMcp = () => {
    if (!mcpDir) return;
    const dir = mcpDir;
    mcpDir = null;
    try { fs.rmSync(dir, { recursive: true, force: true }); } catch { /* tmp, it can wait for the OS */ }
  };

  // Anything that throws before the child exists (a bad model, a content
  // directory outside the repo, spawn itself failing synchronously) must not
  // leave the temp directory behind: no 'close' or 'error' event will come.
  let proc;
  let promptFd = null;
  try {
    const args = buildArgs({ systemPrompt, model: chosen, maxTurns, mcpConfigPath, tools, contentDir, repoRoot });
    const promptPath = path.join(mcpDir, "prompt.txt");
    fs.writeFileSync(promptPath, String(prompt ?? ""), { mode: 0o600 });
    promptFd = fs.openSync(promptPath, "r");
    proc = spawn("claude", args, {
      cwd,
      env: childEnv(),
      stdio: [promptFd, "pipe", "pipe"],
      detached: true,
    });
  } catch (e) {
    cleanupMcp();
    throw e;
  } finally {
    // The child has its own copy of the descriptor by now.
    if (promptFd !== null) { try { fs.closeSync(promptFd); } catch { /* already closed */ } }
  }

  let killed = false;
  let timedOut = false;
  const kill = () => {
    killed = true;
    // No pid means the spawn failed (ENOENT): there is nothing to kill, and
    // process.kill(-undefined) must not be attempted.
    if (!proc.pid) return;
    try { process.kill(-proc.pid, "SIGKILL"); } catch { /* already gone */ }
  };
  armReaper();
  liveKills.add(kill);
  proc.on("close", () => { liveKills.delete(kill); cleanupMcp(); });
  // A spawn failure (ENOENT) can emit 'error' with no 'close' behind it.
  proc.on("error", () => { liveKills.delete(kill); cleanupMcp(); });
  if (signal) {
    if (signal.aborted) kill();
    else signal.addEventListener("abort", kill, { once: true });
  }

  const result = new Promise((resolve, reject) => {
    let stdout = "", stderr = "", pending = "";
    const writes = new Set();
    const scan = (line) => {
      for (const p of toolWrites(line)) {
        const abs = path.resolve(cwd, p);
        if (writes.has(abs)) continue;
        writes.add(abs);
        try { onWrite?.(abs); } catch (e) { console.error(`[fret-not] claude: onWrite failed: ${String(e?.message || e)}`); }
      }
    };
    proc.stdout.setEncoding("utf8");
    proc.stdout.on("data", (d) => {
      stdout += d;
      pending += d;
      let nl;
      while ((nl = pending.indexOf("\n")) >= 0) {
        scan(pending.slice(0, nl));
        pending = pending.slice(nl + 1);
      }
    });
    proc.stderr.on("data", (d) => { stderr += d; });

    // The timeout only kills; the rejection waits for 'close', like a
    // cancel does. The caller deletes the run's worktree when this rejects,
    // and must not start while the process group could still be writing.
    const timer = setTimeout(() => { timedOut = true; kill(); }, timeoutSec * 1000);

    proc.on("error", (err) => {
      clearTimeout(timer);
      if (err.code === "ENOENT") {
        reject(new Error("`claude` CLI not found in PATH — install Claude Code (https://claude.com/claude-code), then retry"));
        return;
      }
      reject(err);
    });
    proc.on("close", (code) => {
      clearTimeout(timer);
      signal?.removeEventListener("abort", kill);
      if (pending) scan(pending);
      // our own kill (client disconnect) — not an auth/limit mystery
      if (timedOut) return reject(new Error(`claude timed out after ${timeoutSec}s`));
      if (killed) return reject(new Error("cancelled"));
      const verdict = classifyExit({ code, stdout, stderr });
      if (!verdict.ok) return reject(new Error(verdict.message));
      const raw = verdict.raw ?? {};
      resolve({
        text: verdict.text,
        costUsd: typeof raw.total_cost_usd === "number" ? raw.total_cost_usd : null,
        numTurns: typeof raw.num_turns === "number" ? raw.num_turns : null,
        durationMs: typeof raw.duration_ms === "number" ? raw.duration_ms : null,
        usage: raw.usage ?? null,
        permissionDenials: Array.isArray(raw.permission_denials) ? raw.permission_denials : [],
        writes: [...writes],
        raw,
      });
    });
  });

  return { result, kill, pid: proc.pid ?? null };
}
