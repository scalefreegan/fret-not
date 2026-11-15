import fs from "node:fs";
import path from "node:path";
import { isAgentModel } from "../../scripts/claude.mjs";
import type { FirstRunSeed } from "../../scripts/db/accounts.ts";
import type { ChatMessage } from "../shared/wire.ts";
import { repairProgress } from "./progress.ts";
import { dataDir } from "./store.ts";
import { isElevenModel } from "./tts-models.ts";

// The first admin's starting data (docs/DATA.md §First run): what the files
// under data/ held before there were logins, read once when the first
// account is made and put on its first learner (progress, Listen settings,
// tutor chat) and the account (the tutor model).
//
//   data/settings.json                    {model, listenMode, ttsVoiceId, ttsModelId}
//   data/chat.jsonl                       one {role, text, ts} per line
//   data/profiles/default/progress.json   the Progress
//
// Read only, never changed or deleted: the files stay where they are as the
// owner's backup. Anything missing, unreadable or out of range is left out
// (the learner starts with the default for it), never a reason to refuse
// the first run.

const ROLES = new Set<string>(["user", "assistant", "commit", "note"]);

function readJson(file: string): unknown {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    return undefined;
  }
}

/** Postgres text cannot hold a NUL; nothing in a chat needs one. */
const noNul = (s: string) => s.replaceAll("\u0000", "");

function readMessages(file: string): ChatMessage[] {
  let text: string;
  try {
    text = fs.readFileSync(file, "utf8");
  } catch {
    return [];
  }
  const out: ChatMessage[] = [];
  for (const line of text.split("\n")) {
    if (!line.trim()) continue;
    try {
      const m = JSON.parse(line) as Record<string, unknown>;
      // A torn last line or a stray role is skipped, as the file store did.
      if (m && typeof m.role === "string" && ROLES.has(m.role) && typeof m.text === "string") {
        out.push({ role: m.role as ChatMessage["role"], text: noNul(m.text), ts: typeof m.ts === "string" ? m.ts : "" });
      }
    } catch {
      /* skip */
    }
  }
  return out;
}

export function readFirstRunSeed(name: string, dir: string = dataDir(), now: Date = new Date()): FirstRunSeed {
  const raw = readJson(path.join(dir, "settings.json"));
  const settings = raw && typeof raw === "object" && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
  const stored = readJson(path.join(dir, "profiles", "default", "progress.json"));
  const progress = stored === undefined ? null : (repairProgress(stored, now)?.progress ?? null);
  return {
    name,
    progress,
    listenMode: settings.listenMode === true,
    ttsVoiceId: typeof settings.ttsVoiceId === "string" && settings.ttsVoiceId ? settings.ttsVoiceId : null,
    ttsModelId: isElevenModel(settings.ttsModelId) ? settings.ttsModelId : null,
    model: isAgentModel(settings.model) ? settings.model : null,
    messages: readMessages(path.join(dir, "chat.jsonl")),
  };
}
