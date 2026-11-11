import assert from "node:assert/strict";
import { test } from "node:test";
import type { ExerciseDecl } from "./content.ts";
import type { Given, Question, Sound, Stimulus } from "./exercise-types.ts";
import { GENERATED_KINDS, generateQuestions, grade, makeRng, reviewQuestions } from "./exercises.ts";
import { chordPcs, parseChord } from "./music/chords.ts";
import { fretMidi, GUITAR_SHAPES, shapePositions } from "./music/instruments.ts";
import { intervalBetween, intervalText, semitones } from "./music/intervals.ts";
import { midiOf, parsePitch, pc } from "./music/notes.ts";
import { parseRhythm, parseTime, totalBeats } from "./music/rhythm.ts";
import { keySignature, scaleNotes } from "./music/scales.ts";
import { checkParams, EXERCISES } from "./registry.ts";

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
  if (e.type === "notes") return { type: "notes", midis: [...e.midis] };
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
    const out: Given[] = [{ type: "notes", midis: e.midis.map((m) => m + 1) }, { type: "notes", midis: [] }, { type: "choice", id: "x" }];
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
      assert.ok(Math.abs((q.expected.toleranceBeats * 60) / r.tempo - 0.11) < 1e-9, `${where}: about 110 ms`);
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

test("odd but loader-valid parameters never throw and still give sound questions", () => {
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
    ["ear-find-note", { range: ["C#4", "C#4"] }],
    ["ear-find-note", { instrument: "guitar", range: ["C1", "D1"] }],
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
    assert.deepEqual(checkParams(EXERCISES[kind].params, params), [], `${kind} ${JSON.stringify(params)} is loader-valid`);
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
