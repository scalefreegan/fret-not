import fs from "node:fs";
import path from "node:path";
import { DEFAULT_MODEL, isAgentModel } from "../../scripts/claude.mjs";
import type { ChatMessage } from "../shared/wire.ts";
import { REPO_ROOT } from "./loader.ts";

// The tutor's runtime state: the chat transcript and the model setting.
// Plain files under data/ (gitignored, created on demand), read on every
// call — the app is single-user and these are tiny, so a cache would only
// add a way for the file and the process to disagree.
//
//   data/chat.jsonl      one {role, text, ts} per line, appended per message;
//                        trimmed to its newest messages when it grows large
//   data/settings.json   {model}

/** FRET_DATA_DIR when set (resolved against the repo root, like the content
 *  override), else <repo>/data. Per call, so a test can point it at a temp
 *  dir. */
export function dataDir(): string {
  const override = process.env.FRET_DATA_DIR;
  return override ? path.resolve(REPO_ROOT, override) : path.join(REPO_ROOT, "data");
}

const historyPath = () => path.join(dataDir(), "chat.jsonl");
const settingsPath = () => path.join(dataDir(), "settings.json");

const ROLES = new Set(["user", "assistant", "commit", "note"]);

/** The transcript is a convenience, not a record: past this size the oldest
 *  messages are dropped, keeping the newest HISTORY_KEEP_BYTES worth. */
export const HISTORY_MAX_BYTES = 1_000_000;
export const HISTORY_KEEP_BYTES = 500_000;

/** Write whole, then rename: a crash mid-write leaves the old file. */
function writeAtomic(file: string, text: string): void {
  const tmp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, text);
  fs.renameSync(tmp, file);
}

export function readHistory(): ChatMessage[] {
  let text: string;
  try {
    text = fs.readFileSync(historyPath(), "utf8");
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw e;
  }
  const out: ChatMessage[] = [];
  for (const line of text.split("\n")) {
    if (!line.trim()) continue;
    // A torn last line (the server died mid-append) is dropped, not fatal:
    // the transcript is a convenience, the content is the product.
    try {
      const m = JSON.parse(line) as Partial<ChatMessage>;
      if (typeof m.role === "string" && ROLES.has(m.role) && typeof m.text === "string") {
        out.push({ role: m.role, text: m.text, ts: typeof m.ts === "string" ? m.ts : "" });
      }
    } catch {
      /* skip */
    }
  }
  return out;
}

export function appendHistory(message: ChatMessage, { maxBytes = HISTORY_MAX_BYTES, keepBytes = HISTORY_KEEP_BYTES } = {}): void {
  fs.mkdirSync(dataDir(), { recursive: true });
  const file = historyPath();
  fs.appendFileSync(file, `${JSON.stringify(message)}\n`);
  if (fs.statSync(file).size <= maxBytes) return;
  // Too big: keep the newest lines that fit in keepBytes (always at least
  // the one just written).
  const lines = readHistory().map((m) => `${JSON.stringify(m)}\n`);
  let size = 0;
  let from = lines.length;
  while (from > 0 && (from === lines.length || size + Buffer.byteLength(lines[from - 1]) <= keepBytes)) size += Buffer.byteLength(lines[--from]);
  writeAtomic(file, lines.slice(from).join(""));
}

export function clearHistory(): void {
  try {
    fs.unlinkSync(historyPath());
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code !== "ENOENT") throw e;
  }
}

/** The model tutor runs use. Anything unreadable or outside the offered list
 *  falls back to the default, so a stale settings file can never spawn a
 *  model the UI doesn't offer. Other keys in settings.json (another part of
 *  the app may keep its own there) are left alone. */
export function getModel(): string {
  try {
    const raw = JSON.parse(fs.readFileSync(settingsPath(), "utf8")) as { model?: unknown };
    return isAgentModel(raw.model) ? raw.model : DEFAULT_MODEL;
  } catch {
    return DEFAULT_MODEL;
  }
}

export function setModel(model: string): string {
  if (!isAgentModel(model)) throw new Error(`unknown model: ${model}`);
  fs.mkdirSync(dataDir(), { recursive: true });
  let existing: Record<string, unknown> = {};
  try {
    const raw: unknown = JSON.parse(fs.readFileSync(settingsPath(), "utf8"));
    if (raw && typeof raw === "object" && !Array.isArray(raw)) existing = raw as Record<string, unknown>;
  } catch {
    /* no file yet, or unreadable: start fresh */
  }
  writeAtomic(settingsPath(), `${JSON.stringify({ ...existing, model }, null, 2)}\n`);
  return model;
}
