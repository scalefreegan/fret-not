import { chordPcs, parseChord } from "./chords.ts";
import { isBlackKey, pc } from "./notes.ts";

// --- guitar ---------------------------------------------------------------

/** A place on the fretboard. Strings are numbered the way guitarists do:
 *  1 = the thinnest, highest string (high E) … 6 = the thickest (low E).
 *  Fret 0 is the open string. Content files write this as "6/3" (string/fret). */
export interface FretPos {
  string: number;
  fret: number;
}

/** Standard tuning, string 6 → string 1: E2 A2 D3 G3 B3 E4 (sounding pitch). */
export const STANDARD_TUNING: readonly number[] = [40, 45, 50, 55, 59, 64];

export function openStringMidi(string: number, tuning: readonly number[] = STANDARD_TUNING): number {
  const midi = tuning[tuning.length - string];
  if (midi === undefined) throw new Error(`no string ${string} on a ${tuning.length}-string instrument`);
  return midi;
}
export function fretMidi(pos: FretPos, tuning: readonly number[] = STANDARD_TUNING): number {
  return openStringMidi(pos.string, tuning) + pos.fret;
}

/** How many frets the app's guitar has: nothing is ever asked, drawn or
 *  marked above this fret. This constant is the source of truth (the engine
 *  runs in the browser and cannot read files); content/instruments/guitar.yaml
 *  states the same number for readers, and the loader refuses the file if the
 *  two disagree (so does the tuning, and the octave guitar music is written
 *  up). To change the guitar, change it here and there together. */
export const GUITAR_FRETS = 20;

const POS_RE = /^([1-9])\/(\d{1,2})$/;
/** A string/fret position that exists on the app's guitar: strings 1–6,
 *  frets 0–GUITAR_FRETS. "7/3" and "1/25" are refused. */
export function isFretPos(s: unknown): s is string {
  const m = typeof s === "string" ? POS_RE.exec(s) : null;
  return !!m && Number(m[1]) >= 1 && Number(m[1]) <= STANDARD_TUNING.length && Number(m[2]) <= GUITAR_FRETS;
}
export function parseFretPos(s: string): FretPos {
  const m = POS_RE.exec(s);
  if (!m || !isFretPos(s)) throw new Error(`not a fretboard position: "${s}" (expected string/fret, e.g. 6/3, with strings 1–6 and frets 0–${GUITAR_FRETS})`);
  return { string: Number(m[1]), fret: Number(m[2]) };
}
export function fretPosText(p: FretPos): string {
  return `${p.string}/${p.fret}`;
}

/** Every place a sounding pitch can be played, lowest string first. */
export function positionsOf(midi: number, maxFret = 12, tuning: readonly number[] = STANDARD_TUNING): FretPos[] {
  const out: FretPos[] = [];
  for (let string = tuning.length; string >= 1; string--) {
    const fret = midi - openStringMidi(string, tuning);
    if (fret >= 0 && fret <= maxFret) out.push({ string, fret });
  }
  return out;
}

/** Every place any octave of a pitch class (0–11) can be played. */
export function positionsOfPc(pitchClass: number, maxFret = 12, tuning: readonly number[] = STANDARD_TUNING): FretPos[] {
  const out: FretPos[] = [];
  for (let string = tuning.length; string >= 1; string--) {
    for (let fret = 0; fret <= maxFret; fret++) {
      if (pc(openStringMidi(string, tuning) + fret) === pitchClass) out.push({ string, fret });
    }
  }
  return out;
}

/** Guitar music is written an octave higher than it sounds, so the written
 *  pitch of a sounding MIDI note is 12 above it. */
export const GUITAR_WRITTEN_OFFSET = 12;

/** A chord shape: one entry per string from string 6 to string 1; a fret
 *  number, or null for a string that is not played. `fingers` uses 1 = index
 *  … 4 = little finger, 0 = open or unplayed. `barre` is the fret one finger
 *  lies flat across. */
export interface ChordShape {
  frets: (number | null)[];
  fingers: number[];
  barre?: number;
}

