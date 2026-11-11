import type { Stimulus, Timbre } from "../exercise-types.ts";
import { chordFullName, chordLabel, chordNotes, chordPcs, chordSymbol } from "../music/chords.ts";
import { fretMidi, GUITAR_SHAPES, pianoVoicing, positionsOf, positionsOfPc, shapeMidis, type FretPos } from "../music/instruments.ts";
import { fromMidi, isBlackKey, isPitchClass, parsePitchClass, pc, pcBothLabels, pcLabel, pcOfClass, pitchLabel, pitchName, toMidi, type PitchClass } from "../music/notes.ts";
import { countLabel, parseDuration, parseTime } from "../music/rhythm.ts";
import { isScaleType, SCALES, scaleNotes, stepLabel, stepPattern } from "../music/scales.ts";
import type { Clef } from "../music/staff.ts";
import { chordPool, chordWhy } from "./identify.ts";
import {
  ALL_STRINGS, arpThenChord, barBeatsOf, durationTokens, fillBar, fretCandidates, joinAnd, kbRange, keyWhere, melodic, midiCandidates, pBool, pList, pNum, pRange, pStr, pick, posWhere, rhythmSound, spell,
  staffWhere, uniq, type Generator, type Params, type Rng,
} from "./util.ts";

const isGuitar = (p: Params) => pStr(p, "instrument", "piano") === "guitar";

export const playNote: Generator = (p, rng) => {
  const guitar = isGuitar(p);
  let from = pStr(p, "from", "name");
  if (from === "tab" && !guitar) from = "name"; // tab is guitar only
  const accidentals = pBool(p, "accidentals", false);
  const anyOctave = pBool(p, "anyOctave", from === "name");
  const clef: Clef = pStr(p, "clef", "treble") === "bass" ? "bass" : "treble";
  const timbre: Timbre = guitar ? "guitar" : "piano";

  let midi: number;
  let pos: FretPos | null = null;
  let maxFret = 5;
  if (guitar) {
    maxFret = Math.max(3, Math.min(24, Math.floor(pNum(p, "maxFret", 5))));
    pos = pick(rng, fretCandidates(pList(p, "strings", ALL_STRINGS), pNum(p, "maxFret", 5), pRange(p), accidentals));
    midi = fretMidi(pos);
  } else {
    const range = pRange(p) ?? (from === "staff" ? (clef === "bass" ? [43, 60] : [60, 79]) : [60, 71]);
    midi = pick(rng, midiCandidates(range as [number, number], accidentals));
  }
  const spelled = isBlackKey(midi) ? spell(rng, midi) : fromMidi(midi);
  const name = pcLabel(spelled);

  let stimulus: Stimulus;
  let prompt: string;
  if (from === "staff") {
    stimulus = { type: "staff", clef, notes: [pitchName(spelled)] };
    prompt = `Play this note on the ${guitar ? "fretboard" : "keyboard"}${anyOctave ? " (any octave)" : ""}.`;
  } else if (from === "tab" && pos) {
    stimulus = { type: "tab", positions: [pos] };
    prompt = "Play the note this tab asks for.";
  } else {
    stimulus = { type: "text", text: anyOctave ? name : pitchLabel(spelled) };
    prompt = anyOctave ? `Play any ${name} on the ${guitar ? "fretboard" : "keyboard"}.` : `Play ${pitchLabel(spelled)} on the ${guitar ? "fretboard" : "keyboard"}.`;
  }

  let explain: string;
  if (guitar) {
    const places = (anyOctave ? positionsOfPc(pc(midi), maxFret) : positionsOf(midi, maxFret)).slice(0, 4).map(posWhere);
    explain = from === "tab" && pos ? `The tab says ${posWhere(pos)}, which is ${pitchLabel(spelled)}.` : `${anyOctave ? name : pitchLabel(spelled)} is at ${joinAnd(places.length ? places : [posWhere(pos!)])}.`;
  } else if (from === "staff") {
    explain = `That note is ${pitchLabel(spelled)}, ${staffWhere({ ...spelled, acc: 0 }, clef)}${spelled.acc ? ` with a ${spelled.acc > 0 ? "sharp" : "flat"}` : ""}. On the keyboard, ${name} is ${keyWhere(midi)}.`;
  } else {
    explain = `${name} is ${keyWhere(midi)}${isBlackKey(midi) ? ` (${pcBothLabels(midi)} are the same key)` : ""}.`;
  }
  return {
    prompt,
    stimuli: [stimulus],
    response: guitar ? { type: "fretboard", maxFret, mode: "single", labels: "none" } : { type: "keyboard", range: kbRange(Math.min(midi, 48), Math.max(midi, 72)), mode: "single", labels: "none" },
    expected: { type: "notes", midis: [midi], match: anyOctave ? "pc" : "exact", ordered: false },
    explain,
    reveal: melodic([midi], timbre),
  };
};

