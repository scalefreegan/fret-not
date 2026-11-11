import type { Choice, Stimulus } from "../exercise-types.ts";
import { CHORDS, chordFullName, chordNotes, chordSymbol, parseChord, type ChordRef } from "../music/chords.ts";
import { fretMidi, GUITAR_SHAPES, pianoVoicing, shapeMidis } from "../music/instruments.ts";
import { intervalName, isInterval, semitones, SIMPLE_INTERVALS, transpose } from "../music/intervals.ts";
import { LETTERS, accSymbol, fromMidi, isPitchClass, parsePitchClass, pc, pcBothLabels, pcLabel, pcName, pcNameOf, pcOfClass, pitchLabel, pitchName, toMidi, type Pitch } from "../music/notes.ts";
import { parseDuration } from "../music/rhythm.ts";
import { keyOfSignature, keySignature, parseKey, scaleNotes } from "../music/scales.ts";
import type { Clef } from "../music/staff.ts";
import {
  ALL_STRINGS, arpThenChord, barBeatsOf, beatsLabel, cap, choice, durationTokens, durationWords, fillBar, fretCandidates, int, intervalLabel, joinAnd, kbRange, keyWhere, melodic, midiCandidates,
  ordinal, pBool, pList, pNum, pRange, pStr, pick, plural, posWhere, shuffle, sound, ev, staffWhere, stepWords, uniq, window5, type Body, type Generator, type Params, type Rng,
} from "./util.ts";

const clefOf = (p: Params): Clef => (pStr(p, "clef", "treble") === "bass" ? "bass" : "treble");
const DEFAULT_STAFF_RANGE: Record<Clef, [number, number]> = { treble: [60, 81], bass: [41, 60] }; // C4–A5, F2–C4

/** Every spelling a staff note-naming question can offer: each letter as a
 *  natural, a sharp and a flat, in letter order. */
const SPELLED = LETTERS.flatMap((letter) => [-1, 0, 1].map((acc) => ({ letter, acc })));

/** Spelled pitches inside a MIDI range: naturals, plus single sharps and
 *  flats when `accidentals`. Never empty. */
function staffCandidates(range: [number, number], accidentals: boolean): Pitch[] {
  const out: Pitch[] = [];
  for (let oct = -1; oct <= 9; oct++) {
    for (const letter of LETTERS) {
      for (const acc of accidentals ? [0, 1, -1] : [0]) {
        const p = { letter, acc, oct };
        const m = toMidi(p);
        if (m >= range[0] && m <= range[1]) out.push(p);
      }
    }
  }
  if (out.length) return out;
  return accidentals ? [fromMidi(range[0])] : staffCandidates(range, true);
}

/** Answer buttons for "name this note" when the note is on an instrument
 *  (one key or fret, so a black key carries both its names). */
function pcChoices(rng: Rng, midi: number, accidentals: boolean): Choice[] {
  if (!accidentals) return LETTERS.map((l) => choice(l, l));
  const all = Array.from({ length: 12 }, (_, i) => i);
  const near = [1, 2, 3, 10, 11, 9].map((d) => pc(midi + d));
  const picked = new Set([pc(midi), ...shuffle(rng, near).slice(0, 4)]);
  return all.filter((x) => picked.has(x)).map((x) => choice(pcNameOf(x), pcBothLabels(x)));
}

