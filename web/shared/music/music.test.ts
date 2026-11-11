import assert from "node:assert/strict";
import { test } from "node:test";
import * as M from "./index.ts";

const names = (ps: M.Pitch[]) => ps.map(M.pitchName).join(" ");

test("pitches round-trip and map to MIDI and Hz", () => {
  assert.equal(M.midiOf("C4"), 60);
  assert.equal(M.midiOf("A4"), 69);
  assert.equal(M.midiOf("Bb3"), 58);
  assert.equal(M.midiOf("Cb4"), 59);
  assert.equal(M.midiOf("B#3"), 60);
  assert.equal(M.midiName(61), "C#4");
  assert.equal(M.midiName(61, "flat"), "Db4");
  assert.equal(M.freqOf(69), 440);
  assert.ok(Math.abs(M.freqOf(60) - 261.626) < 0.01);
  assert.deepEqual(M.nearestNote(446), { midi: 69, cents: 23 });
  assert.throws(() => M.parsePitch("H4"));
  assert.equal(M.pitchLabel(M.parsePitch("F#3")), "F♯3");
});

test("intervals: size, spelling, naming", () => {
  assert.equal(M.semitones("P5"), 7);
  assert.equal(M.semitones("m7"), 10);
  assert.equal(M.semitones("d7"), 9);
  assert.equal(M.semitones("M9"), 14);
  assert.equal(M.pitchName(M.transpose(M.parsePitch("C4"), "M3")), "E4");
  assert.equal(M.pitchName(M.transpose(M.parsePitch("B3"), "m2")), "C4");
  assert.equal(M.pitchName(M.transpose(M.parsePitch("F#4"), "M3")), "A#4");
  assert.equal(M.pitchName(M.transpose(M.parsePitch("C4"), "P5", -1)), "F3");
  assert.equal(M.intervalText(M.intervalBetween(M.parsePitch("C4"), M.parsePitch("G4"))), "P5");
  assert.equal(M.intervalText(M.intervalBetween(M.parsePitch("E4"), M.parsePitch("C4"))), "M3");
  assert.equal(M.intervalText(M.intervalBetween(M.parsePitch("F4"), M.parsePitch("B4"))), "A4");
  assert.equal(M.intervalText(M.intervalBetween(M.parsePitch("B3"), M.parsePitch("F4"))), "d5");
  assert.equal(M.intervalName("m3"), "minor third");
  assert.throws(() => M.parseInterval("M5"));
  assert.throws(() => M.parseInterval("P3"));
  for (const iv of M.SIMPLE_INTERVALS) assert.equal(M.intervalOfSemitones(M.semitones(iv)), iv);
});

test("scales are spelled with one of each letter", () => {
  assert.equal(names(M.scaleNotes("C4", "major")), "C4 D4 E4 F4 G4 A4 B4");
  assert.equal(names(M.scaleNotes("F4", "major")), "F4 G4 A4 Bb4 C5 D5 E5");
  assert.equal(names(M.scaleNotes("E4", "major")), "E4 F#4 G#4 A4 B4 C#5 D#5");
  assert.equal(names(M.scaleNotes("A3", "natural-minor", true)), "A3 B3 C4 D4 E4 F4 G4 A4");
  assert.equal(names(M.scaleNotes("A3", "minor-pentatonic")), "A3 C4 D4 E4 G4");
  assert.equal(names(M.scaleNotes("A3", "blues")), "A3 C4 D4 Eb4 E4 G4");
  assert.deepEqual(M.stepPattern("major"), [2, 2, 1, 2, 2, 2, 1]);
  assert.deepEqual(M.stepPattern("natural-minor"), [2, 1, 2, 2, 1, 2, 2]);
  assert.deepEqual(M.stepPattern("minor-pentatonic"), [3, 2, 2, 3, 2]);
});

test("key signatures", () => {
  assert.deepEqual(M.keySignature("C"), { count: 0, letters: [] });
  assert.deepEqual(M.keySignature("D"), { count: 2, letters: ["F", "C"] });
  assert.deepEqual(M.keySignature("Eb"), { count: -3, letters: ["B", "E", "A"] });
  assert.deepEqual(M.keySignature("Em"), { count: 1, letters: ["F"] });
  assert.deepEqual(M.keySignature("Dm"), { count: -1, letters: ["B"] });
  assert.equal(M.keyOfSignature(3), "A");
  assert.equal(M.keyOfSignature(-2, "minor"), "Gm");
  assert.equal(M.relativeMinor("C"), "Am");
  // every major scale's accidentals match its signature
  for (let n = -7; n <= 7; n++) {
    const key = M.keyOfSignature(n);
    const sig = M.keySignature(key);
    const scale = M.scaleNotes({ ...M.parsePitchClass(key), oct: 4 }, "major");
    const altered = scale.filter((p) => p.acc !== 0).map((p) => p.letter).sort();
    assert.deepEqual(altered, [...sig.letters].sort(), key);
  }
});

