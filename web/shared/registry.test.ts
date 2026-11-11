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
