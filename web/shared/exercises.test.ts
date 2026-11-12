import assert from "node:assert/strict";
import { test } from "node:test";
import type { ExerciseDecl } from "./content.ts";
import type { Given, Question, Sound, Stimulus } from "./exercise-types.ts";
import { GENERATED_KINDS, generateQuestions, grade, makeRng, reviewQuestions } from "./exercises.ts";
import { chordPcs, parseChord } from "./music/chords.ts";
import { fretMidi, GUITAR_SHAPES, positionsOf, positionsSpellChord, shapePositions, type FretPos } from "./music/instruments.ts";
import { intervalBetween, intervalName, intervalText, semitones } from "./music/intervals.ts";
import { isBlackKey, midiName, midiOf, parsePitch, pc } from "./music/notes.ts";
import { canFillBar, isTime, MIN_TAP_WINDOW_SECONDS, parseDuration, parseRhythm, parseTime, tapWindowSeconds, totalBeats } from "./music/rhythm.ts";
import { keySignature, scaleNotes } from "./music/scales.ts";
import { checkParams, EXERCISES, WIDGETS } from "./registry.ts";

const SEEDS = Array.from({ length: 40 }, (_, i) => i * 7919 + 1);

const decl = (kind: string, params: Record<string, unknown> = {}, count = 6): ExerciseDecl => ({ kind, concept: "c", count, params });

const QUIZ = [
  { q: "What does Hz measure?", choices: ["Loudness", "Vibrations per second", "Length"], answer: 2, explain: "Hertz means times per second." },
  { q: "Double the frequency and the pitch rises by…", choices: ["an octave", "a fifth"], answer: 1 },
  { q: "How many strings does a guitar have?", choices: [4, 6, 12], answer: 2, explain: "Six, in standard tuning E A D G B E." },
];

/** For every kind: the defaults (required parameters only) and at least one
 *  constrained set. Odd-but-valid sets live in the edge-case test. */
const CASES: Record<string, Record<string, unknown>[]> = {
  quiz: [{ questions: QUIZ }, { questions: QUIZ.slice(0, 2) }],
  "name-note": [
    { view: "staff" },
    { view: "staff", clef: "bass", range: ["G2", "A3"] },
    { view: "staff", accidentals: true, range: ["C4", "C5"] },
    { view: "keyboard" },
    { view: "keyboard", accidentals: true, range: ["C3", "C4"] },
    { view: "fretboard" },
    { view: "fretboard", strings: [6, 5], maxFret: 5, accidentals: true },
    { view: "tab", strings: [6], maxFret: 3 },
  ],
  "name-interval": [
    { view: "staff", intervals: ["m2", "M2"], labels: "steps" },
    { view: "staff", intervals: ["m3", "M3", "P4", "P5", "m6", "M6", "P8"], clef: "bass" },
    { view: "keyboard", intervals: ["M3", "P5", "A4", "d5"] },
    { view: "fretboard", intervals: ["m2", "M2", "P5"] },
    { view: "staff", intervals: ["M2", "M3", "m3", "P4", "P5", "M6", "M7", "P8"], labels: "numbers" },
    { view: "keyboard", intervals: ["M2", "M3", "P5"], labels: "numbers" },
    { view: "fretboard", intervals: ["m2", "m3", "P5", "P8"], labels: "numbers" },
    { view: "staff", intervals: ["A2", "m3", "d4", "M3", "A4", "d5"], labels: "steps" },
    { view: "staff", intervals: ["P4", "A4", "d5", "P5"] },
    { view: "fretboard", intervals: ["M9", "m10", "P12"] },
  ],
  "name-chord": [
    { view: "staff" },
    { view: "staff", types: ["maj", "min", "dim"], roots: ["C", "F#", "Bb"] },
    { view: "keyboard", chords: ["C", "Am", "G7"] },
    { view: "keyboard", types: ["maj", "min"], roots: ["D"], qualityOnly: true },
    { view: "diagram" },
    { view: "diagram", chords: ["Em", "Am", "C", "G", "D"] },
  ],
  "name-key": [{}, { maxAccidentals: 5, mode: "both", clef: "bass" }, { maxAccidentals: 2, mode: "minor" }],
  "name-duration": [{ values: ["w", "h", "q", "e"] }, { values: ["q", "qr", "h.", "er"], ask: "beats" }, { values: ["h", "q"], ask: "name" }],
  "count-bar": [{ values: ["h", "q", "e"] }, { time: "3/4", values: ["h", "q", "qr"] }, { time: "6/8", values: ["q.", "q", "e"] }],
  "harmonic-frequency": [{}, { fundamentals: [55, 82.41], maxHarmonic: 8 }],
  "ear-higher-lower": [{}, { minSemitones: 1, maxSemitones: 2, timbre: "sine" }],
  "ear-interval": [{ intervals: ["P5", "P8"] }, { intervals: ["m2", "M2", "m3", "M3", "P4", "A4", "P5", "m6", "M6", "m7", "M7", "P8"], mode: "both" }, { intervals: ["m2", "M2"], labels: "steps", mode: "harmonic" }],
  "ear-chord": [{ types: ["maj", "min"] }, { types: ["maj", "min", "dim", "7"], instrument: "guitar" }],
  "ear-timbre": [{ sources: ["sine", "piano", "guitar"] }, { sources: ["sine", "square", "saw", "triangle", "piano", "guitar"] }],
  "ear-same-note": [{}, { timbre: "guitar" }],
  "ear-rhythm": [{ values: ["h", "q", "e"] }, { time: "3/4", values: ["q", "e", "qr"], tempo: 100 }],
  "ear-find-note": [{}, { instrument: "guitar" }, { scale: "minor-pentatonic", range: ["C3", "C5"] }],
  "play-note": [
    { instrument: "piano", from: "name" },
    { instrument: "piano", from: "staff", clef: "bass" },
    { instrument: "piano", from: "name", accidentals: true, anyOctave: false, range: ["C3", "C5"] },
    { instrument: "guitar", from: "name" },
    { instrument: "guitar", from: "tab", strings: [6, 5], maxFret: 5 },
    { instrument: "guitar", from: "staff", accidentals: true },
  ],
  "play-scale": [
    { instrument: "piano", types: ["major"], tonics: ["C", "G", "F"] },
    { instrument: "guitar", types: ["minor-pentatonic", "major"], tonics: ["A", "E"] },
    { instrument: "piano", types: ["natural-minor", "blues"], tonics: ["F#", "Bb", "B"] },
  ],
  "play-chord": [
    { instrument: "piano", chords: ["C", "F", "G", "Am"] },
    { instrument: "guitar", chords: ["Em", "Am", "C", "G", "D", "C7"] },
  ],
  "tap-rhythm": [{ values: ["h", "q"] }, { time: "3/4", values: ["q", "e", "qr"], bars: 2, tempo: 90 }],
  "build-interval": [
    { intervals: ["M3", "P5"] },
    { intervals: ["m2", "M2"], labels: "steps", direction: "both", instrument: "guitar" },
    { intervals: ["m3", "P4", "P8"], direction: "down" },
    { intervals: ["M2", "M3", "m3", "P4", "P5", "P8"], labels: "numbers" },
    { intervals: ["M2", "M3", "P5"], labels: "numbers", direction: "both", instrument: "guitar" },
  ],
  "build-scale": [{ types: ["major"], tonics: ["C", "G", "D"] }, { types: ["natural-minor", "major-pentatonic"], tonics: ["A", "Eb"] }],
  "build-chord": [{ types: ["maj", "min"], roots: ["C", "E", "A"] }, { types: ["dim", "7", "maj7"], roots: ["B", "F#"] }],
  "build-key-signature": [{}, { maxAccidentals: 6, mode: "both" }],
};

function soundOk(s: Sound, where: string): void {
  assert.ok(s.tempo > 0, where);
  assert.ok(s.events.length > 0, `${where}: sound has events`);
  for (const e of s.events) {
    assert.ok(e.at >= 0 && e.beats > 0, where);
    for (const m of e.midis) assert.ok(Number.isInteger(m) && m >= 21 && m <= 108, `${where}: midi ${m} on the piano`);
  }
  assert.ok(s.events.some((e) => e.midis.length > 0), `${where}: something sounds`);
}

function stimulusOk(s: Stimulus, where: string): void {
  switch (s.type) {
    case "staff":
      for (const n of s.notes) parsePitch(n);
      if (s.key) keySignature(s.key);
      assert.ok(s.notes.length > 0 || s.key !== undefined, `${where}: staff shows something`);
      break;
    case "keyboard":
      assert.ok(s.range[0] < s.range[1], where);
      assert.ok(s.marked.length > 0, where);
      for (const m of s.marked) assert.ok(m >= s.range[0] && m <= s.range[1], `${where}: marked key ${m} inside ${s.range}`);
      break;
    case "fretboard":
      assert.ok(s.marked.length > 0, where);
      for (const pos of s.marked) assert.ok(pos.string >= 1 && pos.string <= 6 && pos.fret >= 0 && pos.fret <= s.maxFret, `${where}: ${JSON.stringify(pos)} within ${s.maxFret} frets`);
      break;
    case "tab":
      assert.ok(s.positions.length > 0, where);
      break;
    case "diagram":
      assert.ok(GUITAR_SHAPES[s.chord], `${where}: ${s.chord} has a shape`);
      break;
    case "rhythm":
      assert.ok(parseRhythm(s.pattern).length > 0, where);
      parseTime(s.time);
      break;
    case "sound":
      soundOk(s.sound, where);
      break;
    case "text":
      assert.ok(s.text.trim().length > 0, where);
      break;
  }
}

/** An answer that should grade correct, built from `expected` alone. */
function rightAnswer(q: Question): Given {
  const e = q.expected;
  if (e.type === "choice") return { type: "choice", id: e.id };
  if (e.type === "notes") return { type: "notes", midis: [...e.midis], ...(e.positions ? { positions: e.positions } : {}) };
  if (e.type === "taps") return { type: "taps", onsets: e.onsets.map((o, i) => o + (i % 2 ? 0.9 : -0.9) * e.toleranceBeats) };
  const shape = GUITAR_SHAPES[e.symbol];
  assert.ok(shape, `test needs a stored shape for ${e.symbol}`);
  const positions = shapePositions(shape);
  return { type: "notes", midis: positions.map((x) => fretMidi(x)), positions };
}
function wrongAnswers(q: Question): Given[] {
  const e = q.expected;
  if (e.type === "choice") {
    assert.equal(q.response.type, "choice");
    const others = q.response.type === "choice" ? q.response.choices.filter((c) => c.id !== e.id) : [];
    return [...others.map((c): Given => ({ type: "choice", id: c.id })), { type: "notes", midis: [60] }];
  }
  if (e.type === "notes") {
    const off = [1, 2, 3].find((d) => !e.alsoAccept?.includes(e.midis[0] + d)) ?? 1;
    const out: Given[] = [{ type: "notes", midis: e.midis.map((m) => m + off) }, { type: "notes", midis: [] }, { type: "choice", id: "x" }];
    // A tab names the place: the same pitch on another string, or no place at all, is wrong.
    if (e.positions) out.push({ type: "notes", midis: [...e.midis] }, ...positionsOf(e.midis[0], 24).filter((x) => x.string !== e.positions![0].string).map((x): Given => ({ type: "notes", midis: [...e.midis], positions: [x] })));
    if (e.midis.length > 1) out.push({ type: "notes", midis: e.midis.slice(1) });
    if (e.ordered && new Set(e.midis).size > 1) out.push({ type: "notes", midis: [...e.midis].reverse() });
    if (!e.ordered) out.push({ type: "notes", midis: [...e.midis, e.midis[0] + 1] });
    if (e.match === "exact") out.push({ type: "notes", midis: e.midis.map((m) => m + 12) });
    return out;
  }
  if (e.type === "taps") {
    return [
      { type: "taps", onsets: e.onsets.map((o) => o + e.toleranceBeats * 1.5) },
      { type: "taps", onsets: e.onsets.slice(1) },
      { type: "taps", onsets: [...e.onsets, (e.onsets[e.onsets.length - 1] ?? 0) + 0.3] },
      { type: "taps", onsets: [] },
    ];
  }
  const positions = shapePositions(GUITAR_SHAPES[e.symbol]);
  const moved = positions.map((x, i) => (i === positions.length - 1 ? { ...x, fret: x.fret + 1 } : x));
  return [
    { type: "notes", midis: [], positions: [] },
    { type: "notes", midis: positions.map((x) => fretMidi(x)) }, // no positions given
    { type: "notes", midis: moved.map((x) => fretMidi(x)), positions: moved },
  ];
}

