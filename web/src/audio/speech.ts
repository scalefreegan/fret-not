import { wordAt, type SpokenWord } from "../../shared/tts/alignment.ts";
import { speak as requestSpeech } from "../api/tts.ts";
import { claimStage } from "./index.ts";

// Listen mode's player: speaks one passage through the stored ElevenLabs
// voice (web/server/tts.ts, cached on disk after the first time) and calls
// back as each word sounds, so a reading UI can move a highlight in step.
// A plain HTMLAudioElement, not the note/sample engine in this folder's
// index.ts — narration has no reason to share that engine's AudioContext or
// scheduling clock, but it must still take the "one thing at a time" stage
// (claimStage) that engine already enforces between widgets, so playing a
// note or starting a widget's sound stops the voice, and starting the voice
// stops a widget that was droning.

export interface NarrationHandle {
  pause(): void;
  resume(): void;
  /** Stop for good; no further callbacks fire. */
  stop(): void;
}

export interface NarrateOptions {
  /** Called as playback crosses into a new word, with its index into the
   *  SpokenWord array the server returned. */
  onWord?: (index: number) => void;
  /** Called once the audio finishes on its own (not after stop()). */
  onEnd?: () => void;
  /** The request failed, or the browser could not play the audio (missing
   *  voice, no ELEVENLABS_API_KEY, offline, a blocked autoplay). */
  onError?: (e: Error) => void;
}

/** Speak `text` in the learner's chosen voice. Starts fetching at once;
 *  playback begins once the (possibly cached) audio and its word timings
 *  are back. Returns a handle to pause, resume or stop it early. */
export function narrate(learnerId: string, text: string, opts: NarrateOptions = {}): NarrationHandle {
  let audio: HTMLAudioElement | null = null;
  let words: readonly SpokenWord[] = [];
  let lastWord = -1;
  let stopped = false;
  let release: () => void = () => {};

  const onTimeUpdate = () => {
    if (!audio || !words.length) return;
    const i = wordAt(words, audio.currentTime * 1000, Math.max(0, lastWord));
    if (i !== lastWord) {
      lastWord = i;
      opts.onWord?.(i);
    }
  };
  const finish = () => {
    if (stopped) return;
    stopped = true;
    release();
    opts.onEnd?.();
  };
  const fail = (e: unknown) => {
    if (stopped) return;
    stopped = true;
    release();
    opts.onError?.(e instanceof Error ? e : new Error(String(e)));
  };

  const handle: NarrationHandle = {
    pause() {
      audio?.pause();
    },
    resume() {
      if (!stopped) void audio?.play().catch(fail);
    },
    stop() {
      if (stopped) return;
      stopped = true;
      audio?.pause();
      audio?.removeEventListener("timeupdate", onTimeUpdate);
      release();
    },
  };

  void requestSpeech(learnerId, text).then(
    ({ audioUrl, words: w }) => {
      if (stopped) return; // stop() came in before the request finished
      words = w;
      audio = new Audio(audioUrl);
      audio.addEventListener("timeupdate", onTimeUpdate);
      audio.addEventListener("ended", finish);
      audio.addEventListener("error", () => fail(new Error("the audio could not play")));
      // Taking the stage now, not at the top of narrate(): a stop() during
      // the fetch must not steal (and then immediately release) a stage no
      // widget asked to give up.
      release = claimStage(() => handle.stop());
      void audio.play().catch(fail);
    },
    fail,
  );

  return handle;
}
