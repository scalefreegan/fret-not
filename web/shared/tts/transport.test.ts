import assert from "node:assert/strict";
import { test } from "node:test";
import { wordAt, type SpokenWord } from "./alignment.ts";
import { backTarget, nextStop, seekTarget, skipTarget, type StopKind } from "./transport.ts";

// prose, widget, (nothing to say), prose, prose, widget
const kinds: StopKind[] = ["text", "widget", "empty", "text", "text", "widget"];

test("Skip goes to the next stop: past a widget, over an empty block, and off the end", () => {
  assert.equal(skipTarget(kinds, null), 0, "from idle: the top");
  assert.equal(skipTarget(kinds, 0), 1, "prose → the widget after it");
  assert.equal(skipTarget(kinds, 1), 3, "waiting at a widget → the prose after it, over the empty block");
  assert.equal(skipTarget(kinds, 4), 5);
  assert.equal(skipTarget(kinds, 5), null, "the last stop: reading is over");
  assert.equal(nextStop(["empty", "empty"], 0), null);
});

test("Back restarts the block when more than ~2s in, else the prose before; widgets are passed over", () => {
  assert.equal(backTarget(kinds, 4, 5), 4, "well into a block: restart it");
  assert.equal(backTarget(kinds, 4, 1), 3, "at its start: the block before");
  assert.equal(backTarget(kinds, 3, 0.5), 0, "over the widget and the empty block to the prose before");
  assert.equal(backTarget(kinds, 0, 0.5), 0, "nothing before the first: restart it");
  assert.equal(backTarget(kinds, 1, 0), 0, "waiting at a widget: the prose before it again");
  assert.equal(backTarget(kinds, null, 0), 0, "from idle: the top");
  assert.equal(backTarget(["widget", "text"], 0, 0), 0, "a widget with no prose before: it stays there");
});

test("a seek stays inside the audio, and short of its very end", () => {
  assert.equal(seekTarget(3, -5, 20), 0);
  assert.equal(seekTarget(3, 5, 20), 8);
  assert.equal(seekTarget(18, 5, 20), 19.95, "so the audio still ends by itself");
  assert.equal(seekTarget(3, 5, Number.NaN), 8, "a length not known yet only clamps at 0");
  assert.equal(seekTarget(Number.NaN, 5, 20), 5);
});

test("after a seek back, the word highlight follows from the start, not from the last word", () => {
  const w = (text: string, startMs: number, endMs: number): SpokenWord => ({ text, startMs, endMs, charStart: 0, charEnd: 0 });
  const words = [w("one", 0, 400), w("two", 500, 900), w("three", 1000, 1400), w("four", 1500, 1900)];
  assert.equal(wordAt(words, 1600, 2), 3);
  // What the player does after a seek: search from 0, not from the old index.
  assert.equal(wordAt(words, 600, 0), 1);
  assert.notEqual(wordAt(words, 600, 3), 1, "searching on from the old index lands on the wrong word");
});
