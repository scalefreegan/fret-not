import fs from "node:fs";
import path from "node:path";
import { DEFAULT_MODEL, isAgentModel } from "../../scripts/claude.mjs";
import type { ChatMessage } from "../shared/wire.ts";
import { REPO_ROOT } from "./loader.ts";
import { DEFAULT_ELEVEN_MODEL, isElevenModel } from "./tts-models.ts";

// The tutor's runtime state: the chat transcript and the model setting.
// Plain files under data/ (gitignored, created on demand), read on every
// call — the app is single-user and these are tiny, so a cache would only
// add a way for the file and the process to disagree.
//
//   data/chat.jsonl      one {role, text, ts} per line, appended per message;
//                        trimmed to its newest messages when it grows large
//   data/settings.json   {model, listenMode, ttsVoiceId, ttsModelId}

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
  patchSettings({ model });
  return model;
}

/** settings.json as an object, or {} if it does not exist or is unreadable
 *  (a hand-edited file with a syntax error loses its extra keys rather than
 *  crashing the app — the same spirit as getModel's fallback). */
function readSettingsRaw(): Record<string, unknown> {
  try {
    const raw: unknown = JSON.parse(fs.readFileSync(settingsPath(), "utf8"));
    if (raw && typeof raw === "object" && !Array.isArray(raw)) return raw as Record<string, unknown>;
  } catch {
    /* no file yet, or unreadable: start fresh */
  }
  return {};
}

/** Merge `patch` into settings.json, keeping every key some other setting
 *  (the tutor's model, these TTS fields, anything later) already put there. */
function patchSettings(patch: Record<string, unknown>): void {
  fs.mkdirSync(dataDir(), { recursive: true });
  writeAtomic(settingsPath(), `${JSON.stringify({ ...readSettingsRaw(), ...patch }, null, 2)}\n`);
}

/** Whether Listen mode (TTS read-aloud) is turned on. Off until the learner
 *  turns it on, even once a voice is chosen. */
export function getListenMode(): boolean {
  return readSettingsRaw().listenMode === true;
}
export function setListenMode(on: boolean): boolean {
  patchSettings({ listenMode: on });
  return on;
}

/** The chosen ElevenLabs voice id, or null until the learner has picked one
 *  (Listen mode has nothing to speak with until then — the UI should say
 *  so rather than guess a voice). Not validated against the live voice
 *  catalog here: that would mean a network call on every settings read, and
 *  an id ElevenLabs later removes should surface as a clear "pick again" in
 *  the UI, not silently fall back to another voice. */
export function getTtsVoiceId(): string | null {
  const raw = readSettingsRaw().ttsVoiceId;
  return typeof raw === "string" && raw ? raw : null;
}
export function setTtsVoiceId(voiceId: string | null): string | null {
  patchSettings({ ttsVoiceId: voiceId });
  return voiceId;
}

/** The ElevenLabs synthesis model TTS requests use. Falls back to the
 *  default exactly like getModel: a stale or unknown id in the file can
 *  never reach the API. */
export function getTtsModelId(): string {
  const raw = readSettingsRaw().ttsModelId;
  return isElevenModel(raw) ? raw : DEFAULT_ELEVEN_MODEL;
}
export function setTtsModelId(modelId: string): string {
  if (!isElevenModel(modelId)) throw new Error(`unknown TTS model: ${modelId}`);
  patchSettings({ ttsModelId: modelId });
  return modelId;
}
