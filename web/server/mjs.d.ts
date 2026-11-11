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
    raw: Record<string, unknown>;
  }
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
    tools?: "content" | "none";
    /** The only directory Edit/Write are granted for; must be inside repoRoot. */
    contentDir?: string;
    repoRoot?: string;
  }): { result: Promise<ClaudeResult>; kill: () => void };
}
