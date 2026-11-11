import type { Concept, Content, Lesson } from "./content.ts";

// Learner progress: per-concept mastery, spaced review, level unlocks and
// placement. All functions are pure: they take a Progress and return a new
// one; `now` is always passed in. The file shape is what the server stores
// at data/profiles/<id>/progress.json.

export interface ConceptProgress {
  /** Results of the most recent answers, oldest first, at most RECENT_WINDOW. */
  recent: boolean[];
  attempts: number;
  correct: number;
  /** 0–1, from `recent` (weighted toward the newest). */
  mastery: number;
  /** 0 = still learning. 1+ = in spaced review; a higher box means a longer
   *  gap before the next review (REVIEW_INTERVAL_DAYS[box - 1]). */
  box: number;
  /** ISO time the next review falls due; null while box is 0. */
  dueAt: string | null;
  lastSeenAt: string | null;
}

export interface LessonProgress {
  completedAt: string;
  /** Best share of exercise questions answered correctly, 0–1. */
  bestScore: number;
  runs: number;
}

export interface Progress {
  version: 1;
  profile: string;
  concepts: Record<string, ConceptProgress>;
  lessons: Record<string, LessonProgress>;
  /** Levels below this were unlocked by the placement check. */
  placedLevel: number;
  updatedAt: string;
}

export const RECENT_WINDOW = 12;
/** A concept is mastered at this mastery with at least MIN_ATTEMPTS answers. */
export const MASTERY_THRESHOLD = 0.8;
export const MIN_ATTEMPTS = 4;
/** Days until the next review, by box. */
export const REVIEW_INTERVAL_DAYS = [1, 3, 7, 14, 30, 60, 120];
/** Share of a level's concepts that must be mastered to unlock the next. */
export const UNLOCK_FRACTION = 0.7;
/** Placement puts a tested-out concept in this box, first due in a week
 *  (longer than the box's usual gap: the learner has just shown they know it). */
const PLACEMENT_BOX = 2;
const PLACEMENT_DUE_DAYS = 7;

export interface AnswerResult {
  concept: string;
  correct: boolean;
}

const DAY_MS = 24 * 60 * 60 * 1000;
const addDays = (now: Date, days: number): string => new Date(now.getTime() + days * DAY_MS).toISOString();
const intervalFor = (box: number): number => REVIEW_INTERVAL_DAYS[Math.min(box, REVIEW_INTERVAL_DAYS.length) - 1];

function blankConcept(): ConceptProgress {
  return { recent: [], attempts: 0, correct: 0, mastery: 0, box: 0, dueAt: null, lastSeenAt: null };
}

/** Recency-weighted share correct: the i-th oldest answer weighs i + 1, so
 *  the newest of n answers counts n times as much as the oldest. */
export function masteryOf(recent: boolean[]): number {
  if (recent.length === 0) return 0;
  let got = 0;
  let all = 0;
  recent.forEach((ok, i) => {
    all += i + 1;
    if (ok) got += i + 1;
  });
  return got / all;
}

export function emptyProgress(profile: string, now: Date): Progress {
  return { version: 1, profile, concepts: {}, lessons: {}, placedLevel: 0, updatedAt: now.toISOString() };
}

/** Fold answers in. A concept reaching mastery enters box 1. For a concept
 *  already in review (box ≥ 1) whose review is due, the answers in this call
 *  count as one review: all correct → up a box; any wrong → down two boxes
 *  (not below 1) and due tomorrow. Answers to a concept that is in review but
 *  not yet due update `recent`/mastery only. */
export function recordAnswers(progress: Progress, results: AnswerResult[], now: Date): Progress {
  const byConcept = new Map<string, boolean[]>();
  for (const r of results) {
    const list = byConcept.get(r.concept) ?? [];
    list.push(r.correct);
    byConcept.set(r.concept, list);
  }
  const concepts = { ...progress.concepts };
  for (const [id, answers] of byConcept) {
    const prev = concepts[id] ?? blankConcept();
    const wasDue = prev.box >= 1 && prev.dueAt !== null && Date.parse(prev.dueAt) <= now.getTime();
    const recent = [...prev.recent, ...answers].slice(-RECENT_WINDOW);
    const next: ConceptProgress = {
      recent,
      attempts: prev.attempts + answers.length,
      correct: prev.correct + answers.filter(Boolean).length,
      mastery: masteryOf(recent),
      box: prev.box,
      dueAt: prev.dueAt,
      lastSeenAt: now.toISOString(),
    };
    if (prev.box === 0) {
      if (next.mastery >= MASTERY_THRESHOLD && next.attempts >= MIN_ATTEMPTS) {
        next.box = 1;
        next.dueAt = addDays(now, intervalFor(1));
      }
    } else if (wasDue) {
      if (answers.every(Boolean)) {
        next.box = Math.min(prev.box + 1, REVIEW_INTERVAL_DAYS.length);
        next.dueAt = addDays(now, intervalFor(next.box));
      } else {
        next.box = Math.max(1, prev.box - 2);
        next.dueAt = addDays(now, 1);
      }
    }
    concepts[id] = next;
  }
  return { ...progress, concepts, updatedAt: now.toISOString() };
}

