import { execFile, execFileSync } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import type { ContentProblem } from "../shared/content.ts";
import { REPO_ROOT, contentDir } from "./loader.ts";

// Where a tutor turn writes, and how what it wrote reaches the repository.
//
// THE RULE. The tutor never writes into the owner's working tree. A turn that
// may write runs in its own git worktree (a second checkout of the last
// commit, in a temp directory outside the repository). What it leaves there is
// validated, committed THERE, and only then brought into the real repository
// as a fast-forward done with plumbing (applyCommit: `git read-tree -m -u`,
// which refuses as a whole rather than overwrite anything in the way, then a
// compare-and-swap `git update-ref` of the branch). A turn that fails, is
// cancelled, times out, or dies with the server therefore has nothing to
// undo: the worktree is deleted and the repository was never touched.
//
// WHEN A TURN MAY WRITE (writable). Only when content/ is exactly the last
// commit: nothing modified, staged, untracked or ignored in it, HEAD on a
// branch with at least one commit, no merge/rebase in progress, and no
// symbolic link or `.git` in it. Then "what the worktree holds" and "what the
// owner is looking at" are the same thing, and the validated result is what
// lands. Otherwise the turn still runs, but with no write tools at all, and
// the learner is told why. Uncommitted work OUTSIDE content/ is the normal
// state of this repository and is neither a reason to refuse nor touched.
//
// WHAT GIT IS ALLOWED TO DO. Only plumbing and a plain commit — never `git
// merge`, `pull`, `checkout`, `stash` or `worktree prune`, whose behaviour the
// owner's configuration can change (merge.autoStash would stash and re-apply
// the owner's whole working tree, losing what was staged). Every call runs
// with hooks switched off (core.hooksPath=/dev/null), signing off, no
// fsmonitor program, no submodule recursion and no automatic gc: a hook that
// fails, hangs or rewrites files must not be able to wedge a turn or
// half-apply it, and a signing prompt has nobody to answer it. So tutor
// commits are unsigned and run no hook. Each call has a timeout. Nothing is
// ever pushed. (The owner's clean/smudge filters and line-ending settings do
// apply when the files are written into the owner's tree, as for any
// checkout of theirs.)
//
// LEFTOVERS. A worktree a dead server left behind is a directory under a
// path this app owns (workspaceBase) holding a marker that names the server
// process that made it. sweepWorkspaces removes those whose maker is no
// longer running (and unmarked ones once they are old), each by its own path
// with `git worktree remove`; it never runs `git worktree prune`, which would
// also drop the owner's worktrees on an unplugged drive. A process is only
// ever asked about (`ps`), never signalled.
//
// WHAT IS NOT CLOSED. The checks and the apply are separate git calls, a few
// milliseconds apart. An owner git command landing exactly in that gap can
// still (a) have an ignored file created in it overwritten, (b) find the
// tutor's files staged in a branch created in it, or (c) include the tutor's
// files in a commit made in it. If the server is killed between the two apply
// steps, the tutor's files are in the working tree and staged but the branch
// has not moved; the commit is still named refs/tutor/<id> and the next turn
// says so (heldRefs).

const execFileP = promisify(execFile);

/** One git call may take this long; a stuck one fails the step it was in. */
const GIT_TIMEOUT_MS = 60_000;

/** A leftover worktree with no readable owner marker is deleted once it is
 *  older than this — longer than any turn can run (two agent runs of ten
 *  minutes each). Marked ones go by whether their maker is still running. */
export const STALE_MS = 45 * 60_000;

/** The repository the tutor commits into: FRET_REPO_ROOT when set (resolved
 *  against the repo root; tests point it at a throwaway repo around their
 *  scratch content dir so nothing lands in this one), else this repo. Read
 *  per call, like contentDir(). */
export function gitRoot(): string {
  const override = process.env.FRET_REPO_ROOT;
  return override ? path.resolve(REPO_ROOT, override) : REPO_ROOT;
}

/** Options before the subcommand on every call: no hooks, no signing, and a
 *  file name is a name, never a glob. */
const QUIET = [
  "-c", "core.hooksPath=/dev/null", "-c", "commit.gpgsign=false", "-c", "tag.gpgsign=false", "-c", "advice.detachedHead=false",
  // Settings of the owner's that would make these calls run a program or
  // reach beyond the paths named: a file-system monitor hook, recursion into
  // submodules, a background gc, and (belt and braces: neither command is
  // used here) stashing around a merge or rebase.
  "-c", "core.fsmonitor=false", "-c", "submodule.recurse=false", "-c", "gc.auto=0", "-c", "maintenance.auto=false", "-c", "merge.autoStash=false", "-c", "rebase.autoStash=false",
  "--literal-pathspecs",
];
/** Extra options for calls inside a tutor worktree: its files are the
 *  commit's bytes, whatever line-ending conversion the owner has set. */
