import type { IncomingMessage, ServerResponse } from "node:http";
import { eq } from "drizzle-orm";
import { applyPlacement, emptyProgress, placementTracks, RECENT_WINDOW, recordAnswers, recordLesson, rememberOpened, REVIEW_INTERVAL_DAYS, type AnswerResult, type Progress } from "../shared/progress.ts";
import { forLearner, forUser } from "../../scripts/db/owned.ts";
import { learners, progressBackups } from "../../scripts/db/schema.ts";
import type { AnswersReply, ProgressReply } from "../shared/wire.ts";
import { STALE_LEARNER, type LearnerCtx } from "./auth.ts";
import { rawDb, type Db } from "./db.ts";
import { isId, loadContent } from "./loader.ts";
import { HttpError, methodNotAllowed, readJsonBody, sendJson, subPath } from "./sse.ts";

// Learner progress in the database and over HTTP. One jsonb value per
// learner, `learners.progress` (docs/DATA.md §Schema): the Progress object of
// shared/progress.ts, exactly as the JSON file held it before logins.
//
// Read on every request and rewritten whole on every change, inside one
// transaction that holds the learner row's lock, so two saves at once (two
// tabs of one learner) queue rather than one undoing the other. The rules
// (mastery, review boxes, unlocks) live in shared/progress.ts; this module
// only validates input, loads, repairs, applies and saves. Every read and
// write goes through the account's own scope (forUser): one account can
// never reach another's learner.

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

const num = (v: unknown): number | null => {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  // A hand edit that quoted a number ("5") is still that number.
  if (typeof v === "string" && v.trim() !== "" && Number.isFinite(Number(v))) return Number(v);
  return null;
};

const isDate = (v: unknown): v is string => typeof v === "string" && !Number.isNaN(Date.parse(v));
/** A whole number within [lo, hi]: a fraction is rounded down, anything
 *  outside is pulled to the nearer end. */
const whole = (n: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, Math.floor(n)));
const DAY_MS = 86_400_000;
/** No review is ever scheduled further ahead than the longest interval, so a
 *  later due date can only be damage, and one in the year 9999 would mean
 *  "never ask again". A day of slack for the time zone. */
const latestDue = (now: Date): number => now.getTime() + (REVIEW_INTERVAL_DAYS[REVIEW_INTERVAL_DAYS.length - 1] + 1) * DAY_MS;
/** A level id far beyond any curriculum is damage, not placement. */
const MAX_LEVEL = 1000;

/** One concept's entry made safe for the pure functions, or null when it
 *  cannot be (then that one entry is dropped, not the whole file). Every
 *  field is brought inside the range the rules in shared/progress.ts assume:
 *  counts are whole and not negative, `correct` ≤ `attempts`, `recent` holds
 *  at most RECENT_WINDOW booleans, `mastery` is 0–1, `box` is a real box, a
 *  concept in review has a due date that can come round and one still being
 *  learned has none. */
function cleanConcept(cp: unknown, now: Date): Progress["concepts"][string] | null {
  if (!isRecord(cp) || !Array.isArray(cp.recent)) return null;
  const a = num(cp.attempts), c = num(cp.correct), m = num(cp.mastery), b = num(cp.box);
  if (a === null || c === null || m === null || b === null) return null;
  if (cp.dueAt !== null && !isDate(cp.dueAt)) return null;
  const recent = cp.recent.filter((r) => typeof r === "boolean").slice(-RECENT_WINDOW);
  const attempts = Math.max(recent.length, whole(a, 0, Number.MAX_SAFE_INTEGER));
  const correct = whole(c, recent.filter(Boolean).length, attempts);
  const mastery = Math.min(1, Math.max(0, m));
  const box = whole(b, 0, REVIEW_INTERVAL_DAYS.length);
  let dueAt: string | null = cp.dueAt;
  if (box === 0) dueAt = null;
  // In review with no date would never fall due: ask today.
  else if (dueAt === null) dueAt = now.toISOString();
  else if (Date.parse(dueAt) > latestDue(now)) dueAt = new Date(latestDue(now)).toISOString();
  const lastSeenAt = isDate(cp.lastSeenAt) ? cp.lastSeenAt : null;
  return { ...cp, recent, attempts, correct, mastery, box, dueAt, lastSeenAt } as Progress["concepts"][string];
}
function cleanLesson(lp: unknown): Progress["lessons"][string] | null {
  if (!isRecord(lp) || !isDate(lp.completedAt)) return null;
  const bestScore = num(lp.bestScore), runs = num(lp.runs);
  if (bestScore === null || runs === null) return null;
  return { ...lp, completedAt: lp.completedAt, bestScore: Math.min(1, Math.max(0, bestScore)), runs: whole(runs, 1, Number.MAX_SAFE_INTEGER) } as Progress["lessons"][string];
}