/** Tonics and scale types a declaration draws from, valid ones only. */
export function scalePick(p: Params, rng: Rng): { tonic: PitchClass; type: string } {
  const types = pList<unknown>(p, "types", ["major"]).filter(isScaleType);
  const tonics = pList<unknown>(p, "tonics", ["C"]).filter(isPitchClass);
  return { tonic: parsePitchClass(tonics.length ? pick(rng, tonics) : "C"), type: types.length ? pick(rng, types) : "major" };
}
export function scaleWhy(tonic: PitchClass, type: string): string {
  const notes = scaleNotes({ ...tonic, oct: 4 }, type, true).map((n) => pcLabel(n));
  const steps = stepPattern(type).map(stepLabel).join(" ");
  return `${pcLabel(tonic)} ${SCALES[type].name} is ${notes.join(" ")}. Its steps are ${steps} (W = whole step, H = half step).`;
}
/** The tonic's key on an on-screen keyboard, and that keyboard's range. */
export function scaleKeyboard(tonic: PitchClass): { tonicMidi: number; range: [number, number] } {
  const tonicMidi = 48 + pcOfClass(tonic);
  return { tonicMidi, range: pcOfClass(tonic) >= 5 ? [53, 77] : [48, 72] };
}

export const playScale: Generator = (p, rng) => {
  const { tonic, type } = scalePick(p, rng);
  const guitar = isGuitar(p);
  const name = `${pcLabel(tonic)} ${SCALES[type].name}`;
  const tonicMidi = guitar ? 40 + ((pcOfClass(tonic) - 4 + 12) % 12) : scaleKeyboard(tonic).tonicMidi;
  const spelled = scaleNotes({ ...tonic, oct: 4 }, type, true);
  const offset = tonicMidi - toMidi(spelled[0]);
  const midis = spelled.map((n) => toMidi(n) + offset);
  return {
    prompt: `Play the ${name} scale upward, one octave, starting from the marked ${pcLabel(tonic)}.`,
    stimuli: [{ type: "text", text: `${name} scale` }],
    response: guitar
      ? { type: "fretboard", maxFret: 12, mode: "sequence", length: midis.length, labels: "none", marked: positionsOf(tonicMidi, 12) }
      : { type: "keyboard", range: scaleKeyboard(tonic).range, mode: "sequence", length: midis.length, labels: "none", marked: [tonicMidi] },
    expected: { type: "notes", midis, match: "exact", ordered: true },
    explain: scaleWhy(tonic, type),
    reveal: melodic(midis, guitar ? "guitar" : "piano", 0.5),
  };
};