export const nameNote: Generator = (p, rng) => {
  const view = pStr(p, "view", "staff");
  const accidentals = pBool(p, "accidentals", false);
  if (view === "staff") {
    const clef = clefOf(p);
    const note = pick(rng, staffCandidates(pRange(p) ?? DEFAULT_STAFF_RANGE[clef], accidentals));
    const id = pcName(note);
    let choices: Choice[];
    if (!accidentals && note.acc === 0) choices = LETTERS.map((l) => choice(l, l));
    else {
      const i = SPELLED.findIndex((s) => s.letter === note.letter && s.acc === Math.max(-1, Math.min(1, note.acc)));
      choices = window5(rng, SPELLED, i).map((s) => choice(pcName(s), pcLabel(s)));
      if (!choices.some((c) => c.id === id)) choices[0] = choice(id, pcLabel(note));
    }
    return {
      prompt: "Name this note.",
      stimuli: [{ type: "staff", clef, notes: [pitchName(note)] }],
      response: { type: "choice", choices },
      expected: { type: "choice", id },
      explain: `That is ${pitchLabel(note)}: ${staffWhere({ ...note, acc: 0 }, clef)}${note.acc ? `, ${note.acc > 0 ? "raised" : "lowered"} a half step by the ${note.acc > 0 ? "sharp" : "flat"}` : ""}.`,
      reveal: melodic([toMidi(note)]),
    };
  }
  if (view === "keyboard") {
    const range = pRange(p) ?? [48, 71];
    const midi = pick(rng, midiCandidates(range, accidentals));
    const black = pcBothLabels(midi).includes("/");
    return {
      prompt: "Name the marked key.",
      stimuli: [{ type: "keyboard", range: kbRange(range[0], range[1]), marked: [midi] }],
      response: { type: "choice", choices: pcChoices(rng, midi, accidentals || black) },
      expected: { type: "choice", id: pcNameOf(midi) },
      explain: `That key is ${pcBothLabels(midi)}: ${keyWhere(midi)}.`,
      reveal: melodic([midi]),
    };
  }
  // fretboard or tab
  const maxFret = pNum(p, "maxFret", 5);
  const pos = pick(rng, fretCandidates(pList(p, "strings", ALL_STRINGS), maxFret, pRange(p), accidentals));
  const midi = fretMidi(pos);
  const black = pcBothLabels(midi).includes("/");
  const stimulus: Stimulus = view === "tab" ? { type: "tab", positions: [pos] } : { type: "fretboard", maxFret: Math.max(3, Math.min(24, Math.floor(maxFret))), marked: [pos] };
  const open = fretMidi({ string: pos.string, fret: 0 });
  return {
    prompt: view === "tab" ? "Name the note this tab asks for." : "Name the marked note.",
    stimuli: [stimulus],
    response: { type: "choice", choices: pcChoices(rng, midi, accidentals || black) },
    expected: { type: "choice", id: pcNameOf(midi) },
    explain: pos.fret === 0 ? `That is ${pcBothLabels(midi)}: ${posWhere(pos)}.` : `That is ${pcBothLabels(midi)}: ${posWhere(pos)}, ${stepWords(pos.fret)} above the open ${pcNameOf(open)}.`,
    reveal: melodic([midi], "guitar"),
  };
};

/** The intervals a declaration draws from, valid ones only; with
 *  `bySound`, one per size (a keyboard cannot tell A4 from d5). */
export function intervalPool(p: Params, bySound: boolean): string[] {
  const raw = pList<unknown>(p, "intervals", ["m2", "M2"]).filter(isInterval);
  const list = uniq(raw.length ? raw : ["m2", "M2"]);
  const sorted = [...list].sort((a, b) => semitones(a) - semitones(b));
  if (!bySound) return sorted;
  return sorted.filter((iv, i) => i === 0 || semitones(iv) !== semitones(sorted[i - 1]));
}
export function intervalChoices(rng: Rng, pool: string[], correct: string, labels: string): Choice[] {
  let offered = pool;
  if (offered.length < 2) {
    // One interval declared: a question needs something to tell it from, so
    // offer its nearest neighbours in size.
    const near = [...SIMPLE_INTERVALS].filter((iv) => semitones(iv) !== semitones(correct)).sort((a, b) => Math.abs(semitones(a) - semitones(correct)) - Math.abs(semitones(b) - semitones(correct)));
    offered = [correct, ...near.slice(0, 2)].sort((a, b) => semitones(a) - semitones(b));
  }
  return window5(rng, offered, offered.indexOf(correct)).map((iv) => choice(iv, intervalLabel(iv, labels)));
}
/** A natural lower note and a correctly spelled upper note `iv` above it. */
export function spelledInterval(rng: Rng, iv: string, lo: number, hi: number): [Pitch, Pitch] {
  const roots = staffCandidates([lo, Math.max(lo, hi - semitones(iv))], false);
  for (let i = 0; i < 20; i++) {
    const root = pick(rng, roots);
    const top = transpose(root, iv);
    if (Math.abs(top.acc) <= 1) return [root, top];
  }
  const root = roots[0];
  return [root, transpose(root, iv)];
}
function lettersBetween(a: Pitch, b: Pitch): string {
  const out: string[] = [];
  const start = LETTERS.indexOf(a.letter);
  const n = (b.oct - a.oct) * 7 + LETTERS.indexOf(b.letter) - start + 1;
  for (let i = 0; i < n && i < 15; i++) out.push(LETTERS[(start + i) % 7]);
  return out.join(" ");
}
export function intervalWhy(lo: Pitch, hi: Pitch, iv: string, labels: string): string {
  const semis = semitones(iv);
  if (labels === "steps") return `${pitchLabel(lo)} to ${pitchLabel(hi)} is ${semis === 1 ? "a half step: the very next note" : semis === 2 ? "a whole step: two half steps" : plural(semis, "half step")}.`;
  const n = lettersBetween(lo, hi);
  return `${pitchLabel(lo)} up to ${pitchLabel(hi)} is ${article(intervalName(iv))} ${intervalName(iv)}: ${plural(n.split(" ").length, "letter name")} (${n}) and ${plural(semis, "half step")}.`;
}
function article(w: string): string {
  return /^[aeiou]/i.test(w) ? "an" : "a";
}

