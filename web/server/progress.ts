import fs from "node:fs";
import type { IncomingMessage, ServerResponse } from "node:http";
import path from "node:path";
import { applyPlacement, emptyProgress, placementTracks, RECENT_WINDOW, recordAnswers, recordLesson, rememberOpened, REVIEW_INTERVAL_DAYS, type AnswerResult, type Progress } from "../shared/progress.ts";
import { isId, loadContent, REPO_ROOT } from "./loader.ts";
import type { AnswersReply, ProgressReply } from "../shared/wire.ts";
import { HttpError, methodNotAllowed, readJsonBody, sendJson, subPath } from "./sse.ts";

// Learner progress on disk and over HTTP. One JSON file per profile:
//
//   data/profiles/<profile>/progress.json
//
// read on every request and rewritten whole (temp file + rename) on every
// change — the app is single-user and the file is a few KB, so a cache would
// only add a way for the file and the process to disagree. The rules
// (mastery, review boxes, unlocks) live in shared/progress.ts; this module
// only validates input, loads, applies and saves.

/** v1 has one learner. The id is a parameter everywhere below so a profile
 *  switcher is a route change, not a storage change. */
export const DEFAULT_PROFILE = "default";

/** FRET_DATA_DIR when set (resolved against the repo root), else <repo>/data.
 *  Read per call so a test can redirect it. */
export function dataDir(): string {
  const override = process.env.FRET_DATA_DIR;
  return override ? path.resolve(REPO_ROOT, override) : path.join(REPO_ROOT, "data");
}

const PROFILE_RE = /^[a-z0-9]+(-[a-z0-9]+)*$/;
function profileDir(profile: string): string {
  // The id becomes a directory name; refuse anything that could climb out.
  if (!PROFILE_RE.test(profile)) throw new HttpError(400, `bad profile id: ${JSON.stringify(profile)}`);
  return path.join(dataDir(), "profiles", profile);
}
const progressPath = (profile: string) => path.join(profileDir(profile), "progress.json");

/** Safe in a file name on every filesystem, and sorts by time. */
const stamp = (now: Date) => now.toISOString().replace(/[:.]/g, "-");

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
  /** True when the stored file could not be used as it was: either it was
   *  unreadable and an empty progress took its place, or some entries in it
   *  were bad and were dropped. Either way the original is kept at
   *  `recoveredTo`. */
  recovered: boolean;
  /** Where the original file went (absolute path), when `recovered`. */
  recoveredTo?: string;
}

/** A missing file is a new learner. A file that exists but cannot be used as
 *  it stands is never overwritten in place: the original is kept as
 *  progress.corrupt-<time>.json (so nothing the learner earned is destroyed
 *  by a bad write or a stray edit). If only some entries are bad, those are
 *  dropped and the rest is used; if the file is not a progress file at all,
 *  an empty progress takes its place. */
export function loadProgress(profile: string, now: Date): Loaded {
  const file = progressPath(profile);
  let text: string;
  try {
    text = fs.readFileSync(file, "utf8");
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === "ENOENT") return { progress: emptyProgress(profile, now), recovered: false };
    throw e;
  }
  const aside = path.join(profileDir(profile), `progress.corrupt-${stamp(now)}.json`);
  let repaired: ReturnType<typeof repairProgress> = null;
  try {
    repaired = repairProgress(JSON.parse(text), now);
  } catch {
    /* not JSON: fall through to recovery */
  }
  if (repaired && !repaired.changed) return { progress: { ...repaired.progress, profile }, recovered: false };
  if (repaired) {
    // Usable apart from some entries: keep the original beside it, and save
    // the cleaned file so the next read does not report it again.
    fs.copyFileSync(file, aside);
    const progress = { ...repaired.progress, profile };
    saveProgress(profile, progress);
    console.error(`[fret-not] ${file} had entries that could not be read; dropped them (the original is at ${aside})`);
    return { progress, recovered: true, recoveredTo: aside };
  }
  fs.renameSync(file, aside);
  console.error(`[fret-not] ${file} was not a valid progress file; moved it to ${aside} and started empty`);
  return { progress: emptyProgress(profile, now), recovered: true, recoveredTo: aside };
}

/** Write whole, atomically: a crash mid-write leaves the old file, not half
 *  a new one. */
