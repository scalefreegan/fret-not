import fs from "node:fs";
import type { IncomingMessage, ServerResponse } from "node:http";
import path from "node:path";
import { applyPlacement, emptyProgress, recordAnswers, recordLesson, type AnswerResult, type Progress } from "../shared/progress.ts";
import { loadContent, REPO_ROOT } from "./loader.ts";
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

/** Enough of a shape check that the pure functions cannot crash on the file:
 *  a hand-edited or half-written file is "corrupt", not trusted. */
function looksLikeProgress(v: unknown): v is Progress {
  if (!isRecord(v) || v.version !== 1 || !isRecord(v.concepts) || !isRecord(v.lessons) || typeof v.placedLevel !== "number") return false;
  for (const cp of Object.values(v.concepts)) {
    if (!isRecord(cp) || !Array.isArray(cp.recent) || typeof cp.attempts !== "number" || typeof cp.correct !== "number" || typeof cp.mastery !== "number" || typeof cp.box !== "number") return false;
    if (cp.dueAt !== null && (typeof cp.dueAt !== "string" || Number.isNaN(Date.parse(cp.dueAt)))) return false;
  }
  for (const lp of Object.values(v.lessons)) {
    if (!isRecord(lp) || typeof lp.completedAt !== "string" || typeof lp.bestScore !== "number" || typeof lp.runs !== "number") return false;
  }
  return true;
}

export interface Loaded {
  progress: Progress;
  /** True when the stored file could not be used and was moved aside. */
  recovered: boolean;
}

/** A missing file is a new learner. A file that exists but cannot be parsed
 *  is never overwritten in place: it is moved to progress.corrupt-<time>.json
 *  (so nothing the learner earned is destroyed by a bad write or a stray
 *  edit) and an empty progress takes its place. */
export function loadProgress(profile: string, now: Date): Loaded {
  const file = progressPath(profile);
  let text: string;
  try {
    text = fs.readFileSync(file, "utf8");
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === "ENOENT") return { progress: emptyProgress(profile, now), recovered: false };
    throw e;
  }
  try {
    const parsed: unknown = JSON.parse(text);
    if (looksLikeProgress(parsed)) return { progress: { ...parsed, profile }, recovered: false };
  } catch {
    /* fall through to recovery */
  }
  const aside = path.join(profileDir(profile), `progress.corrupt-${stamp(now)}.json`);
  fs.renameSync(file, aside);
  console.error(`[fret-not] ${file} was not a valid progress file; moved it to ${aside} and started empty`);
  return { progress: emptyProgress(profile, now), recovered: true };
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
    if (!isRecord(r) || typeof r.concept !== "string" || !r.concept || typeof r.correct !== "boolean") {
      throw new HttpError(400, `results[${i}] must be {concept: string, correct: boolean}`);
    }
    return { concept: r.concept, correct: r.correct };
  });
}

function parseLesson(raw: unknown): { id: string; score: number } | null {
  if (raw === undefined || raw === null) return null;
  if (!isRecord(raw) || typeof raw.id !== "string" || !raw.id) throw new HttpError(400, "`lesson` must be {id: string, score: number}");
  if (typeof raw.score !== "number" || !Number.isFinite(raw.score) || raw.score < 0 || raw.score > 1) throw new HttpError(400, "`lesson.score` must be a number from 0 to 1");
  return { id: raw.id, score: raw.score };
}

function reply(res: ServerResponse, loaded: Loaded): void {
  sendJson(res, 200, loaded.recovered ? { progress: loaded.progress, recovered: true } : { progress: loaded.progress });
}

/** Mounted at /api/progress behind wrap() (api.ts), which turns a thrown
 *  HttpError into its status.
 *
 *    GET  /api/progress             → { progress }
 *    POST /api/progress/answers     { results, lesson? } → { progress }
 *    POST /api/progress/placement   { level } → { progress }
 *    POST /api/progress/reset       → { progress } (the old file is archived)
 *
 *  Any response may also carry `recovered: true` (see loadProgress). */
export async function handleProgress(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const route = subPath(req);
  const profile = DEFAULT_PROFILE;
  const now = new Date();

  if (route === "") {
    if (req.method !== "GET") return methodNotAllowed(res, "GET");
    return reply(res, loadProgress(profile, now));
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
    // stored forever.
    const content = loadContent();
    const conceptIds = new Set(content.concepts.map((c) => c.id));
    const loaded = loadProgress(profile, now);
    let progress = recordAnswers(loaded.progress, results.filter((r) => conceptIds.has(r.concept)), now);
    if (lesson && content.lessons.some((l) => l.id === lesson.id)) progress = recordLesson(progress, lesson.id, lesson.score, now);
    saveProgress(profile, progress);
    return reply(res, { progress, recovered: loaded.recovered });
  }

  if (route === "placement") {
    const body = await readJsonBody<{ level?: unknown }>(req);
    const content = loadContent();
    const level = body.level;
    if (typeof level !== "number" || !content.levels.some((l) => l.id === level)) {
      throw new HttpError(400, `\`level\` must be one of the curriculum's levels: ${content.levels.map((l) => l.id).join(", ")}`);
    }
    const loaded = loadProgress(profile, now);
    const progress = applyPlacement(loaded.progress, level, content.concepts, now);
    saveProgress(profile, progress);
    return reply(res, { progress, recovered: loaded.recovered });
  }

  // reset: keep what was there under another name, then start again.
  const file = progressPath(profile);
  if (fs.existsSync(file)) fs.renameSync(file, path.join(profileDir(profile), `progress.reset-${stamp(now)}.json`));
  const progress = emptyProgress(profile, now);
  saveProgress(profile, progress);
  reply(res, { progress, recovered: false });
}