export const nameInterval: Generator = (p, rng) => {
  const view = pStr(p, "view", "staff");
  const labels = pStr(p, "labels", "names");
  const pool = intervalPool(p, view !== "staff");
  const iv = pick(rng, pool);
  const semis = semitones(iv);
  const base: Pick<Body, "response" | "expected"> = { response: { type: "choice", choices: intervalChoices(rng, pool, iv, labels) }, expected: { type: "choice", id: iv } };
  const ask = labels === "steps" ? "How far apart are these two notes?" : "Name the interval between these two notes.";
  if (view === "fretboard") {
    const span = Math.min(semis, 12);
    const pos = { string: int(rng, 1, 6), fret: int(rng, 0, 12 - span) };
    const upper = { string: pos.string, fret: pos.fret + span };
    const lo = fretMidi(pos);
    return {
      ...base,
      prompt: ask,
      stimuli: [{ type: "fretboard", maxFret: 12, marked: [pos, upper] }],
      explain: `${pitchLabel(fromMidi(lo))} to ${pitchLabel(fromMidi(lo + span))} is ${labels === "steps" ? stepWords(semis) : `${article(intervalName(iv))} ${intervalName(iv)}`}: ${plural(span, "fret")} along one string is ${plural(span, "half step")}.`,
      reveal: sound([ev([lo], 0, 1), ev([lo + span], 1, 1), ev([lo, lo + span], 2, 2)], "guitar"),
    };
  }
  const clef = clefOf(p);
  const [lo, hi] = clef === "bass" ? spelledInterval(rng, iv, 43, 60) : spelledInterval(rng, iv, 60, 79);
  const midis = [toMidi(lo), toMidi(hi)];
  const stimulus: Stimulus = view === "keyboard" ? { type: "keyboard", range: kbRange(midis[0], midis[1]), marked: midis } : { type: "staff", clef, notes: [pitchName(lo), pitchName(hi)] };
  return {
    ...base,
    prompt: ask,
    stimuli: [stimulus],
    explain: intervalWhy(lo, hi, iv, labels),
    reveal: sound([ev([midis[0]], 0, 1), ev([midis[1]], 1, 1), ev(midis, 2, 2)]),
  };
};