/** Record a finished run of a lesson's exercises. `completedAt` keeps the
 *  first completion; `bestScore` the best of all runs. */
export function recordLesson(progress: Progress, lessonId: string, score: number, now: Date): Progress {
  const s = Math.min(1, Math.max(0, Number.isFinite(score) ? score : 0));
  const prev = progress.lessons[lessonId];
  const entry: LessonProgress = prev ? { completedAt: prev.completedAt, bestScore: Math.max(prev.bestScore, s), runs: prev.runs + 1 } : { completedAt: now.toISOString(), bestScore: s, runs: 1 };
  return { ...progress, lessons: { ...progress.lessons, [lessonId]: entry }, updatedAt: now.toISOString() };
}

/** Mastered = in spaced review (which a concept enters on reaching
 *  MASTERY_THRESHOLD with MIN_ATTEMPTS answers, or by placement). Once there
 *  it stays mastered — a bad review shortens its interval instead of
 *  re-locking levels. */
export function isMastered(cp: ConceptProgress | undefined): boolean {
  if (!cp) return false;
  return cp.box >= 1 || (cp.mastery >= MASTERY_THRESHOLD && cp.attempts >= MIN_ATTEMPTS);
}

/** Concept ids whose review is due at `now`, most overdue first. */
export function dueConcepts(progress: Progress, now: Date): string[] {
  const t = now.getTime();
  return Object.entries(progress.concepts)
    .filter(([, cp]) => cp.box >= 1 && cp.dueAt !== null && Date.parse(cp.dueAt) <= t)
    .sort((a, b) => Date.parse(a[1].dueAt!) - Date.parse(b[1].dueAt!) || a[0].localeCompare(b[0]))
    .map(([id]) => id);
}

export interface LevelStatus {
  level: number;
  unlocked: boolean;
  mastered: number;
  total: number;
  lessonsDone: number;
  lessonsTotal: number;
}
/** One entry per level in content.levels. Level 0 is always unlocked; level n
 *  is unlocked when n ≤ placedLevel or level n-1 has UNLOCK_FRACTION of its
 *  concepts mastered. Outline levels are never unlocked. */
export function levelStatuses(content: Pick<Content, "levels" | "concepts" | "lessons">, progress: Progress): LevelStatus[] {
  const levels = [...content.levels].sort((a, b) => a.id - b.id);
  const out: LevelStatus[] = [];
  levels.forEach((level, i) => {
    const concepts = content.concepts.filter((c) => c.level === level.id);
    const lessons = content.lessons.filter((l) => l.level === level.id);
    const prev = out[i - 1];
    const prevFraction = prev && prev.total > 0 ? prev.mastered / prev.total : 0;
    const unlocked = level.status !== "outline" && (i === 0 || level.id <= progress.placedLevel || prevFraction >= UNLOCK_FRACTION);
    out.push({
      level: level.id,
      unlocked,
      mastered: concepts.filter((c) => isMastered(progress.concepts[c.id])).length,
      total: concepts.length,
      lessonsDone: lessons.filter((l) => progress.lessons[l.id]).length,
      lessonsTotal: lessons.length,
    });
  });
  // Back in the order content.levels came in.
  return content.levels.map((l) => out.find((s) => s.level === l.id)!);
}

/** The first lesson not yet completed in an unlocked level, in path order;
 *  null when everything available is done. */
export function nextLesson(content: Pick<Content, "levels" | "concepts" | "lessons">, progress: Progress): Lesson | null {
  const unlocked = new Set(levelStatuses(content, progress).filter((s) => s.unlocked).map((s) => s.level));
  return content.lessons.find((l) => unlocked.has(l.level) && !progress.lessons[l.id]) ?? null;
}

/** Placement: the learner tested out of every level below `level`. Marks
 *  those levels' concepts mastered (in review, due in a week, so they still
 *  come round) and leaves their lessons untouched. Never lowers a concept
 *  already further along, and never lowers placedLevel. */
export function applyPlacement(progress: Progress, level: number, concepts: Concept[], now: Date): Progress {
  const next = { ...progress.concepts };
  for (const c of concepts) {
    if (c.level >= level) continue;
    const prev = next[c.id] ?? blankConcept();
    if (prev.box >= PLACEMENT_BOX) continue;
    next[c.id] = { ...prev, recent: [...prev.recent], mastery: Math.max(prev.mastery, 1), box: PLACEMENT_BOX, dueAt: addDays(now, PLACEMENT_DUE_DAYS) };
  }
  return { ...progress, concepts: next, placedLevel: Math.max(progress.placedLevel, level), updatedAt: now.toISOString() };
}
