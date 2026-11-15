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
// owner's backup. A missing file is simply nothing to import. Anything else
// that goes wrong (a file that cannot be read or parsed, a progress the
// repair rules had to change, chat lines that were skipped) is logged, never
// a reason to refuse the first run, and listed in `problems` for the first
// run's reply to show once. A damaged progress is also kept whole in
// progress_backups (`damagedProgress`).
//
// Postgres text and jsonb cannot hold a NUL (U+0000), and one in any value
// would fail the whole first run, the only way in to an empty database. So
// NULs are dropped from what is imported, and a backup that holds one (or
// is not JSON at all) is kept as the file's bytes: {encoding: "base64", raw}.

const ROLES = new Set<string>(["user", "assistant", "commit", "note"]);

type Read = { ok: true; text: string } | { ok: false; missing: true } | { ok: false; missing: false; reason: string };

function readFile(file: string): Read {
  try {
    return { ok: true, text: fs.readFileSync(file, "utf8") };
  } catch (e) {
    const err = e as NodeJS.ErrnoException;
    if (err?.code === "ENOENT") return { ok: false, missing: true };
    const reason = err?.code ?? String(err?.message ?? e);
    console.warn(`[fret-not] first run: could not read ${file}: ${reason}`);
    return { ok: false, missing: false, reason };
  }
}

/** Postgres text cannot hold a NUL; nothing in a chat needs one. */
const noNul = (s: string) => s.replaceAll("\u0000", "");

/** A JSON value with every NUL dropped from its strings and keys. */
export function withoutNul(v: unknown): unknown {
  if (typeof v === "string") return noNul(v);
  if (Array.isArray(v)) return v.map(withoutNul);
  if (v && typeof v === "object") return Object.fromEntries(Object.entries(v).map(([k, x]) => [noNul(k), withoutNul(x)]));
  return v;
}

/** JSON.stringify writes a NUL as \u0000; a raw one cannot appear. */
const holdsNul = (v: unknown) => JSON.stringify(v).includes("\\u0000");

/** A backup of the file's text that any jsonb column accepts. */
const rawBackup = (text: string) => ({ encoding: "base64", raw: Buffer.from(text, "utf8").toString("base64") });

export function readFirstRunSeed(name: string, dir: string = dataDir(), now: Date = new Date()): FirstRunSeed {
  const problems: string[] = [];
  const shown = (file: string) => path.relative(path.dirname(dir), file) || file;

  // Settings: the Listen settings and the tutor model.
  const settingsFile = path.join(dir, "settings.json");
  let settings: Record<string, unknown> = {};
  const s = readFile(settingsFile);
  if (s.ok) {
    try {
      const raw: unknown = JSON.parse(s.text);
      if (raw && typeof raw === "object" && !Array.isArray(raw)) settings = raw as Record<string, unknown>;
      else throw new Error("not an object");
    } catch (e) {
      console.warn(`[fret-not] first run: ${settingsFile} is not readable settings: ${(e as Error).message}`);
      problems.push(`${shown(settingsFile)} could not be read, so Listen settings and the tutor model start at their defaults.`);
    }
  } else if (!s.missing) {
    problems.push(`${shown(settingsFile)} could not be opened (${s.reason}), so Listen settings and the tutor model start at their defaults.`);
  }

  // The chat: a torn last line or a stray role is skipped, as the file store did.
  const chatFile = path.join(dir, "chat.jsonl");
  const messages: ChatMessage[] = [];
  const c = readFile(chatFile);
  if (c.ok) {
    let skipped = 0;
    for (const line of c.text.split("\n")) {
      if (!line.trim()) continue;
      try {
        const m = JSON.parse(line) as Record<string, unknown>;
        if (m && typeof m.role === "string" && ROLES.has(m.role) && typeof m.text === "string") {
          messages.push({ role: m.role as ChatMessage["role"], text: noNul(m.text), ts: typeof m.ts === "string" ? m.ts : "" });
          continue;
        }
      } catch {
        /* counted below */
      }
      skipped++;
    }
    if (skipped) {
      console.warn(`[fret-not] first run: ${skipped} line(s) of ${chatFile} could not be read and were left out`);
      problems.push(`${skipped} line${skipped === 1 ? "" : "s"} of ${shown(chatFile)} could not be read and ${skipped === 1 ? "was" : "were"} left out of the tutor chat.`);
    }
  } else if (!c.missing) {
    problems.push(`${shown(chatFile)} could not be opened (${c.reason}), so the tutor chat starts empty.`);
  }

  // Progress, through the same repair rules as a stored one.
  const progressFile = path.join(dir, "profiles", "default", "progress.json");
  let progress: FirstRunSeed["progress"] = null;
  let damagedProgress: unknown;
  const p = readFile(progressFile);
  if (p.ok) {
    let stored: unknown;
    let parsed = true;
    try {
      stored = JSON.parse(p.text);
    } catch {
      parsed = false;
    }
    const nul = parsed && holdsNul(stored);
    const repaired = parsed ? repairProgress(nul ? withoutNul(stored) : stored, now) : null;
    if (!repaired) {
      damagedProgress = parsed && !nul ? stored : rawBackup(p.text);
      console.warn(`[fret-not] first run: ${progressFile} is not readable progress; it is kept in progress_backups and the learner starts fresh`);
      problems.push(`${shown(progressFile)} could not be read, so progress starts fresh; the file's contents are kept as a backup.`);
    } else {
      progress = repaired.progress;
      if (repaired.changed || nul || holdsNul(progress)) {
        progress = withoutNul(progress) as typeof progress;
        damagedProgress = nul ? rawBackup(p.text) : stored;
        console.warn(`[fret-not] first run: ${progressFile} needed repairs; the original is kept in progress_backups`);
        problems.push(`${shown(progressFile)} was partly damaged: what could be read was kept, and the original is kept as a backup.`);
      }
    }
  } else if (!p.missing) {
    problems.push(`${shown(progressFile)} could not be opened (${p.reason}), so progress starts fresh.`);
  }

  return {
    name,
    progress,
    ...(damagedProgress !== undefined ? { damagedProgress } : {}),
    listenMode: settings.listenMode === true,
    ttsVoiceId: typeof settings.ttsVoiceId === "string" && noNul(settings.ttsVoiceId) ? noNul(settings.ttsVoiceId) : null,
    ttsModelId: isElevenModel(settings.ttsModelId) ? settings.ttsModelId : null,
    model: isAgentModel(settings.model) ? settings.model : null,
    messages,
    problems,
  };
}
