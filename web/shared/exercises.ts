import type { ExerciseDecl } from "./content.ts";
import type { Choice, Given, Grade, Question } from "./exercise-types.ts";
import { buildChord, buildInterval, buildKeySignature, buildScale } from "./exercises/build.ts";
import { earChord, earFindNote, earHigherLower, earInterval, earRhythm, earSameNote, earTimbre } from "./exercises/ear.ts";
import { countBar, harmonicFrequency, nameChord, nameDuration, nameInterval, nameKey, nameNote } from "./exercises/identify.ts";
import { playChord, playNote, playScale, tapRhythm } from "./exercises/play.ts";
import { makeRng, shuffle, type Body, type Generator, type Rng } from "./exercises/util.ts";
import { positionsSpellChord } from "./music/instruments.ts";
import { pc } from "./music/notes.ts";

// The exercise engine: turns an ExerciseDecl from a lesson into Questions and
// grades the learner's answers. Pure and seeded — the same declaration and
// seed always give the same questions — so it is tested with `node --test`
// and never involves the tutor agent. One generator per kind in
// registry.ts lives under ./exercises/, grouped as the registry groups them.

export { makeRng };
export type { Rng };

const GENERATORS: Record<string, Generator> = {
  "name-note": nameNote,
  "name-interval": nameInterval,
  "name-chord": nameChord,
  "name-key": nameKey,
  "name-duration": nameDuration,
  "count-bar": countBar,
  "harmonic-frequency": harmonicFrequency,
  "ear-higher-lower": earHigherLower,
  "ear-interval": earInterval,
  "ear-chord": earChord,
  "ear-timbre": earTimbre,
  "ear-same-note": earSameNote,
  "ear-rhythm": earRhythm,
  "ear-find-note": earFindNote,
  "play-note": playNote,
  "play-scale": playScale,
  "play-chord": playChord,
  "tap-rhythm": tapRhythm,
  "build-interval": buildInterval,
  "build-scale": buildScale,
  "build-chord": buildChord,
  "build-key-signature": buildKeySignature,
};

/** The kinds this engine can generate (every key of EXERCISES; a test pins that). */
export const GENERATED_KINDS: readonly string[] = ["quiz", ...Object.keys(GENERATORS)];

interface QuizItem {
  q: string;
  choices: (string | number)[];
  answer: number;
  explain?: string;
}

function quizItems(raw: unknown): QuizItem[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter((x): x is QuizItem => {
    if (!x || typeof x !== "object") return false;
    const { q, choices, answer } = x as Record<string, unknown>;
    return typeof q === "string" && Array.isArray(choices) && choices.length >= 2 && typeof answer === "number" && Number.isInteger(answer) && answer >= 1 && answer <= choices.length;
  });
}

/** Authored questions: drawn without repeats, choices shuffled so the right
 *  answer's position cannot be memorised. */
function quizBodies(decl: ExerciseDecl, rng: Rng): Body[] {
  const items = shuffle(rng, quizItems(decl.params.questions)).slice(0, Math.max(0, decl.count));
  return items.map((item) => {
    const all: Choice[] = item.choices.map((c, i) => ({ id: String(i + 1), label: String(c) }));
    const right = String(item.choices[item.answer - 1]);
    const said = typeof item.explain === "string" && item.explain.trim() ? item.explain.trim() : "";
    return {
      prompt: item.q,
      stimuli: [],
      response: { type: "choice", choices: shuffle(rng, all) },
      expected: { type: "choice", id: String(item.answer) },
      explain: said ? `The answer is “${right}”. ${said}` : `The answer is “${right}”.`,
    };
  });
}

/** What makes two questions "the same" to the learner. */
function signature(b: Body): string {
  return JSON.stringify([b.prompt, b.stimuli, b.expected]);
}

/** `decl.count` questions for one exercise declaration. Never throws for a
 *  declaration the loader accepted. No question is asked twice until every
 *  question the parameters allow has been asked, and consecutive questions
 *  differ whenever the parameters leave room (so a `count` above the number
 *  of distinct questions is a second lap, not a stutter). `quiz` gives at
 *  most the number authored. */