export function saveProgress(profile: string, progress: Progress): void {
  const dir = profileDir(profile);
  fs.mkdirSync(dir, { recursive: true });
  const file = progressPath(profile);
  const tmp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, `${JSON.stringify(progress, null, 2)}\n`);
  fs.renameSync(tmp, file);
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

function reply(res: ServerResponse, loaded: Loaded): void {
  sendJson(res, 200, { progress: loaded.progress, ...(loaded.recovered ? { recovered: true, recoveredTo: loaded.recoveredTo } : {}) } satisfies ProgressReply);
}

/** Mounted at /api/progress behind wrap() (api.ts), which turns a thrown
 *  HttpError into its status.
 *
 *    GET  /api/progress             → { progress }
 *    POST /api/progress/answers     { results, lesson? } → { progress, dropped, lessonDropped, recovered }
 *                                   `dropped`: how many of the ANSWERS were not
 *                                   recorded because their concept id is not in
 *                                   the curriculum; `lessonDropped`: the lesson
 *                                   completion was not recorded (its id is not
 *                                   a lesson the curriculum has right now)
 *    POST /api/progress/placement   { level } → { progress }
 *    POST /api/progress/reset       → { progress } (the old file is archived)
 *
 *  Any response may also carry `recovered: true` and `recoveredTo` (see
 *  loadProgress); the answers reply always states `recovered`. */
/** Which levels are open is only worth remembering when the whole curriculum
 *  loaded. While a lesson is refused, its concepts look as if nothing tested
 *  them, the level asks less than it should, and a level opened on that
 *  basis would stay open for good. */
function canRemember(content: ReturnType<typeof loadContent>): boolean {
  return content.levels.length > 0 && content.concepts.length > 0 && content.problems.length === 0;
}

export async function handleProgress(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const route = subPath(req);
  const profile = DEFAULT_PROFILE;
  const now = new Date();

  if (route === "") {
    if (req.method !== "GET") return methodNotAllowed(res, "GET");
    const loaded = loadProgress(profile, now);
    // Note which levels are open now, so they stay open if the curriculum
    // grows before the next answer. Only an existing learner's file is
    // written (a new learner has nothing to protect, and GET creates nothing),
    // and only when the curriculum can be read and the record moves.
    const content = loadContent();
    const noted = canRemember(content) ? rememberOpened(content, loaded.progress) : loaded.progress;
    if (noted.openedLevel !== loaded.progress.openedLevel && fs.existsSync(progressPath(profile))) {
      saveProgress(profile, noted);
      return reply(res, { ...loaded, progress: noted });
    }
    return reply(res, loaded);
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
    const loaded = loadProgress(profile, now);
    let progress = recordAnswers(loaded.progress, kept, now);
    let lessonDropped = false;
    if (lesson) {
      if (unreadable || content.lessons.some((l) => l.id === lesson.id)) progress = recordLesson(progress, lesson.id, lesson.score, now);
      else lessonDropped = true;
    }
    if (canRemember(content)) progress = rememberOpened(content, progress);
    saveProgress(profile, progress);
    if (dropped) console.warn(`[fret-not] progress: ${dropped} answer(s) not recorded: their concept id is not in the curriculum`);
    if (lessonDropped) console.warn(`[fret-not] progress: completion of lesson "${lesson?.id}" not recorded: no such lesson is loaded`);
    sendJson(res, 200, { progress, dropped, lessonDropped, recovered: loaded.recovered, ...(loaded.recoveredTo ? { recoveredTo: loaded.recoveredTo } : {}) } satisfies AnswersReply);
    return;
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
    const loaded = loadProgress(profile, now);
    // Credit only the tracks the check stood for: the core and the
    // instruments this learner follows.
    const tracks = placementTracks(content, loaded.progress);
    const placed = applyPlacement(loaded.progress, level, content.concepts.filter((c) => tracks.has(c.track)), now);
    const progress = canRemember(content) ? rememberOpened(content, placed) : placed;
    saveProgress(profile, progress);
    return reply(res, { ...loaded, progress });
  }

  // reset: keep what was there under another name, then start again.
  const file = progressPath(profile);
  if (fs.existsSync(file)) fs.renameSync(file, path.join(profileDir(profile), `progress.reset-${stamp(now)}.json`));
  const progress = emptyProgress(profile, now);
  saveProgress(profile, progress);
  reply(res, { progress, recovered: false });
}