/**
 * The stored file made usable. `null` when it is not a progress file at all
 * (not an object, wrong version, no concepts/lessons maps). Otherwise the
 * progress with every entry checked: a field of the wrong type is coerced
 * when that is unambiguous (a quoted number), a number outside its range is
 * brought inside it (see cleanConcept), an entry that cannot be read is
 * dropped, and `changed` says whether anything had to be — one bad field must
 * not cost the learner everything else in the file. A file from before
 * `openedLevel` existed gains it without that counting as a change.
 */
export function repairProgress(v: unknown, now: Date): { progress: Progress; changed: boolean } | null {
  if (!isRecord(v) || v.version !== 1 || !isRecord(v.concepts) || !isRecord(v.lessons)) return null;
  let changed = false;
  const same = (x: unknown, y: unknown) => JSON.stringify(x) === JSON.stringify(y);
  const concepts: Progress["concepts"] = {};
  for (const [id, cp] of Object.entries(v.concepts)) {
    const clean = isId(id) ? cleanConcept(cp, now) : null;
    if (!clean) { changed = true; continue; }
    if (!same(clean, cp)) changed = true;
    concepts[id] = clean;
  }
  const lessons: Progress["lessons"] = {};
  for (const [id, lp] of Object.entries(v.lessons)) {
    const clean = isId(id) ? cleanLesson(lp) : null;
    if (!clean) { changed = true; continue; }
    if (!same(clean, lp)) changed = true;
    lessons[id] = clean;
  }
  const levelOf = (raw: unknown): number => {
    const n = num(raw);
    const clean = n === null || n < 0 || n > MAX_LEVEL ? 0 : Math.floor(n);
    if (clean !== raw) changed = true;
    return clean;
  };
  const placedLevel = levelOf(v.placedLevel);
  const openedLevel = v.openedLevel === undefined ? 0 : levelOf(v.openedLevel);
  let updatedAt = v.updatedAt;
  if (!isDate(updatedAt)) { updatedAt = now.toISOString(); changed = true; }
  return { progress: { ...(v as unknown as Progress), concepts, lessons, placedLevel, openedLevel, updatedAt: updatedAt as string }, changed };
}

export interface Loaded {
  progress: Progress;
  /** True when the stored value could not be used as it was: either it was
   *  not a progress value at all and an empty progress took its place, or
   *  some entries in it were bad and were dropped. Either way the original
   *  is kept in progress_backups, with the id `recoveredTo`. */
  recovered: boolean;
  /** The progress_backups row that keeps the original, when `recovered`. */
  recoveredTo?: string;
}

/**
 * The stored value made usable, inside the caller's transaction. A value
 * that cannot be used as it stands is never just overwritten: the original
 * is copied to progress_backups first (so nothing the learner earned is
 * destroyed by a bad write or a stray edit). If only some entries are bad,
 * those are dropped and the rest is used; if it is not a progress value at
 * all, an empty progress takes its place.
 */
export async function repairStored(tx: Db, learnerId: string, stored: unknown, now: Date): Promise<Loaded> {
  const repaired = repairProgress(stored, now);
  if (repaired && !repaired.changed) return { progress: { ...repaired.progress, profile: learnerId }, recovered: false };
  const [backup] = await forLearner(tx, learnerId).insert(progressBackups, { reason: "corrupt", data: stored ?? {} });
  if (repaired) {
    console.error(`[fret-not] learner ${learnerId}: progress had entries that could not be read; dropped them (the original is progress_backups ${backup.id})`);
    return { progress: { ...repaired.progress, profile: learnerId }, recovered: true, recoveredTo: backup.id };
  }
  console.error(`[fret-not] learner ${learnerId}: progress was not a valid progress value; kept it as progress_backups ${backup.id} and started empty`);
  return { progress: emptyProgress(learnerId, now), recovered: true, recoveredTo: backup.id };
}

