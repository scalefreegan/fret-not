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
  /** ISO time of the start of the local day the next review falls due (it is
   *  due all of that day, and after); null while box is 0. */
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
  /** The highest level that has ever been open to this learner (by mastery
   *  or placement). Levels up to it stay open: see levelStatuses. Absent in
   *  files written before it existed, which reads as 0. */
  openedLevel?: number;
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
/** Tested-out concepts fall due over this many days, not all on one. */
const PLACEMENT_SPREAD_DAYS = 7;
/** A lesson counts as done once a run of its exercises scores this much.
 *  Below it the lesson has been attempted: it is offered again by Continue
 *  and is not ticked off. */
export const LESSON_DONE_SCORE = 0.6;

export interface AnswerResult {
  concept: string;
  correct: boolean;
}

/** Reviews are due by calendar day, in the learner's own time zone (the
 *  server and the browser are the same machine): "due tomorrow" means from
 *  the start of tomorrow, whatever time of day today's practice was. */
const startOfLocalDay = (d: Date, plusDays = 0): Date => new Date(d.getFullYear(), d.getMonth(), d.getDate() + plusDays);
const addDays = (now: Date, days: number): string => startOfLocalDay(now, days).toISOString();
/** True once the local day `dueAt` falls on has begun. Older files stored a
 *  clock time (now + N×24h); they are read by their day, like the rest. */
export function isDue(dueAt: string | null, now: Date): boolean {
  if (dueAt === null) return false;
  const t = Date.parse(dueAt);
  return !Number.isNaN(t) && startOfLocalDay(new Date(t)).getTime() <= now.getTime();
}
const dueDay = (dueAt: string): number => startOfLocalDay(new Date(Date.parse(dueAt))).getTime();

// Progress is plain JSON keyed by ids, so a key is only ever read as an OWN
// property: an id such as "constructor" must find nothing, not a built-in.
// "__proto__" cannot be stored by assignment at all, so it is never recorded
// (the loader refuses both as ids).
const own = <T>(map: Record<string, T>, key: string): T | undefined => (Object.hasOwn(map, key) ? map[key] : undefined);
const storable = (key: string): boolean => key !== "__proto__";
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
  return { version: 1, profile, concepts: {}, lessons: {}, placedLevel: 0, openedLevel: 0, updatedAt: now.toISOString() };
}

/** Fold answers in. A concept reaching mastery enters box 1. For a concept
 *  already in review (box ≥ 1) whose review is due, the answers in this call
 *  count as one review: all correct → up a box; any wrong → down two boxes
 *  (not below 1) and due tomorrow. Answers to a concept that is in review but
 *  not yet due update `recent`/mastery only. */
