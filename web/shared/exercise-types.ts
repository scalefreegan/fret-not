import type { FretPos } from "./music/instruments.ts";

// What an exercise question looks like once generated. The generator
// (exercises.ts) turns an ExerciseDecl into Questions; the UI
// (src/exercises/) renders a Question from these parts and hands back a
// Given; grade() compares it with `expected`. Nothing here knows about React
// or audio, so generation and grading are tested with `node --test`.

export type Timbre = "sine" | "triangle" | "square" | "saw" | "piano" | "guitar";

/** One or more notes sounding together, placed in time. */
export interface SoundEvent {
  /** MIDI notes; empty for a silent event (a rest). */
  midis: number[];
  /** Start, in quarter-note beats from the beginning of the Sound. */
  at: number;
  /** Length in quarter-note beats. */
  beats: number;
  timbre?: Timbre;
  /** For guitar chords: seconds between successive strings. */
  strum?: number;
}
/** Something the learner can press Play on. */
export interface Sound {
  events: SoundEvent[];
  /** Quarter-note beats per minute. */
  tempo: number;
  timbre?: Timbre;
}

/** Something shown (or played) as part of the question. */
export type Stimulus =
  | { type: "staff"; clef: "treble" | "bass"; notes: string[]; chord?: boolean; key?: string }
  | { type: "keyboard"; range: [number, number]; marked: number[] }
  | { type: "fretboard"; maxFret: number; marked: FretPos[] }
  | { type: "tab"; positions: FretPos[] }
  | { type: "diagram"; chord: string }
  | { type: "rhythm"; pattern: string; time: string }
  | { type: "sound"; sound: Sound; autoplay: boolean }
  /** Large text: a chord symbol, a note name, "220 Hz". */
  | { type: "text"; text: string };

export interface Choice {
  id: string;
  label: string;
  /** Shown instead of (or above) the label, e.g. three rhythms to pick from. */
  stimulus?: Stimulus;
}

/** How the learner answers. */
export type ResponseSpec =
  | { type: "choice"; choices: Choice[] }
  /** Play on the virtual keyboard. `single` submits on the first key;
   *  `sequence` collects keys in order until `length` are played; `set`
   *  toggles keys on and off until the learner presses Check. `labels:
   *  "landmarks"` names only the C keys with their octave and marks middle C:
   *  what a question graded on the exact octave needs to be answerable. */
  | { type: "keyboard"; range: [number, number]; mode: "single" | "sequence" | "set"; length?: number; labels?: "none" | "c" | "landmarks" | "naturals" | "all"; marked?: number[] }
  /** The same on the virtual fretboard. */
  | { type: "fretboard"; maxFret: number; mode: "single" | "sequence" | "set"; length?: number; labels?: "none" | "open" | "naturals" | "all"; marked?: FretPos[] }
  /** Tap the space bar in time after a count-in. */
  /** `countInBeats`: the length of the count-in in quarter-note beats.
   *  `clickBeats`: quarter-note beats between metronome clicks (absent = 1),
   *  so the count-in is countInBeats / clickBeats clicks: six in 6/8. */
  | { type: "tap"; pattern: string; time: string; tempo: number; countInBeats: number; clickBeats?: number };

export type Expected =
  | { type: "choice"; id: string }
  /** `match: "exact"` compares MIDI numbers, `"pc"` ignores the octave.
   *  `ordered` compares as a sequence, otherwise as a set.
   *  `positions`: on the fretboard the answer must be played at exactly these
   *  places (a tab names a string and a fret, not just a pitch).
   *  `alsoAccept`: for a one-note answer, other MIDI notes that are equally
   *  right (`midis` stays the one shown as the answer). */
  | { type: "notes"; midis: number[]; match: "exact" | "pc"; ordered: boolean; positions?: FretPos[]; alsoAccept?: number[] }
  /** Guitar: the fretted positions must spell this chord: any voicing a hand
   *  can reach with the root lowest (see positionsSpellChord). With `exact`
   *  the answer must be the stored shape itself, string for string: the
   *  learner was shown its diagram and asked to copy it. */
  | { type: "chord-shape"; symbol: string; exact?: boolean }
  /** Onset times in quarter-note beats from the first beat after the
   *  count-in. Tap `i` must fall within `tolerances[i]` beats of `onsets[i]`:
   *  each note's window is limited by its own nearest neighbour, so a pair of
   *  sixteenths is tight and a half note in the same pattern is not.
   *  `toleranceBeats` is the smallest of them, for a reader that wants one
   *  number; when `tolerances` is absent it applies to every onset. */
  | { type: "taps"; onsets: number[]; toleranceBeats: number; tolerances?: number[] };

export type Given =
  | { type: "choice"; id: string }
  | { type: "notes"; midis: number[]; positions?: FretPos[] }
  | { type: "taps"; onsets: number[] };

export interface Question {
  /** Unique within one generated batch. */
  id: string;
  kind: string;
  concept: string;
  /** The instruction, one sentence: "Name this note." */
  prompt: string;
  stimuli: Stimulus[];
  response: ResponseSpec;
  expected: Expected;
  /** One or two sentences shown after answering, right or wrong: the answer
   *  and why. Written so it teaches ("That is G: the second line of the
   *  treble clef."). */
  explain: string;
  /** Played after answering, e.g. the correct notes. */
  reveal?: Sound;
}

export interface Grade {
  correct: boolean;
  /** For taps: per-onset error in beats (null = missed), so the UI can show
   *  early/late. */
  tapErrors?: (number | null)[];
}