/**
 * Read the learner's progress under its row lock, repaired, and hand it to
 * `change`, which returns the progress to save (or null to save nothing)
 * and what to reply. A repaired value is saved even when `change` saves
 * nothing, so the next read does not report the same damage again. The
 * learner gone meanwhile (archived in another tab) is the stale-learner 409.
 */
async function withProgress<T>(ctx: LearnerCtx, now: Date, change: (loaded: Loaded, tx: Db) => Promise<{ save: Progress | null; reply: T }>): Promise<T> {
  return rawDb().transaction(async (tx) => {
    const mine = forUser(tx, ctx.user.id);
    const [row] = await tx.select({ progress: learners.progress }).from(learners).where(mine.where(learners, eq(learners.id, ctx.learner.id))).for("update");
    if (!row) throw new HttpError(409, "choose who's learning first", STALE_LEARNER);
    const loaded = await repairStored(tx, ctx.learner.id, row.progress, now);
    const { save, reply } = await change(loaded, tx);
    const out = save ?? (loaded.recovered ? loaded.progress : null);
    if (out) await mine.update(learners, { progress: out as unknown as Record<string, unknown> }, eq(learners.id, ctx.learner.id));
    return reply;
  });
}

interface AnswersBody {
  results?: unknown;
  lesson?: unknown;
}

function parseResults(raw: unknown): AnswerResult[] {
  if (!Array.isArray(raw)) throw new HttpError(400, "`results` must be a list of {concept, correct}");
  if (raw.length > 500) throw new HttpError(400, "`results` is too long (at most 500 answers per request)");
  return raw.map((r, i) => {
    // The id becomes a key of the progress file: it must have the shape of a
    // curriculum id (which also rules out "__proto__" and "constructor").
    if (!isRecord(r) || !isId(r.concept) || r.concept.length > 80 || typeof r.correct !== "boolean") {
      throw new HttpError(400, `results[${i}] must be {concept: string (a concept id), correct: boolean}`);
    }
    return { concept: r.concept, correct: r.correct };
  });
}

function parseLesson(raw: unknown): { id: string; score: number } | null {
  if (raw === undefined || raw === null) return null;
  if (!isRecord(raw) || !isId(raw.id) || raw.id.length > 120) throw new HttpError(400, "`lesson` must be {id: string (a lesson id), score: number}");
  if (typeof raw.score !== "number" || !Number.isFinite(raw.score) || raw.score < 0 || raw.score > 1) throw new HttpError(400, "`lesson.score` must be a number from 0 to 1");
  return { id: raw.id, score: raw.score };
}

function replyOf(loaded: Loaded, progress: Progress = loaded.progress): ProgressReply {
  return { progress, ...(loaded.recovered ? { recovered: true, recoveredTo: loaded.recoveredTo } : {}) };
}

/** Which levels are open is only worth remembering when the whole curriculum
 *  loaded. While a lesson is refused, its concepts look as if nothing tested
 *  them, the level asks less than it should, and a level opened on that
 *  basis would stay open for good. */
function canRemember(content: ReturnType<typeof loadContent>): boolean {
  return content.levels.length > 0 && content.concepts.length > 0 && content.problems.length === 0;
}

/** Mounted at /api/progress behind wrap() (api.ts) for the page's learner,
 *  which turns a thrown HttpError into its status.
 *
 *    GET  /api/progress             → { progress }
 *    POST /api/progress/answers     { results, lesson? } → { progress, dropped, lessonDropped, recovered }
 *                                   `dropped`: how many of the ANSWERS were not
 *                                   recorded because their concept id is not in
 *                                   the curriculum; `lessonDropped`: the lesson
 *                                   completion was not recorded (its id is not
 *                                   a lesson the curriculum has right now)
 *    POST /api/progress/placement   { level } → { progress }
 *    POST /api/progress/reset       → { progress } (the old progress is kept in progress_backups)
 *
 *  Any response may also carry `recovered: true` and `recoveredTo` (see
 *  repairStored); the answers reply always states `recovered`. */