const IN_WORKTREE = ["-c", "core.autocrlf=false"];

/** The environment for git: the server's, minus variables that would point
 *  git at some other repository or index, and with prompting off. */
function gitEnv(): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = { ...process.env, GIT_TERMINAL_PROMPT: "0", GIT_OPTIONAL_LOCKS: "0" };
  for (const k of ["GIT_DIR", "GIT_WORK_TREE", "GIT_INDEX_FILE", "GIT_COMMON_DIR", "GIT_PREFIX", "GIT_NAMESPACE"]) delete env[k];
  return env;
}

/** Every git call is execFile with an argv — never a shell string, since the
 *  commit subject is agent-written text. */
async function git(cwd: string, args: string[], { config = [] as string[], detached = false } = {}): Promise<string> {
  const { stdout } = await execFileP("git", [...QUIET, ...config, ...args], { cwd, env: gitEnv(), maxBuffer: 16 << 20, timeout: GIT_TIMEOUT_MS, detached } as Parameters<typeof execFileP>[2]);
  return String(stdout);
}
/** A call inside a tutor worktree. */
const gitWs = (cwd: string, args: string[]): Promise<string> => git(cwd, args, { config: IN_WORKTREE });
function gitSync(cwd: string, args: string[]): string {
  return execFileSync("git", [...QUIET, ...args], { cwd, env: gitEnv(), maxBuffer: 16 << 20, timeout: GIT_TIMEOUT_MS, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
}
const gitError = (e: unknown): string => {
  const err = e as Error & { stderr?: string | Buffer; killed?: boolean };
  if (err.killed) return "git did not answer in time";
  return (String(err.stderr ?? "").trim() || err.message || String(e)).trim().split("\n").slice(0, 4).join(" ").slice(0, 400);
};

/** The content directory relative to the repository, with forward slashes;
 *  null when it is not inside it. */
function contentSpec(root: string, dir: string): string | null {
  const rel = path.relative(root, dir);
  if (!rel || rel.startsWith("..") || path.isAbsolute(rel)) return null;
  return rel.split(path.sep).join("/");
}

/* ------------------------------ may it write? ----------------------------- */

/** What git is in the middle of in this repository, if anything. */
function operationInProgress(gitDir: string): string | null {
  const marks: [string, string][] = [["MERGE_HEAD", "a merge"], ["CHERRY_PICK_HEAD", "a cherry-pick"], ["REVERT_HEAD", "a revert"], ["rebase-merge", "a rebase"], ["rebase-apply", "a rebase"], ["BISECT_LOG", "a bisect"]];
  for (const [name, what] of marks) if (fs.existsSync(path.join(gitDir, name))) return what;
  return null;
}

/** Symbolic links and `.git` entries under `dir` (relative paths). A link
 *  would be checked out in the worktree too, and a write through it lands
 *  wherever it points; a nested repository is invisible to the outer one. */
export function unsafePaths(dir: string, limit = 20): string[] {
  const out: string[] = [];
  const visit = (abs: string, rel: string): void => {
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(abs, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      if (out.length >= limit) return;
      const r = rel ? `${rel}/${e.name}` : e.name;
      if (e.isSymbolicLink() || e.name === ".git") out.push(r);
      else if (e.isDirectory()) visit(path.join(abs, e.name), r);
    }
  };
  visit(dir, "");
  return out;
}

/** The first symbolic link among the folders from `root` down to `dir`
 *  (inclusive of `dir`, exclusive of `root`), as a path relative to `root`;
 *  null when there is none. A content directory reached through a link is
 *  the same link in the worktree, pointing at the same real folder — the
 *  agent's "private copy" would be the owner's live files. */
export function linkOnTheWay(root: string, dir: string): string | null {
  const parts = path.relative(root, dir).split(path.sep).filter(Boolean);
  let at = root;
  for (let i = 0; i < parts.length; i++) {
    at = path.join(at, parts[i]);
    try {
      if (fs.lstatSync(at).isSymbolicLink()) return parts.slice(0, i + 1).join("/");
    } catch {
      return null; // does not exist: nothing to follow
    }
  }
  return null;
}

/** One line of `git status --porcelain -z`: the two status letters and the
 *  path relative to the repository. */
interface StatusEntry {
  code: string;
  path: string;
}
function parseStatus(out: string): StatusEntry[] {
  const parts = out.split("\0");
  const entries: StatusEntry[] = [];
  for (let i = 0; i < parts.length; i++) {
    const s = parts[i];
    if (s.length < 4) continue;
    const code = s.slice(0, 2);
    entries.push({ code, path: s.slice(3) });
    if (code[0] === "R" || code[0] === "C") i++; // the next field is the old name
  }
  return entries;
}

/** Everything under `spec` that is not exactly the last commit: modified,
 *  staged, deleted, untracked AND ignored files. */
async function statusOf(cwd: string, spec: string, config: string[] = []): Promise<StatusEntry[]> {
  return parseStatus(await git(cwd, ["status", "--porcelain=v1", "-z", "--untracked-files=all", "--ignored", "--", spec], { config }));
}

/** What stands between content/ and "exactly the last commit", as a phrase
 *  for the learner; null when nothing does. Finder's `.DS_Store` files (when
 *  git ignores them) do not count: the loader skips dot-files, and nothing
 *  the tutor may write can collide with one. */
async function dirtyReason(root: string, spec: string): Promise<string | null> {
  const entries = (await statusOf(root, spec)).filter((e) => !(e.code === "!!" && path.posix.basename(e.path.replace(/\/$/, "")) === ".DS_Store"));
  if (entries.length) {
    const shown = entries.slice(0, 5).map((e) => e.path).join(", ");
    return `${spec}/ has changes that are not committed (${shown}${entries.length > 5 ? `, and ${entries.length - 5} more` : ""})`;
  }
  // A file git has been told not to look at (assume-unchanged, skip-worktree,
  // a sparse checkout) can differ from the commit without showing in status.
  const hidden = (await git(root, ["ls-files", "-v", "-z", "--", spec])).split("\0").filter((l) => l && l[0] !== "H");
  if (hidden.length) return `${spec}/ has files git has been told to skip (${hidden.slice(0, 3).map((l) => l.slice(2)).join(", ")}), so the app cannot tell whether they match the last commit`;
  return null;
}

/** A repository and content directory a turn may write for, as of now. */
export interface Ready {
  ok: true;
  root: string;
  /** content/ relative to the repository. */
  spec: string;
  /** The commit the turn starts from (full hash). */
  base: string;
  /** The branch HEAD is on (full ref name). */
  branch: string;
}
/** Why a turn may not write, and what the owner can do about it. */
export interface NotReady {
  ok: false;
  reason: string;
  fix: string;
}

/**
 * May a tutor turn write right now? Never throws: anything git cannot answer
 * is a reason not to write.
 */
export async function writable(root: string = gitRoot(), dir: string = contentDir()): Promise<Ready | NotReady> {
  const no = (reason: string, fix: string): NotReady => ({ ok: false, reason, fix });
  const spec = contentSpec(root, dir);
  if (!spec) return no(`the content directory ${dir} is not inside the repository ${root}`, "Fix FRET_CONTENT_DIR.");
  try {
    let top: string;
    try {
      top = (await git(root, ["rev-parse", "--show-toplevel"])).trim();
    } catch {
      return no("this folder is not a git repository", "Run `git init` and make a first commit; the tutor keeps every change as a commit.");
    }
    if (fs.realpathSync(top) !== fs.realpathSync(root)) return no(`the app's folder is inside another git repository (${top})`, "Give the app a repository of its own.");
    let branch: string;
    try {
      branch = (await git(root, ["symbolic-ref", "-q", "HEAD"])).trim();
    } catch {
      return no("the repository is not on a branch (HEAD is detached)", "Check out a branch (`git switch main`), then ask again.");
    }
    let base: string;
    try {
      base = (await git(root, ["rev-parse", "-q", "--verify", "HEAD^{commit}"])).trim();
    } catch {
      return no("the repository has no commits yet", "Make a first commit, then ask again.");
    }
    const gitDir = (await git(root, ["rev-parse", "--absolute-git-dir"])).trim();
    const busy = operationInProgress(gitDir);
    if (busy) return no(`${busy} is in progress in the repository`, `Finish or abort the ${busy.replace(/^an? /, "")}, then ask again.`);
    const link = linkOnTheWay(root, dir);
    if (link) return no(`${link} is a symbolic link, so the tutor's separate copy of ${spec}/ would be the very same folder`, "Make it a real folder inside the repository (and commit that), then ask again.");
    if (fs.realpathSync(dir) !== path.join(fs.realpathSync(root), ...spec.split("/"))) return no(`${spec}/ is not a plain folder inside the repository`, "Make it a real folder inside the repository, then ask again.");
    const unsafe = unsafePaths(dir);
    if (unsafe.length) return no(`${spec}/ contains ${unsafe.length === 1 ? "a symbolic link or .git entry" : "symbolic links or .git entries"} (${unsafe.slice(0, 5).map((p) => `${spec}/${p}`).join(", ")})`, "Remove them (and commit that), then ask again.");
    const dirty = await dirtyReason(root, spec);
    if (dirty) return no(dirty, `Commit them (\`git add ${spec} && git commit\`) or set them aside (\`git stash -u -- ${spec}\`), then ask again.`);
    return { ok: true, root, spec, base, branch };
  } catch (e) {
    return no(`git could not be asked about the repository (${gitError(e)})`, "Check `git status` in a terminal.");
  }
}

/** What the learner is told when a turn runs without write access. */
export function readOnlyNote(why: NotReady): string {
  return `The tutor can answer questions right now but cannot write lessons, because ${why.reason}. ${why.fix}`.trim();
}

/* ------------------------------ the workspace ----------------------------- */

/** The directory this app's tutor worktrees live in, one sub-directory per
 *  repository: FRET_TUTOR_DIR when set, else under the system temp directory.
 *  Resolved through symlinks (macOS's /var is one), so the paths handed to
 *  the agent's sandbox are the ones the filesystem reports. */
export function workspaceBase(root: string = gitRoot()): string {
  const parent = process.env.FRET_TUTOR_DIR ? path.resolve(REPO_ROOT, process.env.FRET_TUTOR_DIR) : path.join(os.tmpdir(), "fret-not-tutor");
  let real = root;
  try {
    real = fs.realpathSync(root);
  } catch {
    /* a root that does not exist has no worktrees either */
  }
  const dir = path.join(parent, crypto.createHash("sha1").update(real).digest("hex").slice(0, 12));
  fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  return fs.realpathSync(dir);
}

/** One turn's private checkout. */
export interface Workspace {
  id: string;
  /** The worktree: a whole checkout of `base`. The agent's cwd. */
  dir: string;
  /** content/ inside it: the only place the agent may write. */
  content: string;
  root: string;
  spec: string;
  base: string;
  branch: string;
}

/** The app's own format documents, copied from the live tree into the
 *  worktree: the agent must write for the loader that is RUNNING (which will
 *  judge its work), and that may be ahead of the last commit. Never committed
 *  — only content/ is. */
const LIVE_DOCS = ["docs/CONTENT.md", "docs/CONTENT-REFERENCE.md"];

/** Check out `ready.base` into a new worktree. Throws when git refuses; the
 *  caller then runs the turn read-only. */
export async function openWorkspace(ready: Ready, now = Date.now()): Promise<Workspace> {
  const base = workspaceBase(ready.root);
  const inside = path.relative(fs.realpathSync(ready.root), base);
  if (!inside || (!inside.startsWith("..") && !path.isAbsolute(inside))) throw new Error(`the tutor's work directory ${base} is inside the repository`);
  const id = `${now}-${crypto.randomBytes(4).toString("hex")}`;
  const dir = path.join(base, id);
  await git(ready.root, ["worktree", "add", "--detach", "-q", dir, ready.base], { config: IN_WORKTREE });
  const ws: Workspace = { id, dir, content: path.join(dir, ...ready.spec.split("/")), root: ready.root, spec: ready.spec, base: ready.base, branch: ready.branch };
  try {
    markOwned(dir);
    if ((await gitWs(dir, ["rev-parse", "HEAD"])).trim() !== ready.base) throw new Error("the worktree is not at the commit it was made from");
    // content/ in the copy must be a real folder IN the copy: a tracked link
    // would lead the agent's writes somewhere else.
    const link = linkOnTheWay(dir, ws.content);
    if (link) throw new Error(`${link} is a symbolic link in the commit`);
    if (!fs.lstatSync(ws.content).isDirectory() || fs.realpathSync(ws.content) !== path.join(fs.realpathSync(dir), ...ready.spec.split("/"))) throw new Error(`${ready.spec}/ is not a plain folder in the commit`);
    for (const doc of LIVE_DOCS) {
      const from = path.join(ready.root, doc);
      if (!fs.existsSync(from)) continue;
      fs.mkdirSync(path.dirname(path.join(dir, doc)), { recursive: true });
      fs.copyFileSync(from, path.join(dir, doc));
    }
  } catch (e) {
    closeWorkspace(ws);
    throw e;
  }
  return ws;
}

/* ------------------------- whose worktree is this? ------------------------ */

/** The file in a worktree's root naming the server process that made it.
 *  Outside content/, so it is never validated or committed. */
const OWNER_FILE = ".fret-not-owner.json";

interface Owner {
  pid: number;
  /** When that process started, as `ps` prints it: a pid alone can be reused
   *  by another program after the server dies. */
  started: string;
}

/** When process `pid` started (`ps -o lstart=`), "" when there is no such
 *  process, null when `ps` could not be asked. Looks; never signals. */
export function processStarted(pid: number): string | null {
  if (!Number.isInteger(pid) || pid <= 0) return "";
  try {
    return execFileSync("ps", ["-o", "lstart=", "-p", String(pid)], { encoding: "utf8", env: { ...process.env, LC_ALL: "C" }, timeout: 5000, stdio: ["ignore", "pipe", "ignore"] }).trim();
  } catch (e) {
    // ps exits 1 with no output for a pid that does not exist.
    return (e as { status?: number }).status === 1 ? "" : null;
  }
}

let selfStarted: string | null | undefined;
function self(): Owner | null {
  selfStarted ??= processStarted(process.pid);
  return selfStarted ? { pid: process.pid, started: selfStarted } : null;
}

function markOwned(dir: string): void {
  const me = self();
  if (me) fs.writeFileSync(path.join(dir, OWNER_FILE), JSON.stringify(me), { mode: 0o600 });
}

/** "self": made by this server process. "alive": by another process that is
 *  still running. "dead": by one that is gone. "unknown": no readable marker,
 *  or `ps` could not be asked. */
function ownerOf(dir: string): "self" | "alive" | "dead" | "unknown" {
  let owner: Owner;
  try {
    owner = JSON.parse(fs.readFileSync(path.join(dir, OWNER_FILE), "utf8")) as Owner;
  } catch {
    return "unknown";
  }
  if (typeof owner?.pid !== "number" || typeof owner?.started !== "string" || !owner.started) return "unknown";
  const me = self();
  if (me && owner.pid === me.pid && owner.started === me.started) return "self";
  const started = processStarted(owner.pid);
  if (started === null) return "unknown";
  return started === owner.started ? "alive" : "dead";
}

/** Remove one of this app's worktrees: git's record of it and the directory,
 *  by its own path. Never `git worktree prune`. Never throws. */
function removeWorktree(root: string, dir: string): void {
  try {
    // Works whether or not the directory still exists; fails (harmlessly)
    // when git has no record of it.
    gitSync(root, ["worktree", "remove", "--force", dir]);
  } catch {
    /* removed below */
  }
  try {
    fs.rmSync(dir, { recursive: true, force: true });
  } catch (e) {
    console.error(`[fret-not] tutor: could not remove ${dir}: ${String((e as Error)?.message || e)}`);
  }
}

/** Delete a turn's worktree. Synchronous (it also runs from the shutdown
 *  hook) and never throws: the next sweep takes what this could not. */
export function closeWorkspace(ws: Pick<Workspace, "dir" | "root">): void {
  removeWorktree(ws.root, ws.dir);
}

/**
 * Delete worktrees an earlier turn or server left behind. Only directories
 * under this app's own work directory with this app's naming are looked at:
 *
 *   - made by a server process that is no longer running → removed;
 *   - made by THIS process → removed, unless it is `keep` (the turn in
 *     flight): one turn runs at a time, so any other is a leftover;
 *   - made by another process that is still running → left alone, however
 *     old (a Mac that slept mid-turn does not lose its worktree);
 *   - no readable marker → removed once older than `maxAgeMs`.
 *
 * Then git's records of worktrees under that directory whose folder is gone
 * are removed too, one by one. Never throws; returns how many directories
 * were removed.
 */
export function sweepWorkspaces({ root = gitRoot(), maxAgeMs = STALE_MS, now = Date.now(), keep = null as string | null } = {}): number {
  let removed = 0;
  let base: string;
  try {
    base = workspaceBase(root);
  } catch (e) {
    console.error(`[fret-not] tutor: could not clear old work directories: ${String((e as Error)?.message || e)}`);
    return 0;
  }
  try {
    for (const name of fs.readdirSync(base)) {
      const made = Number(/^(\d{10,})-[0-9a-f]+$/.exec(name)?.[1]);
      if (!Number.isFinite(made)) continue;
      const dir = path.join(base, name);
      if (keep && dir === keep) continue;
      const owner = ownerOf(dir);
      if (owner === "alive") continue;
      if (owner === "unknown" && now - made < maxAgeMs) continue;
      removeWorktree(root, dir);
      removed++;
    }
  } catch (e) {
    console.error(`[fret-not] tutor: could not clear old work directories: ${String((e as Error)?.message || e)}`);
  }
  try {
    // Records git still holds for worktrees of ours whose folder is gone.
    for (const line of gitSync(root, ["worktree", "list", "--porcelain"]).split("\n")) {
      if (!line.startsWith("worktree ")) continue;
      const dir = line.slice("worktree ".length);
      if (path.dirname(dir) !== base || !/^\d{10,}-[0-9a-f]+$/.test(path.basename(dir)) || fs.existsSync(dir)) continue;
      removeWorktree(root, dir);
    }
  } catch {
    /* not a repository: no records */
  }
  return removed;
}

/* --------------------------- what the turn wrote -------------------------- */

/** True for the files the loader reads: curriculum.yaml, instruments/*.yaml
 *  and lessons/**.md. */
export function isContentFile(rel: string): boolean {
  return rel === "curriculum.yaml" || /^instruments\/[^/]+\.yaml$/.test(rel) || /^lessons\/.+\.md$/.test(rel);
}

/** A path (relative to content/) the turn added, changed or removed. */
export interface Changed {
  path: string;
  /** git ignores it, so it could never be part of the commit. */
  ignored: boolean;
}

/** What the turn has added, changed or removed under content/ in its
 *  worktree — including files git would ignore. */
export async function changedPaths(ws: Workspace): Promise<Changed[]> {
  const prefix = `${ws.spec}/`;
  return (await statusOf(ws.dir, ws.spec, IN_WORKTREE)).filter((e) => e.path.startsWith(prefix)).map((e) => ({ path: e.path.slice(prefix.length).replace(/\/$/, ""), ignored: e.code === "!!" }));
}

/**
 * Changed paths that are not curriculum files at all: a name (or folder name)
 * starting with a dot, a file type the loader does not read, a file git
 * ignores (it would be validated but never committed), or something that is
 * not a regular file. The agent cannot delete a file, so one of these means
 * the turn is discarded.
 */
export function strayWrites(ws: Pick<Workspace, "content">, changed: Changed[]): ContentProblem[] {
  const out: ContentProblem[] = [];
  for (const { path: p, ignored } of changed) {
    if (p.split("/").some((part) => part.startsWith("."))) {
      out.push({ file: p, message: "files and folders whose name starts with a dot are not part of the curriculum and may not be written" });
      continue;
    }
    if (!isContentFile(p)) {
      out.push({ file: p, message: "this is not a curriculum file: only curriculum.yaml, instruments/<name>.yaml and lessons/<track>/<name>.md are, and nothing else may be added under content/" });
      continue;
    }
    if (ignored) {
      out.push({ file: p, message: "git is set to ignore this path, so it cannot be part of the curriculum; use another file name" });
      continue;
    }
    let st: fs.Stats | null = null;
    try {
      st = fs.lstatSync(path.join(ws.content, p));
    } catch {
      /* removed: a deletion is judged by the lost-id check */
    }
    if (st && !st.isFile()) out.push({ file: p, message: "this must be a regular file" });
  }
  return out;
}

/**
 * The commit subject from the tutor's reply. The system prompt asks it to
 * end a turn that edited files with one line starting "Changed:", so the
 * last such line is the summary; a reply without one (the agent forgot)
 * falls back to its last non-empty line. Markdown dressing is stripped and
 * the result cut to 72 characters, git's conventional subject width.
 */
export function commitSubject(reply: string): string {
  const lines = reply.split("\n").map((l) => l.trim()).filter(Boolean);
  const clean = (l: string) => l.replace(/^[-*•]\s+/, "").replace(/^#+\s+/, "").replace(/^\*\*(.+)\*\*$/, "$1").replace(/^\*\*(changed:?)\*\*:?/i, "Changed:");
  const marked = lines.map(clean).filter((l) => /^changed\s*:/i.test(l));
  let line = marked.length ? marked[marked.length - 1] : clean(lines[lines.length - 1] ?? "");
  line = line.replace(/^(summary|changes?|changed)\s*:\s*/i, "").replace(/\s+/g, " ").trim();
  if (!line) line = "content edited";
  const MAX = 72;
  return line.length > MAX ? `${line.slice(0, MAX - 1).trimEnd()}…` : line;
}

export type Committed = { hash: string; summary: string } | { skipped: true } | { error: string };

/**
 * Commit what the turn left under content/ in its worktree as
 * `agent: <summary>`, on top of the commit the turn started from. Only
 * content/ is staged: anything else in the worktree (the copied documents, a
 * write the sandbox should have refused) stays out. Resolves, never throws.
 * Nothing in the real repository changes here except that the new commit
 * object exists in its object store.
 */
export async function commitWorkspace(ws: Workspace, reply: string): Promise<Committed> {
  try {
    await gitWs(ws.dir, ["add", "-A", "--", ws.spec]);
    const staged = (await gitWs(ws.dir, ["diff", "--cached", "--name-only", "-z", ws.base, "--"])).split("\0").filter(Boolean);
    if (staged.length === 0) return { skipped: true };
    const outside = staged.filter((p) => !p.startsWith(`${ws.spec}/`));
    if (outside.length) return { error: `the commit would have included files outside ${ws.spec}/ (${outside.slice(0, 3).join(", ")})` };
    const summary = commitSubject(reply);
    await gitWs(ws.dir, ["commit", "-q", "--no-verify", "-m", `agent: ${summary}`]);
    const hash = (await gitWs(ws.dir, ["rev-parse", "HEAD"])).trim();
    const parents = (await gitWs(ws.dir, ["rev-list", "--parents", "-n", "1", hash])).trim().split(" ").slice(1);
    if (parents.length !== 1 || parents[0] !== ws.base) return { error: "the tutor's commit is not a single commit on top of where the turn started" };
    return { hash, summary };
  } catch (e) {
    return { error: gitError(e) };
  }
}

/** Where a commit that was not applied stands. `kept`: under its name, the
 *  working tree untouched. `staged`: under its name, but (some of) its files
 *  are already in content/ and the index. `unnamed`: git could not give it a
 *  name, so `ref` is the bare hash and only git's object store holds it. */
export type HeldState = "kept" | "staged" | "unnamed";
export type Applied = { applied: true } | { applied: false; cancelled: true } | { applied: false; cancelled?: false; ref: string; reason: string; state: HeldState };

/**
 * Bring the turn's commit into the real repository — only if that is a plain
 * fast-forward of the branch the turn started on, with content/ still exactly
 * as it was. Done with plumbing, so no setting of the owner's (merge.autoStash,
 * merge.ff, pull.*) has a say:
 *
 *   1. the commit is given a name (`refs/tutor/<id>`) so it cannot be lost;
 *   2. the branch, HEAD, in-progress operations and content/ are re-checked;
 *   3. `git read-tree -m -u <base> <commit>` writes the commit's files into
 *      the index and the working tree. It touches only the paths the commit
 *      changed, keeps everything else in the index as it is (the owner's
 *      staged work included), and refuses as a whole, before writing
 *      anything, when one of those paths is not as the base commit has it;
 *   4. `git update-ref <branch> <commit> <base>` moves the branch, only if it
 *      is still at the base (compare-and-swap). If that fails, step 3 is
 *      reversed the same way.
 *
 * `cancelled` is asked just before step 1 and again just before step 3: a
 * turn stopped by then is not applied and keeps nothing. From step 3 on the
 * apply runs to the end (it takes milliseconds), in a process group of its
 * own so that a Ctrl-C aimed at the server does not cut git off half-way.
 *
 * On success the name is removed again. On refusal the name stays, nothing in
 * the working tree has changed, and the caller tells the owner how to take it.
 */
export async function applyCommit(ws: Workspace, hash: string, { cancelled = () => false as boolean } = {}): Promise<Applied> {
  if (cancelled()) return { applied: false, cancelled: true };
  const ref = `refs/tutor/${ws.id}`;
  try {
    await git(ws.root, ["update-ref", ref, hash, ""]);
  } catch (e) {
    return { applied: false, ref: hash, reason: `git could not record the commit (${gitError(e)})`, state: "unnamed" };
  }
  const kept = (reason: string, state: HeldState = "kept"): Applied => ({ applied: false, ref, reason, state });
  // After a write that failed or could not be undone: did anything land in
  // content/? It was clean before the write (checked above), so any change
  // there is the tutor's.
  const landedIn = async (): Promise<HeldState> => ((await dirtyReason(ws.root, ws.spec).catch(() => "unknown")) ? "staged" : "kept");
  const short = (r: string) => r.replace(/^refs\/heads\//, "");
  const onBranch = async (): Promise<string> => {
    try {
      return (await git(ws.root, ["symbolic-ref", "-q", "HEAD"])).trim();
    } catch {
      return ""; // detached now
    }
  };
  try {
    const branch = await onBranch();
    if (branch !== ws.branch) return kept(`the repository was on ${short(ws.branch)} when the tutor started and is ${branch ? `on ${short(branch)}` : "not on a branch"} now`);
    const head = (await git(ws.root, ["rev-parse", "HEAD"])).trim();
    if (head !== ws.base) return kept(`${short(ws.branch)} gained or lost commits while the tutor was working`);
    const busy = operationInProgress((await git(ws.root, ["rev-parse", "--absolute-git-dir"])).trim());
    if (busy) return kept(`${busy} is in progress in the repository`);
    const touched = (await git(ws.root, ["diff-tree", "-r", "--name-only", "-z", ws.base, hash])).split("\0").filter(Boolean);
    if (touched.some((p) => !p.startsWith(`${ws.spec}/`))) return kept(`the commit changes files outside ${ws.spec}/`);
    const dirty = await dirtyReason(ws.root, ws.spec);
    if (dirty) return kept(`${dirty} — they appeared while the tutor was working`);
    if (cancelled()) {
      await git(ws.root, ["update-ref", "-d", ref, hash]).catch(() => undefined);
      return { applied: false, cancelled: true };
    }
    try {
      await git(ws.root, ["read-tree", "-m", "-u", ws.base, hash], { detached: true });
    } catch (e) {
      return kept(`git would not write the files (${gitError(e)})`, await landedIn());
    }
    let moved = "";
    try {
      if ((await onBranch()) !== ws.branch) moved = "the repository left the branch at the last moment";
      else await git(ws.root, ["update-ref", "-m", `tutor: agent commit ${hash.slice(0, 10)}`, ws.branch, hash, ws.base], { detached: true });
    } catch (e) {
      moved = `${short(ws.branch)} moved at the last moment (${gitError(e)})`;
    }
    if (moved) {
      try {
        await git(ws.root, ["read-tree", "-m", "-u", hash, ws.base], { detached: true });
      } catch (e) {
        return kept(`${moved}, and the files it had already written could not be taken out again (${gitError(e)})`, await landedIn());
      }
      return kept(moved);
    }
  } catch (e) {
    return kept(`git could not be asked about the repository (${gitError(e)})`);
  }
  try {
    await git(ws.root, ["update-ref", "-d", ref, hash]);
  } catch {
    /* an extra name for a commit that is on the branch: heldRefs drops it */
  }
  return { applied: true };
}

/** What the learner is told when the commit exists but was not applied. */
export function heldNote(ws: Pick<Workspace, "branch" | "spec">, hash: string, summary: string, held: { ref: string; reason: string; state?: HeldState }): string {
  const branch = ws.branch.replace(/^refs\/heads\//, "");
  const what = `The tutor's change ("${summary}") passed the checks but was NOT ${held.state === "staged" ? "committed to your branch" : "put into your files"}, because ${held.reason}.`;
  if (held.state === "unnamed")
    return `${what} Nothing in your working tree was touched, and git could not keep the change under a name either: it exists only as the unnamed commit ${hash}, which git will eventually clean up. To keep it, run \`git update-ref refs/tutor/kept-${hash.slice(0, 10)} ${hash}\` soon; otherwise just ask the tutor again.`;
  if (held.state === "staged") return `${what} ${stagedAdvice(held.ref, hash, ws.spec)}`;
  return `${what} Nothing in your working tree was touched. The change is kept as commit ${hash.slice(0, 10)} under the name ${held.ref}. To take it: with ${ws.spec}/ committed or stashed and ${branch} checked out, run \`git merge --ff-only ${held.ref}\` (or \`git cherry-pick ${held.ref}\` if ${branch} has moved on). To drop it: \`git update-ref -d ${held.ref}\`.`;
}

/** The files are (partly) in content/ and the index but the branch did not move. */
function stagedAdvice(ref: string, hash: string, spec: string): string {
  return `Its files were already (at least partly) written into ${spec}/ and staged, but the branch has not moved. The change is kept as commit ${hash.slice(0, 10)} under the name ${ref}. To finish: \`git merge --ff-only ${ref}\`. To back out: \`git restore --staged --worktree ${spec}\` and \`git clean -f ${spec}\` (look at \`git status\` first), then \`git update-ref -d ${ref}\`.`;
}

/** A tutor commit that is still waiting under a name. */
export interface Held {
  ref: string;
  hash: string;
  summary: string;
  /** Its files are already in the index (the server stopped between writing
   *  the files and moving the branch). */
  staged: boolean;
}

/**
 * The tutor commits still kept under refs/tutor/. A name whose commit is
 * already part of the current branch is removed on the way (the server
 * stopped between moving the branch and dropping the name; nothing is lost by
 * dropping it now) and reported in `landed`. Never throws.
 */
export async function heldRefs(root: string = gitRoot(), spec = "content"): Promise<{ held: Held[]; landed: Held[] }> {
  const held: Held[] = [];
  const landed: Held[] = [];
  try {
    const lines = (await git(root, ["for-each-ref", "--format=%(refname)%00%(objectname)%00%(contents:subject)", "refs/tutor/"])).split("\n").filter(Boolean);
    for (const line of lines) {
      const [ref, hash, subject = ""] = line.split("\0");
      const entry: Held = { ref, hash, summary: subject.replace(/^agent: /, ""), staged: false };
      let onBranch = false;
      try {
        await git(root, ["merge-base", "--is-ancestor", hash, "HEAD"]);
        onBranch = true;
      } catch {
        /* not an ancestor (or no HEAD) */
      }
      if (onBranch) {
        await git(root, ["update-ref", "-d", ref, hash]).catch(() => undefined);
        landed.push(entry);
        continue;
      }
      try {
        const parent = (await git(root, ["rev-parse", "-q", "--verify", `${hash}^`])).trim();
        const head = (await git(root, ["rev-parse", "-q", "--verify", "HEAD"])).trim();
        if (parent === head) {
          await git(root, ["diff", "--cached", "--quiet", hash, "--", spec]);
          entry.staged = true;
        }
      } catch {
        /* differs: not staged */
      }
      held.push(entry);
    }
  } catch {
    /* not a repository */
  }
  return { held, landed };
}

/** What the learner is told about a kept commit no message ever mentioned
 *  (the server stopped before it could say). */
export function foundHeldNote(h: Held, spec = "content"): string {
  const what = `An earlier tutor change ("${h.summary}") is kept as commit ${h.hash.slice(0, 10)} under the name ${h.ref}; the app stopped before it could say so.`;
  if (h.staged) return `${what} The app stopped half-way through putting it into your files. ${stagedAdvice(h.ref, h.hash, spec)}`;
  return `${what} Nothing in your working tree was touched. To take it: with ${spec}/ committed or stashed, run \`git merge --ff-only ${h.ref}\` (or \`git cherry-pick ${h.ref}\`). To drop it: \`git update-ref -d ${h.ref}\`.`;
}
