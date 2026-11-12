// Types for the plain-ESM module the server imports from scripts/ (kept .mjs
// so `node --test scripts/tests/*.test.mjs` pins the sandbox with no build
// step and no dependency on web/).

declare module "*/scripts/claude.mjs" {
  export const REPO_ROOT: string;
  export const AGENT_MODELS: import("../shared/wire.ts").AgentModel[];
  export const DEFAULT_MODEL: string;
  export function isAgentModel(id: unknown): id is string;
  /** A sentence for a known headless-CLI failure (sign-in, usage limit,
   *  overload), or null. */
  export function failureHint(text: string): string | null;
  /** The agent's final reply plus the envelope's accounting. */
  export interface ClaudeResult {
    text: string;
    costUsd: number | null;
    numTurns: number | null;
    durationMs: number | null;
    usage: Record<string, unknown> | null;
    permissionDenials: unknown[];
    /** Absolute paths the run's Write/Edit calls named (may have written). */
    writes: string[];
    raw: Record<string, unknown>;
  }
  /** Run `hook` (synchronously) on a fatal signal, after live agents are
   *  killed; returns a function that removes it. */
  export function onFatalSignal(hook: () => void): () => void;
  export function sleepSync(ms: number): void;
  /** Delete old per-run temp directories (prompt + MCP config); returns how many. */
  export function sweepPromptDirs(opts?: { maxAgeMs?: number; now?: number; tmp?: string }): number;
  /** What a fatal signal does: kill live agents, run the hooks, arrange the exit. */
  export function reapOnSignal(code: number, opts?: { exit?: (code: number) => void; graceMs?: number }): ReturnType<typeof setTimeout>;
  /** Spawns `claude -p` in the sandbox buildArgs() pins (see the test).
   *  `kill()` and `signal` both SIGKILL the process group. */
  export function startClaude(opts: {
    prompt: string;
    systemPrompt?: string;
    model?: string;
    cwd?: string;
    signal?: AbortSignal;
    maxTurns?: number;
    timeoutSec?: number;
    tools?: "content" | "read" | "none";
    /** The only directory Edit/Write are granted for; must be inside repoRoot. */
    contentDir?: string;
    repoRoot?: string;
    /** Called as each Write/Edit call appears in the stream. */
    onWrite?: (absPath: string) => void;
  }): { result: Promise<ClaudeResult>; kill: () => void; pid: number | null };
}