export async function handleProgress(req: IncomingMessage, res: ServerResponse, ctx: LearnerCtx): Promise<void> {
  const route = subPath(req);
  const now = new Date();

  if (route === "") {
    if (req.method !== "GET") return methodNotAllowed(res, "GET");
    // Note which levels are open now, so they stay open if the curriculum
    // grows before the next answer. Only for a learner who has done
    // something (a new one has nothing to protect, and GET records nothing
    // for them), and only when the curriculum can be read and the record
    // moves.
    const content = loadContent();
    const out = await withProgress(ctx, now, async (loaded) => {
      const p = loaded.progress;
      const started = Object.keys(p.concepts).length > 0 || Object.keys(p.lessons).length > 0 || p.placedLevel > 0;
      const noted = started && canRemember(content) ? rememberOpened(content, p) : p;
      const moved = noted.openedLevel !== p.openedLevel;
      return { save: moved ? noted : null, reply: replyOf(loaded, noted) };
    });
    return sendJson(res, 200, out);
  }

  if (route !== "answers" && route !== "placement" && route !== "reset") {
    sendJson(res, 404, { error: "no such route" });
    return;
  }
  if (req.method !== "POST") return methodNotAllowed(res, "POST");

  if (route === "answers") {
    const body = await readJsonBody<AnswersBody>(req);
    const results = parseResults(body.results);
    const lesson = parseLesson(body.lesson);
    // Progress is keyed by ids from the curriculum; anything else (a concept
    // or lesson since renamed or removed, or a typo) is dropped rather than
    // stored forever — and the reply says how many, so the page can tell the
    // learner instead of the answers vanishing behind a 200.
    //
    // But "not in the curriculum" is only a verdict when the curriculum can
    // be read. While curriculum.yaml cannot be loaded there are no concepts
    // at all: the learner still answered real questions on a page loaded
    // earlier, so those are recorded as sent (the ids are already
    // shape-checked). A lesser problem — one refused lesson, a duplicate
    // track — leaves the id lists intact, and they are used.
    const content = loadContent();
    const unreadable = content.concepts.length === 0;
    const conceptIds = new Set(content.concepts.map((c) => c.id));
    const kept = unreadable ? results : results.filter((r) => conceptIds.has(r.concept));
    const dropped = results.length - kept.length;
    const lessonKnown = !lesson || unreadable || content.lessons.some((l) => l.id === lesson.id);
    const out = await withProgress(ctx, now, async (loaded) => {
      let progress = recordAnswers(loaded.progress, kept, now);
      if (lesson && lessonKnown) progress = recordLesson(progress, lesson.id, lesson.score, now);
      if (canRemember(content)) progress = rememberOpened(content, progress);
      const reply: AnswersReply = { progress, dropped, lessonDropped: !lessonKnown, recovered: loaded.recovered, ...(loaded.recoveredTo ? { recoveredTo: loaded.recoveredTo } : {}) };
      return { save: progress, reply };
    });
    if (dropped) console.warn(`[fret-not] progress: ${dropped} answer(s) not recorded: their concept id is not in the curriculum`);
    if (!lessonKnown) console.warn(`[fret-not] progress: completion of lesson "${lesson?.id}" not recorded: no such lesson is loaded`);
    return sendJson(res, 200, out);
  }

  if (route === "placement") {
    const body = await readJsonBody<{ level?: unknown }>(req);
    const content = loadContent();
    const level = body.level;
    // One past the last level is a real result: every level was passed.
    const top = Math.max(-1, ...content.levels.map((l) => l.id)) + 1;
    if (typeof level !== "number" || !(content.levels.some((l) => l.id === level) || (content.levels.length > 0 && level === top))) {
      throw new HttpError(400, `\`level\` must be one of the curriculum's levels (${content.levels.map((l) => l.id).join(", ")}) or ${top}, one past the last`);
    }
    const out = await withProgress(ctx, now, async (loaded) => {
      // Credit only the tracks the check stood for: the core and the
      // instruments this learner follows.
      const tracks = placementTracks(content, loaded.progress);
      const placed = applyPlacement(loaded.progress, level, content.concepts.filter((c) => tracks.has(c.track)), now);
      const progress = canRemember(content) ? rememberOpened(content, placed) : placed;
      return { save: progress, reply: replyOf(loaded, progress) };
    });
    return sendJson(res, 200, out);
  }

  // reset: keep what was there in progress_backups, then start again.
  const out = await withProgress(ctx, now, async (loaded, tx) => {
    await forLearner(tx, ctx.learner.id).insert(progressBackups, { reason: "reset", data: loaded.progress });
    const progress = emptyProgress(ctx.learner.id, now);
    return { save: progress, reply: { progress, recovered: false } satisfies ProgressReply };
  });
  sendJson(res, 200, out);
}
