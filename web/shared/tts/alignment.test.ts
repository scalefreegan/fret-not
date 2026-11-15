import assert from "node:assert/strict";
import { test } from "node:test";
import { wordAt, wordsFromAlignment, type CharAlignment } from "./alignment.ts";

/** Build a fixture alignment for `text` where each character takes
 *  `msPerChar` milliseconds, back-to-back — enough to pin the grouping and
 *  timing logic without a real ElevenLabs response. */
function fixture(text: string, msPerChar = 100): CharAlignment {
  const characters = [...text];
  const character_start_times_seconds = characters.map((_, i) => (i * msPerChar) / 1000);
  const character_end_times_seconds = characters.map((_, i) => ((i + 1) * msPerChar) / 1000);
  return { characters, character_start_times_seconds, character_end_times_seconds };
}

test("wordsFromAlignment groups characters into words at whitespace", () => {
  const words = wordsFromAlignment(fixture("hi there"));
  assert.deepEqual(words.map((w) => w.text), ["hi", "there"]);
  assert.equal(words[0].startMs, 0);
  assert.equal(words[0].endMs, 200); // "hi" = chars 0,1 -> end of char 1
  assert.equal(words[1].charStart, 3);
  assert.equal(words[1].charEnd, 8);
});

test("wordsFromAlignment tolerates leading, trailing and repeated whitespace", () => {
  const words = wordsFromAlignment(fixture("  a   b  "));
  assert.deepEqual(words.map((w) => w.text), ["a", "b"]);
});

test("wordsFromAlignment refuses mismatched array lengths", () => {
  const bad = fixture("hi");
  bad.character_end_times_seconds.pop();
  assert.throws(() => wordsFromAlignment(bad), /different lengths/);
});

test("wordAt finds the word sounding at a given time, and the gap before the next one", () => {
  const words = wordsFromAlignment(fixture("one two three", 100));
  assert.equal(wordAt(words, 0), 0);
  assert.equal(wordAt(words, 50), 0);
  assert.equal(words[0].text, "one");
  const gapMs = words[1].startMs - words[0].endMs;
  if (gapMs > 0) assert.equal(wordAt(words, words[0].endMs + 1), 0, "mid-gap still reports the word just finished");
  assert.equal(wordAt(words, words[1].startMs), 1);
  assert.equal(wordAt(words, 1_000_000), words.length - 1, "past the end reports the last word");
});