export function recordAnswers(progress: Progress, results: AnswerResult[], now: Date): Progress {
  const byConcept = new Map<string, boolean[]>();
  for (const r of results) {
    if (!storable(r.concept)) continue;
    const list = byConcept.get(r.concept) ?? [];
    list.push(r.correct);
    byConcept.set(r.concept, list);
  }
  const concepts = { ...progress.concepts };
  for (const [id, answers] of byConcept) {
    const prev = own(concepts, id) ?? blankConcept();
    const wasDue = prev.box >= 1 && isDue(prev.dueAt, now);
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
  if (!storable(lessonId)) return progress;
  const prev = own(progress.lessons, lessonId);
  const entry: LessonProgress = prev ? { completedAt: prev.completedAt, bestScore: Math.max(prev.bestScore, s), runs: prev.runs + 1 } : { completedAt: now.toISOString(), bestScore: s, runs: 1 };
  return { ...progress, lessons: { ...progress.lessons, [lessonId]: entry }, updatedAt: now.toISOString() };
}

/** Done = finished with at least LESSON_DONE_SCORE in some run. */
export function isLessonDone(lp: LessonProgress | undefined): boolean {
  return !!lp && lp.bestScore >= LESSON_DONE_SCORE - 1e-9;
}
/** "new": never finished; "attempted": finished, but below LESSON_DONE_SCORE
 *  every time; "done". */
export function lessonState(lp: LessonProgress | undefined): "new" | "attempted" | "done" {
  return !lp ? "new" : isLessonDone(lp) ? "done" : "attempted";
}

/** Mastered = in spaced review (which a concept enters on reaching
 *  MASTERY_THRESHOLD with MIN_ATTEMPTS answers, or by placement). Once there
 *  it stays mastered: a bad review shortens its interval. (What keeps a level
 *  open once opened is `openedLevel`, not this.) */
export function isMastered(cp: ConceptProgress | undefined): boolean {
  if (!cp) return false;
  return cp.box >= 1 || (cp.mastery >= MASTERY_THRESHOLD && cp.attempts >= MIN_ATTEMPTS);
}

/** Concept ids whose review is due today (or overdue), most overdue first.
 *  With `known` (see reviewableConcepts), ids outside it are left out: a
 *  concept the curriculum no longer has, or one no exercise tests, could
 *  never be reviewed and so must not be counted as waiting. */
export function dueConcepts(progress: Progress, now: Date, known?: ReadonlySet<string>): string[] {
  return Object.entries(progress.concepts)
    .filter(([id, cp]) => cp.box >= 1 && isDue(cp.dueAt, now) && (!known || known.has(id)))
    .sort((a, b) => dueDay(a[1].dueAt!) - dueDay(b[1].dueAt!) || a[0].localeCompare(b[0]))
    .map(([id]) => id);
}

/** The concepts a review can actually ask about: in the curriculum, and
 *  tested by at least one exercise of a lesson that loaded. Pass the result
 *  to dueConcepts. */
export function reviewableConcepts(content: Pick<Content, "concepts" | "lessons">): Set<string> {
  const tested = new Set(content.lessons.flatMap((l) => l.exercises.map((e) => e.concept)));
  return new Set(content.concepts.filter((c) => tested.has(c.id)).map((c) => c.id));
}

export interface LevelStatus {
  level: number;
  unlocked: boolean;
  mastered: number;
  total: number;
  lessonsDone: number;
  lessonsTotal: number;
  /** The level whose mastery decides whether this one opens (see
   *  levelStatuses), or null when nothing gates it. The page names THIS level
   *  in its "locked until…" text. */
  gate: number | null;
  /** Of the gate level's reviewable concepts in `gateTracks`: how many are
   *  mastered, and how many there are. Both 0 when `gate` is null. */
  gateMastered: number;
  gateTotal: number;
  /** The tracks the gate was counted over: the choice that leaves this
   *  learner the fewest concepts still to master. Empty when `gate` is null. */
  gateTracks: string[];
}

interface Gate {
  level: number;
  mastered: number;
  total: number;
  tracks: string[];
  passed: boolean;
}
const needOf = (mastered: number, total: number): number => Math.max(0, Math.ceil(total * UNLOCK_FRACTION - 1e-9) - mastered);

/** How a level stands as a gate FOR THIS LEARNER. Nobody has to learn every
 *  instrument: the count is taken over the core concepts plus whichever
 *  instrument tracks suit the learner best (none, one, several), i.e. the
 *  choice of tracks that leaves the fewest concepts still to master. So a
 *  piano-only learner is measured on core + piano, a guitar-only learner on
 *  core + guitar, and work on a second instrument can only help. `core` here
 *  means every track that is not an instrument track; when `instrumentTracks`
 *  is not given, a track named "core" is the core and the rest are optional. */
function gateOf(level: number, testable: Concept[], progress: Progress, optional: (track: string) => boolean): Gate {
  const count = (cs: Concept[]) => ({ mastered: cs.filter((c) => isMastered(own(progress.concepts, c.id))).length, total: cs.length });
  const core = count(testable.filter((c) => !optional(c.track)));
  const tracks = [...new Set(testable.filter((c) => optional(c.track)).map((c) => c.track))];
  const coreTracks = [...new Set(testable.filter((c) => !optional(c.track)).map((c) => c.track))];
  // Each optional track is taken or left on its own merits: it joins the count
  // exactly when that lowers (or, on a tie, does not raise) what is still
  // needed. Trying every combination is exact; past a dozen optional tracks
  // (never, in practice) all of them are counted.
  const per = tracks.map((t) => ({ track: t, ...count(testable.filter((c) => c.track === t)) }));
  let best: { mastered: number; total: number; tracks: string[] } | null = null;
  const combos = per.length <= 12 ? 1 << per.length : 1;
  for (let mask = 0; mask < combos; mask++) {
    const chosen = per.length <= 12 ? per.filter((_, i) => mask & (1 << i)) : per;
    const mastered = core.mastered + chosen.reduce((n, t) => n + t.mastered, 0);
    const total = core.total + chosen.reduce((n, t) => n + t.total, 0);
    if (total === 0) continue;
    const cand = { mastered, total, tracks: [...coreTracks, ...chosen.map((t) => t.track)] };
    // Fewest still needed; then the wider choice (it describes more of what
    // the learner has done).
    if (!best || needOf(mastered, total) < needOf(best.mastered, best.total) || (needOf(mastered, total) === needOf(best.mastered, best.total) && total > best.total)) best = cand;
  }
  if (!best) return { level, mastered: 0, total: 0, tracks: [], passed: true };
  return { level, ...best, passed: needOf(best.mastered, best.total) === 0 };
}

type GateContent = Pick<Content, "levels" | "concepts" | "lessons"> & Partial<Pick<Content, "tracks">>;

const optionalTrack = (content: GateContent): ((track: string) => boolean) => {
  const instrumentTracks = content.tracks ? new Set(content.tracks.filter((t) => t.instrument).map((t) => t.id)) : null;
  return (track) => (instrumentTracks ? instrumentTracks.has(track) : track !== "core");
};

/** The instrument tracks this learner has actually worked in: a lesson
 *  finished or attempted there, or a concept of that track answered. */
export function followedTracks(content: GateContent, progress: Progress): Set<string> {
  const optional = optionalTrack(content);
  const out = new Set<string>();
  for (const l of content.lessons) if (optional(l.track) && own(progress.lessons, l.id)) out.add(l.track);
  for (const c of content.concepts) if (optional(c.track) && (own(progress.concepts, c.id)?.attempts ?? 0) > 0) out.add(c.track);
  return out;
}
/** The tracks a placement check asks about and credits: the core, plus the
 *  instruments the learner follows. Someone who has touched no instrument is
 *  placed on the core alone, which is all the level gate asks of them. */
export function placementTracks(content: GateContent, progress: Progress): Set<string> {
  const optional = optionalTrack(content);
  const followed = followedTracks(content, progress);
  return new Set([...content.concepts.map((c) => c.track), ...content.lessons.map((l) => l.track)].filter((t) => !optional(t) || followed.has(t)));
}
/** The concepts a placement check for `level` draws its questions from: the
 *  level's reviewable concepts in placementTracks, so a piano-only learner is
 *  never failed on guitar questions. In curriculum order; with `seed`, in an
 *  order shuffled by it. */
export function placementConcepts(content: GateContent, progress: Progress, level: number, seed?: number): string[] {
  const tracks = placementTracks(content, progress);
  const reviewable = reviewableConcepts(content);
  const ids = content.concepts.filter((c) => c.level === level && tracks.has(c.track) && reviewable.has(c.id)).map((c) => c.id);
  if (seed === undefined) return ids;
  let a = (Math.floor(seed) ^ 0x9e3779b9) >>> 0;
  for (let i = ids.length - 1; i > 0; i--) {
    a = (Math.imul(a, 1664525) + 1013904223) >>> 0;
    const j = a % (i + 1);
    [ids[i], ids[j]] = [ids[j], ids[i]];
  }
  return ids;
}

/** One entry per level in content.levels. Outline levels are never unlocked.
 *  The first written level is always unlocked. A later level n is unlocked
 *  when any of these holds:
 *    - n ≤ placedLevel (the placement check);
 *    - n ≤ openedLevel (it has been open before: a level never re-locks, not
 *      after a bad review and not when the curriculum gains a concept);
 *    - the written level before it is unlocked AND its GATE is passed.
 *  The gate is the nearest earlier level that has reviewable concepts
 *  (reviewableConcepts: in the curriculum and tested by an exercise of a
 *  loaded lesson); it is passed when UNLOCK_FRACTION of them are mastered,
 *  counted over the tracks that suit this learner (gateOf). A level with no
 *  reviewable concepts — just added, an outline, or concepts no lesson drills
 *  yet — asks nothing the learner could do, so it is skipped when looking
 *  back rather than blocking everything after it. Levels open in order: a
 *  level is never open while the written level before it is locked. */
export function levelStatuses(content: GateContent, progress: Progress): LevelStatus[] {
  const levels = [...content.levels].sort((a, b) => a.id - b.id);
  const out: LevelStatus[] = [];
  const reviewable = reviewableConcepts(content);
  const optional = optionalTrack(content);
  const opened = Math.max(progress.placedLevel, progress.openedLevel ?? 0);
  const gates: Gate[] = [];
  let first = true;
  let prevUnlocked = true;
  for (const level of levels) {
    const concepts = content.concepts.filter((c) => c.level === level.id);
    const lessons = content.lessons.filter((l) => l.level === level.id);
    const gate = first ? undefined : [...gates].reverse().find((g) => g.total > 0);
    const written = level.status !== "outline";
    const unlocked: boolean = written && (first || level.id <= opened || (prevUnlocked && (!gate || gate.passed)));
    gates.push(gateOf(level.id, concepts.filter((c) => reviewable.has(c.id)), progress, optional));
    if (written) {
      first = false;
      prevUnlocked = unlocked;
    }
    out.push({
      level: level.id,
      unlocked,
      mastered: concepts.filter((c) => isMastered(own(progress.concepts, c.id))).length,
      total: concepts.length,
      lessonsDone: lessons.filter((l) => isLessonDone(own(progress.lessons, l.id))).length,
      lessonsTotal: lessons.length,
      gate: gate ? gate.level : null,
      gateMastered: gate ? gate.mastered : 0,
      gateTotal: gate ? gate.total : 0,
      gateTracks: gate ? gate.tracks : [],
    });
  }
  // Back in the order content.levels came in.
  return content.levels.map((l) => out.find((s) => s.level === l.id)!);
}

/** Remember the highest level that is open, so it stays open whatever happens
 *  to the curriculum or to a review afterwards. Returns the same object when
 *  nothing changed. The server calls this whenever it has both the curriculum
 *  and the progress in hand; skip it while the curriculum cannot be read (no
 *  levels: nothing would be learned from it). */
export function rememberOpened(content: GateContent, progress: Progress): Progress {
  const open = levelStatuses(content, progress).filter((s) => s.unlocked).map((s) => s.level);
  const highest = Math.max(progress.openedLevel ?? 0, ...open);
  return highest === (progress.openedLevel ?? 0) && progress.openedLevel !== undefined ? progress : { ...progress, openedLevel: highest };
}

/** The lesson "Continue" offers: the first lesson not yet done (isLessonDone)
 *  in an unlocked level, in path order — looking first at the core and the
 *  instrument tracks the learner follows (followedTracks), so a pianist is not
 *  sent to the guitar's level 0 while core lessons wait in level 1. Someone
 *  who has not started an instrument is offered every track, and when the
 *  followed tracks are finished the others are offered. Null when everything
 *  available is done. */
export function nextLesson(content: GateContent, progress: Progress): Lesson | null {
  const unlocked = new Set(levelStatuses(content, progress).filter((s) => s.unlocked).map((s) => s.level));
  const open = content.lessons.filter((l) => unlocked.has(l.level) && !isLessonDone(own(progress.lessons, l.id)));
  const followed = followedTracks(content, progress);
  const optional = optionalTrack(content);
  const mine = followed.size ? open.filter((l) => !optional(l.track) || followed.has(l.track)) : open;
  return mine[0] ?? open[0] ?? null;
}

/** Placement: the learner tested out of every level below `level`. Marks
 *  those levels' concepts mastered (in review, first due in a week and spread
 *  over the week after, so they still come round but not all on one day) and
 *  leaves their lessons untouched. Pass only the concepts the check stood for
 *  (placementTracks): a pianist is not credited with the guitar's. Never lowers a concept
 *  already further along, and never lowers placedLevel. */
export function applyPlacement(progress: Progress, level: number, concepts: Concept[], now: Date): Progress {
  const next = { ...progress.concepts };
  let n = 0;
  for (const c of concepts) {
    if (c.level >= level || !storable(c.id)) continue;
    const prev = own(next, c.id) ?? blankConcept();
    if (prev.box >= PLACEMENT_BOX) continue;
    next[c.id] = { ...prev, recent: [...prev.recent], mastery: Math.max(prev.mastery, 1), box: PLACEMENT_BOX, dueAt: addDays(now, PLACEMENT_DUE_DAYS + (n++ % PLACEMENT_SPREAD_DAYS)) };
  }
  return { ...progress, concepts: next, placedLevel: Math.max(progress.placedLevel, level), updatedAt: now.toISOString() };
}
