// The shape of the curriculum once loaded from content/ — what the server
// sends and the UI renders. The on-disk format is docs/CONTENT.md.

export interface Track {
  id: string; // "core", "piano", "guitar"
  title: string;
  summary: string;
  /** Set on instrument tracks: the id of a file in content/instruments/. */
  instrument?: string;
}

export interface Level {
  id: number;
  title: string;
  summary: string;
  /** `written` levels have lessons; `outline` levels only list their topics. */
  status: "written" | "outline";
  topics: string[];
}

export interface Concept {
  id: string;
  title: string;
  level: number;
  track: string;
  /** Concepts that should be learned first (used to order reviews and hints). */
  requires: string[];
}

export interface Instrument {
  id: string;
  title: string;
  layout: "keyboard" | "fretboard";
  /** Lowest and highest sounding pitch, e.g. ["E2", "C6"] for a 20-fret guitar. */
  range: [string, string];
  /** Open strings from the lowest, for fretted instruments. */
  tuning?: string[];
  frets?: number;
  /** Notation is written this many semitones above the sounding pitch (guitar: 12). */
  writtenOffset: number;
  /** Which sound the audio engine uses. */
  timbre: string;
}

export interface ExerciseDecl {
  kind: string; // key of EXERCISES in registry.ts
  concept: string;
  /** How many questions to ask. */
  count: number;
  title?: string;
  params: Record<string, unknown>;
}

export type Block = { type: "prose"; markdown: string } | { type: "widget"; widget: string; params: Record<string, unknown> };

export interface Lesson {
  id: string;
  title: string;
  track: string;
  level: number;
  /** Position within its track and level. */
  order: number;
  concepts: string[];
  summary: string;
  /** For an instrument lesson: the core lesson it is the counterpart of. */
  mirrors?: string;
  blocks: Block[];
  exercises: ExerciseDecl[];
  /** Path relative to content/, for error messages and the tutor. */
  file: string;
}

export interface ContentProblem {
  file: string;
  message: string;
}

export interface Content {
  tracks: Track[];
  levels: Level[];
  concepts: Concept[];
  instruments: Instrument[];
  /** Valid lessons only, sorted by level, then track order, then `order`. */
  lessons: Lesson[];
  /** Everything the loader refused, with a readable reason. A lesson with a
   *  problem is left out of `lessons` rather than served half-working. */
  problems: ContentProblem[];
}
