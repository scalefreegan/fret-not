import type { ExerciseDecl } from "../content.ts";
import type { Choice, Question, Sound, SoundEvent, Timbre } from "../exercise-types.ts";
import { intervalName, semitones } from "../music/intervals.ts";
import { fretMidi, GUITAR_FRETS, openStringMidi, type FretPos } from "../music/instruments.ts";
import { fromMidi, isBlackKey, isPitch, midiOf, pc, pcLabel, pcNameOf, pitchLabel, toMidi, type Pitch } from "../music/notes.ts";
import { parseDuration, parseTime, type Duration } from "../music/rhythm.ts";
import { staffPosition, type Clef } from "../music/staff.ts";

// Shared pieces for the question generators: the seeded random source,
// parameter readers that apply defaults and tolerate odd values, and small
// builders for sounds, choices and learner-facing wording.

export type Rng = () => number;

/** mulberry32: tiny, fast, and good enough to shuffle questions. */
export function makeRng(seed: number): Rng {
  let a = (Math.floor(seed) ^ 0x9e3779b9) >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function int(rng: Rng, lo: number, hi: number): number {
  return hi <= lo ? lo : lo + Math.floor(rng() * (hi - lo + 1));
}
export function pick<T>(rng: Rng, items: readonly T[]): T {
  return items[Math.floor(rng() * items.length)];
}
export function shuffle<T>(rng: Rng, items: readonly T[]): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}
export function uniq<T>(items: readonly T[]): T[] {
  return [...new Set(items)];
}

// --- parameters -------------------------------------------------------------

export type Params = Record<string, unknown>;
export const pStr = (p: Params, k: string, d: string): string => (typeof p[k] === "string" ? (p[k] as string) : d);
export const pNum = (p: Params, k: string, d: number): number => (typeof p[k] === "number" && Number.isFinite(p[k]) ? (p[k] as number) : d);
export const pBool = (p: Params, k: string, d: boolean): boolean => (typeof p[k] === "boolean" ? (p[k] as boolean) : d);
export function pList<T>(p: Params, k: string, d: readonly T[]): T[] {
  const v = p[k];
  return Array.isArray(v) && v.length > 0 ? (v as T[]) : [...d];
}
/** A [low, high] pitch range as MIDI, low ≤ high; null when not given. */
export function pRange(p: Params, k = "range"): [number, number] | null {
  const v = p[k];
  if (!Array.isArray(v) || v.length !== 2 || !v.every(isPitch)) return null;
  const a = midiOf(v[0] as string);
  const b = midiOf(v[1] as string);
  return [Math.min(a, b), Math.max(a, b)];
}

/** What a generator returns; the framework adds id, kind and concept. */
export type Body = Omit<Question, "id" | "kind" | "concept">;
export type Generator = (p: Params, rng: Rng, decl: ExerciseDecl) => Body;

// --- sounds -----------------------------------------------------------------

export const TEMPO = 80;
export function ev(midis: number[], at: number, beats: number, extra: Partial<SoundEvent> = {}): SoundEvent {
  return { midis, at, beats, ...extra };
}
export function sound(events: SoundEvent[], timbre?: Timbre, tempo = TEMPO): Sound {
  return { events, tempo, ...(timbre ? { timbre } : {}) };
}
/** Notes one after another, a beat each. */
export function melodic(midis: number[], timbre?: Timbre, beats = 1): Sound {
  return sound(midis.map((m, i) => ev([m], i * beats, beats)), timbre);
}
export function together(midis: number[], timbre?: Timbre, strum?: number): Sound {
  return sound([ev(midis, 0, 2, strum ? { strum } : {})], timbre);
}
/** One after another, then together: the usual way to reveal an interval or chord. */
export function arpThenChord(midis: number[], timbre?: Timbre, strum?: number): Sound {
  return sound([...midis.map((m, i) => ev([m], i, 1)), ev(midis, midis.length, 2, strum ? { strum } : {})], timbre);
}
/** A rhythm on one pitch; rests are silent events. */
export function rhythmSound(tokens: string[], tempo: number, timbre: Timbre = "piano"): Sound {
  let at = 0;
  const events = tokens.map((t) => {
    const d = parseDuration(t);
    const e = ev(d.rest ? [] : [72], at, d.beats);
    at += d.beats;
    return e;
  });
  return sound(events, timbre, tempo);
}

// --- choices ----------------------------------------------------------------

/** When a list of options is longer than `max`, keep the correct one and its
 *  nearest neighbours in the list (which is assumed to be in a meaningful
 *  order, so neighbours are the plausible confusions). Order is preserved. */
export function window5<T>(rng: Rng, ordered: readonly T[], correctIndex: number, max = 5): T[] {
  if (ordered.length <= max) return [...ordered];
  const lo = Math.max(0, Math.min(ordered.length - max, correctIndex - int(rng, 0, max - 1)));
  return ordered.slice(lo, lo + max);
}
export function choice(id: string, label: string): Choice {
  return { id, label };
}