/** The chords a declaration draws from: `chords`, else `roots` × `types`. */
export function chordPool(p: Params, needShape: boolean): ChordRef[] {
  const out: ChordRef[] = [];
  const add = (symbol: string) => {
    try {
      const c = parseChord(symbol);
      if (!out.some((o) => chordSymbol(o) === chordSymbol(c))) out.push(c);
    } catch {
      /* skip */
    }
  };
  const chords = Array.isArray(p.chords) ? p.chords : [];
  if (chords.length) for (const s of chords) if (typeof s === "string") add(s);
  if (!out.length) {
    const types = pList<string>(p, "types", ["maj", "min"]).filter((t) => Object.hasOwn(CHORDS, t));
    const roots = pList<unknown>(p, "roots", needShape ? ["C", "D", "E", "G", "A"] : ["C", "D", "E", "F", "G", "A"]).filter(isPitchClass);
    for (const r of roots) for (const t of types) add(pcName(parsePitchClass(r)) + CHORDS[t].suffix);
  }
  if (needShape) {
    const shaped = out.filter((c) => GUITAR_SHAPES[chordSymbol(c)]);
    if (shaped.length) return shaped;
    return ["C", "G", "D", "A", "E", "Am", "Em", "Dm"].map(parseChord);
  }
  return out.length ? out : ["C", "F", "G", "Am", "Dm", "Em"].map(parseChord);
}
export function chordWhy(c: ChordRef): string {
  const notes = chordNotes(c, 4);
  const def = CHORDS[c.type];
  const parts = def.intervals.slice(1).map((iv, i) => `${pcLabel(notes[i + 1])} ${article(intervalName(iv))} ${intervalName(iv)} above it`);
  return `${chordFullName(c)} is ${joinAnd(notes.map((n) => pcLabel(n)))}: the root ${pcLabel(notes[0])}, then ${joinAnd(parts)}.`;
}
const TRIAD_FLIP: Record<string, string[]> = { maj: ["min", "dim"], min: ["maj", "dim"], dim: ["min", "maj"], aug: ["maj", "min"], "7": ["maj7", "m7"], maj7: ["7", "m7"], m7: ["7", "maj7"] };

export const nameChord: Generator = (p, rng) => {
  const view = pStr(p, "view", "staff");
  const pool = chordPool(p, view === "diagram");
  const c = pick(rng, pool);
  const symbol = chordSymbol(c);
  let stimulus: Stimulus;
  let midis: number[];
  if (view === "diagram") {
    stimulus = { type: "diagram", chord: symbol };
    midis = shapeMidis(GUITAR_SHAPES[symbol]);
  } else if (view === "keyboard") {
    midis = pianoVoicing(symbol);
    stimulus = { type: "keyboard", range: kbRange(48, Math.max(72, ...midis)), marked: midis };
  } else {
    const notes = chordNotes(c, 4);
    midis = notes.map(toMidi);
    stimulus = { type: "staff", clef: "treble", notes: notes.map(pitchName), chord: true };
  }
  let choices: Choice[];
  let id: string;
  if (pBool(p, "qualityOnly", false)) {
    const types = uniq([...pool.map((x) => x.type), ...(uniq(pool.map((x) => x.type)).length < 2 ? (TRIAD_FLIP[c.type] ?? ["maj", "min"]).slice(0, 1) : [])]);
    const ordered = Object.keys(CHORDS).filter((t) => types.includes(t));
    choices = window5(rng, ordered, ordered.indexOf(c.type)).map((t) => choice(t, cap(CHORDS[t].name)));
    id = c.type;
  } else {
    const others = shuffle(rng, pool.filter((x) => chordSymbol(x) !== symbol));
    // Same root with another quality first: the confusion worth testing.
    others.sort((a, b) => Number(pcOfClass(b.root) === pcOfClass(c.root)) - Number(pcOfClass(a.root) === pcOfClass(c.root)));
    const picked = others.slice(0, 3);
    for (const t of TRIAD_FLIP[c.type] ?? ["maj", "min"]) {
      if (picked.length >= 3) break;
      const alt = { root: c.root, type: t };
      if (chordSymbol(alt) !== symbol && !picked.some((x) => chordSymbol(x) === chordSymbol(alt))) picked.push(alt);
    }
    choices = shuffle(rng, [c, ...picked]).map((x) => choice(chordSymbol(x), chordFullName(x)));
    id = symbol;
  }
  return {
    prompt: pBool(p, "qualityOnly", false) ? "What kind of chord is this?" : "Name this chord.",
    stimuli: [stimulus],
    response: { type: "choice", choices },
    expected: { type: "choice", id },
    explain: chordWhy(c),
    reveal: view === "diagram" ? arpThenChord(midis, "guitar", 0.03) : arpThenChord(midis),
  };
};

