import type { Expected } from "../../shared/exercise-types.ts";
import { chordPcs, parseChord } from "../../shared/music/chords.ts";
import { fretMidi, GUITAR_SHAPES, positionsOf, positionsOfPc, positionsSpellChord, shapePositions, type FretPos } from "../../shared/music/instruments.ts";
import { pc } from "../../shared/music/notes.ts";

// What to show on the keyboard or fretboard after an answer: for each note
// the learner gave, whether that note is right; and the notes of the answer
// they did not give. Pure (no React), so the rules are tested on their own.
// The verdict on the whole answer is the engine's grade(); this only says
// which marks to colour, and it must never contradict that verdict: an
// answer graded wrong always has at least one note marked wrong or missing.

export interface Played {
  midi: number;
  /** Where it was played, on the fretboard. */
  pos?: FretPos;
}

export interface Reveal {
  /** One verdict per played note, in the order given. */
  given: ("good" | "bad")[];
  /** Notes of the answer that were not played. */
  missing: Played[];
}

export interface RevealContext {
  /** Keyboard answers: the keys on screen (MIDI, inclusive). */
  range?: [number, number];
  /** Fretboard answers: the highest fret on screen. */
  maxFret?: number;
  /** A one-note answer: show every place the note could have been played. */
  single?: boolean;
}

const posKey = (p: FretPos) => `${p.string}/${p.fret}`;
const mean = (xs: number[], fallback: number) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : fallback);

/** Somewhere on screen to show a note of the answer that was not played. */
function placesFor(want: number, exact: boolean, played: Played[], ctx: RevealContext, fretboard: boolean): Played[] {
  if (fretboard) {
    const maxFret = ctx.maxFret ?? 12;
    const all = exact ? positionsOf(want, maxFret) : positionsOfPc(pc(want), maxFret);
    const near = mean(played.flatMap((p) => (p.pos ? [p.pos.fret] : [])), 0);
    const sorted = [...all].sort((a, b) => Math.abs(a.fret - near) - Math.abs(b.fret - near));
    const shown = ctx.single ? sorted.slice(0, exact ? sorted.length : 8) : sorted.slice(0, 1);
    return shown.map((pos) => ({ midi: fretMidi(pos), pos }));
  }
  if (exact) return [{ midi: want }];
  const [lo, hi] = ctx.range ?? [48, 84];
  const near = mean(played.map((p) => p.midi), (lo + hi) / 2);
  const keys: number[] = [];
  for (let m = lo; m <= hi; m++) if (pc(m) === pc(want)) keys.push(m);
  keys.sort((a, b) => Math.abs(a - near) - Math.abs(b - near));
  return keys.slice(0, 1).map((midi) => ({ midi }));
}

export function classifyAnswer(expected: Expected, played: Played[], ctx: RevealContext = {}): Reveal {
  const fretboard = played.some((p) => p.pos) || ctx.maxFret !== undefined;

  if (expected.type === "chord-shape") {
    let pcs: number[] = [];
    try {
      pcs = chordPcs(parseChord(expected.symbol));
    } catch {
      /* an unknown symbol: nothing can be right */
    }
    const want = new Set(pcs);
    const seenStrings = new Set<number>();
    const given = played.map((p) => {
      const twice = !!p.pos && seenStrings.has(p.pos.string);
      if (p.pos) seenStrings.add(p.pos.string);
      return !twice && want.has(pc(p.midi)) ? ("good" as const) : ("bad" as const);
    });
    const positions = played.flatMap((p) => (p.pos ? [p.pos] : []));
    let correct = false;
    try {
      correct = positions.length > 0 && positionsSpellChord(positions, expected.symbol);
    } catch {
      /* stays false */
    }
    if (correct) return { given, missing: [] };
    // Wrong: show the usual shape, wherever the learner has not already put
    // exactly that note.
    const have = new Set(positions.map(posKey));
    const shape = GUITAR_SHAPES[expected.symbol];
    if (shape) return { given, missing: shapePositions(shape).filter((p) => !have.has(posKey(p))).map((pos) => ({ midi: fretMidi(pos), pos })) };
    const gotPcs = new Set(played.filter((_, i) => given[i] === "good").map((p) => pc(p.midi)));
    const missing: Played[] = [];
    for (const x of pcs) {
      if (gotPcs.has(x)) continue;
      const spot = positionsOfPc(x, ctx.maxFret ?? 4).find((p) => !seenStrings.has(p.string));
      if (spot) {
        seenStrings.add(spot.string);
        missing.push({ midi: fretMidi(spot), pos: spot });
      }
    }
    return { given, missing };
  }

  if (expected.type !== "notes") return { given: played.map(() => "bad"), missing: [] };
  const exact = expected.match === "exact";
  const norm = (m: number) => (exact ? m : pc(m));

  // Read from tab: the answer is places on the neck, not just pitches.
  if (expected.positions?.length) {
    const asked = expected.positions.map(posKey);
    const seen = new Set<string>();
    const given = played.map((p, i) => {
      const k = p.pos ? posKey(p.pos) : "";
      const ok = expected.ordered ? k === asked[i] : asked.includes(k) && !seen.has(k);
      seen.add(k);
      return ok ? ("good" as const) : ("bad" as const);
    });
    const rightKeys = new Set(played.filter((_, i) => given[i] === "good").map((p) => posKey(p.pos!)));
    return { given, missing: expected.positions.filter((p) => !rightKeys.has(posKey(p))).map((pos) => ({ midi: fretMidi(pos), pos })) };
  }

  const exp = expected.midis.map(norm);
  const also = (expected.alsoAccept ?? []).map(norm);
  let given: ("good" | "bad")[];
  if (played.length === 1 && also.includes(norm(played[0].midi))) given = ["good"];
  else if (expected.ordered) given = played.map((p, i) => (norm(p.midi) === exp[i] ? "good" : "bad"));
  else given = played.map((p) => (exp.includes(norm(p.midi)) ? "good" : "bad"));

  // The answer's notes that are not on screen as a right note.
  const right = new Set(played.filter((_, i) => given[i] === "good").map((p) => norm(p.midi)));
  const done = new Set<number>();
  const missing: Played[] = [];
  expected.midis.forEach((m) => {
    const n = norm(m);
    if (right.has(n) || done.has(n)) return;
    done.add(n);
    missing.push(...placesFor(m, exact, played, ctx, fretboard));
  });
  // In a one-note answer that was right, there is nothing more to show.
  if (given.length === 1 && given[0] === "good" && !expected.ordered && exp.length === 1) return { given, missing: [] };
  return { given, missing };
}
