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

declare module "*/scripts/env.mjs" {
  export const ROOT: string;
  /** FRET_ENV_FILE (resolved against the repo root), else <repo>/.env.local. */
  export function envFile(root?: string): string;
  /** KEY=VALUE lines → an object; comments, `export ` and one layer of quotes tolerated. */
  export function parseEnv(text: string): Record<string, string>;
}

declare module "*/scripts/auth.mjs" {
  export const MIN_PASSWORD: number;
  export const MAX_PASSWORD: number;
  export function hashPassword(password: string): Promise<string>;
  /** False (never a throw) for a wrong password or a malformed hash. */
  export function verifyPassword(password: unknown, stored: unknown): Promise<boolean>;
  export function passwordProblem(password: unknown): string | null;
  export const USERNAME_RE: RegExp;
  export function normalizeUsername(name: unknown): string;
  export function usernameProblem(name: unknown): string | null;
  export function newSessionToken(): string;
  /** SHA-256 hex: what auth_sessions.id stores. */
  export function tokenHash(token: string): string;
  export const SESSION_COOKIE: string;
  export const SESSION_DAYS: number;
  export const SESSION_MS: number;
  export const SLIDE_EVERY_MS: number;
  export function parseCookies(header: string | undefined): Record<string, string>;
  export function serializeCookie(
    name: string,
    value: string,
    opts?: { path?: string; maxAge?: number; httpOnly?: boolean; sameSite?: "Lax" | "Strict" | "None"; secure?: boolean },
  ): string;
  export function isSecureRequest(headers: Record<string, string | string[] | undefined>): boolean;
  /** Loopback peer, no X-Forwarded-* headers, localhost Host: a request made on this machine. */
  export function isDirectLocalRequest(headers: Record<string, string | string[] | undefined>, remoteAddress: string | undefined): boolean;
  export function sessionCookie(token: string, opts?: { secure?: boolean }): string;
  export function clearSessionCookie(opts?: { secure?: boolean }): string;
  export interface LoginThrottle {
    /** Milliseconds this key must still wait; 0 when it may try. */
    wait(key: string): number;
    /** The wait (> 0: refused), or 0 with the attempt counted as a failure until succeed(). */
    attempt(key: string): number;
    succeed(key: string): void;
    clear(): void;
  }
  export function createLoginThrottle(opts?: { max?: number; windowMs?: number; waitMs?: number; now?: () => number }): LoginThrottle;
  /** The client for the throttle: X-Forwarded-For's last hop behind a loopback proxy, else the socket address. */
  export function clientAddress(headers: Record<string, string | string[] | undefined>, remoteAddress: string | undefined): string;
  export function throttleKey(username: string, address: string): string;
}

declare module "*/scripts/db/config.mjs" {
  export const DEFAULT_DATABASE_URL: string;
  export const MIGRATIONS_DIR: string;
  export function isLinkedWorktree(root?: string): boolean;
  /** The shell's DATABASE_URL, else .env.local's, else the default; throws
   *  in a linked worktree with neither. */
  export function databaseUrl(env?: Record<string, string | undefined>, file?: string, root?: string): string;
  /** Throws when the URL names no database. */
  export function databaseName(url: string): string;
  /** The URL with any password masked. */
  export function redact(url: string): string;
}

declare module "*/scripts/db/migrations.mjs" {
  type Migration = { sql: string[]; folderMillis: number; hash: string };
  type MigrationState = {
    status: "current" | "behind" | "skipped" | "ahead" | "diverged";
    total: number;
    applied: number;
    missing: Migration[];
    skipped: Migration[];
    unknown: { hash: string; createdAt: number | null }[];
  };
  type Query = (text: string, params?: unknown[]) => Promise<Record<string, unknown>[]>;
  /** Read-only: the database's recorded migrations against the files, by hash. */
  export function migrationState(query: Query, disk?: Migration[]): Promise<MigrationState>;
  export function describeMigrations(state: MigrationState): string;
}

declare module "*/scripts/tests/testdb.mjs" {
  /** A fresh, fully migrated in-process PGlite database for one test. */
  export function freshDb(): Promise<{
    db: import("../../scripts/db/owned.ts").Db;
    client: unknown;
    query: (text: string, params?: unknown[]) => Promise<Record<string, unknown>[]>;
    close: () => Promise<void>;
  }>;
}