export const playChord: Generator = (p, rng) => {
  const guitar = isGuitar(p);
  const c = pick(rng, chordPool(p, false));
  const symbol = chordSymbol(c);
  const stimulus: Stimulus = { type: "text", text: chordLabel(c) };
  if (guitar) {
    const shape = GUITAR_SHAPES[symbol];
    const midis = shape ? shapeMidis(shape) : pianoVoicing(symbol).map((m) => m - 12);
    const maxFret = Math.max(5, ...(shape ? shape.frets.map((f) => f ?? 0) : [5]));
    const shapeText = shape ? ` A common shape, from string 6 to string 1: ${shape.frets.map((f) => (f === null ? "x" : f)).join(" ")} (x = not played, 0 = open).` : "";
    return {
      prompt: `Fret ${chordFullName(c)} (${chordLabel(c)}): mark one note on each string you would play, then check.`,
      stimuli: [stimulus],
      response: { type: "fretboard", maxFret, mode: "set", labels: "none" },
      expected: { type: "chord-shape", symbol },
      explain: `${chordFullName(c)} is ${joinAnd(uniq(chordNotes(c).map((n) => pcLabel(n))))}; any shape that sounds only those notes works.${shapeText}`,
      reveal: arpThenChord(midis, "guitar", 0.03),
    };
  }
  const midis = pianoVoicing(symbol);
  return {
    prompt: `Press the notes of ${chordFullName(c)} (${chordLabel(c)}), then check.`,
    stimuli: [stimulus],
    response: { type: "keyboard", range: [48, 72], mode: "set", labels: "none" },
    expected: { type: "notes", midis: chordPcs(c).map((x) => 60 + x), match: "pc", ordered: false },
    explain: chordWhy(c),
    reveal: arpThenChord(midis),
  };
};

/** About 110 ms either side counts as on time. */
export const TAP_TOLERANCE_SECONDS = 0.11;

export const tapRhythm: Generator = (p, rng) => {
  const time = pStr(p, "time", "4/4");
  const bar = barBeatsOf(time);
  const values = durationTokens(pList(p, "values", ["h", "q"]));
  const nBars = Math.max(1, Math.min(2, Math.floor(pNum(p, "bars", 1))));
  const tempo = Math.max(30, Math.min(240, pNum(p, "tempo", 72)));
  const bars = Array.from({ length: nBars }, () => fillBar(rng, values, bar));
  const tokens = bars.flat();
  const onsets: number[] = [];
  let at = 0;
  for (const t of tokens) {
    const d = parseDuration(t);
    if (!d.rest) onsets.push(at);
    at += d.beats;
  }
  let unit8 = false;
  try {
    unit8 = parseTime(time).unit === 8;
  } catch {
    /* default */
  }
  const counted = onsets.map((o) => {
    const inBar = o - Math.floor(o / bar + 1e-9) * bar;
    const label = countLabel(inBar, time);
    if (/^\d+$/.test(label) || label === "") return label || "between counts";
    return `the ${label === "&" ? "“and”" : `“${label}”`} of ${Math.floor((unit8 ? inBar * 2 : inBar) + 1e-9) + 1}`;
  });
  const pattern = bars.map((b) => b.join(" ")).join(" | ");
  const where = Array.from({ length: nBars }, (_, b) => {
    const inThisBar = counted.filter((_c, i) => Math.floor(onsets[i] / bar + 1e-9) === b);
    const said = inThisBar.length ? joinAnd(inThisBar) : "nothing (a bar of rest)";
    return nBars > 1 ? `In bar ${b + 1} the notes start on ${said}.` : `The notes start on ${said}.`;
  }).join(" ");
  return {
    prompt: `Tap this rhythm on the space bar. You get one bar of clicks to count you in.`,
    stimuli: [{ type: "rhythm", pattern, time }],
    response: { type: "tap", pattern, time, tempo, countInBeats: bar },
    expected: { type: "taps", onsets, toleranceBeats: (TAP_TOLERANCE_SECONDS * tempo) / 60 },
    explain: `${where} Hold each note for its full length; you only tap where a note begins.`,
    reveal: rhythmSound(tokens, tempo),
  };
};
