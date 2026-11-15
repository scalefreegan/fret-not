// Turns ElevenLabs' per-character timestamps into per-word timings the UI
// can walk as audio plays. Pure: no network, no DOM — runs in the browser,
// the server and `node --test` alike, like the rest of web/shared/.

/** The alignment block ElevenLabs' `/with-timestamps` endpoint returns
 *  alongside the audio: one entry per character of the text that was sent. */
export interface CharAlignment {
  characters: string[];
  character_start_times_seconds: number[];
  character_end_times_seconds: number[];
}

/** One spoken word, timed in milliseconds from the start of the audio, with
 *  the character range it covers in the original text (so a renderer can
 *  match it back to the text it already shows). */
export interface SpokenWord {
  text: string;
  startMs: number;
  endMs: number;
  charStart: number;
  charEnd: number;
}

/** Group a character alignment into words, splitting on whitespace. A
 *  leading/trailing run of whitespace characters is dropped; punctuation
 *  stays attached to the word it follows (ElevenLabs times it as part of
 *  that word's trailing silence). Throws if the three arrays disagree in
 *  length — that would mean the response shape changed underneath us. */
export function wordsFromAlignment(alignment: CharAlignment): SpokenWord[] {
  const { characters: chars, character_start_times_seconds: starts, character_end_times_seconds: ends } = alignment;
  if (chars.length !== starts.length || chars.length !== ends.length) {
    throw new Error("alignment arrays have different lengths");
  }
  const words: SpokenWord[] = [];
  let wordStart = -1;
  let buf = "";
  const flush = (end: number) => {
    if (wordStart < 0) return;
    words.push({ text: buf, startMs: Math.round(starts[wordStart] * 1000), endMs: Math.round(ends[end] * 1000), charStart: wordStart, charEnd: end + 1 });
    wordStart = -1;
    buf = "";
  };
  for (let i = 0; i < chars.length; i++) {
    if (/\s/.test(chars[i])) {
      flush(i - 1);
    } else {
      if (wordStart < 0) wordStart = i;
      buf += chars[i];
    }
  }
  flush(chars.length - 1);
  return words;
}

/** The word, if any, sounding at `ms` milliseconds into playback. Binary
 *  search would be overkill for a lesson paragraph's word count; a linear
 *  scan from the last known index (passed as `from`) is what the player
 *  actually needs, called once per `timeupdate`. */
export function wordAt(words: readonly SpokenWord[], ms: number, from = 0): number {
  for (let i = Math.max(0, from); i < words.length; i++) {
    if (ms < words[i].startMs) return i > 0 ? i - 1 : 0;
    if (ms <= words[i].endMs) return i;
  }
  return words.length - 1;
}
