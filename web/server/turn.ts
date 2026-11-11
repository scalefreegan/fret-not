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
// by a fast-forward (`git merge --ff-only`), which git itself refuses rather
// than overwrite anything in the way. A turn that fails, is cancelled, times
// out, or dies with the server therefore has nothing to undo: the worktree is
// deleted and the repository was never touched.
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
// WHAT GIT IS ALLOWED TO DO. Every git call here runs with hooks switched off
// (core.hooksPath=/dev/null) and signing off: a hook that fails, hangs or
// rewrites files must not be able to wedge a turn or half-apply it, and a
// signing prompt has nobody to answer it. So tutor commits are unsigned and
// run no pre-commit, commit-msg, post-checkout or post-merge hook. Each call
// has a timeout. Nothing is ever pushed.
//
// LEFTOVERS. A worktree a dead server left behind is just a directory under
// a path this app owns (workspaceBase): sweepWorkspaces deletes the old ones
// and runs `git worktree prune`. No process is ever looked up or killed.

const execFileP = promisify(execFile);

/** One git call may take this long; a stuck one fails the step it was in. */
const GIT_TIMEOUT_MS = 60_000;

/** A leftover worktree is deleted once it is older than this — longer than
 *  any turn can run (two agent runs of ten minutes each), so a turn in
 *  flight in another copy of the app is never swept from under it. */
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
const QUIET = ["-c", "core.hooksPath=/dev/null", "-c", "commit.gpgsign=false", "-c", "tag.gpgsign=false", "-c", "advice.detachedHead=false", "--literal-pathspecs"];

/** The environment for git: the server's, minus variables that would point
 *  git at some other repository or index, and with prompting off. */
function gitEnv(): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = { ...process.env, GIT_TERMINAL_PROMPT: "0", GIT_OPTIONAL_LOCKS: "0" };
  for (const k of ["GIT_DIR", "GIT_WORK_TREE", "GIT_INDEX_FILE", "GIT_COMMON_DIR", "GIT_PREFIX", "GIT_NAMESPACE"]) delete env[k];
  return env;
}

/** Every git call is execFile with an argv — never a shell string, since the
 *  commit subject is agent-written text. */