/** The common first shapes. Keys are chord symbols parseChord understands. */
export const GUITAR_SHAPES: Record<string, ChordShape> = {
  C: { frets: [null, 3, 2, 0, 1, 0], fingers: [0, 3, 2, 0, 1, 0] },
  D: { frets: [null, null, 0, 2, 3, 2], fingers: [0, 0, 0, 1, 3, 2] },
  E: { frets: [0, 2, 2, 1, 0, 0], fingers: [0, 2, 3, 1, 0, 0] },
  G: { frets: [3, 2, 0, 0, 0, 3], fingers: [2, 1, 0, 0, 0, 3] },
  A: { frets: [null, 0, 2, 2, 2, 0], fingers: [0, 0, 1, 2, 3, 0] },
  F: { frets: [1, 3, 3, 2, 1, 1], fingers: [1, 3, 4, 2, 1, 1], barre: 1 },
  B: { frets: [null, 2, 4, 4, 4, 2], fingers: [0, 1, 2, 3, 4, 1], barre: 2 },
  Am: { frets: [null, 0, 2, 2, 1, 0], fingers: [0, 0, 2, 3, 1, 0] },
  Dm: { frets: [null, null, 0, 2, 3, 1], fingers: [0, 0, 0, 2, 3, 1] },
  Em: { frets: [0, 2, 2, 0, 0, 0], fingers: [0, 2, 3, 0, 0, 0] },
  Bm: { frets: [null, 2, 4, 4, 3, 2], fingers: [0, 1, 3, 4, 2, 1], barre: 2 },
  "F#m": { frets: [2, 4, 4, 2, 2, 2], fingers: [1, 3, 4, 1, 1, 1], barre: 2 },
  A7: { frets: [null, 0, 2, 0, 2, 0], fingers: [0, 0, 2, 0, 3, 0] },
  B7: { frets: [null, 2, 1, 2, 0, 2], fingers: [0, 2, 1, 3, 0, 4] },
  C7: { frets: [null, 3, 2, 3, 1, 0], fingers: [0, 3, 2, 4, 1, 0] },
  D7: { frets: [null, null, 0, 2, 1, 2], fingers: [0, 0, 0, 2, 1, 3] },
  E7: { frets: [0, 2, 0, 1, 0, 0], fingers: [0, 2, 0, 1, 0, 0] },
  G7: { frets: [3, 2, 0, 0, 0, 1], fingers: [3, 2, 0, 0, 0, 1] },
  Am7: { frets: [null, 0, 2, 0, 1, 0], fingers: [0, 0, 2, 0, 1, 0] },
  Dm7: { frets: [null, null, 0, 2, 1, 1], fingers: [0, 0, 0, 2, 1, 1], barre: 1 },
  Em7: { frets: [0, 2, 0, 0, 0, 0], fingers: [0, 2, 0, 0, 0, 0] },
  Cmaj7: { frets: [null, 3, 2, 0, 0, 0], fingers: [0, 3, 2, 0, 0, 0] },
  Fmaj7: { frets: [null, null, 3, 2, 1, 0], fingers: [0, 0, 3, 2, 1, 0] },
  Gmaj7: { frets: [3, 2, 0, 0, 0, 2], fingers: [3, 2, 0, 0, 0, 1] },
  Dsus4: { frets: [null, null, 0, 2, 3, 3], fingers: [0, 0, 0, 1, 3, 4] },
  Asus4: { frets: [null, 0, 2, 2, 3, 0], fingers: [0, 0, 1, 2, 3, 0] },
  E5: { frets: [0, 2, 2, null, null, null], fingers: [0, 1, 2, 0, 0, 0] },
  A5: { frets: [null, 0, 2, 2, null, null], fingers: [0, 0, 1, 2, 0, 0] },
  G5: { frets: [3, 5, 5, null, null, null], fingers: [1, 3, 4, 0, 0, 0] },
};

/** The positions a shape presses or plays open, string 6 first. */
export function shapePositions(shape: ChordShape): FretPos[] {
  const out: FretPos[] = [];
  shape.frets.forEach((fret, i) => {
    if (fret !== null) out.push({ string: shape.frets.length - i, fret });
  });
  return out;
}
/** The sounding MIDI notes of a shape, lowest string first. */
export function shapeMidis(shape: ChordShape, tuning: readonly number[] = STANDARD_TUNING): number[] {
  return shapePositions(shape).map((p) => fretMidi(p, tuning));
}

