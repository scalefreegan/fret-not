import { isChordSymbol, isChordType } from "./music/chords.ts";
import { isFretPos } from "./music/instruments.ts";
import { isInterval } from "./music/intervals.ts";
import { isPitch, isPitchClass } from "./music/notes.ts";
import { isDuration, isTime, parseMelody, parseRhythm, parseTab } from "./music/rhythm.ts";
import { isKey, isScaleType } from "./music/scales.ts";

// The catalogue of widgets a lesson may embed and exercise kinds it may
// declare, with the parameters each accepts. This file is the single source
// of truth: the loader validates content against it, docs/CONTENT.md
// describes it for authors (human and agent), and the UI implements it.
// Adding a widget or an exercise kind starts here.

/** How a parameter value is checked. `x[]` means a list of x. */
export type ParamType =
  | "string"
  | "number"
  | "boolean"
  | "pitch" // "C4", "F#3", "Bb2"
  | "pitch[]"
  | "pitchclass" // "C", "F#", "Bb"
  | "pitchclass[]"
  | "range" // [lowPitch, highPitch]
  | "interval[]" // ["m3", "P5"]
  | "chord" // chord symbol: "C", "Am", "G7"
  | "chord[]"
  | "chordtype[]" // ["maj", "min"]
  | "scaletype"
  | "scaletype[]"
  | "key" // "G", "Em", "Bb"
  | "key[]"
  | "time" // "4/4"
  | "duration[]" // ["q", "h", "e", "qr"]
  | "fretpos[]" // ["6/3", "5/2"]
  | "number[]"
  | "string[]"
  | "rhythm" // "q q e e h | w"
  | "melody" // "C4:q D4:q E4:h"
  | "tabline" // "6/0:q 6/3:q"
  | "questions" // quiz questions, see CONTENT.md
  | `enum:${string}` // one of a|b|c
  | `enum[]:${string}`; // a list drawn from a|b|c

export interface ParamSpec {
  type: ParamType;
  required?: boolean;
  /** Shown in docs/CONTENT.md; keep it to one line. */
  doc: string;
}
export type ParamSpecs = Record<string, ParamSpec>;

const VIEWS = "staff|keyboard|fretboard|tab";
const CLEFS = "treble|bass|grand";
const INSTRUMENTS = "piano|guitar";
const TIMBRES = "sine|triangle|square|saw|piano|guitar";