async function git(cwd: string, args: string[]): Promise<string> {
  const { stdout } = await execFileP("git", [...QUIET, ...args], { cwd, env: gitEnv(), maxBuffer: 16 << 20, timeout: GIT_TIMEOUT_MS });
  return stdout;
}
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
async function statusOf(cwd: string, spec: string): Promise<StatusEntry[]> {
  return parseStatus(await git(cwd, ["status", "--porcelain=v1", "-z", "--untracked-files=all", "--ignored", "--", spec]));
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
  await git(ready.root, ["worktree", "add", "--detach", "-q", dir, ready.base]);
  const ws: Workspace = { id, dir, content: path.join(dir, ...ready.spec.split("/")), root: ready.root, spec: ready.spec, base: ready.base, branch: ready.branch };
  try {
    if ((await git(dir, ["rev-parse", "HEAD"])).trim() !== ready.base) throw new Error("the worktree is not at the commit it was made from");
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

/** Delete a turn's worktree. Synchronous (it also runs from the shutdown
 *  hook) and never throws: the next sweep takes what this could not. */
export function closeWorkspace(ws: Pick<Workspace, "dir" | "root">): void {
  try {
    gitSync(ws.root, ["worktree", "remove", "--force", ws.dir]);
  } catch {
    /* removed below */
  }
  try {
    fs.rmSync(ws.dir, { recursive: true, force: true });
  } catch (e) {
    console.error(`[fret-not] tutor: could not remove ${ws.dir}: ${String((e as Error)?.message || e)}`);
  }
  try {
    gitSync(ws.root, ["worktree", "prune"]);
  } catch {
    /* not a repository any more: nothing to prune */
  }
}

/**
 * Delete worktrees an earlier server left behind: every directory under this
 * app's own work directory whose name says it was made more than `maxAgeMs`
 * ago, then `git worktree prune`. Identified by path and age only. Never
 * throws; returns how many were removed.
 */
export function sweepWorkspaces({ root = gitRoot(), maxAgeMs = STALE_MS, now = Date.now() } = {}): number {
  let removed = 0;
  try {
    const base = workspaceBase(root);
    for (const name of fs.readdirSync(base)) {
      const made = Number(/^(\d{10,})-[0-9a-f]+$/.exec(name)?.[1]);
      if (!Number.isFinite(made) || now - made < maxAgeMs) continue;
      fs.rmSync(path.join(base, name), { recursive: true, force: true });
      removed++;
    }
  } catch (e) {
    console.error(`[fret-not] tutor: could not clear old work directories: ${String((e as Error)?.message || e)}`);
  }
  try {
    gitSync(root, ["worktree", "prune"]);
  } catch {
    /* not a repository: nothing to prune */
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
  return (await statusOf(ws.dir, ws.spec)).filter((e) => e.path.startsWith(prefix)).map((e) => ({ path: e.path.slice(prefix.length).replace(/\/$/, ""), ignored: e.code === "!!" }));
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
    await git(ws.dir, ["add", "-A", "--", ws.spec]);
    const staged = (await git(ws.dir, ["diff", "--cached", "--name-only", "-z", ws.base, "--"])).split("\0").filter(Boolean);
    if (staged.length === 0) return { skipped: true };
    const outside = staged.filter((p) => !p.startsWith(`${ws.spec}/`));
    if (outside.length) return { error: `the commit would have included files outside ${ws.spec}/ (${outside.slice(0, 3).join(", ")})` };
    const summary = commitSubject(reply);
    await git(ws.dir, ["commit", "-q", "--no-verify", "-m", `agent: ${summary}`]);
    const hash = (await git(ws.dir, ["rev-parse", "HEAD"])).trim();
    const parents = (await git(ws.dir, ["rev-list", "--parents", "-n", "1", hash])).trim().split(" ").slice(1);
    if (parents.length !== 1 || parents[0] !== ws.base) return { error: "the tutor's commit is not a single commit on top of where the turn started" };
    return { hash, summary };
  } catch (e) {
    return { error: gitError(e) };
  }
}

export type Applied = { applied: true } | { applied: false; ref: string; reason: string };

/**
 * Bring the turn's commit into the real repository — only if that is a plain
 * fast-forward of the branch the turn started on, with content/ still exactly
 * as it was. First the commit is given a name (`refs/tutor/<id>`) so it
 * cannot be lost; then `git merge --ff-only`, which updates the branch, the
 * index and the working files of the committed paths together, and refuses
 * as a whole when anything of the owner's is in the way. On success the name
 * is removed again. On refusal the name stays, nothing in the working tree
 * has changed, and the caller tells the owner how to apply it.
 */
export async function applyCommit(ws: Workspace, hash: string): Promise<Applied> {
  const ref = `refs/tutor/${ws.id}`;
  try {
    await git(ws.root, ["update-ref", ref, hash]);
  } catch (e) {
    return { applied: false, ref: hash, reason: `git could not record the commit (${gitError(e)})` };
  }
  const kept = (reason: string): Applied => ({ applied: false, ref, reason });
  try {
    let branch = "";
    try {
      branch = (await git(ws.root, ["symbolic-ref", "-q", "HEAD"])).trim();
    } catch {
      /* detached now */
    }
    const short = (r: string) => r.replace(/^refs\/heads\//, "");
    if (branch !== ws.branch) return kept(`the repository was on ${short(ws.branch)} when the tutor started and is ${branch ? `on ${short(branch)}` : "not on a branch"} now`);
    const head = (await git(ws.root, ["rev-parse", "HEAD"])).trim();
    if (head !== ws.base) return kept(`${short(ws.branch)} gained or lost commits while the tutor was working`);
    const busy = operationInProgress((await git(ws.root, ["rev-parse", "--absolute-git-dir"])).trim());
    if (busy) return kept(`${busy} is in progress in the repository`);
    const dirty = await dirtyReason(ws.root, ws.spec);
    if (dirty) return kept(`${dirty} — they appeared while the tutor was working`);
    try {
      await git(ws.root, ["merge", "--ff-only", "-q", "--no-verify", hash]);
    } catch (e) {
      return kept(`git would not fast-forward (${gitError(e)})`);
    }
    if ((await git(ws.root, ["rev-parse", "HEAD"])).trim() !== hash) return kept("the fast-forward did not land on the tutor's commit");
  } catch (e) {
    return kept(`git could not be asked about the repository (${gitError(e)})`);
  }
  try {
    await git(ws.root, ["update-ref", "-d", ref, hash]);
  } catch {
    /* an extra name for a commit that is on the branch: harmless */
  }
  return { applied: true };
}

/** What the learner is told when the commit exists but was not applied. */
export function heldNote(ws: Pick<Workspace, "branch" | "spec">, hash: string, summary: string, held: { ref: string; reason: string }): string {
  const branch = ws.branch.replace(/^refs\/heads\//, "");
  return `The tutor's change ("${summary}") passed the checks but was NOT put into your files, because ${held.reason}. Nothing in your working tree was touched. The change is kept as commit ${hash.slice(0, 10)} under the name ${held.ref}. To take it: with ${ws.spec}/ committed or stashed and ${branch} checked out, run \`git merge --ff-only ${held.ref}\` (or \`git cherry-pick ${held.ref}\` if ${branch} has moved on). To drop it: \`git update-ref -d ${held.ref}\`.`;
}
