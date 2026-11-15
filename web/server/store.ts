import path from "node:path";
import { and, asc, desc, eq, isNull, lt, sql } from "drizzle-orm";
import { DEFAULT_MODEL, isAgentModel } from "../../scripts/claude.mjs";
import { getStoredModel, saveModel, validDate } from "../../scripts/db/accounts.ts";
import { forLearner, forUser } from "../../scripts/db/owned.ts";
import { chatMessages, learners } from "../../scripts/db/schema.ts";
import type { ChatMessage } from "../shared/wire.ts";
import { rawDb } from "./db.ts";
import { REPO_ROOT } from "./loader.ts";
import { DEFAULT_ELEVEN_MODEL, isElevenModel } from "./tts-models.ts";

// Per-learner and per-account state that is not progress (docs/DATA.md):
//
//   chat_messages               the learner's tutor transcript, trimmed to its
//                               newest messages when it grows large
//   learners.listen_mode,       the learner's Listen mode: on/off, voice, model
//   .tts_voice_id, .tts_model_id
//   user_settings.model         the account's tutor model
//
// Read on every call: they are tiny, and a cache would only add a way for two
// tabs to disagree. Before logins these were data/chat.jsonl and
// data/settings.json; the first admin's first learner is seeded from them
// once (seed.ts), and nothing reads them after that. Every query goes
// through an owner scope (scripts/db/owned.ts).

/** FRET_DATA_DIR when set (resolved against the repo root, like the content
 *  override), else <repo>/data: what is still on disk (the shared TTS cache)
 *  and the files the first run imports. Per call, so a test can point it at
 *  a temp dir. */
export function dataDir(): string {
  const override = process.env.FRET_DATA_DIR;
  return override ? path.resolve(REPO_ROOT, override) : path.join(REPO_ROOT, "data");
}

/* ---------------------------------- chat ---------------------------------- */

/** The transcript is a convenience, not a record: past this size (of message
 *  text, per learner) the oldest messages are dropped, keeping the newest
 *  HISTORY_KEEP_BYTES worth. */
export const HISTORY_MAX_BYTES = 1_000_000;
export const HISTORY_KEEP_BYTES = 500_000;

const toMessage = (r: typeof chatMessages.$inferSelect): ChatMessage => ({ role: r.role, text: r.text, ts: r.ts.toISOString() });

/** The learner's tutor chat, oldest first. With `last`, only the newest
 *  `last` messages. */
export async function readHistory(learnerId: string, last?: number): Promise<ChatMessage[]> {
  const mine = forLearner(rawDb(), learnerId);
  const rows = last === undefined
    ? await mine.list(chatMessages, undefined, { orderBy: asc(chatMessages.seq) })
    : (await mine.list(chatMessages, undefined, { orderBy: desc(chatMessages.seq), limit: last })).reverse();
  return rows.map(toMessage);
}

export async function appendHistory(learnerId: string, message: ChatMessage, { maxBytes = HISTORY_MAX_BYTES, keepBytes = HISTORY_KEEP_BYTES } = {}): Promise<void> {
  const db = rawDb();
  const mine = forLearner(db, learnerId);
  await mine.insert(chatMessages, { role: message.role, text: message.text, ...(validDate(message.ts) ? { ts: new Date(message.ts) } : {}) });
  const [{ bytes }] = await db
    .select({ bytes: sql<number>`coalesce(sum(octet_length(${chatMessages.text})), 0)::bigint` })
    .from(chatMessages)
    .where(mine.where(chatMessages));
  if (Number(bytes) <= maxBytes) return;
  // Too big: keep the newest messages that fit in keepBytes (always at least
  // the one just written).
  const sizes = await db
    .select({ seq: chatMessages.seq, size: sql<number>`octet_length(${chatMessages.text})` })
    .from(chatMessages)
    .where(mine.where(chatMessages))
    .orderBy(desc(chatMessages.seq));
  let kept = 0;
  let oldestKept = sizes[0].seq;
  for (const [i, r] of sizes.entries()) {
    if (i > 0 && kept + Number(r.size) > keepBytes) break;
    kept += Number(r.size);
    oldestKept = r.seq;
  }
  await mine.remove(chatMessages, lt(chatMessages.seq, oldestKept));
}

export async function clearHistory(learnerId: string): Promise<void> {
  await forLearner(rawDb(), learnerId).removeAllOwned(chatMessages);
}

/* --------------------------------- the model ------------------------------ */

/** The model this account's tutor runs use. Anything outside the offered
 *  list falls back to the default, so a stale row can never spawn a model
 *  the UI doesn't offer. */
export async function getModel(userId: string): Promise<string> {
  const model = await getStoredModel(rawDb(), userId);
  return isAgentModel(model) ? model : DEFAULT_MODEL;
}

export async function setModel(userId: string, model: string): Promise<string> {
  if (!isAgentModel(model)) throw new Error(`unknown model: ${model}`);
  await saveModel(rawDb(), userId, model);
  return model;
}

/* ------------------------------- Listen mode ------------------------------ */

/** Who a Listen setting belongs to: the learner, through its account. */
export interface LearnerRef {
  userId: string;
  learnerId: string;
}

export interface ListenSettings {
  /** Off until the learner turns it on, even once a voice is chosen. */
  listenMode: boolean;
  /** The chosen ElevenLabs voice id, or null until the learner has picked
   *  one (Listen mode has nothing to speak with until then: the UI says so
   *  rather than guess a voice). Not validated against the live catalog. */
  ttsVoiceId: string | null;
  /** The ElevenLabs model; a stale or unknown stored id reads as the default,
   *  so it can never reach the API. */
  ttsModelId: string;
}

const liveLearner = (ref: LearnerRef) => and(eq(learners.id, ref.learnerId), isNull(learners.archivedAt))!;

/** The learner's Listen settings; the defaults for a learner that is gone. */
export async function getListenSettings(ref: LearnerRef): Promise<ListenSettings> {
  const row = await forUser(rawDb(), ref.userId).get(learners, liveLearner(ref));
  return {
    listenMode: row?.listenMode === true,
    ttsVoiceId: typeof row?.ttsVoiceId === "string" && row.ttsVoiceId ? row.ttsVoiceId : null,
    ttsModelId: isElevenModel(row?.ttsModelId) ? row.ttsModelId : DEFAULT_ELEVEN_MODEL,
  };
}

/** Change some of the learner's Listen settings; each column is written on
 *  its own, so two saves of different settings at once both land. */
export async function setListenSettings(ref: LearnerRef, patch: Partial<ListenSettings>): Promise<ListenSettings> {
  if (patch.ttsModelId !== undefined && !isElevenModel(patch.ttsModelId)) throw new Error(`unknown TTS model: ${patch.ttsModelId}`);
  const set: Partial<typeof learners.$inferInsert> = {};
  if (patch.listenMode !== undefined) set.listenMode = patch.listenMode;
  if (patch.ttsVoiceId !== undefined) set.ttsVoiceId = patch.ttsVoiceId || null;
  if (patch.ttsModelId !== undefined) set.ttsModelId = patch.ttsModelId;
  if (Object.keys(set).length) await forUser(rawDb(), ref.userId).update(learners, set, liveLearner(ref));
  return getListenSettings(ref);
}