export const WIDGETS: Record<string, { doc: string; params: ParamSpecs }> = {
  // --- sound -------------------------------------------------------------
  "string-sim": {
    doc: "An animated vibrating string. In `harmonics` mode the learner switches standing-wave modes on and off and hears each; in `pluck` and `strike` mode they choose where along the string to pluck (guitar) or strike (piano) and see and hear which harmonics that excites.",
    params: {
      mode: { type: "enum:harmonics|pluck|strike", doc: "Default harmonics." },
      note: { type: "pitch", doc: "The string's fundamental. Default A2." },
      modes: { type: "number", doc: "How many harmonics are offered. Default 6." },
    },
  },
  "harmonic-mixer": {
    doc: "One slider per harmonic of a note, with the summed waveform and the spectrum drawn live. The learner builds a timbre by ear and eye.",
    params: {
      note: { type: "pitch", doc: "Fundamental. Default A2." },
      partials: { type: "number", doc: "Number of sliders. Default 8." },
      preset: { type: "enum:sine|saw|square|triangle|piano|guitar", doc: "Starting mix. Default sine." },
    },
  },
  "frequency-explorer": {
    doc: "A frequency slider with a live waveform: drag to hear pitch rise as the wave gets tighter. Shows Hz and the nearest note name.",
    params: {
      min: { type: "number", doc: "Lowest Hz. Default 55." },
      max: { type: "number", doc: "Highest Hz. Default 1760." },
      start: { type: "number", doc: "Starting Hz. Default 220." },
      showNotes: { type: "boolean", doc: "Show the nearest note name. Default true." },
      loudness: { type: "boolean", doc: "Also offer a loudness (amplitude) slider. Default false." },
    },
  },
  consonance: {
    doc: "Two tones a chosen frequency ratio apart: hear them together, see the combined wave repeat (or not), and see which of their harmonics coincide.",
    params: {
      base: { type: "pitch", doc: "Lower note. Default A3." },
      ratios: { type: "string[]", doc: 'Ratios offered, e.g. ["2:1", "3:2", "4:3", "5:4", "16:15"]. Default those five.' },
    },
  },
  "timbre-compare": {
    doc: "The same note from several sources side by side, each with its waveform and spectrum: why a piano and a guitar playing the same pitch sound different.",
    params: {
      note: { type: "pitch", doc: "Default A3." },
      sources: { type: `enum[]:${TIMBRES}`, doc: "Default [sine, piano, guitar]." },
    },
  },
  scope: {
    doc: "A live oscilloscope and spectrum of everything the app is currently playing.",
    params: { show: { type: "enum:wave|spectrum|both", doc: "Default both." } },
  },
  "instrument-anatomy": {
    doc: "An interactive cutaway of how the instrument makes sound. Piano: key, hammer, strings, damper, soundboard. Guitar: string, fret, bridge, soundboard and body, and how pressing a fret shortens the string.",
    params: { instrument: { type: `enum:${INSTRUMENTS}`, required: true, doc: "Which instrument." } },
  },

  // --- notes on instruments and staff ------------------------------------
  keyboard: {
    doc: "A playable piano keyboard.",
    params: {
      range: { type: "range", doc: "Default [C3, C5]." },
      highlight: { type: "pitch[]", doc: "Keys to light up." },
      labels: { type: "enum:none|c|naturals|all", doc: "Which keys carry their note name. Default naturals." },
    },
  },
  fretboard: {
    doc: "A playable guitar fretboard in standard tuning, low E string at the bottom (as in tab).",
    params: {
      frets: { type: "number", doc: "How many frets to draw. Default 12." },
      positions: { type: "fretpos[]", doc: 'Exact places to mark, as string/fret: ["6/3", "5/2"].' },
      highlight: { type: "pitch[]", doc: "Mark every place these sounding pitches can be played." },
      pitchClasses: { type: "pitchclass[]", doc: "Mark every place any octave of these notes can be played." },
      labels: { type: "enum:none|open|naturals|all", doc: "Which positions carry a note name. Default open." },
    },
  },
  staff: {
    doc: "A staff with notes on it. Click a note to hear it.",
    params: {
      clef: { type: `enum:${CLEFS}`, doc: "Default treble." },
      notes: { type: "pitch[]", doc: "Notes drawn left to right." },
      chord: { type: "boolean", doc: "Stack the notes as one chord instead. Default false." },
      key: { type: "key", doc: "Key signature to draw." },
      labels: { type: "boolean", doc: "Write each note's name under it. Default false." },
    },
  },
  linked: {
    doc: "The central widget: the same notes shown on staff, keyboard and fretboard at once. With `interactive`, clicking a key, a fret or a staff line changes the note everywhere.",
    params: {
      notes: { type: "pitch[]", required: true, doc: "The notes shown to begin with (sounding pitch)." },
      views: { type: `enum[]:${VIEWS}`, doc: "Default [staff, keyboard, fretboard]." },
      clef: { type: `enum:${CLEFS}`, doc: "Default: chosen from the notes." },
      chord: { type: "boolean", doc: "Treat the notes as one chord (sounded together). Default false." },
      interactive: { type: "boolean", doc: "Let the learner pick a different note. Default true." },
    },
  },
  interval: {
    doc: "Two notes and the distance between them: its name, its size in half steps, its frequency ratio, on staff and keyboard, played one after the other or together.",
    params: {
      from: { type: "pitch", required: true, doc: "Lower note." },
      to: { type: "pitch", required: true, doc: "Upper note." },
      interactive: { type: "boolean", doc: "Let the learner move the upper note. Default true." },
      views: { type: `enum[]:${VIEWS}`, doc: "Default [staff, keyboard]." },
    },
  },
  scale: {
    doc: "A scale with its pattern of whole and half steps, on the chosen views, playable up and down.",
    params: {
      tonic: { type: "pitchclass", required: true, doc: "Starting note, e.g. C or Bb." },
      scale: { type: "scaletype", required: true, doc: "Which scale: major, natural-minor, major-pentatonic, minor-pentatonic, blues …" },
      views: { type: `enum[]:${VIEWS}`, doc: "Default [staff, keyboard]." },
      interactive: { type: "boolean", doc: "Let the learner change tonic and type. Default false." },
    },
  },
  chord: {
    doc: "One chord: its notes, how it is built from thirds, and how it looks on each view. `diagram` is the guitar chord box.",
    params: {
      symbol: { type: "chord", required: true, doc: "e.g. C, Am, G7." },
      views: { type: "enum[]:staff|keyboard|fretboard|diagram", doc: "Default [staff, keyboard]." },
      interactive: { type: "boolean", doc: "Let the learner change root and type. Default false." },
    },
  },
  "chord-diagram": {
    doc: "A row of guitar chord boxes. Click one to strum it. Only chords with a stored shape can be shown (see CONTENT.md).",
    params: { chords: { type: "chord[]", required: true, doc: 'e.g. ["Em", "Am", "C", "G", "D"].' } },
  },
  "circle-of-fifths": {
    doc: "The circle of fifths: click a key to see its signature, its scale and its relative minor.",
    params: { key: { type: "key", doc: "Key selected to begin with. Default C." } },
  },

  // --- music in time -----------------------------------------------------
  metronome: {
    doc: "A visual metronome: a swinging arm and a light per beat, with tempo and time signature controls.",
    params: {
      tempo: { type: "number", doc: "Beats per minute. Default 80." },
      time: { type: "time", doc: "Default 4/4." },
    },
  },
  rhythm: {
    doc: "A rhythm in notation with the counting written under it. Play it and a cursor follows; with `tap` the learner taps along and sees how close each tap was.",
    params: {
      pattern: { type: "rhythm", required: true, doc: 'Durations: "q q e e h | w".' },
      time: { type: "time", doc: "Default 4/4." },
      tempo: { type: "number", doc: "Default 80." },
      count: { type: "boolean", doc: "Write the counting (1 & 2 &) underneath. Default true." },
      tap: { type: "boolean", doc: "Offer tap-along. Default false." },
    },
  },
  melody: {
    doc: "A short tune on the staff, played back with a moving cursor and the current note lit on the linked views.",
    params: {
      notes: { type: "melody", required: true, doc: 'Melody tokens: "C4:q D4:q E4:h | G4:w". Sounding pitch.' },
      title: { type: "string", doc: "Shown above, e.g. the tune's name and origin." },
      time: { type: "time", doc: "Default 4/4." },
      tempo: { type: "number", doc: "Default 90." },
      key: { type: "key", doc: "Key signature. Default C." },
      clef: { type: `enum:${CLEFS}`, doc: "Default treble." },
      views: { type: `enum[]:${VIEWS}`, doc: "Default [staff, keyboard]." },
      instrument: { type: `enum:${INSTRUMENTS}`, doc: "Which sound plays it. Default piano." },
    },
  },
  tab: {
    doc: "Guitar tablature with the same music on a staff above it (written an octave above where it sounds), played back with a cursor.",
    params: {
      notes: { type: "tabline", required: true, doc: 'Tab tokens, string/fret:duration: "6/0:q 6/3:q 5/0:h".' },
      title: { type: "string", doc: "Shown above." },
      time: { type: "time", doc: "Default 4/4." },
      tempo: { type: "number", doc: "Default 90." },
      staff: { type: "boolean", doc: "Draw the staff above the tab. Default true." },
    },
  },
  progression: {
    doc: "A chord progression played in time, each chord shown as it sounds.",
    params: {
      chords: { type: "string", required: true, doc: 'Chord symbols ("C G Am F") or, with `key`, Roman numerals ("I V vi IV"). One bar each.' },
      key: { type: "key", doc: "Needed for Roman numerals; also labels symbols with their numeral." },
      tempo: { type: "number", doc: "Default 90." },
      time: { type: "time", doc: "Default 4/4." },
      instrument: { type: `enum:${INSTRUMENTS}`, doc: "Default piano." },
      views: { type: "enum[]:staff|keyboard|fretboard|diagram", doc: "Default [keyboard]." },
    },
  },
};

