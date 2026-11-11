import { fretMidi, isFretPos, parseFretPos, type FretPos } from "./instruments.ts";
import { isPitch, midiOf } from "./notes.ts";

// Rhythm and melody tokens: the way content files write music in time.
//
//   duration   w h q e s  (whole, half, quarter, eighth, sixteenth),
//              an optional dot (h. = dotted half), an optional r for a rest
//              (qr = quarter rest).
//   rhythm     "q q e e h | w"            durations separated by spaces; "|" is a bar line
//   melody     "C4:q D4:q E4:h | r:q G4+B4:h."   pitch(es):duration; r = rest; + joins a chord
//   tab        "6/0:q 6/3:q 5/0:h"        string/fret:duration (guitar, sounding pitch from the tuning)
//
// One beat is a quarter note throughout (so 6/8 has six eighths = three beats).

export type NoteValue = "w" | "h" | "q" | "e" | "s";
const BEATS: Record<NoteValue, number> = { w: 4, h: 2, q: 1, e: 0.5, s: 0.25 };
export const VALUE_NAMES: Record<NoteValue, string> = { w: "whole", h: "half", q: "quarter", e: "eighth", s: "sixteenth" };

export interface Duration {
  value: NoteValue;
  dotted: boolean;
  rest: boolean;
  beats: number;
}

const DUR_RE = /^([whqes])(\.)?(r)?$/;

export function isDuration(s: unknown): s is string {
  return typeof s === "string" && DUR_RE.test(s);
}
export function parseDuration(s: string): Duration {
  const m = DUR_RE.exec(s);
  if (!m) throw new Error(`not a duration: "${s}" (expected w h q e s, optional dot, optional r for a rest)`);
  const value = m[1] as NoteValue;
  const dotted = Boolean(m[2]);
  return { value, dotted, rest: Boolean(m[3]), beats: BEATS[value] * (dotted ? 1.5 : 1) };
}
export function durationName(d: Duration): string {
  return `${d.dotted ? "dotted " : ""}${VALUE_NAMES[d.value]} ${d.rest ? "rest" : "note"}`;
}

export interface TimeSignature {
  beats: number; // top number
  unit: number; // bottom number
  /** Length of one bar in quarter-note beats. */
  barBeats: number;
}
export function parseTime(s: string): TimeSignature {
  const m = /^(\d{1,2})\/(2|4|8|16)$/.exec(s);
  if (!m) throw new Error(`not a time signature: "${s}" (expected e.g. 4/4, 3/4, 6/8)`);
  const beats = Number(m[1]);
  const unit = Number(m[2]);
  return { beats, unit, barBeats: beats * (4 / unit) };
}
export function isTime(s: unknown): s is string {
  return typeof s === "string" && /^(\d{1,2})\/(2|4|8|16)$/.test(s);
}

/** One event in time: zero or more sounding MIDI notes (zero = a rest). */
export interface TimedEvent {
  midis: number[];
  /** Fretboard positions, when the source was tab. */
  positions?: FretPos[];
  /** The pitch names as written, when the source was a melody. */
  names?: string[];
  duration: Duration;
  /** Start, in quarter-note beats from the beginning. */
  at: number;
  /** Index of the bar this event falls in (0-based), by bar lines if the
   *  source had any, else by the time signature. */
  bar: number;
}

interface RawToken {
  head: string | null; // null for a pure rhythm token
  dur: string;
  bar: number;
}

function tokenize(src: string, withHead: boolean): RawToken[] {
  const out: RawToken[] = [];
  let bar = 0;
  for (const tok of src.trim().split(/\s+/)) {
    if (!tok) continue;
    if (tok === "|") {
      bar++;
      continue;
    }
    if (!withHead) {
      out.push({ head: null, dur: tok, bar });
      continue;
    }
    const i = tok.lastIndexOf(":");
    if (i < 0) throw new Error(`"${tok}": expected note:duration (e.g. C4:q)`);
    out.push({ head: tok.slice(0, i), dur: tok.slice(i + 1), bar });
  }
  return out;
}

