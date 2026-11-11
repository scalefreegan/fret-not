import assert from "node:assert/strict";
import { test } from "node:test";
import { checkParam, checkParams, EXERCISES, WIDGETS } from "./registry.ts";

test("no parameter name collides with the block's own keys", () => {
  // A widget block's `type:` names the widget, so a parameter called `type`
  // can never be written (YAML refuses the duplicate key).
  for (const [name, w] of Object.entries(WIDGETS)) assert.ok(!("type" in w.params), `widget ${name} has a parameter called type`);
  for (const [name, e] of Object.entries(EXERCISES)) for (const reserved of ["kind", "concept", "count", "title"]) assert.ok(!(reserved in e.params), `exercise ${name} has a parameter called ${reserved}`);
});

test("parameter checks accept good values and explain bad ones", () => {
  assert.equal(checkParam("pitch", "C4"), null);
  assert.match(checkParam("pitch", "C") ?? "", /octave/);
  assert.equal(checkParam("range", ["C4", "C5"]), null);
  assert.equal(checkParam("enum:a|b", "a"), null);
  assert.match(checkParam("enum:a|b", "c") ?? "", /one of/);
  assert.equal(checkParam("melody", "C4:q D4:q | E4:h"), null);
  assert.ok(checkParam("melody", "C4 D4"));
  assert.equal(checkParam("chord[]", ["C", "Am", "G7"]), null);
  assert.ok(checkParam("chord[]", ["Cmajor"]));
  assert.equal(checkParam("questions", [{ q: "x?", choices: ["a", "b"], answer: 2 }]), null);
  assert.ok(checkParam("questions", [{ q: "x?", choices: ["a", "b"], answer: 3 }]));
  assert.deepEqual(checkParams(WIDGETS.scale.params, { tonic: "C", scale: "major" }), []);
  assert.equal(checkParams(WIDGETS.scale.params, { tonic: "C" }).length, 1);
  assert.equal(checkParams(WIDGETS.keyboard.params, { colour: "red" }).length, 1);
});

test("checks across parameters: intervals too wide for the fretboard, a range with nothing to find", () => {
  const ni = EXERCISES["name-interval"].params;
  assert.deepEqual(checkParams(ni, { view: "fretboard", intervals: ["M9", "m13"] }), []);
  assert.match(checkParams(ni, { view: "fretboard", intervals: ["M9", "P15"] }).join(), /P15 cannot be shown/);
  assert.deepEqual(checkParams(ni, { view: "staff", intervals: ["P15"] }), []);
  assert.match(checkParams(ni, { view: "fretboard", intervals: ["M2", "M9"], labels: "numbers" }).join(), /M9 cannot be shown/);
  assert.deepEqual(checkParams(ni, { view: "fretboard", intervals: ["M2", "P8"], labels: "numbers" }), []);
  const ef = EXERCISES["ear-find-note"].params;
  assert.deepEqual(checkParams(ef, {}), []);
  assert.deepEqual(checkParams(ef, { range: ["C4", "C5"] }), []);
  assert.match(checkParams(ef, { instrument: "piano", scale: "harmonic-minor", range: ["A5", "A5"] }).join(), /no note/);
  assert.match(checkParams(ef, { range: ["C4", "C#4"] }).join(), /only one note/);
  assert.match(checkParams(ef, { instrument: "guitar", range: ["C7", "C8"] }).join(), /no note/);
  // The interval widget can hide qualities.
  assert.deepEqual(checkParams(WIDGETS.interval.params, { from: "C4", to: "E4", labels: "numbers" }), []);
  assert.equal(checkParams(WIDGETS.interval.params, { from: "C4", to: "E4", labels: "steps" }).length, 1);
});