function clampAcc(p: Params): number {
  return Math.max(0, Math.min(7, Math.floor(pNum(p, "maxAccidentals", 3))));
}
function keyWords(key: string): string {
  const k = parseKey(key);
  return `${pcLabel(k.tonic)} ${k.mode}`;
}
function sigWords(count: number): string {
  return count === 0 ? "no sharps or flats" : plural(Math.abs(count), count > 0 ? "sharp" : "flat");
}
function sigList(key: string): string {
  const sig = keySignature(key);
  return sig.letters.map((l) => l + accSymbol(Math.sign(sig.count))).join(", ");
}
export function pickKey(p: Params, rng: Rng): { key: string; count: number; mode: "major" | "minor" } {
  const max = clampAcc(p);
  const modeParam = pStr(p, "mode", "major");
  const mode = modeParam === "both" ? pick(rng, ["major", "minor"] as const) : modeParam === "minor" ? "minor" : "major";
  const count = int(rng, -max, max);
  return { key: keyOfSignature(count, mode), count, mode };
}

export const nameKey: Generator = (p, rng) => {
  const { key, count, mode } = pickKey(p, rng);
  const both = pStr(p, "mode", "major") === "both";
  const other = mode === "major" ? "minor" : "major";
  const cands = [count - 2, count - 1, count + 1, count + 2, -count].filter((n) => n >= -7 && n <= 7 && n !== count);
  const distract = uniq(shuffle(rng, cands)).slice(0, both ? 2 : 3).map((n) => keyOfSignature(n, mode));
  if (both) distract.push(keyOfSignature(count, other));
  const choices = shuffle(rng, uniq([key, ...distract])).map((k) => choice(k, cap(keyWords(k))));
  const relative = keyOfSignature(count, other);
  return {
    prompt: both ? `Which ${mode} key has this key signature?` : `Name the ${mode} key with this key signature.`,
    stimuli: [{ type: "staff", clef: clefOf(p), notes: [], key }],
    response: { type: "choice", choices },
    expected: { type: "choice", id: key },
    explain: `${cap(sigWords(count))}${count ? ` (${sigList(key)})` : ""} is the key signature of ${keyWords(key)} (and of ${keyWords(relative)}, its relative ${other}).`,
    reveal: melodic(scaleNotes({ ...parseKey(key).tonic, oct: 4 }, mode === "minor" ? "natural-minor" : "major", true).map(toMidi), undefined, 0.5),
  };
};

const BY_LENGTH = (a: string, b: string) => parseDuration(b).beats - parseDuration(a).beats || a.localeCompare(b);

export const nameDuration: Generator = (p, rng) => {
  const values = durationTokens(pList(p, "values", ["w", "h", "q", "e"]));
  const token = pick(rng, values);
  const d = parseDuration(token);
  const ask = pStr(p, "ask", "name");
  let choices: Choice[];
  let id: string;
  if (ask === "beats") {
    const all = uniq([...values.map((v) => parseDuration(v).beats), ...(uniq(values.map((v) => parseDuration(v).beats)).length < 3 ? [4, 2, 1, 0.5] : [])]).sort((a, b) => b - a);
    choices = window5(rng, all, all.indexOf(d.beats)).map((b) => choice(String(b), cap(beatsLabel(b))));
    id = String(d.beats);
  } else {
    const sameKind = ["w", "h", "q", "e"].map((v) => v + (d.rest ? "r" : ""));
    const all = uniq([...values, ...(values.length < 3 ? sameKind : [])]).sort(BY_LENGTH);
    choices = window5(rng, all, all.indexOf(token)).map((v) => choice(v, cap(durationWords(parseDuration(v)))));
    id = token;
  }
  return {
    prompt: ask === "beats" ? `How many beats does this ${d.rest ? "rest" : "note"} last, when a quarter note gets one beat?` : `What is this ${d.rest ? "rest" : "note"} called?`,
    stimuli: [{ type: "rhythm", pattern: token, time: "4/4" }],
    response: { type: "choice", choices },
    expected: { type: "choice", id },
    explain: `That is ${article(durationWords(d))} ${durationWords(d)}: it lasts ${beatsLabel(d.beats)} when a quarter note gets one beat${d.dotted ? " (the dot adds half the note's length again)" : ""}.`,
  };
};