/** The widest stretch between fretted notes a chord answer may have: four
 *  frets (first to fourth finger), so highest fret − lowest fret ≤ 3. Open
 *  strings do not count: they need no finger. */
export const MAX_CHORD_FRET_SPAN = 3;

/** True when a set of fretboard positions is a playable way to sound a chord:
 *  one note per string at most, no note from outside the chord, nothing
 *  missing (except that a seventh chord may leave out its fifth, as common
 *  guitar shapes do: open C7 has no G), the chord's root as the lowest note
 *  (E under an open C chord makes it C/E, which is why the diagram mutes
 *  string 6), and the fretted notes within one hand's reach.
 *
 *  With `exact`, the positions must be the stored shape itself, string for
 *  string: every string the diagram plays, at its fret, and no string it
 *  mutes. False when the chord has no stored shape. */
export function positionsSpellChord(positions: FretPos[], symbol: string, exact = false): boolean {
  const strings = new Set(positions.map((p) => p.string));
  if (positions.length === 0 || strings.size !== positions.length) return false;
  if (exact) {
    const shape = GUITAR_SHAPES[symbol];
    if (!shape) return false;
    const want = shapePositions(shape);
    return want.length === positions.length && want.every((w) => positions.some((p) => p.string === w.string && p.fret === w.fret));
  }
  const pcs = chordPcs(parseChord(symbol));
  const want = new Set(pcs);
  const got = new Set(positions.map((p) => pc(fretMidi(p))));
  if (![...got].every((x) => want.has(x))) return false;
  const missing = [...want].filter((x) => !got.has(x));
  // Only a seventh chord with a perfect fifth may drop it. A sixth chord
  // without its fifth is another chord (C–E–A is A minor).
  const mayDropFifth = ["7", "maj7", "m7"].includes(parseChord(symbol).type);
  if (!(missing.length === 0 || (mayDropFifth && missing.length === 1 && missing[0] === pcs[2]))) return false;
  const lowest = positions.reduce((a, b) => (fretMidi(b) < fretMidi(a) ? b : a));
  if (pc(fretMidi(lowest)) !== pcs[0]) return false;
  const fretted = positions.filter((p) => p.fret > 0).map((p) => p.fret);
  return fretted.length === 0 || Math.max(...fretted) - Math.min(...fretted) <= MAX_CHORD_FRET_SPAN;
}

// --- piano ----------------------------------------------------------------

export const PIANO_RANGE: readonly [number, number] = [21, 108]; // A0–C8

/** A simple root-position piano voicing: the chord's notes from the root
 *  nearest middle C upward. */
export function pianoVoicing(symbol: string): number[] {
  const pcs = chordPcs(parseChord(symbol));
  let root = 48 + pcs[0]; // C3–B3
  if (root < 53) root += 12; // keep it around middle C: F3…E4
  const out: number[] = [];
  let last = root - 1;
  for (const p of pcs) {
    let midi = last + 1;
    while (pc(midi) !== p) midi++;
    out.push(midi);
    last = midi;
  }
  return out;
}

/** White keys between two MIDI notes, inclusive — the unit a keyboard is
 *  drawn in. */
export function whiteKeysIn(lo: number, hi: number): number[] {
  const out: number[] = [];
  for (let m = lo; m <= hi; m++) if (!isBlackKey(m)) out.push(m);
  return out;
}

/** Which computer-keyboard key plays which note, as offsets in semitones from
 *  the C at the left of the on-screen keyboard: the home row is white keys,
 *  the row above is black keys (the usual tracker layout). */
export const TYPING_KEYS: Record<string, number> = {
  a: 0, w: 1, s: 2, e: 3, d: 4, f: 5, t: 6, g: 7, y: 8, h: 9, u: 10, j: 11, k: 12, o: 13, l: 14, p: 15, ";": 16,
};