const NOTE_SOURCE: ParamSpecs = {
  clef: { type: "enum:treble|bass", doc: "For staff views. Default treble." },
  range: { type: "range", doc: "Lowest and highest pitch asked. Default depends on the view." },
  accidentals: { type: "boolean", doc: "Include sharps and flats. Default false." },
  strings: { type: "number[]", doc: "Guitar strings to draw from (1 = high E … 6 = low E). Default all." },
  maxFret: { type: "number", doc: "Highest fret asked. Default 5." },
};

export const EXERCISES: Record<string, { doc: string; group: "identify" | "ear" | "play" | "build"; params: ParamSpecs }> = {
  // --- identify ----------------------------------------------------------
  quiz: {
    group: "identify",
    doc: "Authored multiple-choice questions, for ideas no generator covers. `count` questions are drawn at random.",
    params: { questions: { type: "questions", required: true, doc: "List of {q, choices, answer, explain}; `answer` is the 1-based index of the right choice." } },
  },
  "name-note": {
    group: "identify",
    doc: "A note is shown; name it.",
    params: { view: { type: `enum:${VIEWS}`, required: true, doc: "Where the note is shown." }, ...NOTE_SOURCE },
  },
  "name-interval": {
    group: "identify",
    doc: "Two notes are shown; name the interval between them.",
    params: {
      view: { type: "enum:staff|keyboard|fretboard", required: true, doc: "Where the notes are shown." },
      intervals: { type: "interval[]", required: true, doc: 'Intervals drawn from, e.g. ["m2", "M2"].' },
      labels: { type: "enum:names|steps", doc: "`steps` words the answers as half steps / whole steps (for m2 and M2). Default names." },
      clef: { type: "enum:treble|bass", doc: "Default treble." },
    },
  },
  "name-chord": {
    group: "identify",
    doc: "A chord is shown; name it (root and quality).",
    params: {
      view: { type: "enum:staff|keyboard|diagram", required: true, doc: "Where the chord is shown. `diagram` uses guitar chord boxes." },
      chords: { type: "chord[]", doc: "Chords drawn from. Give this or `types` + `roots`." },
      types: { type: "chordtype[]", doc: "e.g. [maj, min]." },
      roots: { type: "pitchclass[]", doc: "e.g. [C, F, G]." },
      qualityOnly: { type: "boolean", doc: "Ask only major or minor (etc.), not the root. Default false." },
    },
  },
  "name-key": {
    group: "identify",
    doc: "A key signature is shown; name the key.",
    params: {
      maxAccidentals: { type: "number", doc: "Up to this many sharps or flats. Default 3." },
      mode: { type: "enum:major|minor|both", doc: "Default major." },
      clef: { type: "enum:treble|bass", doc: "Default treble." },
    },
  },
  "name-duration": {
    group: "identify",
    doc: "A note or rest is shown; say what it is called or how many beats it lasts.",
    params: {
      values: { type: "duration[]", required: true, doc: "e.g. [w, h, q, e, qr]." },
      ask: { type: "enum:name|beats", doc: "Default name." },
    },
  },
  "count-bar": {
    group: "identify",
    doc: "A bar with one note missing is shown; choose the note value that completes it.",
    params: {
      time: { type: "time", doc: "Default 4/4." },
      values: { type: "duration[]", required: true, doc: "Note values used." },
    },
  },
  "harmonic-frequency": {
    group: "identify",
    doc: "Given a fundamental frequency, pick the frequency of its nth harmonic (or which harmonic a frequency is).",
    params: {
      fundamentals: { type: "number[]", doc: "Fundamentals in Hz. Default [100, 110, 200, 220]." },
      maxHarmonic: { type: "number", doc: "Default 5." },
    },
  },

  // --- ear ---------------------------------------------------------------
  "ear-higher-lower": {
    group: "ear",
    doc: "Two notes play one after the other; is the second higher or lower?",
    params: {
      minSemitones: { type: "number", doc: "Smallest gap. Default 2." },
      maxSemitones: { type: "number", doc: "Largest gap. Default 12." },
      timbre: { type: `enum:${TIMBRES}`, doc: "Default piano." },
    },
  },
  "ear-interval": {
    group: "ear",
    doc: "An interval plays; name it.",
    params: {
      intervals: { type: "interval[]", required: true, doc: "Intervals drawn from." },
      mode: { type: "enum:melodic|harmonic|both", doc: "One note after the other, together, or either. Default melodic." },
      labels: { type: "enum:names|steps", doc: "As for name-interval." },
    },
  },
  "ear-chord": {
    group: "ear",
    doc: "A chord plays; say its quality.",
    params: {
      types: { type: "chordtype[]", required: true, doc: "e.g. [maj, min]." },
      instrument: { type: `enum:${INSTRUMENTS}`, doc: "Default piano." },
    },
  },
  "ear-timbre": {
    group: "ear",
    doc: "A note plays; say which source made it.",
    params: { sources: { type: `enum[]:${TIMBRES}`, required: true, doc: "e.g. [sine, piano, guitar]." } },
  },
  "ear-same-note": {
    group: "ear",
    doc: "Two notes play; are they the same note, an octave apart, or different notes?",
    params: { timbre: { type: `enum:${TIMBRES}`, doc: "Default piano." } },
  },
  "ear-rhythm": {
    group: "ear",
    doc: "A one-bar rhythm plays; pick the notation that matches it from three.",
    params: {
      time: { type: "time", doc: "Default 4/4." },
      values: { type: "duration[]", required: true, doc: "Note values used." },
      tempo: { type: "number", doc: "Default 80." },
    },
  },
  "ear-find-note": {
    group: "ear",
    doc: "A reference note is shown and played, then a second note plays; find the second on the instrument.",
    params: {
      instrument: { type: `enum:${INSTRUMENTS}`, doc: "Default piano." },
      scale: { type: "scaletype", doc: "Draw notes from this scale on C. Default major." },
      range: { type: "range", doc: "Default [C4, C5]." },
    },
  },

  // --- play --------------------------------------------------------------
  "play-note": {
    group: "play",
    doc: "A note is asked for by name, on the staff or in tab; play it on the virtual instrument.",
    params: {
      instrument: { type: `enum:${INSTRUMENTS}`, required: true, doc: "Which instrument answers." },
      from: { type: "enum:name|staff|tab", required: true, doc: "How the note is asked for. `tab` is guitar only." },
      anyOctave: { type: "boolean", doc: "Accept the note in any octave. Default true for `name`, false otherwise." },
      ...NOTE_SOURCE,
    },
  },
  "play-scale": {
    group: "play",
    doc: "Play a scale upward from its tonic, one octave, in order.",
    params: {
      instrument: { type: `enum:${INSTRUMENTS}`, required: true, doc: "Which instrument answers." },
      types: { type: "scaletype[]", required: true, doc: "Scale types drawn from." },
      tonics: { type: "pitchclass[]", required: true, doc: "Tonics drawn from." },
    },
  },
  "play-chord": {
    group: "play",
    doc: "A chord symbol is shown; press its notes (piano) or fret its shape (guitar), then check.",
    params: {
      instrument: { type: `enum:${INSTRUMENTS}`, required: true, doc: "Which instrument answers." },
      chords: { type: "chord[]", required: true, doc: "Chords drawn from." },
    },
  },
  "tap-rhythm": {
    group: "play",
    doc: "A one- or two-bar rhythm is shown; after a count-in, tap it on the space bar in time.",
    params: {
      time: { type: "time", doc: "Default 4/4." },
      values: { type: "duration[]", required: true, doc: "Note values used." },
      bars: { type: "number", doc: "1 or 2. Default 1." },
      tempo: { type: "number", doc: "Default 72." },
    },
  },

  // --- build -------------------------------------------------------------
  "build-interval": {
    group: "build",
    doc: "A starting note is given; play the note the named interval above (or below) it.",
    params: {
      intervals: { type: "interval[]", required: true, doc: "Intervals drawn from." },
      direction: { type: "enum:up|down|both", doc: "Default up." },
      instrument: { type: `enum:${INSTRUMENTS}`, doc: "Default piano." },
      labels: { type: "enum:names|steps", doc: "As for name-interval." },
    },
  },
  "build-scale": {
    group: "build",
    doc: "A scale is named; select exactly its notes on the keyboard.",
    params: {
      types: { type: "scaletype[]", required: true, doc: "Scale types drawn from." },
      tonics: { type: "pitchclass[]", required: true, doc: "Tonics drawn from." },
    },
  },
  "build-chord": {
    group: "build",
    doc: "A chord is named in words (\"a major triad on E\"); select exactly its notes on the keyboard.",
    params: {
      types: { type: "chordtype[]", required: true, doc: "Chord types drawn from." },
      roots: { type: "pitchclass[]", required: true, doc: "Roots drawn from." },
    },
  },
  "build-key-signature": {
    group: "build",
    doc: "A key is named; choose how many sharps or flats its signature has.",
    params: {
      maxAccidentals: { type: "number", doc: "Default 3." },
      mode: { type: "enum:major|minor|both", doc: "Default major." },
    },
  },
};