function place(raw: RawToken[], time: TimeSignature | null, build: (t: RawToken, d: Duration) => Omit<TimedEvent, "at" | "bar" | "duration">): TimedEvent[] {
  const hasBars = raw.some((t) => t.bar > 0);
  let at = 0;
  return raw.map((t) => {
    const duration = parseDuration(t.dur);
    const ev: TimedEvent = { ...build(t, duration), duration, at, bar: hasBars || !time ? t.bar : Math.floor(at / time.barBeats + 1e-9) };
    at += duration.beats;
    return ev;
  });
}

/** "q q e e h" → events with no pitch (midis is [60] for a note, [] for a rest). */
export function parseRhythm(src: string, time?: string): TimedEvent[] {
  return place(tokenize(src, false), time ? parseTime(time) : null, (_t, d) => ({ midis: d.rest ? [] : [60] }));
}

/** "C4:q E4+G4:h r:q" → events. A rest is written r:q (or with an r duration). */
export function parseMelody(src: string, time?: string): TimedEvent[] {
  return place(tokenize(src, true), time ? parseTime(time) : null, (t, d) => {
    if (t.head === "r" || d.rest) return { midis: [], names: [] };
    const names = (t.head ?? "").split("+");
    for (const n of names) if (!isPitch(n)) throw new Error(`"${n}": not a pitch (in "${t.head}:${t.dur}")`);
    return { midis: names.map((n) => midiOf(n)), names };
  });
}

/** "6/0:q 5/2+4/2:h" → events with fretboard positions and sounding pitches. */
export function parseTab(src: string, time?: string): TimedEvent[] {
  return place(tokenize(src, true), time ? parseTime(time) : null, (t, d) => {
    if (t.head === "r" || d.rest) return { midis: [], positions: [] };
    const parts = (t.head ?? "").split("+");
    for (const p of parts) if (!isFretPos(p)) throw new Error(`"${p}": not a string/fret position (in "${t.head}:${t.dur}")`);
    const positions = parts.map(parseFretPos);
    return { midis: positions.map((p) => fretMidi(p)), positions };
  });
}

export function totalBeats(events: TimedEvent[]): number {
  const last = events[events.length - 1];
  return last ? last.at + last.duration.beats : 0;
}

/** Problems with how events fill their bars: a list of messages, empty when
 *  every bar (bar lines given) holds exactly one bar's worth of beats. The
 *  last bar may be short. */
export function barProblems(events: TimedEvent[], time: string): string[] {
  const ts = parseTime(time);
  const perBar = new Map<number, number>();
  for (const e of events) perBar.set(e.bar, (perBar.get(e.bar) ?? 0) + e.duration.beats);
  const bars = [...perBar.keys()].sort((a, b) => a - b);
  if (bars.length <= 1 && (perBar.get(0) ?? 0) > ts.barBeats + 1e-9) return []; // no bar lines written: nothing to check
  const out: string[] = [];
  bars.forEach((b, i) => {
    const got = perBar.get(b) ?? 0;
    const last = i === bars.length - 1;
    if (Math.abs(got - ts.barBeats) > 1e-9 && !(last && got < ts.barBeats)) out.push(`bar ${b + 1} holds ${got} beats, but ${time} needs ${ts.barBeats}`);
  });
  return out;
}

/** How a beat position is counted aloud: 0 → "1", 0.5 → "&", 1 → "2",
 *  0.25 → "e", 0.75 → "a". */
export function countLabel(beatInBar: number, time: string): string {
  const ts = parseTime(time);
  if (ts.unit === 8) {
    const eighth = beatInBar * 2;
    return Number.isInteger(eighth) ? String(eighth + 1) : "&";
  }
  const whole = Math.floor(beatInBar + 1e-9);
  const frac = beatInBar - whole;
  if (frac < 1e-9) return String(whole + 1);
  if (Math.abs(frac - 0.5) < 1e-9) return "&";
  if (Math.abs(frac - 0.25) < 1e-9) return "e";
  if (Math.abs(frac - 0.75) < 1e-9) return "a";
  return "";
}