export const countBar: Generator = (p, rng) => {
  const time = pStr(p, "time", "4/4");
  const bar = barBeatsOf(time);
  const values = durationTokens(pList(p, "values", ["h", "q", "e"]));
  const tokens = fillBar(rng, values, bar, 2);
  const i = int(rng, 0, tokens.length - 1);
  const missing = tokens[i];
  const d = parseDuration(missing);
  const rest = tokens.filter((_, j) => j !== i);
  const sameKind = (v: string) => parseDuration(v).rest === d.rest;
  const pool = uniq([...values.filter(sameKind), ...["w", "h", "q", "e", "s"].map((v) => v + (d.rest ? "r" : ""))]);
  const distinct = pool.filter((v, j) => v === missing || (parseDuration(v).beats !== d.beats && pool.findIndex((x) => parseDuration(x).beats === parseDuration(v).beats) === j));
  const ordered = [...distinct].sort(BY_LENGTH);
  const choices = window5(rng, ordered, ordered.indexOf(missing), 4).map((v) => choice(v, cap(durationWords(parseDuration(v)))));
  const have = bar - d.beats;
  return {
    prompt: `This bar of ${time} is one ${d.rest ? "rest" : "note"} short. Which ${d.rest ? "rest" : "note"} completes it?`,
    stimuli: rest.length ? [{ type: "rhythm", pattern: rest.join(" "), time }] : [{ type: "text", text: `An empty bar of ${time}` }],
    response: { type: "choice", choices },
    expected: { type: "choice", id: missing },
    explain: `A bar of ${time} holds ${beatsLabel(bar)}. What is shown adds up to ${beatsLabel(have)}, so ${article(durationWords(d))} ${durationWords(d)} (${beatsLabel(d.beats)}) completes it.`,
  };
};

export const harmonicFrequency: Generator = (p, rng) => {
  const fundamentals = pList<number>(p, "fundamentals", [100, 110, 200, 220]).filter((f) => typeof f === "number" && f > 0);
  const f = fundamentals.length ? pick(rng, fundamentals) : 110;
  const max = Math.max(2, Math.min(16, Math.floor(pNum(p, "maxHarmonic", 5))));
  const n = int(rng, 2, max);
  const hz = (x: number) => `${Number((x).toFixed(2))} Hz`;
  const why = `The ${ordinal(n)} harmonic vibrates ${n} times as fast as the fundamental: ${n} × ${hz(f)} = ${hz(n * f)}.`;
  if (rng() < 0.5) {
    const cands = uniq([f * (n - 1), f * (n + 1), f * (n + 2), (f * n) / 2, f + n, f * n + f / 2].filter((x) => x > 0 && Math.abs(x - f * n) > 1e-9));
    const values = [f * n, ...shuffle(rng, cands).slice(0, 3)].sort((a, b) => a - b);
    return {
      prompt: `A string's fundamental is ${hz(f)}. What is the frequency of its ${ordinal(n)} harmonic?`,
      stimuli: [{ type: "text", text: hz(f) }],
      response: { type: "choice", choices: values.map((v) => choice(String(v), hz(v))) },
      expected: { type: "choice", id: String(f * n) },
      explain: why,
    };
  }
  const all = Array.from({ length: Math.max(max, 4) - 1 }, (_, i) => i + 2);
  return {
    prompt: `A string's fundamental is ${hz(f)}. Which of its harmonics has a frequency of ${hz(f * n)}?`,
    stimuli: [{ type: "text", text: `${hz(f)} → ${hz(f * n)}` }],
    response: { type: "choice", choices: window5(rng, all, all.indexOf(n)).map((k) => choice(String(k), `The ${ordinal(k)} harmonic`)) },
    expected: { type: "choice", id: String(n) },
    explain: `${hz(f * n)} ÷ ${hz(f)} = ${n}. ${why}`,
  };
};