export function generateQuestions(decl: ExerciseDecl, seed: number): Question[] {
  const rng = makeRng(seed);
  const count = Math.max(0, Math.floor(Number.isFinite(decl.count) ? decl.count : 5));
  const finish = (bodies: Body[]): Question[] => bodies.map((b, i) => ({ id: `${decl.kind}-${seed}-${i}`, kind: decl.kind, concept: decl.concept, ...b }));
  if (decl.kind === "quiz") return finish(quizBodies({ ...decl, count }, rng));
  const gen = GENERATORS[decl.kind];
  if (!gen) return [];
  const bodies: Body[] = [];
  let last = "";
  const seen = new Set<string>();
  for (let i = 0; i < count; i++) {
    // A question not yet asked in this round if the parameters leave one;
    // failing that, at least not the one just asked. When every question
    // the parameters allow has been asked, a new round starts: a batch longer
    // than the pool goes through all of it before anything comes round again,
    // and then through all of it once more.
    let body = gen(decl.params ?? {}, rng, decl);
    let spare: Body | null = signature(body) === last ? null : body;
    for (let tries = 0; tries < 200 && seen.has(signature(body)); tries++) {
      body = gen(decl.params ?? {}, rng, decl);
      if (!spare && signature(body) !== last) spare = body;
    }
    if (seen.has(signature(body))) {
      if (spare) body = spare;
      seen.clear();
    }
    last = signature(body);
    seen.add(last);
    bodies.push(body);
  }
  return finish(bodies);
}

/** A shuffled mix of `perDecl` questions from each declaration, for review
 *  sessions and the placement check. Ids are unique across the mix. */
export function reviewQuestions(decls: ExerciseDecl[], perDecl: number, seed: number): Question[] {
  const rng = makeRng(seed);
  const all: Question[] = [];
  decls.forEach((decl, d) => {
    const sub = Math.floor(rng() * 0x7fffffff);
    for (const q of generateQuestions({ ...decl, count: Math.max(0, Math.floor(perDecl)) }, sub)) all.push({ ...q, id: `r${d}-${q.id}` });
  });
  return shuffle(rng, all);
}

function sameSet(a: number[], b: number[]): boolean {
  const sa = new Set(a);
  const sb = new Set(b);
  return sa.size === sb.size && [...sa].every((x) => sb.has(x));
}

/** Compare an answer with the question's `expected`. An answer of the wrong
 *  shape for the question is simply incorrect. */
export function grade(question: Question, given: Given): Grade {
  const want = question.expected;
  switch (want.type) {
    case "choice":
      return { correct: given.type === "choice" && given.id === want.id };
    case "notes": {
      if (given.type !== "notes") return { correct: false };
      const norm = (m: number) => (want.match === "pc" ? pc(m) : m);
      const got = given.midis.map(norm);
      const exp = want.midis.map(norm);
      if (want.positions) {
        const key = (x: { string: number; fret: number }) => `${x.string}/${x.fret}`;
        const played = (given.positions ?? []).map(key);
        const asked = want.positions.map(key);
        if (want.ordered) return { correct: played.length === asked.length && played.every((k, i) => k === asked[i]) };
        // Each asked place once: the same place given twice is not two notes.
        return { correct: played.length > 0 && new Set(played).size === played.length && played.length === new Set(asked).size && played.every((k) => asked.includes(k)) };
      }
      if (want.alsoAccept && got.length === 1 && want.alsoAccept.map(norm).includes(got[0])) return { correct: true };
      if (want.ordered) return { correct: got.length === exp.length && got.every((m, i) => m === exp[i]) };
      return { correct: got.length > 0 && sameSet(got, exp) };
    }
    case "chord-shape": {
      if (given.type !== "notes" || !given.positions || given.positions.length === 0) return { correct: false };
      try {
        return { correct: positionsSpellChord(given.positions, want.symbol) };
      } catch {
        return { correct: false };
      }
    }
    case "taps": {
      if (given.type !== "taps") return { correct: false };
      const taps = [...given.onsets].sort((a, b) => a - b);
      // Each note has its own window when `tolerances` is given.
      const tolOf = (i: number) => want.tolerances?.[i] ?? want.toleranceBeats;
      if (taps.length === want.onsets.length) {
        // Same number of taps: pair them in order, so a tap that drifts is
        // measured against the note it was meant for.
        const tapErrors = want.onsets.map((o, i) => taps[i] - o);
        return { correct: tapErrors.every((e, i) => Math.abs(e) <= tolOf(i) + 1e-9), tapErrors };
      }
      // Too many or too few: wrong, but still say how each note fared — the
      // nearest unused tap if one is anywhere close, else a miss.
      const used = new Set<number>();
      const tapErrors = want.onsets.map((o, n) => {
        const tol = tolOf(n);
        let best = -1;
        taps.forEach((t, i) => {
          if (!used.has(i) && Math.abs(t - o) <= tol * 3 && (best < 0 || Math.abs(t - o) < Math.abs(taps[best] - o))) best = i;
        });
        if (best < 0) return null;
        used.add(best);
        return taps[best] - o;
      });
      return { correct: false, tapErrors };
    }
    default:
      return { correct: false };
  }
}