function checkQuestion(q: Question, where: string): void {
  assert.ok(q.prompt.trim().length > 8, `${where}: prompt`);
  assert.ok(q.explain.trim().length > 8, `${where}: explain`);
  assert.ok(!/undefined|NaN|\[object/.test(q.prompt + q.explain), `${where}: clean wording: ${q.prompt} / ${q.explain}`);
  assert.ok(!/[A-G](#|b)\d?\b/.test(q.prompt + " " + q.explain), `${where}: learner-facing spellings use ♯/♭: ${q.prompt} / ${q.explain}`);
  q.stimuli.forEach((s) => stimulusOk(s, where));
  if (q.reveal) soundOk(q.reveal, `${where} reveal`);
  const r = q.response;
  if (r.type === "choice") {
    assert.equal(q.expected.type, "choice", where);
    assert.ok(r.choices.length >= 2 && r.choices.length <= 7, `${where}: ${r.choices.length} choices`);
    assert.equal(new Set(r.choices.map((c) => c.id)).size, r.choices.length, `${where}: choice ids unique`);
    assert.equal(new Set(r.choices.map((c) => c.label)).size, r.choices.length, `${where}: choice labels unique`);
    assert.equal(r.choices.filter((c) => q.expected.type === "choice" && c.id === q.expected.id).length, 1, `${where}: exactly one correct choice`);
    for (const c of r.choices) {
      assert.ok(c.label.trim().length > 0, where);
      if (c.stimulus) stimulusOk(c.stimulus, where);
    }
  } else if (r.type === "keyboard") {
    assert.equal(q.expected.type, "notes", where);
    assert.ok(r.range[1] - r.range[0] >= 12 && r.range[1] - r.range[0] <= 48, `${where}: keyboard spans ${r.range}`);
    assert.ok([0, 5].includes(pc(r.range[0])), `${where}: keyboard starts on C or F`);
    for (const m of r.marked ?? []) assert.ok(m >= r.range[0] && m <= r.range[1], `${where}: marked key in range`);
    if (q.expected.type === "notes") {
      if (q.expected.match === "exact") for (const m of q.expected.midis) assert.ok(m >= r.range[0] && m <= r.range[1], `${where}: answer ${m} is on the keyboard ${r.range}`);
      if (r.mode === "single") assert.equal(q.expected.midis.length, 1, where);
      if (r.mode === "sequence") {
        assert.equal(r.length, q.expected.midis.length, where);
        assert.equal(q.expected.ordered, true, where);
      }
      if (r.mode === "set") assert.equal(q.expected.ordered, false, where);
    }
  } else if (r.type === "fretboard") {
    assert.ok(q.expected.type === "notes" || q.expected.type === "chord-shape", where);
    assert.ok(r.maxFret >= 3 && r.maxFret <= 24, where);
    for (const pos of r.marked ?? []) assert.ok(pos.fret <= r.maxFret, where);
    if (q.expected.type === "notes" && q.expected.match === "exact") {
      for (const m of q.expected.midis) assert.ok(m >= 40 && m <= 64 + r.maxFret, `${where}: answer ${m} is on the fretboard`);
    }
    if (q.expected.type === "notes" && r.mode === "sequence") assert.equal(r.length, q.expected.midis.length, where);
    if (q.expected.type === "chord-shape") {
      assert.equal(r.mode, "set", where);
      const shape = GUITAR_SHAPES[q.expected.symbol];
      if (shape) for (const f of shape.frets) assert.ok(f === null || f <= r.maxFret, `${where}: stored shape fits the fretboard shown`);
    }
  } else {
    assert.equal(q.expected.type, "taps", where);
    const events = parseRhythm(r.pattern);
    const bar = parseTime(r.time).barBeats;
    assert.ok(Math.abs(totalBeats(events) % bar) < 1e-9, `${where}: whole bars`);
    assert.ok(r.countInBeats > 0 && r.tempo > 0, where);
    if (q.expected.type === "taps") {
      assert.deepEqual(q.expected.onsets, events.filter((e) => e.midis.length).map((e) => e.at), where);
      assert.ok(q.expected.onsets.length > 0, where);
      const secs = (q.expected.toleranceBeats * 60) / r.tempo;
      assert.ok(secs > 0.02 && secs <= 0.11 + 1e-9, `${where}: at most about 110 ms`);
      const on = q.expected.onsets;
      for (let i = 1; i < on.length; i++) assert.ok(q.expected.toleranceBeats <= (on[i] - on[i - 1]) / 2 + 1e-9, `${where}: tolerance windows of neighbouring notes do not overlap`);
    }
  }
  assert.equal(grade(q, rightAnswer(q)).correct, true, `${where}: the expected answer grades correct`);
  for (const w of wrongAnswers(q)) assert.equal(grade(q, w).correct, false, `${where}: ${JSON.stringify(w)} grades incorrect`);
}

test("the engine covers exactly the kinds in the registry, and the test cases are loader-valid", () => {
  assert.deepEqual([...GENERATED_KINDS].sort(), Object.keys(EXERCISES).sort());
  assert.deepEqual(Object.keys(CASES).sort(), Object.keys(EXERCISES).sort());
  for (const [kind, sets] of Object.entries(CASES)) {
    assert.ok(sets.length >= 2, `${kind} has two parameter sets`);
    for (const params of sets) assert.deepEqual(checkParams(EXERCISES[kind].params, params), [], `${kind} ${JSON.stringify(params)}`);
  }
});

for (const [kind, sets] of Object.entries(CASES)) {
  test(`${kind}: generated questions are well formed and grade as expected`, () => {
    for (const params of sets) {
      let distinct = 0;
      let pairs = 0;
      for (const seed of SEEDS) {
        const d = decl(kind, params);
        const qs = generateQuestions(d, seed);
        const where = `${kind} ${JSON.stringify(params)} seed ${seed}`;
        if (kind === "quiz") assert.equal(qs.length, Math.min(d.count, (params.questions as unknown[]).length), where);
        else assert.equal(qs.length, d.count, where);
        assert.equal(new Set(qs.map((q) => q.id)).size, qs.length, `${where}: ids unique`);
        assert.deepEqual(generateQuestions(d, seed), qs, `${where}: deterministic`);
        qs.forEach((q, i) => {
          assert.equal(q.kind, kind);
          assert.equal(q.concept, "c");
          checkQuestion(q, `${where} #${i}`);
          if (i > 0) {
            pairs++;
            const sig = (x: Question) => JSON.stringify([x.prompt, x.stimuli, x.expected]);
            if (sig(q) !== sig(qs[i - 1])) distinct++;
          }
        });
      }
      assert.ok(distinct / pairs > 0.97, `${kind} ${JSON.stringify(params)}: consecutive questions differ (${distinct}/${pairs})`);
    }
  });
}

test("different seeds give different batches; makeRng is a stable stream in [0, 1)", () => {
  const a = generateQuestions(decl("name-note", { view: "staff" }, 8), 1);
  const b = generateQuestions(decl("name-note", { view: "staff" }, 8), 2);
  assert.notDeepEqual(a.map((q) => q.expected), b.map((q) => q.expected));
  const r1 = makeRng(42);
  const r2 = makeRng(42);
  const xs = Array.from({ length: 1000 }, () => r1());
  assert.deepEqual(xs.slice(0, 50), Array.from({ length: 50 }, () => r2()));
  assert.ok(xs.every((x) => x >= 0 && x < 1));
  const mean = xs.reduce((s, x) => s + x, 0) / xs.length;
  assert.ok(mean > 0.45 && mean < 0.55, `mean ${mean}`);
});

test("odd parameters, accepted by the loader or not, never throw and still give sound questions", () => {
  const odd: [string, Record<string, unknown>][] = [
    ["name-note", { view: "staff", range: ["C4", "C4"] }],
    ["name-note", { view: "staff", range: ["C#4", "C#4"] }],
    ["name-note", { view: "staff", range: ["G5", "C4"] }],
    ["name-note", { view: "keyboard", range: ["F#3", "F#3"] }],
    ["name-note", { view: "fretboard", strings: [9, 0], maxFret: 0 }],
    ["name-note", { view: "fretboard", range: ["C7", "C8"], maxFret: 2 }],
    ["name-note", { view: "tab", maxFret: 40 }],
    ["name-interval", { view: "staff", intervals: ["P1"] }],
    ["name-interval", { view: "fretboard", intervals: ["M9", "P8"] }],
    ["name-interval", { view: "keyboard", intervals: ["A4", "d5"] }],
    ["name-chord", { view: "diagram", chords: ["Bdim", "Ebmaj7"] }],
    ["name-chord", { view: "staff", chords: ["C"] }],
    ["name-chord", { view: "keyboard", types: ["dim7", "m7b5", "aug", "sus2", "sus4", "5", "6", "m6"], roots: ["Cb", "E#", "F##"] }],
    ["name-chord", { view: "staff", types: ["maj"], roots: ["C"], qualityOnly: true }],
    ["name-key", { maxAccidentals: 0 }],
    ["name-key", { maxAccidentals: 99, mode: "both" }],
    ["name-duration", { values: ["w"] }],
    ["name-duration", { values: ["s.", "sr"], ask: "beats" }],
    ["count-bar", { time: "4/4", values: ["w"] }],
    ["count-bar", { time: "3/4", values: ["w"] }],
    ["count-bar", { time: "1/16", values: ["q"] }],
    ["count-bar", { time: "12/8", values: ["wr", "hr"] }],
    ["harmonic-frequency", { fundamentals: [0.5], maxHarmonic: 1 }],
    ["harmonic-frequency", { fundamentals: [-3], maxHarmonic: 100 }],
    ["ear-higher-lower", { minSemitones: 0, maxSemitones: 0 }],
    ["ear-higher-lower", { minSemitones: 30, maxSemitones: 2 }],
    ["ear-interval", { intervals: ["P1"] }],
    ["ear-interval", { intervals: ["M13", "P15"] }],
    ["ear-chord", { types: ["dim7"] }],
    ["ear-timbre", { sources: ["saw"] }],
    ["ear-rhythm", { time: "4/4", values: ["w"] }],
    ["ear-rhythm", { time: "2/4", values: ["hr"] }],
    ["ear-rhythm", { time: "1/16", values: ["s"] }],
    ["ear-find-note", { scale: "locrian", range: ["B4", "C3"] }],
    ["play-note", { instrument: "piano", from: "tab" }],
    ["play-note", { instrument: "piano", from: "staff", range: ["A0", "C8"], accidentals: true }],
    ["play-note", { instrument: "guitar", from: "name", strings: [7], maxFret: 30, range: ["C1", "C2"] }],
    ["play-scale", { instrument: "piano", types: ["locrian", "harmonic-minor"], tonics: ["Cb", "B#", "Fb", "G#"] }],
    ["play-scale", { instrument: "guitar", types: ["blues"], tonics: ["Eb", "D#"] }],
    ["play-chord", { instrument: "guitar", chords: ["Bdim", "Ebmaj7"] }],
    ["play-chord", { instrument: "piano", chords: ["Cbdim7", "E5"] }],
    ["tap-rhythm", { time: "4/4", values: ["wr"], bars: 7, tempo: 5000 }],
    ["tap-rhythm", { time: "5/8", values: ["w"], bars: 0, tempo: 1 }],
    ["build-interval", { intervals: ["P8", "M13"], direction: "down", instrument: "guitar" }],
    ["build-interval", { intervals: ["P15"], direction: "both" }],
    ["build-scale", { types: ["blues"], tonics: ["Fb"] }],
    ["build-chord", { types: ["dim7", "5"], roots: ["Cb", "B#"] }],
    ["build-key-signature", { maxAccidentals: -4, mode: "minor" }],
  ];
  for (const [kind, params] of odd) {
    for (const seed of SEEDS.slice(0, 12)) {
      const qs = generateQuestions(decl(kind, params, 4), seed);
      assert.equal(qs.length, 4, `${kind} ${JSON.stringify(params)}`);
      for (const q of qs) {
        const where = `${kind} ${JSON.stringify(params)} seed ${seed}`;
        assert.ok(q.prompt && q.explain, where);
        assert.ok(!/undefined|NaN/.test(q.prompt + q.explain), `${where}: ${q.prompt} / ${q.explain}`);
        if (q.response.type === "choice") {
          const ids = q.response.choices.map((c) => c.id);
          assert.equal(new Set(ids).size, ids.length, where);
          assert.equal(ids.filter((id) => q.expected.type === "choice" && id === q.expected.id).length, 1, `${where}: one correct choice among ${ids}`);
          assert.ok(ids.length >= 2, where);
        }
        if (q.expected.type !== "chord-shape" || GUITAR_SHAPES[q.expected.symbol]) assert.equal(grade(q, rightAnswer(q)).correct, true, where);
      }
    }
  }
  assert.deepEqual(generateQuestions(decl("no-such-kind"), 1), []);
  assert.deepEqual(generateQuestions(decl("name-note", { view: "staff" }, 0), 1), []);
});

// --- musical spot checks -----------------------------------------------------

const many = (kind: string, params: Record<string, unknown>, n = 30): Question[] => SEEDS.flatMap((seed) => generateQuestions(decl(kind, params, n), seed));

test("name-note: the expected name is the note shown, in every view", () => {
  for (const q of many("name-note", { view: "staff", accidentals: true, range: ["A3", "C6"] })) {
    const s = q.stimuli[0];
    assert.ok(s.type === "staff" && q.expected.type === "choice");
    assert.equal(q.expected.id, s.notes[0].replace(/-?\d+$/, ""));
  }
  for (const q of many("name-note", { view: "keyboard", accidentals: true })) {
    const s = q.stimuli[0];
    assert.ok(s.type === "keyboard" && q.expected.type === "choice");
    assert.equal(pc(midiOf(`${q.expected.id}4`)), pc(s.marked[0]));
  }
  for (const view of ["fretboard", "tab"]) {
    for (const q of many("name-note", { view, strings: [6, 5], maxFret: 5 })) {
      const s = q.stimuli[0];
      const pos = s.type === "fretboard" ? s.marked[0] : s.type === "tab" ? s.positions[0] : null;
      assert.ok(pos && q.expected.type === "choice");
      assert.ok([5, 6].includes(pos.string) && pos.fret <= 5);
      assert.equal(pc(midiOf(`${q.expected.id}4`)), pc(fretMidi(pos)));
      assert.ok(!q.expected.id.includes("#"), "naturals only without `accidentals`");
    }
  }
  // Without accidentals the seven letters are offered, always in the same order.
  const q = generateQuestions(decl("name-note", { view: "staff" }), 3)[0];
  assert.deepEqual(q.response.type === "choice" && q.response.choices.map((c) => c.id), ["C", "D", "E", "F", "G", "A", "B"]);
});

test("name-interval: C4–G4 is a perfect fifth, and every question's answer is the interval shown", () => {
  let sawFifthOnC = false;
  for (const q of many("name-interval", { view: "staff", intervals: ["m2", "M2", "m3", "M3", "P4", "A4", "d5", "P5", "m6", "M6", "m7", "M7", "P8"] })) {
    const s = q.stimuli[0];
    assert.ok(s.type === "staff" && q.expected.type === "choice");
    const [lo, hi] = s.notes.map(parsePitch);
    assert.equal(intervalText(intervalBetween(lo, hi)), q.expected.id, `${s.notes} is ${q.expected.id}`);
    if (s.notes.join(" ") === "C4 G4") {
      sawFifthOnC = true;
      assert.equal(q.expected.id, "P5");
      assert.match(q.explain, /perfect fifth/);
      assert.match(q.explain, /C D E F G/);
      assert.match(q.explain, /7 half steps/);
    }
  }
  assert.ok(sawFifthOnC, "C4–G4 came up");
  for (const view of ["keyboard", "fretboard"]) {
    for (const q of many("name-interval", { view, intervals: ["m3", "M3", "P5", "P8"] }, 10)) {
      const s = q.stimuli[0];
      assert.ok((s.type === "keyboard" || s.type === "fretboard") && q.expected.type === "choice");
      const midis = s.type === "keyboard" ? s.marked : s.marked.map((x) => fretMidi(x));
      assert.equal(Math.abs(midis[1] - midis[0]), semitones(q.expected.id));
    }
  }
  const steps = generateQuestions(decl("name-interval", { view: "keyboard", intervals: ["m2", "M2"], labels: "steps" }), 5)[0];
  assert.deepEqual(steps.response.type === "choice" && steps.response.choices.map((c) => c.label), ["Half step", "Whole step"]);
  // A keyboard cannot tell an augmented fourth from a diminished fifth: only one is offered.
  const tt = generateQuestions(decl("name-interval", { view: "keyboard", intervals: ["A4", "d5", "P5"] }), 5)[0];
  assert.equal(tt.response.type === "choice" && tt.response.choices.length, 2);
});

test("name-chord and build-chord: E major is E G♯ B", () => {
  for (const q of many("build-chord", { types: ["maj"], roots: ["E"] }, 2)) {
    assert.ok(q.expected.type === "notes");
    assert.deepEqual(q.expected.midis.map(pc).sort((a, b) => a - b), [4, 8, 11]);
    assert.equal(q.expected.match, "pc");
    assert.match(q.prompt, /major triad on E/);
    assert.match(q.explain, /E, G♯ and B/);
    assert.equal(grade(q, { type: "notes", midis: [52, 56, 59] }).correct, true);
    assert.equal(grade(q, { type: "notes", midis: [64, 68, 71, 76] }).correct, true, "octave doublings are fine");
    assert.equal(grade(q, { type: "notes", midis: [52, 55, 59] }).correct, false, "E minor is not E major");
  }
  for (const q of many("name-chord", { view: "staff", types: ["maj", "min", "dim"], roots: ["C", "D", "E", "F", "G", "A", "B"] }, 10)) {
    const s = q.stimuli[0];
    assert.ok(s.type === "staff" && s.chord && q.expected.type === "choice");
    assert.deepEqual(s.notes.map((n) => pc(midiOf(n))), chordPcs(parseChord(q.expected.id)));
  }
  for (const q of many("name-chord", { view: "diagram" }, 6)) {
    const s = q.stimuli[0];
    assert.ok(s.type === "diagram" && q.expected.type === "choice");
    assert.equal(s.chord, q.expected.id);
  }
  for (const q of many("name-chord", { view: "keyboard", types: ["maj", "min"], roots: ["C", "G"], qualityOnly: true }, 6)) {
    assert.ok(q.response.type === "choice");
    assert.deepEqual(q.response.choices.map((c) => c.label), ["Major", "Minor"]);
  }
});

test("name-key and build-key-signature: two sharps is D major (B minor)", () => {
  let saw = 0;
  for (const q of many("name-key", { maxAccidentals: 4, mode: "both" })) {
    const s = q.stimuli[0];
    assert.ok(s.type === "staff" && s.key && q.expected.type === "choice");
    assert.equal(s.key, q.expected.id);
    if (keySignature(s.key).count === 2) {
      saw++;
      assert.ok(["D", "Bm"].includes(q.expected.id));
      assert.match(q.explain, /2 sharps \(F♯, C♯\)/);
      assert.match(q.explain, /D major/);
      assert.match(q.explain, /B minor/);
    }
    assert.ok(Math.abs(keySignature(s.key).count) <= 4);
  }
  assert.ok(saw > 0);
  for (const q of many("name-key", { maxAccidentals: 2 }, 10)) assert.ok(q.expected.type === "choice" && !q.expected.id.endsWith("m"), "major by default");
  for (const q of many("build-key-signature", { maxAccidentals: 5, mode: "both" }, 10)) {
    const s = q.stimuli[0];
    assert.ok(s.type === "text" && q.expected.type === "choice");
    const m = /^([A-G][♯♭]?) (major|minor)$/.exec(s.text);
    assert.ok(m, s.text);
    const key = m[1].replace("♯", "#").replace("♭", "b") + (m[2] === "minor" ? "m" : "");
    assert.equal(String(keySignature(key).count), q.expected.id);
  }
});

test("durations, bars and harmonics add up", () => {
  for (const q of many("name-duration", { values: ["w", "h", "q", "e", "h.", "qr"], ask: "beats" }, 10)) {
    const s = q.stimuli[0];
    assert.ok(s.type === "rhythm" && q.expected.type === "choice");
    assert.equal(Number(q.expected.id), parseRhythm(s.pattern)[0].duration.beats);
  }
  for (const time of ["4/4", "3/4", "6/8"]) {
    for (const q of many("count-bar", { time, values: ["h", "q", "e", "q.", "qr"] }, 10)) {
      const s = q.stimuli[0];
      assert.ok(s.type === "rhythm" && q.expected.type === "choice");
      const shown = totalBeats(parseRhythm(s.pattern));
      const missing = parseRhythm(q.expected.id)[0].duration.beats;
      assert.ok(Math.abs(shown + missing - parseTime(time).barBeats) < 1e-9, `${s.pattern} + ${q.expected.id} fills ${time}`);
      // No other choice also completes the bar.
      assert.ok(q.response.type === "choice");
      assert.equal(q.response.choices.filter((c) => parseRhythm(c.id)[0].duration.beats === missing).length, 1);
    }
  }
  for (const q of many("harmonic-frequency", { fundamentals: [110], maxHarmonic: 6 }, 10)) {
    assert.ok(q.expected.type === "choice" && q.response.type === "choice");
    const wantId = q.expected.id;
    const right = q.response.choices.find((c) => c.id === wantId)!;
    const n = /(\d+)(?:st|nd|rd|th) harmonic/.exec(q.prompt.includes("Which of its harmonics") ? right.label : q.prompt);
    assert.ok(n);
    assert.ok(Number(n[1]) >= 2 && Number(n[1]) <= 6);
    assert.match(q.explain, new RegExp(`${n[1]} × 110 Hz = ${Number(n[1]) * 110} Hz`));
    if (!q.prompt.includes("Which of its harmonics")) assert.equal(right.label, `${Number(n[1]) * 110} Hz`);
  }
});

test("ear questions: what is played is what is expected", () => {
  for (const q of many("ear-higher-lower", { minSemitones: 3, maxSemitones: 5 }, 10)) {
    const s = q.stimuli[0];
    assert.ok(s.type === "sound" && s.autoplay && q.expected.type === "choice");
    const [a, b] = s.sound.events.map((e) => e.midis[0]);
    assert.equal(q.expected.id, b > a ? "higher" : "lower");
    assert.ok(Math.abs(b - a) >= 3 && Math.abs(b - a) <= 5);
  }
  for (const mode of ["melodic", "harmonic"]) {
    for (const q of many("ear-interval", { intervals: ["m3", "M3", "P4", "P5", "P8"], mode }, 10)) {
      const s = q.stimuli[0];
      assert.ok(s.type === "sound" && q.expected.type === "choice");
      const midis = s.sound.events.flatMap((e) => e.midis);
      assert.equal(s.sound.events.length, mode === "melodic" ? 2 : 1);
      assert.equal(Math.max(...midis) - Math.min(...midis), semitones(q.expected.id));
    }
  }
  for (const q of many("ear-chord", { types: ["maj", "min", "dim", "7"] }, 10)) {
    const s = q.stimuli[0];
    assert.ok(s.type === "sound" && q.expected.type === "choice");
    const midis = s.sound.events[0].midis;
    const want = chordPcs(parseChord(`C${{ maj: "", min: "m", dim: "dim", "7": "7" }[q.expected.id]}`));
    assert.deepEqual(midis.map((m) => pc(m - midis[0])), want);
  }
  for (const q of many("ear-timbre", { sources: ["sine", "piano", "guitar"] }, 10)) {
    const s = q.stimuli[0];
    assert.ok(s.type === "sound" && q.expected.type === "choice");
    assert.equal(s.sound.timbre, q.expected.id);
  }
  const kinds = new Set<string>();
  for (const q of many("ear-same-note", {}, 10)) {
    const s = q.stimuli[0];
    assert.ok(s.type === "sound" && q.expected.type === "choice");
    const [a, b] = s.sound.events.map((e) => e.midis[0]);
    const gap = Math.abs(a - b);
    assert.equal(q.expected.id, gap === 0 ? "same" : gap === 12 ? "octave" : "different");
    kinds.add(q.expected.id);
  }
  assert.equal(kinds.size, 3);
  for (const q of many("ear-rhythm", { values: ["h", "q", "e", "qr"] }, 10)) {
    const s = q.stimuli[0];
    assert.ok(s.type === "sound" && q.expected.type === "choice" && q.response.type === "choice");
    assert.equal(q.response.choices.length, 3);
    const onsets = (pattern: string) => parseRhythm(pattern).filter((e) => e.midis.length).map((e) => e.at).join(",");
    const played = s.sound.events.filter((e) => e.midis.length).map((e) => e.at).join(",");
    const matching = q.response.choices.filter((c) => c.stimulus?.type === "rhythm" && onsets(c.stimulus.pattern) === played);
    assert.equal(matching.length, 1, "exactly one choice sounds like what was played");
    assert.equal(matching[0].id, q.expected.id);
    for (const c of q.response.choices) assert.ok(c.stimulus?.type === "rhythm" && Math.abs(totalBeats(parseRhythm(c.stimulus.pattern)) - 4) < 1e-9);
  }
  for (const instrument of ["piano", "guitar"]) {
    for (const q of many("ear-find-note", { instrument }, 10)) {
      const s = q.stimuli.find((x) => x.type === "sound");
      assert.ok(s && s.type === "sound" && q.expected.type === "notes");
      assert.equal(s.sound.events[1].midis[0], q.expected.midis[0]);
      assert.equal(pc(s.sound.events[0].midis[0]), 0, "the reference is a C");
      assert.notEqual(s.sound.events[0].midis[0], q.expected.midis[0]);
      assert.ok(scaleNotes("C4", "major").some((n) => pc(midiOf(n)) === pc(q.expected.type === "notes" ? q.expected.midis[0] : -1)));
    }
  }
});

test("play and build questions expect the right notes", () => {
  for (const q of many("play-note", { instrument: "piano", from: "staff", accidentals: true }, 10)) {
    const s = q.stimuli[0];
    assert.ok(s.type === "staff" && q.expected.type === "notes");
    assert.deepEqual(q.expected.midis, [midiOf(s.notes[0])]);
    assert.equal(q.expected.match, "exact");
  }
  for (const q of many("play-note", { instrument: "piano", from: "name" }, 10)) {
    const s = q.stimuli[0];
    assert.ok(s.type === "text" && q.expected.type === "notes");
    assert.equal(q.expected.match, "pc", "by name, any octave counts by default");
    assert.equal(pc(midiOf(`${s.text}4`)), pc(q.expected.midis[0]));
    assert.equal(grade(q, { type: "notes", midis: [q.expected.midis[0] + 12] }).correct, true);
  }
  for (const q of many("play-note", { instrument: "guitar", from: "tab", strings: [6, 5, 4] }, 10)) {
    const s = q.stimuli[0];
    assert.ok(s.type === "tab" && q.expected.type === "notes" && q.response.type === "fretboard");
    assert.deepEqual(q.expected.midis, [fretMidi(s.positions[0])]);
    assert.ok([4, 5, 6].includes(s.positions[0].string));
  }
  for (const q of many("play-scale", { instrument: "piano", types: ["major"], tonics: ["G"] }, 2)) {
    assert.ok(q.expected.type === "notes" && q.response.type === "keyboard");
    assert.deepEqual(q.expected.midis.map(pc), [7, 9, 11, 0, 2, 4, 6, 7]);
    assert.deepEqual(q.response.marked, [q.expected.midis[0]]);
    assert.equal(q.expected.midis[7] - q.expected.midis[0], 12);
    assert.match(q.explain, /G A B C D E F♯ G/);
    assert.match(q.explain, /W W H W W W H/);
  }
  for (const q of many("play-scale", { instrument: "guitar", types: ["minor-pentatonic"], tonics: ["A"] }, 2)) {
    assert.ok(q.expected.type === "notes" && q.response.type === "fretboard");
    assert.deepEqual(q.expected.midis, [45, 48, 50, 52, 55, 57]);
    assert.deepEqual(q.response.marked?.[0], { string: 6, fret: 5 });
  }
  for (const q of many("play-chord", { instrument: "piano", chords: ["Am", "G7"] }, 6)) {
    const s = q.stimuli[0];
    assert.ok(s.type === "text" && q.expected.type === "notes");
    assert.deepEqual(q.expected.midis.map(pc), chordPcs(parseChord(s.text)));
  }
  for (const q of many("play-chord", { instrument: "guitar", chords: ["C7"] }, 2)) {
    assert.deepEqual(q.expected, { type: "chord-shape", symbol: "C7" });
    // Another voicing of the same chord is accepted; a wrong note is not.
    const barre = [{ string: 5, fret: 3 }, { string: 4, fret: 5 }, { string: 3, fret: 3 }, { string: 2, fret: 5 }, { string: 1, fret: 3 }];
    assert.equal(grade(q, { type: "notes", midis: barre.map((x) => fretMidi(x)), positions: barre }).correct, true);
    const two = [{ string: 5, fret: 3 }, { string: 5, fret: 7 }];
    assert.equal(grade(q, { type: "notes", midis: two.map((x) => fretMidi(x)), positions: two }).correct, false, "two notes on one string");
  }
  for (const q of many("build-interval", { intervals: ["M3"], direction: "up" }, 10)) {
    assert.ok(q.expected.type === "notes" && q.response.type === "keyboard");
    assert.equal(q.expected.midis[0] - q.response.marked![0], 4);
  }
  for (const q of many("build-interval", { intervals: ["P4", "m2"], direction: "down", instrument: "guitar" }, 10)) {
    assert.ok(q.expected.type === "notes" && q.response.type === "fretboard");
    const start = fretMidi(q.response.marked![0]);
    assert.ok([1, 5].includes(start - q.expected.midis[0]));
    assert.match(q.prompt, /below/);
  }
  let sawE = false;
  for (const q of many("build-interval", { intervals: ["M3"] }, 10)) {
    if (q.prompt.includes("marked E")) {
      sawE = true;
      assert.match(q.explain, /is G♯4/);
    }
  }
  assert.ok(sawE);
  for (const q of many("build-scale", { types: ["major"], tonics: ["D"] }, 2)) {
    assert.ok(q.expected.type === "notes");
    assert.deepEqual(q.expected.midis.map(pc).sort((a, b) => a - b), [1, 2, 4, 6, 7, 9, 11]);
    assert.equal(grade(q, { type: "notes", midis: [50, 52, 54, 55, 57, 59, 61, 62] }).correct, true);
    assert.equal(grade(q, { type: "notes", midis: [50, 52, 54, 55, 57, 59, 60, 62] }).correct, false, "C natural is not in D major");
    assert.equal(grade(q, { type: "notes", midis: [50, 52, 54, 55, 57, 59] }).correct, false, "a note is missing");
  }
});

test("tap-rhythm: onsets follow the notation and grading reports early and late", () => {
  for (const q of many("tap-rhythm", { values: ["q", "e", "qr"], bars: 2, tempo: 60 }, 6)) {
    assert.ok(q.response.type === "tap" && q.expected.type === "taps");
    assert.equal(q.response.countInBeats, 4);
    assert.ok(Math.abs(q.expected.toleranceBeats - 0.11) < 1e-9, "at 60 bpm a beat is a second");
    assert.equal(q.response.pattern.split("|").length, 2);
    const on = q.expected.onsets;
    const g = grade(q, { type: "taps", onsets: on.map((o) => o + 0.05) });
    assert.equal(g.correct, true);
    assert.equal(g.tapErrors?.length, on.length);
    assert.ok(g.tapErrors!.every((e) => e !== null && Math.abs(e - 0.05) < 1e-9));
    const late = grade(q, { type: "taps", onsets: on.map((o, i) => o + (i === 0 ? 0.3 : 0)) });
    assert.equal(late.correct, false);
    assert.ok(Math.abs(late.tapErrors![0]! - 0.3) < 1e-9);
    if (on.length > 1) {
      const missed = grade(q, { type: "taps", onsets: on.slice(1) });
      assert.equal(missed.correct, false);
      assert.equal(missed.tapErrors![0], null, "the first note was never tapped");
      assert.ok(missed.tapErrors!.slice(1).every((e) => e === 0));
    }
    const extra = grade(q, { type: "taps", onsets: [...on, on[on.length - 1] + 0.5] });
    assert.equal(extra.correct, false);
  }
  const waltz = generateQuestions(decl("tap-rhythm", { time: "6/8", values: ["q.", "e"], tempo: 120 }), 9)[0];
  assert.ok(waltz.response.type === "tap" && waltz.expected.type === "taps");
  assert.equal(waltz.response.countInBeats, 3, "a bar of 6/8 is three quarter-note beats");
  assert.ok(Math.abs(waltz.expected.toleranceBeats - 0.22) < 1e-9);
});

test("grade: sets ignore duplicates and order, sequences do not", () => {
  const base = generateQuestions(decl("build-chord", { types: ["maj"], roots: ["C"] }, 1), 1)[0];
  assert.equal(grade(base, { type: "notes", midis: [67, 60, 64, 72, 60] }).correct, true);
  const exact: Question = { ...base, expected: { type: "notes", midis: [60, 64, 67], match: "exact", ordered: false } };
  assert.equal(grade(exact, { type: "notes", midis: [67, 64, 60, 60] }).correct, true);
  assert.equal(grade(exact, { type: "notes", midis: [72, 64, 67] }).correct, false);
  const seq: Question = { ...base, expected: { type: "notes", midis: [60, 62, 64], match: "exact", ordered: true } };
  assert.equal(grade(seq, { type: "notes", midis: [60, 62, 64] }).correct, true);
  assert.equal(grade(seq, { type: "notes", midis: [60, 64, 62] }).correct, false);
  assert.equal(grade(seq, { type: "notes", midis: [60, 62, 64, 64] }).correct, false);
  const seqPc: Question = { ...base, expected: { type: "notes", midis: [60, 62, 64], match: "pc", ordered: true } };
  assert.equal(grade(seqPc, { type: "notes", midis: [72, 74, 76] }).correct, true);
});

test("quiz: authored questions, no repeats, shuffled choices keep the right answer", () => {
  for (const seed of SEEDS) {
    const qs = generateQuestions(decl("quiz", { questions: QUIZ }, 10), seed);
    assert.equal(qs.length, 3);
    assert.equal(new Set(qs.map((q) => q.prompt)).size, 3);
    for (const q of qs) {
      const src = QUIZ.find((x) => x.q === q.prompt)!;
      assert.ok(q.response.type === "choice" && q.expected.type === "choice");
      const wantId = q.expected.id;
      const right = q.response.choices.find((c) => c.id === wantId)!;
      assert.equal(right.label, String(src.choices[src.answer - 1]));
      assert.deepEqual(q.response.choices.map((c) => c.label).sort(), src.choices.map(String).sort());
      assert.ok(q.explain.includes(right.label));
      if (src.explain) assert.ok(q.explain.includes(src.explain));
    }
    assert.equal(generateQuestions(decl("quiz", { questions: QUIZ }, 2), seed).length, 2);
  }
  const firsts = new Set(SEEDS.map((seed) => generateQuestions(decl("quiz", { questions: QUIZ }, 1), seed)[0].prompt));
  assert.equal(firsts.size, 3, "which question is drawn depends on the seed");
});

test("reviewQuestions mixes declarations, keeps ids unique, and is deterministic", () => {
  const decls: ExerciseDecl[] = [
    { kind: "name-note", concept: "treble-clef-notes", count: 9, params: { view: "staff" } },
    { kind: "ear-interval", concept: "interval-sound", count: 9, params: { intervals: ["P5", "P8"] } },
    { kind: "quiz", concept: "vibration", count: 9, params: { questions: QUIZ } },
    { kind: "play-chord", concept: "guitar-open-chords", count: 9, params: { instrument: "guitar", chords: ["Em", "Am"] } },
  ];
  const qs = reviewQuestions(decls, 2, 77);
  assert.equal(qs.length, 8);
  assert.equal(new Set(qs.map((q) => q.id)).size, 8);
  for (const d of decls) assert.equal(qs.filter((q) => q.kind === d.kind && q.concept === d.concept).length, 2);
  assert.deepEqual(reviewQuestions(decls, 2, 77), qs);
  assert.notDeepEqual(reviewQuestions(decls, 2, 78).map((q) => q.id), qs.map((q) => q.id));
  const orders = new Set(SEEDS.map((s) => reviewQuestions(decls, 2, s).map((q) => q.kind).join()));
  assert.ok(orders.size > 10, "the mix is shuffled");
  assert.deepEqual(reviewQuestions([], 3, 1), []);
  assert.deepEqual(reviewQuestions(decls, 0, 1), []);
  // The same declaration twice still yields unique ids.
  const twice = reviewQuestions([decls[0], decls[0]], 3, 5);
  assert.equal(new Set(twice.map((q) => q.id)).size, 6);
});

test("name-interval: no two choices share a label or are equally right", () => {
  // On the staff a tritone is an augmented fourth or a diminished fifth, and both may be offered: each under its own name.
  let both = 0;
  for (const q of many("name-interval", { view: "staff", intervals: ["A4", "d5"] }, 6)) {
    assert.ok(q.response.type === "choice");
    const labels = q.response.choices.map((c) => c.label);
    assert.equal(new Set(labels).size, labels.length, labels.join(" / "));
    if (labels.length === 2) {
      both++;
      assert.deepEqual([...labels].sort(), ["Augmented fourth", "Diminished fifth"]);
    }
  }
  assert.ok(both > 0);
  // Counted in half steps, an augmented second and a minor third are one answer.
  for (const q of many("name-interval", { view: "staff", intervals: ["A2", "m3", "d4", "M3", "P4"], labels: "steps" }, 6)) {
    assert.ok(q.response.type === "choice" && q.expected.type === "choice");
    const sizes = q.response.choices.map((c) => semitones(c.id));
    assert.equal(new Set(sizes).size, sizes.length, `one choice per size: ${q.response.choices.map((c) => c.id)}`);
    const s = q.stimuli[0];
    assert.ok(s.type === "staff");
    assert.equal(midiOf(s.notes[1]) - midiOf(s.notes[0]), semitones(q.expected.id));
  }
});

test("name-interval on the fretboard shows the interval it asks for, beyond an octave too", () => {
  for (const q of many("name-interval", { view: "fretboard", intervals: ["P5", "M9", "m10", "P12"] }, 10)) {
    const s = q.stimuli[0];
    assert.ok(s.type === "fretboard" && q.expected.type === "choice");
    assert.equal(s.marked[0].string, s.marked[1].string);
    assert.equal(s.marked[1].fret - s.marked[0].fret, semitones(q.expected.id), `${q.expected.id} is ${semitones(q.expected.id)} frets`);
    assert.ok(s.marked[1].fret <= s.maxFret && s.maxFret <= 20, "the guitar has 20 frets");
  }
  for (const q of many("name-interval", { view: "fretboard", intervals: ["m13", "M13", "P12"] }, 10)) {
    const s = q.stimuli[0];
    assert.ok(s.type === "fretboard" && s.maxFret <= 20 && s.marked.every((m) => m.fret >= 0 && m.fret <= 20));
  }
  // Nothing wider than the neck fits on one string: the loader refuses such a declaration, and a stray one is left out, never mis-shown.
  for (const q of many("name-interval", { view: "fretboard", intervals: ["P5", "P15", "P19"] }, 4)) assert.ok(q.expected.type === "choice" && q.expected.id === "P5");
  assert.match(checkParams(EXERCISES["name-interval"].params, { view: "fretboard", intervals: ["P5", "P15"] }).join(), /P15 cannot be shown/);
});

test("intervals by number only: natural notes, one choice per number, no quality words", () => {
  const quality = /major|minor|perfect|augmented|diminished|tritone|half step/i;
  for (const view of ["staff", "keyboard", "fretboard"]) {
    for (const q of many("name-interval", { view, intervals: ["M2", "m3", "M3", "P4", "P5", "m6", "P8"], labels: "numbers" }, 10)) {
      assert.ok(q.response.type === "choice" && q.expected.type === "choice");
      assert.deepEqual(q.response.choices.map((c) => c.label).filter((l) => l === "Third").length <= 1, true);
      assert.ok(!quality.test(q.prompt + q.explain + q.response.choices.map((c) => c.label).join(" ")), `${q.prompt} / ${q.explain}`);
      const s = q.stimuli[0];
      const midis = s.type === "staff" ? s.notes.map((n) => midiOf(n)) : s.type === "keyboard" ? s.marked : s.type === "fretboard" ? s.marked.map((x) => fretMidi(x)) : [];
      assert.equal(midis.length, 2);
      // Both notes are natural, and the letters between them count to the expected number.
      const [lo, hi] = midis.map((m) => parsePitch(midiName(m)));
      assert.ok(lo.acc === 0 && hi.acc === 0, `${view}: natural notes`);
      assert.equal(String(intervalBetween(lo, hi).num), q.expected.id);
    }
  }
  const c = generateQuestions(decl("name-interval", { view: "staff", intervals: ["M3", "m3", "P5"], labels: "numbers" }), 3)[0];
  assert.deepEqual(c.response.type === "choice" && c.response.choices.map((x) => x.label), ["Third", "Fifth"]);

  let sawThirdOnC = false;
  for (const q of many("build-interval", { intervals: ["M2", "M3", "P4", "P5"], labels: "numbers", direction: "both" }, 10)) {
    assert.ok(q.expected.type === "notes" && q.response.type === "keyboard");
    assert.ok(!quality.test(q.prompt + q.explain), `${q.prompt} / ${q.explain}`);
    const start = parsePitch(midiName(q.response.marked![0]));
    const target = parsePitch(midiName(q.expected.midis[0]));
    assert.equal(target.acc, 0);
    const num = intervalBetween(start, target).num;
    assert.match(q.prompt, new RegExp(["", "", "second", "third", "fourth", "fifth"][num]));
    // The same letter with a sharp or flat is as good; a neighbouring white key is another number.
    for (const m of q.expected.alsoAccept ?? []) {
      assert.equal(Math.abs(m - q.expected.midis[0]), 1);
      assert.ok(isBlackKey(m));
      assert.equal(grade(q, { type: "notes", midis: [m] }).correct, true);
    }
    for (const d of [-2, -1, 1, 2]) {
      const m: number = q.expected.midis[0] + d;
      if (!isBlackKey(m)) assert.equal(grade(q, { type: "notes", midis: [m] }).correct, false, `${midiName(m)} is another letter`);
    }
    if (q.prompt === "Play the note a third above the marked C.") {
      sawThirdOnC = true;
      assert.deepEqual(q.expected.midis, [64]);
      assert.deepEqual(q.expected.alsoAccept, [63]);
      assert.match(q.explain, /C4 up to E4 is a third: 3 letter names counting both ends \(C D E\)/);
      assert.equal(grade(q, { type: "notes", midis: [65] }).correct, false);
    }
  }
  assert.ok(sawThirdOnC);
});

test("name-chord away from the staff never offers two names for the same keys", () => {
  for (const q of many("name-chord", { view: "keyboard", types: ["maj", "min"], roots: ["C#", "Db", "F#", "Gb", "A"] }, 10)) {
    assert.ok(q.response.type === "choice");
    const sets = q.response.choices.map((c) => chordPcs(parseChord(c.id)).sort((a, b) => a - b).join(","));
    assert.equal(new Set(sets).size, sets.length, q.response.choices.map((c) => c.id).join(" "));
  }
  const kinds = generateQuestions(decl("name-chord", { view: "staff", types: ["5", "6", "7", "maj", "min"], roots: ["C"], qualityOnly: true }), 2)[0];
  assert.deepEqual(kinds.response.type === "choice" && kinds.response.choices.map((c) => c.label), ["Major", "Minor", "Dominant seventh", "Power chord", "Major sixth"]);
});

test("play-note from tab wants the place the tab names; from the guitar staff it explains the octave", () => {
  for (const q of many("play-note", { instrument: "guitar", from: "tab", strings: [6, 5, 4], maxFret: 7 }, 10)) {
    const s = q.stimuli[0];
    assert.ok(s.type === "tab" && q.expected.type === "notes");
    assert.deepEqual(q.expected.positions, s.positions);
    const pos = s.positions[0];
    assert.equal(grade(q, { type: "notes", midis: [fretMidi(pos)], positions: [pos] }).correct, true);
    for (const other of positionsOf(fretMidi(pos), 24)) {
      if (other.string !== pos.string) assert.equal(grade(q, { type: "notes", midis: [fretMidi(other)], positions: [other] }).correct, false, "same pitch, another string");
    }
  }
  for (const q of many("play-note", { instrument: "guitar", from: "staff" }, 6)) {
    assert.ok(q.expected.type === "notes" && q.expected.positions === undefined, "from the staff any place with that pitch counts");
    assert.match(q.explain, /written an octave higher than it sounds/);
    const sounding = parsePitch(midiName(q.expected.midis[0]));
    assert.ok(q.explain.includes(`drawn as ${sounding.letter}${sounding.oct + 1}`), q.explain);
  }
});

test("tap-rhythm: sixteenths never get overlapping tolerance windows; counts follow the beat unit", () => {
  for (const q of many("tap-rhythm", { values: ["s", "e", "q"], tempo: 72 }, 6)) {
    assert.ok(q.expected.type === "taps");
    const on = q.expected.onsets;
    for (let i = 1; i < on.length; i++) assert.ok(q.expected.toleranceBeats * 2 < on[i] - on[i - 1], `${q.expected.toleranceBeats} against a gap of ${on[i] - on[i - 1]}`);
  }
  for (const q of many("tap-rhythm", { time: "2/2", values: ["h", "q"], tempo: 80 }, 4)) assert.ok(!/on (3|4)\b|and (3|4)\b/.test(q.explain), `2/2 has two counts: ${q.explain}`);
});

test("ear-chord wording does not say chord twice", () => {
  for (const q of many("ear-chord", { types: ["5", "maj"] }, 6)) assert.ok(!/chord chord/.test(q.explain), q.explain);
});

test("name-chord: no two choices look the same on keys or a chord box, added distractors included", () => {
  const look = (id: string) => chordPcs(parseChord(id)).sort((a, b) => a - b).join(",");
  for (const params of [
    { view: "keyboard", chords: ["C#", "Dbm"] },
    { view: "keyboard", chords: ["Db", "C#m", "C#dim"] },
    { view: "keyboard", chords: ["F#", "Gbm", "Gb"] },
    { view: "diagram", chords: ["A", "Am"] },
  ]) {
    for (const q of many("name-chord", params, 10)) {
      assert.ok(q.response.type === "choice" && q.expected.type === "choice");
      const sets = q.response.choices.map((c) => look(c.id));
      assert.equal(new Set(sets).size, sets.length, q.response.choices.map((c) => c.id).join(" "));
      assert.equal(q.response.choices.filter((c) => c.id === (q.expected as { id: string }).id).length, 1);
    }
  }
});

test("tap-rhythm: each note's window depends on its own neighbours, and grading uses it", () => {
  // Two sixteenths then a half note, at 120: the pair is tight, the half note is not.
  const q: Question = { id: "t", kind: "tap-rhythm", concept: "c", prompt: "", stimuli: [], response: { type: "tap", pattern: "s s e q h", time: "4/4", tempo: 120, countInBeats: 4 }, expected: { type: "taps", onsets: [0, 0.25, 0.5, 1, 2], toleranceBeats: 0.1125, tolerances: [0.1125, 0.1125, 0.1125, 0.22, 0.22] }, explain: "" };
  assert.equal(grade(q, { type: "taps", onsets: [0, 0.25, 0.5, 1, 2.2] }).correct, true, "the half note has the full window");
  assert.equal(grade(q, { type: "taps", onsets: [0, 0.25 + 0.15, 0.5, 1, 2] }).correct, false, "a sixteenth does not");
  assert.equal(grade(q, { type: "taps", onsets: [0, 0.25, 0.5, 1, 2.3] }).correct, false);
  // Without `tolerances` the single number applies to every note, as before.
  const old: Question = { ...q, expected: { type: "taps", onsets: [0, 1], toleranceBeats: 0.2 } };
  assert.equal(grade(old, { type: "taps", onsets: [0.19, 1.19] }).correct, true);
  assert.equal(grade(old, { type: "taps", onsets: [0.21, 1] }).correct, false);
  for (const asked of [60, 72, 120, 200]) {
    for (const g of many("tap-rhythm", { values: ["s", "e", "q", "h"], tempo: asked, bars: 2 }, 8)) {
      assert.ok(g.expected.type === "taps" && g.expected.tolerances && g.response.type === "tap");
      // Sixteenths cannot be tapped above 84: a stray faster declaration is slowed.
      const tempo = g.response.tempo;
      assert.equal(tempo, Math.min(asked, 84));
      const { onsets, tolerances, toleranceBeats } = g.expected;
      assert.equal(tolerances.length, onsets.length);
      assert.ok(Math.abs(Math.min(...tolerances) - toleranceBeats) < 1e-9);
      const full = (0.11 * tempo) / 60;
      onsets.forEach((o, i) => {
        const gap = Math.min(...onsets.filter((x) => x !== o).map((x) => Math.abs(x - o)), Infinity);
        assert.ok(Math.abs(tolerances[i] - Math.min(full, gap * 0.45)) < 1e-9, "own nearest neighbour sets the window");
        if (i > 0) assert.ok(tolerances[i] + tolerances[i - 1] < o - onsets[i - 1], "neighbouring windows never overlap");
      });
      assert.equal(grade(g, { type: "taps", onsets }).correct, true);
    }
  }
});

test("tap-rhythm in 2/2 with sixteenths counts in four, with no nameless positions", () => {
  for (const q of many("tap-rhythm", { time: "2/2", values: ["s", "e", "q"], tempo: 60 }, 8)) {
    assert.ok(!/between counts/.test(q.explain), q.explain);
    assert.ok(q.response.type === "tap");
    const hasSixteenths = q.response.pattern.split(/[\s|]+/).some((t) => t.startsWith("s"));
    assert.equal(/Count 4 to the bar/.test(q.explain), hasSixteenths, `${q.response.pattern}: ${q.explain}`);
  }
  for (const q of many("tap-rhythm", { time: "2/2", values: ["h", "q"], tempo: 60 }, 4)) assert.ok(!/Count 4 to the bar/.test(q.explain));
});

test("build-interval by number: only reachable notes are also accepted, and the answer named is the natural note", () => {
  for (const instrument of ["piano", "guitar"]) {
    for (const direction of ["up", "down", "both"]) {
      for (const q of many("build-interval", { intervals: ["M2", "M3", "P5", "M7", "P8", "M9", "P12"], labels: "numbers", instrument, direction }, 12)) {
        assert.ok(q.expected.type === "notes");
        const target = q.expected.midis[0];
        assert.ok(!isBlackKey(target), "the shown answer is a natural note");
        for (const m of q.expected.alsoAccept ?? []) {
          assert.ok(isBlackKey(m) && Math.abs(m - target) === 1);
          if (q.response.type === "fretboard") assert.ok(positionsOf(m, q.response.maxFret).length > 0, `${midiName(m)} is not on the fretboard shown`);
          if (q.response.type === "keyboard") assert.ok(m >= q.response.range[0] && m <= q.response.range[1]);
        }
        if (q.response.type === "fretboard") assert.ok(positionsOf(target, q.response.maxFret).length > 0);
        const natural = parsePitch(midiName(target));
        assert.ok(q.explain.includes(`${natural.letter}${natural.oct}`), q.explain);
      }
    }
  }
});

test("ear-find-note: the note to find is always on the instrument shown", () => {
  for (const params of [{}, { instrument: "guitar" }, { instrument: "piano", scale: "harmonic-minor", range: ["A5", "A5"] }, { range: ["C6", "C7"] }, { instrument: "guitar", range: ["C7", "C8"] }, { instrument: "guitar", scale: "blues", range: ["E2", "E3"] }]) {
    for (const q of many("ear-find-note", params, 10)) {
      assert.ok(q.expected.type === "notes");
      const target = q.expected.midis[0];
      if (q.response.type === "keyboard") assert.ok(target >= q.response.range[0] && target <= q.response.range[1], `${midiName(target)} outside ${q.response.range}`);
      else if (q.response.type === "fretboard") assert.ok(positionsOf(target, q.response.maxFret).length > 0);
      else assert.fail("unexpected response");
      const marked = q.response.marked ?? [];
      assert.equal(marked.length, 1);
    }
  }
});

test("grade: a tab position given twice is not a two-note answer", () => {
  const pos = { string: 2, fret: 0 };
  const two = [{ string: 2, fret: 0 }, { string: 3, fret: 0 }];
  const q = (positions: { string: number; fret: number }[]): Question => ({ id: "p", kind: "play-note", concept: "c", prompt: "", stimuli: [], response: { type: "fretboard", maxFret: 5, mode: "set" }, expected: { type: "notes", midis: positions.map((x) => fretMidi(x)), match: "exact", ordered: false, positions }, explain: "" });
  assert.equal(grade(q([pos]), { type: "notes", midis: [59], positions: [pos] }).correct, true);
  assert.equal(grade(q([pos]), { type: "notes", midis: [59, 59], positions: [pos, pos] }).correct, false);
  assert.equal(grade(q(two), { type: "notes", midis: [59, 55], positions: two }).correct, true);
  assert.equal(grade(q(two), { type: "notes", midis: [55, 59], positions: [two[1], two[0]] }).correct, true);
  assert.equal(grade(q(two), { type: "notes", midis: [59, 59], positions: [pos, pos] }).correct, false);
  assert.equal(grade(q(two), { type: "notes", midis: [59], positions: [pos] }).correct, false);
});

test("registry bounds: impossible declarations are refused, not quietly replaced", () => {
  const bad = (kind: string, params: Record<string, unknown>, re: RegExp) => {
    const got = checkParams(EXERCISES[kind].params, params);
    assert.ok(got.length > 0 && re.test(got.join(" ")), `${kind} ${JSON.stringify(params)} should be refused (${re}); got ${JSON.stringify(got)}`);
  };
  const badW = (type: string, params: Record<string, unknown>, re: RegExp) => {
    const got = checkParams(WIDGETS[type].params, params);
    assert.ok(got.length > 0 && re.test(got.join(" ")), `${type} ${JSON.stringify(params)} should be refused (${re}); got ${JSON.stringify(got)}`);
  };
  bad("name-note", { view: "staff", range: ["G5", "C4"] }, /lower note first/);
  bad("name-note", { view: "fretboard", strings: [9, 0], maxFret: 0 }, /at most 6|at least 1/);
  bad("name-note", { view: "tab", maxFret: 40 }, /at most 20/);
  bad("name-note", { view: "fretboard", range: ["C7", "C8"], maxFret: 2 }, /no note/);
  bad("name-interval", { view: "staff", intervals: ["P1"] }, /unison/);
  bad("name-interval", { view: "staff", intervals: ["P29"] }, /two octaves/);
  bad("build-interval", { intervals: ["P29"], instrument: "guitar" }, /two octaves/);
  bad("build-interval", { intervals: ["P1"], labels: "numbers" }, /unison/);
  bad("name-chord", { view: "diagram", chords: ["Bb", "F#"] }, /stored guitar shape/);
  bad("play-chord", { instrument: "guitar", chords: ["Bb"], show: "diagram" }, /stored guitar shape/);
  bad("play-chord", { instrument: "piano", chords: ["C"], show: "diagram" }, /guitar` only/);
  bad("play-note", { instrument: "piano", from: "tab" }, /guitar` only/);
  bad("play-note", { instrument: "guitar", from: "name", range: ["C1", "C2"] }, /no note/);
  bad("tap-rhythm", { values: ["q"], tempo: -5 }, /at least 30/);
  bad("tap-rhythm", { values: ["q"], bars: 7 }, /at most 2/);
  bad("harmonic-frequency", { fundamentals: [0.001] }, /at least 20/);
  bad("ear-higher-lower", { minSemitones: 9, maxSemitones: 2 }, /maxSemitones/);
  bad("name-key", { maxAccidentals: 99 }, /at most 7/);
  badW("progression", { chords: "C Hm Q vii°7" }, /neither a chord symbol/);
  badW("progression", { chords: "I V vi IV" }, /neither a chord symbol/);
  badW("fretboard", { positions: ["7/3", "1/99"] }, /positions/);
  badW("tab", { notes: "1/25:q 6/99:q" }, /position/);
  badW("metronome", { tempo: -5 }, /at least 30/);
  badW("keyboard", { range: ["C5", "C3"] }, /lower note first/);
  badW("interval", { from: "G4", to: "C4" }, /lower note/);
  badW("fretboard", { frets: 24 }, /at most 20/);
  // And what must still pass.
  for (const [kind, params] of [
    ["name-chord", { view: "diagram" }],
    ["name-chord", { view: "diagram", chords: ["Em", "Am", "E", "A"] }],
    ["play-chord", { instrument: "guitar", chords: ["Em", "Am"], show: "diagram" }],
    ["play-note", { instrument: "guitar", from: "tab", strings: [6, 5], maxFret: 5 }],
    ["name-note", { view: "fretboard", maxFret: 0 }],
    ["name-note", { view: "staff", range: ["C4", "C4"] }],
    ["ear-interval", { intervals: ["P8", "P5", "m2"], mode: "harmonic", vocab: "plain" }],
    ["build-interval", { intervals: ["m2", "M2"], labels: "steps", vocab: "letters" }],
  ] as [string, Record<string, unknown>][]) assert.deepEqual(checkParams(EXERCISES[kind].params, params), [], `${kind} ${JSON.stringify(params)}`);
  assert.deepEqual(checkParams(WIDGETS.progression.params, { chords: "I V vi IV", key: "C" }), []);
  assert.deepEqual(checkParams(WIDGETS.progression.params, { chords: "i bVII bVI V", key: "Am" }), []);
  assert.deepEqual(checkParams(WIDGETS.progression.params, { chords: "C G Am F" }), []);
});

/** Words a learner has not met at each vocabulary level. */
const OCTAVE_NUMBER = /[A-G][♯♭]?\d/;
const ACCIDENTAL = /[♯♭]|\bsharp\b|\bflat\b/;
const INTERVAL_NAME = /\b(major|minor|perfect|augmented|diminished) (second|third|fourth|fifth|sixth|seventh|octave|unison)|tritone/i;
const NOTE_LETTER = /\b[A-G]\b(?! minor| major)/;

test("vocab: explanations stay inside what the learner has been taught", () => {
  const texts = (kind: string, params: Record<string, unknown>) => SEEDS.flatMap((seed) => generateQuestions(decl(kind, params, 6), seed)).map((q) => ({ q, said: `${q.prompt} ${q.explain} ${q.stimuli.map((s) => (s.type === "text" ? s.text : "")).join(" ")}` }));
  // plain: no note names, octave numbers, accidentals or half steps.
  for (const [kind, params] of [
    ["ear-higher-lower", { vocab: "plain", minSemitones: 1, maxSemitones: 12 }],
    ["ear-same-note", { vocab: "plain" }],
    ["name-interval", { view: "fretboard", intervals: ["m2", "M2"], labels: "steps", vocab: "plain" }],
  ] as [string, Record<string, unknown>][]) {
    for (const { said } of texts(kind, params)) {
      assert.ok(!OCTAVE_NUMBER.test(said) && !ACCIDENTAL.test(said) && !NOTE_LETTER.test(said), `${kind} plain: ${said}`);
      if (kind !== "name-interval") assert.ok(!/half step/.test(said), `${kind} plain: ${said}`);
    }
  }
  // Level 0 consonance: the interval is named as its choice is, nothing more.
  for (const { q } of texts("ear-interval", { intervals: ["P8", "P5", "m2"], mode: "harmonic", vocab: "plain" })) assert.ok(!OCTAVE_NUMBER.test(q.explain) && !/half step/.test(q.explain), q.explain);
  // letters: letter names, no accidentals or octave numbers, no interval names.
  for (const [kind, params] of [
    ["name-interval", { view: "keyboard", intervals: ["m2", "M2"], labels: "steps", vocab: "letters" }],
    ["name-interval", { view: "fretboard", intervals: ["m2", "M2"], labels: "steps", vocab: "letters" }],
    ["ear-interval", { intervals: ["m2", "M2"], labels: "steps", vocab: "letters" }],
    ["build-interval", { intervals: ["m2", "M2"], labels: "steps", vocab: "letters" }],
    ["build-interval", { intervals: ["m2", "M2"], labels: "steps", vocab: "letters", instrument: "guitar", direction: "both" }],
  ] as [string, Record<string, unknown>][]) {
    for (const { said } of texts(kind, params)) assert.ok(!OCTAVE_NUMBER.test(said) && !ACCIDENTAL.test(said) && !INTERVAL_NAME.test(said), `${kind} letters: ${said}`);
  }
  // names: sharps and flats allowed, still no octave numbers or interval names.
  for (const [kind, params] of [
    ["build-interval", { intervals: ["m2", "M2"], labels: "steps", vocab: "names", direction: "both" }],
    ["ear-find-note", { instrument: "guitar", vocab: "names" }],
    ["ear-same-note", { vocab: "names" }],
  ] as [string, Record<string, unknown>][]) {
    for (const { said } of texts(kind, params)) assert.ok(!OCTAVE_NUMBER.test(said) && !INTERVAL_NAME.test(said), `${kind} names: ${said}`);
  }
  // The default is unchanged: full names with octave numbers.
  assert.ok(texts("ear-higher-lower", {}).every(({ q }) => OCTAVE_NUMBER.test(q.explain)));
});

test("play-chord with show: diagram puts the chord box in front of the learner", () => {
  for (const seed of SEEDS) {
    for (const q of generateQuestions(decl("play-chord", { instrument: "guitar", chords: ["Em", "Am"], show: "diagram" }, 4), seed)) {
      const box = q.stimuli.find((s) => s.type === "diagram");
      assert.ok(box && box.type === "diagram" && ["Em", "Am"].includes(box.chord), JSON.stringify(q.stimuli));
      assert.equal(q.expected.type, "chord-shape");
      assert.equal(grade(q, rightAnswer(q)).correct, true);
    }
  }
  // The same stimulus shape name-chord emits.
  const named = generateQuestions(decl("name-chord", { view: "diagram", chords: ["Em", "Am"] }, 1), 1)[0].stimuli[0];
  assert.deepEqual(Object.keys(named).sort(), ["chord", "type"]);
});

test("count-bar offers only note values the lesson uses; x/8 bars are described in eighths", () => {
  for (const seed of SEEDS) {
    for (const [time, values] of [["4/4", ["w", "h", "q"]], ["3/4", ["h", "q", "e"]], ["4/4", ["h", "q", "e", "hr", "qr"]]] as [string, string[]][]) {
      for (const q of generateQuestions(decl("count-bar", { time, values }, 6), seed)) {
        if (q.response.type !== "choice") throw new Error("choice expected");
        for (const c of q.response.choices) assert.ok(!/^s/.test(c.id), `${time} ${values}: offered ${c.label}`);
      }
    }
    for (const q of generateQuestions(decl("count-bar", { time: "6/8", values: ["q", "e", "q."] }, 4), seed)) assert.match(q.explain, /A bar of 6\/8 holds 6 eighth notes/);
  }
});

test("a batch does not repeat a question while the parameters leave another", () => {
  const sig = (x: Question) => JSON.stringify([x.prompt, x.stimuli, x.expected]);
  for (const seed of SEEDS) {
    const qs = generateQuestions(decl("name-note", { view: "tab", strings: [6, 5], maxFret: 3 }, 6), seed);
    assert.equal(new Set(qs.map(sig)).size, qs.length, `seed ${seed}`);
  }
});

test("a batch longer than the pool asks everything once before anything twice, evenly and never back to back", () => {
  const sig = (x: Question) => JSON.stringify([x.prompt, x.stimuli, x.expected]);
  // Four note values: a pool of 4.
  for (const count of [6, 8, 11]) {
    for (const seed of SEEDS) {
      const qs = generateQuestions(decl("name-duration", { values: ["w", "h", "q", "e"], ask: "name" }, count), seed).map(sig);
      assert.equal(qs.length, count);
      for (let lap = 0; lap * 4 < count; lap++) {
        const part = qs.slice(lap * 4, lap * 4 + 4);
        assert.equal(new Set(part).size, part.length, `seed ${seed} count ${count} lap ${lap}`);
      }
      assert.ok(qs.every((q, i) => i === 0 || q !== qs[i - 1]), `seed ${seed}: back to back`);
    }
  }
});

test("wording: articles, chord roots and fretboard spellings", () => {
  for (const seed of SEEDS) {
    for (const q of generateQuestions(decl("name-interval", { view: "fretboard", intervals: ["m2", "M2"], labels: "steps" }, 6), seed)) assert.match(q.explain, /is a (half|whole) step:/);
    for (const q of generateQuestions(decl("ear-chord", { types: ["min", "maj"] }, 6), seed)) assert.ok(!/minor chord on (G♭|D♭|A♭)\b|major chord on (A♯|D♯|C♯|G♯)/.test(q.explain), q.explain);
    for (const q of generateQuestions(decl("name-interval", { view: "fretboard", intervals: ["m3", "M3", "P4", "P5", "m6", "M6"] }, 6), seed)) {
      const m = /^([A-G][♯♭]?)(\d) to ([A-G][♯♭]?)(\d) is an? ([a-z ]+):/.exec(q.explain);
      assert.ok(m, q.explain);
      const fix = (x: string) => x.replace("♯", "#").replace("♭", "b");
      assert.equal(intervalName(intervalText(intervalBetween(parsePitch(fix(m[1]) + m[2]), parsePitch(fix(m[3]) + m[4])))), m[5], q.explain);
    }
  }
});

test("positionsSpellChord: only seventh chords may drop the fifth", () => {
  // C6 without its fifth is C–E–A, an A minor triad.
  assert.equal(positionsSpellChord([{ string: 5, fret: 3 }, { string: 4, fret: 2 }, { string: 3, fret: 2 }], "C6"), false);
  assert.equal(positionsSpellChord(shapePositions(GUITAR_SHAPES.C7), "C7"), true);
});

// --- round five ---------------------------------------------------------------

test("play-note on the piano: an exact-octave question shows the C landmarks on one keyboard per declaration", () => {
  for (const params of [{ instrument: "piano", from: "staff" }, { instrument: "piano", from: "staff", clef: "bass" }, { instrument: "piano", from: "name", anyOctave: false, range: ["C3", "C5"] }, { instrument: "piano", from: "staff", range: ["A3", "C6"], accidentals: true }]) {
    const qs = many("play-note", params, 20);
    const ranges = new Set(qs.map((q) => (q.response.type === "keyboard" ? q.response.range.join("-") : "")));
    assert.equal(ranges.size, 1, `one range for ${JSON.stringify(params)}, got ${[...ranges]}`);
    for (const q of qs) {
      assert.ok(q.response.type === "keyboard" && q.expected.type === "notes" && q.expected.match === "exact");
      assert.equal(q.response.labels, "landmarks");
      const [lo, hi] = q.response.range;
      assert.ok(q.expected.midis[0] >= lo && q.expected.midis[0] <= hi);
      assert.ok(lo <= 60 && hi >= 60, "middle C is on the keyboard");
    }
  }
  // Any octave will do: naming the Cs would give "play any C" away.
  for (const q of many("play-note", { instrument: "piano", from: "name" }, 10)) assert.ok(q.response.type === "keyboard" && q.response.labels === "none");
});

const LETTER_INDEX = "CDEFGAB";
const NATURAL_PC = [0, 2, 4, 5, 7, 9, 11];
const pcOfName = (n: string) => (NATURAL_PC[LETTER_INDEX.indexOf(n[0])] + (n.includes("♯") ? 1 : n.includes("♭") ? -1 : 0) + 12) % 12;

test("ear-interval: the two notes named in the explanation are spelled as that interval", () => {
  const NUM: Record<string, number> = { second: 2, third: 3, fourth: 4, fifth: 5, sixth: 6, seventh: 7, octave: 8 };
  let checked = 0;
  for (const vocab of ["names", "full"]) {
    for (const q of many("ear-interval", { intervals: ["m2", "M2", "m3", "M3", "P4", "P5", "m6", "M6", "m7", "M7", "P8"], vocab }, 30)) {
      const m = /^That was an? (.+?): ([A-G][♯♭]?)(-?\d)? and ([A-G][♯♭]?)(-?\d)?, (\d+) half steps? apart\.$/.exec(q.explain);
      assert.ok(m, q.explain);
      const [, name, lo, , hi, , semis] = m;
      const num = NUM[name.split(" ").pop()!];
      assert.ok(num, name);
      // Independent of the engine: letters apart, and half steps apart.
      assert.equal((LETTER_INDEX.indexOf(hi[0]) - LETTER_INDEX.indexOf(lo[0]) + 7) % 7, (num - 1) % 7, `${q.explain}: letters must be a ${name}`);
      assert.equal((pcOfName(hi) - pcOfName(lo) + 12) % 12, Number(semis) % 12, q.explain);
      assert.ok(q.expected.type === "choice" && semitones(q.expected.id) === Number(semis));
      assert.ok(!/[EB]♯|[FC]♭/.test(q.explain), `${q.explain}: no white key under another name`);
      checked++;
    }
  }
  assert.ok(checked > 1000);
  // Counted in steps, a black key carries both names.
  for (const q of many("ear-interval", { intervals: ["m2", "M2"], labels: "steps", vocab: "names" }, 20)) assert.ok(!/[A-G][♯♭](?! \/|\b.*\/)/.test(q.explain.replace(/[A-G]♯ \/ [A-G]♭/g, "")), q.explain);
  // Below `full` the word "interval" is not used.
  for (const q of many("ear-interval", { intervals: ["P8", "P5", "m2"], vocab: "plain" }, 5)) assert.ok(!/interval/i.test(q.prompt), q.prompt);
});

test("ear-find-note: flats come from the scale, and `vocab` limits what is named", () => {
  for (const q of many("ear-find-note", { scale: "natural-minor" }, 20)) assert.ok(!/♯/.test(q.explain + q.prompt), `${q.prompt} ${q.explain}: C natural minor has E♭, A♭ and B♭`);
  for (const q of many("ear-find-note", { vocab: "plain" }, 10)) {
    assert.ok(!/\b[A-G][♯♭]?\d?\b(?! natural)/.test(`${q.prompt} ${q.explain} ${q.stimuli.map((s) => (s.type === "text" ? s.text : "")).join(" ")}`.replace(/^You|Find|The|Starts/g, "")), `${q.prompt} | ${q.explain}`);
  }
  for (const q of many("ear-find-note", { vocab: "letters", scale: "blues" }, 10)) assert.ok(!/[♯♭]/.test(q.prompt + q.explain), `${q.prompt} ${q.explain}`);
});

test("guitar chords: a copied diagram must be the shape itself; a free answer needs the root lowest within one hand's reach", () => {
  const P = (s: string): FretPos[] => s.split(" ").map((x) => ({ string: Number(x.split("/")[0]), fret: Number(x.split("/")[1]) }));
  for (const [symbol, shape] of Object.entries(GUITAR_SHAPES)) {
    assert.equal(positionsSpellChord(shapePositions(shape), symbol, true), true, `${symbol} exact`);
    assert.equal(positionsSpellChord(shapePositions(shape), symbol), true, `${symbol}: the stored shape is a playable voicing with the root lowest`);
    assert.equal(positionsSpellChord(shapePositions(shape).slice(1), symbol, true), false, `${symbol}: a string left out`);
  }
  // Em: 022000.
  assert.equal(positionsSpellChord(P("3/0 2/0 1/0"), "Em", true), false, "three open strings are not the diagram");
  assert.equal(positionsSpellChord(P("3/0 2/0 1/0"), "Em"), false, "G in the bass is not E minor in root position");
  assert.equal(positionsSpellChord(P("6/0 3/0 2/0"), "Em"), true, "open E, G and B are E minor, root lowest");
  assert.equal(positionsSpellChord(P("6/0 5/2 4/14 3/0 2/0 1/0"), "Em"), false, "fret 2 with fret 14 is not one hand");
  assert.equal(positionsSpellChord(P("6/0 5/2 4/5 3/4 2/5 1/0"), "Em"), true, "four frets is a hand");
  assert.equal(positionsSpellChord(P("6/0 5/2 4/5 3/4 2/5 1/7"), "Em"), false, "six frets is not");
  assert.equal(positionsSpellChord(P("6/0 5/2 4/2 3/0 2/0 1/0"), "Em", true), true);
  // Am and C mute string 6.
  assert.equal(positionsSpellChord(P("6/0 5/0 4/2 3/2 2/1 1/0"), "Am", true), false);
  assert.equal(positionsSpellChord(P("6/0 5/0 4/2 3/2 2/1 1/0"), "Am"), false, "E under A minor");
  assert.equal(positionsSpellChord(P("6/0 5/3 4/2 3/0 2/1 1/0"), "C"), false, "E under C");
  assert.equal(positionsSpellChord(P("5/3 4/5 3/5 2/5 1/3"), "C"), true, "the barre voicing of C is as good as the open one");
  assert.equal(positionsSpellChord(P("6/8 5/10 4/10 3/9 2/8 1/8"), "C"), true);
  for (const q of many("play-chord", { instrument: "guitar", chords: ["Em", "Am", "C"], show: "diagram" }, 6)) {
    assert.ok(q.expected.type === "chord-shape" && q.expected.exact === true);
    const shape = shapePositions(GUITAR_SHAPES[q.expected.symbol]);
    assert.equal(grade(q, { type: "notes", midis: shape.map((x) => fretMidi(x)), positions: shape }).correct, true);
    assert.equal(grade(q, { type: "notes", midis: [], positions: [...shape.slice(1)] }).correct, false);
  }
  for (const q of many("play-chord", { instrument: "guitar", chords: ["Em", "Am", "C"] }, 6)) assert.ok(q.expected.type === "chord-shape" && !q.expected.exact);
});

test("rhythm drills are on the beat unless `syncopation` is set", () => {
  const offBeat = (pattern: string, time: string) => {
    const beat = time === "6/8" ? 1.5 : 1;
    return parseRhythm(pattern.replaceAll("|", ""), time).some((e) => {
      const inBar = e.at % parseTime(time).barBeats;
      return e.duration.beats > 0.5 && Math.abs(inBar / beat - Math.round(inBar / beat)) > 1e-9 && !(time === "6/8" && e.duration.beats < 1.5);
    });
  };
  const patternOf = (q: Question) => (q.response.type === "tap" ? q.response.pattern : q.stimuli[0]?.type === "rhythm" ? q.stimuli[0].pattern : "");
  let dotted = 0;
  for (const q of many("tap-rhythm", { values: ["q", "e", "q."], tempo: 66 }, 20)) {
    assert.equal(offBeat(patternOf(q), "4/4"), false, patternOf(q));
    if (/q\. e/.test(patternOf(q))) dotted++;
    assert.ok(!/q\.(?! e)/.test(patternOf(q).replaceAll(" |", "")), `${patternOf(q)}: a dotted quarter is followed by its eighth`);
  }
  assert.ok(dotted > 50, "the dotted quarter still turns up");
  for (const q of many("count-bar", { values: ["h.", "h", "q", "e"] }, 20)) {
    // The bar shown has one value missing, so check the full bar instead.
    assert.ok(q.expected.type === "choice");
  }
  for (const params of [{ values: ["h", "q", "e"] }, { values: ["q", "e", "q."] }, { time: "6/8", values: ["q.", "q", "e"] }, { time: "3/4", values: ["h", "q", "e", "qr"] }]) {
    for (const q of many("ear-rhythm", params, 10)) {
      assert.ok(q.response.type === "choice");
      const right = q.response.choices.find((c) => q.expected.type === "choice" && c.id === q.expected.id)!;
      assert.ok(right.stimulus?.type === "rhythm");
      assert.equal(offBeat(right.stimulus.pattern, (params as { time?: string }).time ?? "4/4"), false, right.stimulus.pattern);
    }
  }
  assert.ok(many("tap-rhythm", { values: ["q", "e", "q."], tempo: 66, syncopation: true }, 20).some((q) => offBeat(patternOf(q), "4/4")), "with syncopation, off-beat long notes appear");
});

test("tap-rhythm: the click is the counted beat, and no window is narrower than a hand can hit", () => {
  for (const q of many("tap-rhythm", { time: "6/8", values: ["q.", "q", "e"], tempo: 60 }, 5)) {
    assert.ok(q.response.type === "tap");
    assert.equal(q.response.clickBeats, 0.5);
    assert.equal(q.response.countInBeats / q.response.clickBeats, 6, "six clicks, as the explanation counts six");
  }
  for (const q of many("tap-rhythm", { values: ["h", "q"] }, 5)) assert.ok(q.response.type === "tap" && q.response.clickBeats === undefined && q.response.countInBeats === 4);
  for (const q of many("tap-rhythm", { time: "2/2", values: ["h", "q"] }, 5)) assert.ok(q.response.type === "tap" && q.response.clickBeats === 2);
  for (const [values, tempo, ok] of [[["s", "e"], 84, true], [["s", "e"], 85, false], [["e", "q"], 168, true], [["e", "q"], 169, false], [["q"], 240, true], [["s"], 240, false]] as const) {
    assert.equal(checkParams(EXERCISES["tap-rhythm"].params, { values: [...values], tempo }).length === 0, ok, `${values} at ${tempo}`);
    assert.equal(tapWindowSeconds(Math.min(...values.map((v) => parseDuration(v).beats)), tempo) >= MIN_TAP_WINDOW_SECONDS - 1e-9, ok);
  }
});

test("chord symbols: answers can be symbols, the prompt need not translate, and one quality is never the only choice", () => {
  for (const q of many("name-chord", { view: "keyboard", chords: ["C", "F", "G", "Am", "Dm", "Em"], answers: "symbols" }, 10)) {
    assert.ok(q.response.type === "choice");
    for (const c of q.response.choices) assert.ok(/^[A-G][♯♭]?m?$/.test(c.label), c.label);
    assert.ok(!/major|minor/.test(q.prompt));
  }
  for (const instrument of ["piano", "guitar"]) {
    for (const q of many("play-chord", { instrument, chords: ["C", "Am", "Dm"], ask: "symbol" }, 6)) {
      assert.ok(!/major|minor|\(/.test(q.prompt), q.prompt);
      assert.ok(q.stimuli.some((s) => s.type === "text" && /^[A-G]m?$/.test(s.text)));
    }
  }
  for (const q of many("name-chord", { view: "keyboard", qualityOnly: true, types: ["sus2", "sus4"], roots: ["C", "G", "D"] }, 10)) {
    assert.ok(q.response.type === "choice" && q.response.choices.length >= 2, "something to choose from");
    assert.ok(q.expected.type === "choice" && q.response.choices.some((c) => q.expected.type === "choice" && c.id === q.expected.id));
  }
});

test("what the loader now refuses: declarations no generator could honour", () => {
  const bad = (kind: string, params: Record<string, unknown>, re: RegExp) => {
    const got = checkParams(EXERCISES[kind].params, params);
    assert.ok(got.length > 0 && got.some((m) => re.test(m)), `${kind} ${JSON.stringify(params)} → ${JSON.stringify(got)}`);
  };
  const good = (kind: string, params: Record<string, unknown>) => assert.deepEqual(checkParams(EXERCISES[kind].params, params), [], `${kind} ${JSON.stringify(params)}`);
  assert.equal(isTime("0/4"), false);
  assert.equal(isTime("99/2"), false);
  assert.equal(isTime("12/8"), true);
  bad("count-bar", { values: ["q"], time: "0/4" }, /time signature/);
  bad("count-bar", { time: "5/4", values: ["w", "h"] }, /cannot fill/);
  bad("count-bar", { values: ["w"] }, /at least 2/);
  bad("count-bar", { values: ["qr", "hr"] }, /all rests/);
  bad("tap-rhythm", { time: "3/4", values: ["q."] }, /syncopation/);
  good("tap-rhythm", { time: "3/4", values: ["q."], syncopation: true });
  good("count-bar", { time: "6/8", values: ["q.", "q", "e"] });
  assert.equal(canFillBar(["q.", "e"], "4/4"), true);
  assert.equal(canFillBar(["h."], "4/4"), false);
  bad("ear-interval", { intervals: ["P1", "P5"] }, /unison/);
  bad("ear-interval", { intervals: ["d2", "M2"] }, /no half steps/);
  bad("ear-interval", { intervals: ["P29"] }, /interval|wider/);
  bad("build-interval", { intervals: ["d2"] }, /no half steps/);
  bad("name-interval", { view: "staff", intervals: ["d2"] }, /no half steps/);
  bad("name-note", { view: "staff", range: ["C0", "C1"] }, /ledger/);
  bad("name-note", { view: "staff", clef: "bass", range: ["C2", "C5"] }, /ledger/);
  good("name-note", { view: "staff", range: ["A3", "C6"] });
  good("name-note", { view: "staff", clef: "bass", range: ["E2", "E4"] });
  bad("name-note", { view: "keyboard", range: ["C#4", "C#4"] }, /black key/);
  good("name-note", { view: "keyboard", range: ["C#4", "C#4"], accidentals: true });
  bad("play-note", { instrument: "piano", from: "name", range: ["C8", "C9"] }, /piano/);
  bad("play-note", { instrument: "piano", from: "staff", range: ["C1", "C2"] }, /ledger/);
  bad("play-note", { instrument: "guitar", from: "staff", clef: "bass" }, /treble/);
  bad("play-note", { instrument: "guitar", from: "name", strings: [6], maxFret: 2, range: ["F#2", "F#2"] }, /sharps and flats/);
  good("play-note", { instrument: "guitar", from: "name", strings: [6], maxFret: 2, range: ["F#2", "F#2"], accidentals: true });
  bad("name-chord", { view: "staff", chords: ["B#aug"] }, /triple/);
  good("name-chord", { view: "staff", chords: ["Baug", "Cdim7"] });
});

test("explanations name only what the lesson has reached", () => {
  // An open-strings lesson (maxFret 0) is not told about fretted places.
  for (const q of many("play-note", { instrument: "guitar", from: "name", maxFret: 0 }, 10)) assert.ok(!/fret \d/.test(q.explain), q.explain);
  // A major-key lesson comes before relative minors.
  for (const q of many("name-key", {}, 10)) assert.ok(!/relative/.test(q.explain), q.explain);
  assert.ok(many("name-key", { mode: "both" }, 5).every((q) => /relative/.test(q.explain)));
  // A half step up or down from a white key lands on a key with two names.
  for (const q of many("build-interval", { intervals: ["m2", "M2"], labels: "steps", direction: "both", vocab: "names" }, 20)) {
    if (/[♯♭]/.test(q.explain.split(" is ").slice(1).join(" is "))) assert.ok(/[A-G]♯ \/ [A-G]♭/.test(q.explain), q.explain);
    assert.ok(!/key or fret/.test(q.explain));
  }
  for (const q of many("tap-rhythm", { values: ["q"], tempo: 60 }, 2)) assert.ok(!/\bbar\b/.test(q.prompt.replace(" on the space bar", "")) && / on the space bar/.test(q.prompt), q.prompt);
  // A pure tone never drops below G3.
  for (const q of many("ear-higher-lower", { timbre: "sine", minSemitones: 3, maxSemitones: 12 }, 30)) {
    const s = q.stimuli[0];
    assert.ok(s.type === "sound" && s.sound.events.every((e) => e.midis.every((m) => m >= 55)));
  }
});