// --- validation ------------------------------------------------------------

function listOf(check: (v: unknown) => boolean): (v: unknown) => boolean {
  return (v) => Array.isArray(v) && v.length > 0 && v.every(check);
}
function parses(fn: (s: string) => unknown): (v: unknown) => string | null {
  return (v) => {
    if (typeof v !== "string") return "must be a string";
    try {
      fn(v);
      return null;
    } catch (e) {
      return (e as Error).message;
    }
  };
}

function checkQuestions(v: unknown): string | null {
  if (!Array.isArray(v) || v.length === 0) return "must be a non-empty list of questions";
  for (const [i, q] of v.entries()) {
    const where = `question ${i + 1}`;
    if (!q || typeof q !== "object") return `${where} must be a mapping`;
    const { q: text, choices, answer, explain } = q as Record<string, unknown>;
    if (typeof text !== "string" || !text.trim()) return `${where}: \`q\` (the question) is missing`;
    if (!Array.isArray(choices) || choices.length < 2 || !choices.every((c) => typeof c === "string" || typeof c === "number")) return `${where}: \`choices\` must list at least two answers`;
    if (typeof answer !== "number" || !Number.isInteger(answer) || answer < 1 || answer > choices.length) return `${where}: \`answer\` must be the 1-based index of the right choice (1–${choices.length})`;
    if (explain !== undefined && typeof explain !== "string") return `${where}: \`explain\` must be text`;
  }
  return null;
}

