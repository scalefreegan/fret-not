import assert from "node:assert/strict";
import { test } from "node:test";
import { classifyAnswer } from "../../web/src/exercises/reveal.ts";
import { fretMidi, GUITAR_SHAPES, shapePositions } from "../../web/shared/music/instruments.ts";
import { grade } from "../../web/shared/exercises.ts";

// The marks shown after an answer (web/src/exercises/reveal.ts) must agree
// with the engine's verdict: a wrong answer always shows something wrong or
// missing, a right one never does.

const at = (string, fret) => ({ midi: fretMidi({ string, fret }), pos: { string, fret } });
const key = (p) => `${p.pos.string}/${p.pos.fret}`;

test("chord shape: right notes stay green, the wrong finger is red, the usual shape is shown", () => {
  // A minor is x02210; string 4 is fretted one too high (F instead of E).
  const played = [at(5, 0), at(4, 3), at(3, 2), at(2, 1), at(1, 0)];
  const r = classifyAnswer({ type: "chord-shape", symbol: "Am" }, played, { maxFret: 4 });
  assert.deepEqual(r.given, ["good", "bad", "good", "good", "good"]);
  assert.deepEqual(r.missing.map(key), ["4/2"]);
});

test("chord shape: a correct shape has nothing missing, a chord tone left out is shown", () => {
  for (const [symbol, shape] of Object.entries(GUITAR_SHAPES)) {
    const played = shapePositions(shape).map((p) => at(p.string, p.fret));
    const r = classifyAnswer({ type: "chord-shape", symbol }, played, { maxFret: 5 });
    assert.ok(r.given.every((g) => g === "good"), symbol);
    assert.equal(r.missing.length, 0, symbol);
  }
  // E minor with only the two fretted strings: both right, the open strings missing.
  const r = classifyAnswer({ type: "chord-shape", symbol: "Em" }, [at(5, 2), at(4, 2)], { maxFret: 4 });
  assert.deepEqual(r.given, ["good", "good"]);
  assert.deepEqual(r.missing.map(key).sort(), ["1/0", "2/0", "3/0", "6/0"]);
});

test("ordered scale: two swapped notes are both wrong", () => {
  const scale = [67, 69, 71, 72, 74, 76, 78, 79];
  const played = [67, 69, 72, 71, 74, 76, 78, 79].map((midi) => ({ midi }));
  const r = classifyAnswer({ type: "notes", midis: scale, match: "exact", ordered: true }, played, { range: [60, 84] });
  assert.deepEqual(r.given, ["good", "good", "bad", "bad", "good", "good", "good", "good"]);
});

test("set by pitch class: a note left out is shown, an extra one is red", () => {
  const fMajor = [65, 67, 69, 70, 72, 74, 76];
  const expected = { type: "notes", midis: fMajor, match: "pc", ordered: false };
  const without = fMajor.filter((m) => m !== 69).map((midi) => ({ midi }));
  const r = classifyAnswer(expected, without, { range: [60, 84] });
  assert.ok(r.given.every((g) => g === "good"));
  assert.equal(r.missing.length, 1);
  assert.equal(r.missing[0].midi % 12, 9);
  const extra = classifyAnswer(expected, [...fMajor, 66].map((midi) => ({ midi })), { range: [60, 84] });
  assert.equal(extra.given.at(-1), "bad");
  assert.equal(extra.missing.length, 0);
});

test("tab: only the asked place is right, and it is the only one shown", () => {
  const expected = { type: "notes", midis: [59], match: "exact", ordered: false, positions: [{ string: 2, fret: 0 }] };
  const r = classifyAnswer(expected, [at(3, 4)], { maxFret: 5, single: true });
  assert.deepEqual(r.given, ["bad"]);
  assert.deepEqual(r.missing.map(key), ["2/0"]);
  assert.deepEqual(classifyAnswer(expected, [at(2, 0)], { maxFret: 5, single: true }), { given: ["good"], missing: [] });
});

test("one note: alsoAccept is right; a wrong key shows the nearest right one", () => {
  const expected = { type: "notes", midis: [64], match: "exact", ordered: false, alsoAccept: [63] };
  assert.deepEqual(classifyAnswer(expected, [{ midi: 63 }], { range: [60, 72], single: true }), { given: ["good"], missing: [] });
  const anyC = classifyAnswer({ type: "notes", midis: [60], match: "pc", ordered: false }, [{ midi: 70 }], { range: [48, 84], single: true });
  assert.deepEqual(anyC.given, ["bad"]);
  assert.deepEqual(anyC.missing, [{ midi: 72 }]);
});

test("never contradicts the grade: a wrong answer shows a wrong or missing note", () => {
  const cases = [
    [{ type: "notes", midis: [60, 64, 67], match: "exact", ordered: false }, [60, 64]],
    [{ type: "notes", midis: [60, 64, 67], match: "exact", ordered: false }, [60, 64, 67, 71]],
    [{ type: "notes", midis: [60, 62, 64], match: "exact", ordered: true }, [60, 64, 62]],
    [{ type: "notes", midis: [60, 62, 64], match: "pc", ordered: false }, [72, 74]],
    [{ type: "notes", midis: [60, 62, 64], match: "pc", ordered: false }, [72, 74, 76]],
  ];
  for (const [expected, midis] of cases) {
    const g = grade({ expected }, { type: "notes", midis });
    const r = classifyAnswer(expected, midis.map((midi) => ({ midi })), { range: [48, 84] });
    const flagged = r.given.includes("bad") || r.missing.length > 0;
    assert.equal(flagged, !g.correct, JSON.stringify([expected, midis]));
  }
});