// --- wording ----------------------------------------------------------------

export function cap(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
export function joinAnd(items: string[]): string {
  if (items.length <= 1) return items.join("");
  if (items.length === 2) return `${items[0]} and ${items[1]}`;
  return `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;
}
export function plural(n: number, word: string): string {
  return `${n} ${word}${n === 1 ? "" : "s"}`;
}
export function ordinal(n: number): string {
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return n + (s[(v - 20) % 10] ?? s[v] ?? s[0]);
}
export function article(word: string): string {
  return /^[aeiouAEIOU]/.test(word) ? "an" : "a";
}

/** "half step", "whole step", or "n half steps". */
export function stepWords(semis: number): string {
  return semis === 1 ? "half step" : semis === 2 ? "whole step" : plural(semis, "half step");
}
/** The same with its article: "a half step", "a whole step", "5 half steps". */
export function aStep(semis: number): string {
  return semis === 1 || semis === 2 ? `a ${stepWords(semis)}` : stepWords(semis);
}
/** The label of an interval choice under the `labels` parameter. */
export function intervalLabel(iv: string, labels: string): string {
  return labels === "steps" ? cap(stepWords(semitones(iv))) : cap(intervalName(iv));
}

const LINE_WORDS = ["bottom", "second", "third", "fourth", "top"];
const SPACE_WORDS = ["first", "second", "third", "top"];
/** Where a pitch sits on a clef, in words. */
export function staffWhere(p: Pitch | string, clef: Clef): string {
  const pos = staffPosition(p, clef);
  if (pos >= 0 && pos <= 8) return pos % 2 === 0 ? `the ${LINE_WORDS[pos / 2]} line of the ${clef} clef` : `the ${SPACE_WORDS[(pos - 1) / 2]} space of the ${clef} clef`;
  const side = pos < 0 ? "below" : "above";
  const dist = pos < 0 ? -pos : pos - 8;
  if (dist === 1) return `the space just ${side} the ${clef} staff`;
  const n = Math.floor(dist / 2);
  const which = `the ${["first", "second", "third", "fourth", "fifth"][n - 1] ?? ordinal(n)} ledger line`;
  return dist % 2 === 0 ? `${which} ${side} the ${clef} staff` : `the space beyond ${which} ${side} the ${clef} staff`;
}

const WHITE_KEY_HINTS: Record<string, string> = {
  C: "the white key just left of each group of two black keys",
  D: "the white key between the two black keys of each group of two",
  E: "the white key just right of each group of two black keys",
  F: "the white key just left of each group of three black keys",
  G: "the white key between the first and second of each group of three black keys",
  A: "the white key between the second and third of each group of three black keys",
  B: "the white key just right of each group of three black keys",
};
/** Where a key is on the keyboard, in words. */
export function keyWhere(midi: number): string {
  if (!isBlackKey(midi)) return WHITE_KEY_HINTS[pcNameOf(midi)];
  return `the black key between ${pcNameOf(midi - 1)} and ${pcNameOf(midi + 1)}`;
}

export function stringName(string: number): string {
  const letter = pcNameOf(openStringMidi(string));
  return `string ${string} (${string === 6 ? "low " : string === 1 ? "high " : ""}${letter})`;
}
export function posWhere(pos: FretPos): string {
  return pos.fret === 0 ? `the open ${stringName(pos.string)}` : `${stringName(pos.string)}, fret ${pos.fret}`;
}
/** A pitch label for a MIDI note with a random-but-sensible spelling. */
export function spell(rng: Rng, midi: number): Pitch {
  return fromMidi(midi, rng() < 0.5 ? "sharp" : "flat");
}
export function midiLabel(midi: number, prefer: "sharp" | "flat" = "sharp"): string {
  return pitchLabel(fromMidi(midi, prefer));
}

// --- vocabulary ---------------------------------------------------------------
// An explanation may only use words the learner has met. The `vocab`
// parameter of an exercise says how far the curriculum has got:
//   plain    nothing yet: no note names, no half steps, no interval names
//   letters  the seven letter names; a black key is described by where it is
//   names    letters with sharps and flats, and half steps; no octave numbers
//   full     everything (the default): octave numbers and interval names

export type Vocab = "plain" | "letters" | "names" | "full";
export const VOCABS: readonly Vocab[] = ["plain", "letters", "names", "full"];
export function vocabOf(p: Params): Vocab {
  const v = pStr(p, "vocab", "full");
  return (VOCABS as readonly string[]).includes(v) ? (v as Vocab) : "full";
}
/** A note as the learner can be told it at this vocabulary: "C♯4", "C♯",
 *  "the black key between C and D" (or the fretboard place), or "" at `plain`. */
export function sayNote(pitch: Pitch, vocab: Vocab, where?: FretPos): string {
  if (vocab === "full") return pitchLabel(pitch);
  if (vocab === "names") return pcLabel(pitch);
  if (vocab === "plain") return "";
  if (pitch.acc === 0) return pcLabel(pitch);
  return where ? `the note at ${posWhere(where)}` : keyWhere(toMidi(pitch));
}

// --- keyboard and fretboard helpers ----------------------------------------

/** An on-screen keyboard range covering [lo, hi]: starts on the C or F at or
 *  below `lo` and spans at least two octaves. */
export function kbRange(lo: number, hi: number): [number, number] {
  let start = lo;
  while (pc(start) !== 0 && pc(start) !== 5) start--;
  let end = start + 24;
  while (end < hi) end += 12;
  return [start, end];
}

export const ALL_STRINGS = [6, 5, 4, 3, 2, 1];
/** Fretboard positions allowed by the strings / maxFret / range / accidentals
 *  parameters. Filters are relaxed one at a time rather than return nothing. */
export function fretCandidates(strings: number[], maxFret: number, range: [number, number] | null, accidentals: boolean): FretPos[] {
  const valid = uniq(strings.filter((s) => Number.isInteger(s) && s >= 1 && s <= 6));
  const use = valid.length ? valid : ALL_STRINGS;
  const top = Math.max(0, Math.min(GUITAR_FRETS, Math.floor(maxFret)));
  const all: FretPos[] = [];
  for (const string of use) for (let fret = 0; fret <= top; fret++) all.push({ string, fret });
  const natural = (x: FretPos) => accidentals || !isBlackKey(fretMidi(x));
  const inRange = (x: FretPos) => !range || (fretMidi(x) >= range[0] && fretMidi(x) <= range[1]);
  for (const f of [(x: FretPos) => natural(x) && inRange(x), inRange, natural]) {
    const hit = all.filter(f);
    if (hit.length) return hit;
  }
  return all;
}
/** MIDI notes in a range, naturals only unless `accidentals`; never empty. */
export function midiCandidates(range: [number, number], accidentals: boolean): number[] {
  const all: number[] = [];
  for (let m = range[0]; m <= range[1]; m++) all.push(m);
  const hit = all.filter((m) => accidentals || !isBlackKey(m));
  return hit.length ? hit : all;
}

// --- rhythm helpers ---------------------------------------------------------

const STANDARD_VALUES = ["w", "h", "q", "e", "s"];

/** Distinct, valid duration tokens from a `values` parameter. */
export function durationTokens(values: unknown[]): string[] {
  const out: string[] = [];
  for (const v of values) {
    if (typeof v !== "string") continue;
    try {
      parseDuration(v);
      if (!out.includes(v)) out.push(v);
    } catch {
      /* skip */
    }
  }
  return out.length ? out : ["q"];
}

/** Fill exactly one bar from `values`. When the values cannot fill it (e.g.
 *  only whole notes in 3/4) the plain note values are allowed in as well; a
 *  sixteenth always fits, so this terminates. */
export function fillBar(rng: Rng, values: string[], barBeats: number, minEvents = 1): string[] {
  const attempt = (pool: string[]): string[] | null => {
    for (let tries = 0; tries < 30; tries++) {
      const out: string[] = [];
      let left = barBeats;
      while (left > 1e-9) {
        const fits = pool.filter((t) => parseDuration(t).beats <= left + 1e-9);
        if (!fits.length) break;
        const t = pick(rng, fits);
        out.push(t);
        left -= parseDuration(t).beats;
      }
      if (Math.abs(left) < 1e-9 && out.length >= minEvents && out.some((t) => !parseDuration(t).rest)) return out;
    }
    return null;
  };
  const wide = uniq([...values, ...STANDARD_VALUES]);
  return attempt(values) ?? attempt(wide) ?? attempt(wide.filter((t) => parseDuration(t).beats < barBeats)) ?? attempt(["s"]) ?? ["s"];
}
export function barBeatsOf(time: string): number {
  try {
    return parseTime(time).barBeats;
  } catch {
    return 4;
  }
}
export function beatsLabel(beats: number): string {
  if (Math.abs(beats - 0.25) < 1e-9) return "a quarter of a beat";
  if (Math.abs(beats - 0.5) < 1e-9) return "half a beat";
  if (Math.abs(beats - 0.75) < 1e-9) return "three quarters of a beat";
  const whole = Math.floor(beats + 1e-9);
  const frac = beats - whole;
  const f = Math.abs(frac - 0.5) < 1e-9 ? "½" : Math.abs(frac - 0.25) < 1e-9 ? "¼" : Math.abs(frac - 0.75) < 1e-9 ? "¾" : frac < 1e-9 ? "" : String(Number(frac.toFixed(3))).slice(1);
  return `${whole}${f} beat${beats === 1 ? "" : "s"}`;
}
export function durationWords(d: Duration): string {
  return `${d.dotted ? "dotted " : ""}${{ w: "whole", h: "half", q: "quarter", e: "eighth", s: "sixteenth" }[d.value]} ${d.rest ? "rest" : "note"}`;
}