test("chords: symbols, notes, identification, in a key", () => {
  assert.equal(names(M.chordNotes("C")), "C4 E4 G4");
  assert.equal(names(M.chordNotes("Am", 3)), "A3 C4 E4");
  assert.equal(names(M.chordNotes("G7", 3)), "G3 B3 D4 F4");
  assert.equal(names(M.chordNotes("F#m7", 3)), "F#3 A3 C#4 E4");
  assert.equal(names(M.chordNotes("Bdim", 3)), "B3 D4 F4");
  assert.equal(names(M.chordNotes("Cmaj7")), "C4 E4 G4 B4");
  assert.equal(M.chordSymbol(M.parseChord("Bbmaj7")), "Bbmaj7");
  assert.throws(() => M.parseChord("Cmajor"));
  assert.equal(M.chordSymbol(M.identifyChord([60, 64, 67])[0]), "C");
  assert.equal(M.chordSymbol(M.identifyChord([57, 60, 64])[0]), "Am");
  assert.equal(M.chordSymbol(M.identifyChord([64, 67, 72], 64)[0]), "C");
  assert.equal(names(M.invert(M.chordNotes("C"), 1)), "E4 G4 C5");
  assert.equal(M.diatonicTriads("C").map((d) => `${d.roman}=${M.chordSymbol(d.chord)}`).join(" "), "I=C ii=Dm iii=Em IV=F V=G vi=Am vii°=Bdim");
  assert.equal(M.diatonicTriads("Am").map((d) => M.chordSymbol(d.chord)).join(" "), "Am Bdim C Dm Em F G");
  assert.equal(M.chordSymbol(M.romanToChord("C", "vi")), "Am");
  assert.equal(M.chordSymbol(M.romanToChord("G", "V7")), "D7");
  assert.equal(M.chordSymbol(M.romanToChord("C", "bVII")), "Bb");
});

test("staff positions", () => {
  assert.equal(M.staffPosition("E4", "treble"), 0);
  assert.equal(M.staffPosition("F5", "treble"), 8);
  assert.equal(M.staffPosition("C4", "treble"), -2);
  assert.equal(M.staffPosition("C4", "bass"), 10);
  assert.equal(M.staffPosition("G2", "bass"), 0);
  assert.equal(M.staffPosition("F#4", "treble"), 1);
  assert.deepEqual(M.ledgerLines(-2), [-2]);
  assert.deepEqual(M.ledgerLines(-5), [-2, -4]);
  assert.deepEqual(M.ledgerLines(11), [10]);
  assert.deepEqual(M.ledgerLines(4), []);
  assert.equal(M.pitchName(M.pitchAtPosition(4, "treble")), "B4");
  assert.equal(M.pitchName(M.pitchAtPosition(-2, "treble")), "C4");
  assert.equal(M.clefFor("B3"), "bass");
  assert.deepEqual(M.keySignaturePositions(M.keySignature("A"), "treble"), [8, 5, 9]);
  assert.deepEqual(M.keySignaturePositions(M.keySignature("Bb"), "bass"), [2, 5]);
  assert.equal(M.accidentalToDraw(M.parsePitch("F#4"), M.keySignature("G")), null);
  assert.equal(M.accidentalToDraw(M.parsePitch("F4"), M.keySignature("G")), 0);
  assert.equal(M.accidentalToDraw(M.parsePitch("C#4"), M.keySignature("G")), 1);
});

test("fretboard", () => {
  assert.equal(M.fretMidi({ string: 6, fret: 0 }), 40);
  assert.equal(M.fretMidi({ string: 1, fret: 0 }), 64);
  assert.equal(M.fretMidi({ string: 2, fret: 1 }), 60);
  assert.deepEqual(M.positionsOf(64, 12).map(M.fretPosText), ["5/19", "4/14", "3/9", "2/5", "1/0"].filter((s) => Number(s.split("/")[1]) <= 12));
  assert.equal(M.positionsOfPc(4, 12).length, 8); // E: open and 12 on both E strings, one place on each inner string
  // every stored shape really spells the chord it is filed under
  for (const [symbol, shape] of Object.entries(M.GUITAR_SHAPES)) {
    assert.equal(shape.frets.length, 6, symbol);
    assert.equal(shape.fingers.length, 6, symbol);
    assert.ok(M.positionsSpellChord(M.shapePositions(shape), symbol), `${symbol} shape spells ${M.shapeMidis(shape).map((m) => M.pcNameOf(m))}`);
  }
  assert.deepEqual(M.pianoVoicing("C"), [60, 64, 67]);
  assert.deepEqual(M.pianoVoicing("G7"), [55, 59, 62, 65]);
});

test("rhythm, melody and tab tokens", () => {
  const r = M.parseRhythm("q q e e h", "4/4");
  assert.deepEqual(r.map((e) => e.at), [0, 1, 2, 2.5, 3]);
  assert.equal(M.totalBeats(r), 5);
  assert.deepEqual(r.map((e) => e.bar), [0, 0, 0, 0, 0]);
  const m = M.parseMelody("C4:q D4:q E4:h | r:q G4+B4:h.", "4/4");
  assert.deepEqual(m.map((e) => e.midis), [[60], [62], [64], [], [67, 71]]);
  assert.deepEqual(m.map((e) => e.bar), [0, 0, 0, 1, 1]);
  assert.deepEqual(M.barProblems(m, "4/4"), []);
  assert.equal(M.barProblems(M.parseMelody("C4:q D4:q | E4:w", "4/4"), "4/4").length, 1);
  const t = M.parseTab("6/0:q 6/3:q 5/0:h");
  assert.deepEqual(t.map((e) => e.midis[0]), [40, 43, 45]);
  assert.equal(M.parseDuration("h.").beats, 3);
  assert.equal(M.parseDuration("er").rest, true);
  assert.equal(M.parseTime("6/8").barBeats, 3);
  assert.equal(M.countLabel(0.5, "4/4"), "&");
  assert.equal(M.countLabel(2, "4/4"), "3");
  assert.throws(() => M.parseMelody("C4"));
  assert.throws(() => M.parseMelody("H4:q"));
});