/** null when `value` fits `type`, else a message saying what was expected. */
export function checkParam(type: ParamType, value: unknown): string | null {
  if (type.startsWith("enum:")) {
    const allowed = type.slice(5).split("|");
    return typeof value === "string" && allowed.includes(value) ? null : `must be one of: ${allowed.join(", ")}`;
  }
  if (type.startsWith("enum[]:")) {
    const allowed = type.slice(7).split("|");
    return listOf((v) => typeof v === "string" && allowed.includes(v))(value) ? null : `must be a list drawn from: ${allowed.join(", ")}`;
  }
  const ok = (pass: boolean, expected: string) => (pass ? null : `must be ${expected}`);
  switch (type) {
    case "string":
      return ok(typeof value === "string" && value.trim() !== "", "text");
    case "number":
      return ok(typeof value === "number" && Number.isFinite(value), "a number");
    case "boolean":
      return ok(typeof value === "boolean", "true or false");
    case "pitch":
      return ok(isPitch(value), "a pitch with its octave, e.g. C4 or F#3");
    case "pitch[]":
      return ok(listOf(isPitch)(value), "a list of pitches with octaves, e.g. [C4, E4, G4]");
    case "pitchclass":
      return ok(isPitchClass(value), "a note name without octave, e.g. C or Bb");
    case "pitchclass[]":
      return ok(listOf(isPitchClass)(value), "a list of note names without octaves, e.g. [C, F, G]");
    case "range":
      return ok(Array.isArray(value) && value.length === 2 && value.every(isPitch), "[lowest, highest], e.g. [C4, C5]");
    case "interval[]":
      return ok(listOf(isInterval)(value), "a list of intervals, e.g. [m3, M3, P5]");
    case "chord":
      return ok(isChordSymbol(value), "a chord symbol, e.g. C, Am or G7");
    case "chord[]":
      return ok(listOf(isChordSymbol)(value), "a list of chord symbols, e.g. [C, Am, G7]");
    case "chordtype[]":
      return ok(listOf(isChordType)(value), "a list of chord types, e.g. [maj, min, dim, 7]");
    case "scaletype":
      return ok(isScaleType(value), "a scale type, e.g. major or minor-pentatonic");
    case "scaletype[]":
      return ok(listOf(isScaleType)(value), "a list of scale types, e.g. [major, natural-minor]");
    case "key":
      return ok(isKey(value), "a key, e.g. G, Em or Bb");
    case "key[]":
      return ok(listOf(isKey)(value), "a list of keys, e.g. [C, G, Em]");
    case "time":
      return ok(isTime(value), "a time signature, e.g. 4/4");
    case "duration[]":
      return ok(listOf(isDuration)(value), "a list of durations, e.g. [w, h, q, e, qr]");
    case "fretpos[]":
      return ok(listOf(isFretPos)(value), 'a list of string/fret positions, e.g. ["6/3", "5/2"]');
    case "number[]":
      return ok(listOf((v) => typeof v === "number" && Number.isFinite(v))(value), "a list of numbers");
    case "string[]":
      return ok(listOf((v) => typeof v === "string")(value), "a list of strings");
    case "rhythm":
      return parses((s) => parseRhythm(s))(value);
    case "melody":
      return parses((s) => parseMelody(s))(value);
    case "tabline":
      return parses((s) => parseTab(s))(value);
    case "questions":
      return checkQuestions(value);
    default:
      return `unknown parameter type ${type}`;
  }
}

/** Check a parameter mapping against a spec. Returns messages; empty = valid. */
export function checkParams(specs: ParamSpecs, params: Record<string, unknown>, ignore: readonly string[] = []): string[] {
  const out: string[] = [];
  for (const [name, value] of Object.entries(params)) {
    if (ignore.includes(name)) continue;
    const spec = specs[name];
    if (!spec) {
      out.push(`unknown parameter \`${name}\` (allowed: ${Object.keys(specs).join(", ") || "none"})`);
      continue;
    }
    const problem = checkParam(spec.type, value);
    if (problem) out.push(`\`${name}\` ${problem}`);
  }
  for (const [name, spec] of Object.entries(specs)) {
    if (spec.required && params[name] === undefined) out.push(`\`${name}\` is required`);
  }
  return out;
}
