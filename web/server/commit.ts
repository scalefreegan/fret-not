import { execFile } from "node:child_process";
import path from "node:path";
import { promisify } from "node:util";
import type { ChatCommit } from "../shared/wire.ts";
import { REPO_ROOT, contentDir } from "./loader.ts";

// Auto-commit of content/ after a tutor turn, so each change is one `git log`
// entry and one `git revert` away. Only content/ is ever staged: the rest of
// the working tree may be dirty with the user's own work and must stay that
// way. Never a push.

const execFileP = promisify(execFile);

/** The repository the commits go into: FRET_REPO_ROOT when set (resolved
 *  against the repo root; tests point it at a throwaway repo around their
 *  scratch content dir so nothing lands in this one), else this repo. Read
 *  per call, like contentDir(). */
export function gitRoot(): string {
  const override = process.env.FRET_REPO_ROOT;
  return override ? path.resolve(REPO_ROOT, override) : REPO_ROOT;
}

/** Every git call is execFile with an argv — never a shell string, since the
 *  commit subject is agent-written text. */
async function git(args: string[], cwd: string): Promise<string> {
  const { stdout } = await execFileP("git", args, { cwd, maxBuffer: 1 << 20 });
  return stdout;
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

/** True when anything under content/ differs from HEAD (edited, added,
 *  deleted). False when git cannot say (not a repository): then there is
 *  nothing to commit either. */
export async function contentDirty({ repoRoot = gitRoot(), dir = contentDir() } = {}): Promise<boolean> {
  try {
    return (await git(["status", "--porcelain", "--", path.relative(repoRoot, dir) || "."], repoRoot)).trim() !== "";
  } catch {
    return false;
  }
}

/**
 * After a tutor turn: stage and commit whatever changed under content/ as
 * `agent: <summary>`. Resolves to the `commit` payload rather than throwing:
 * a failed commit must reach the UI as a line the user can read — the write
 * it was recording has already happened — not take down a stream the reply
 * already went out on.
 */
export async function commitContent(reply: string, { repoRoot = gitRoot(), dir = contentDir() } = {}): Promise<ChatCommit> {
  // A pathspec relative to the repo, so `git status`/`add`/`commit` all name
  // the same tree regardless of how dir was spelled.
  const spec = path.relative(repoRoot, dir) || ".";
  if (spec.startsWith("..") || path.isAbsolute(spec)) return { error: `content directory ${dir} is outside the repository ${repoRoot}` };
  const summary = commitSubject(reply);
  try {
    const status = await git(["status", "--porcelain", "--", spec], repoRoot);
    if (!status.trim()) return { skipped: true };
    // -A so a file that was deleted or renamed is staged too; the pathspec
    // on `commit` means only these paths are recorded, leaving anything the
    // user had staged elsewhere in the index exactly as it was.
    await git(["add", "-A", "--", spec], repoRoot);
    await git(["commit", "-q", "-m", `agent: ${summary}`, "--", spec], repoRoot);
    const hash = (await git(["rev-parse", "--short", "HEAD"], repoRoot)).trim();
    return { hash, summary };
  } catch (e) {
    const err = e as Error & { stderr?: string };
    return { error: (err.stderr || err.message || String(e)).trim().slice(0, 500) };
  }
}
