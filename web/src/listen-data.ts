import { createContext, useContext } from "react";
import type { TtsModel, TtsVoice } from "../shared/wire.ts";
import type { NarrateOptions, NarrationHandle } from "./audio/speech.ts";

// Listen mode's shared state: the types, the context and the hook that
// reads it. The provider that fills it is in listen-state.tsx — split the
// same way app-data.ts/state.tsx are, so each hot-reloads cleanly.

/** What the transport bar shows: nothing narrating (idle), fetching the
 *  audio (loading), playing, or paused. */
export type TransportState = "idle" | "loading" | "playing" | "paused";

/** A page that reads a sequence of blocks (a lesson) hands the transport
 *  its own Start/Back/Skip/Stop while it is showing; without one, the
 *  transport works on the last single passage spoken (a tutor reply, an
 *  exercise prompt): Back restarts it, Skip stops it. */
export interface ListenSequence {
  /** Start, when nothing is narrating: the passage it was on (stopped by a
   *  widget's sound, say), on past the widget it waits at, or the top. */
  start: () => void;
  /** Back, given how far into the current passage playback is. */
  back: (elapsedSeconds: number) => void;
  skip: () => void;
  /** Stop: clear the highlight and any widget wait; Start then begins from
   *  the top. (The provider stops the audio itself.) */
  stop: () => void;
}

export interface ListenState {
  /** Whether Listen mode (auto read-aloud) is turned on. Saved per
   *  learner (learners.listen_mode, docs/DATA.md). */
  on: boolean;
  setOn: (on: boolean) => void;
  /** Null until the learner has picked a voice; Listen mode has nothing to
   *  speak with until then. */
  voiceId: string | null;
  setVoiceId: (id: string) => void;
  modelId: string;
  setModelId: (id: string) => void;
  ttsModels: TtsModel[];
  /** Whether ELEVENLABS_API_KEY is reachable at all (server/tts.ts). */
  ttsConfigured: boolean;
  /** The voice catalog, fetched once the picker is opened. */
  voices: TtsVoice[];
  voicesLoading: boolean;
  voicesError: string | null;
  loadVoices: () => void;
  /** Speak `text`, first stopping whatever Listen mode was already saying —
   *  only one passage narrates at a time, across lessons, the tutor and
   *  exercises alike. Returns null (and calls onError) when there is no
   *  voice to speak with. */
  speak: (text: string, opts?: NarrateOptions) => NarrationHandle | null;
  /** Stop whatever is currently narrating, if anything. */
  stop: () => void;
  speaking: boolean;
  /** The transport (src/ListenTransport.tsx). */
  transport: TransportState;
  /** The passage narrating now, if any. */
  current: NarrationHandle | null;
  /** Register the page's block sequence; returns the unregister. */
  registerSequence: (sequence: ListenSequence) => () => void;
  /** Start (idle) or resume (paused). */
  play: () => void;
  pause: () => void;
  /** Move within the current passage, in seconds. */
  seek: (deltaSeconds: number) => void;
  back: () => void;
  skip: () => void;
  /** Stop, and clear the page's place: Start then begins from the top. */
  stopAll: () => void;
  /** The last thing that went wrong (a passage that could not be read, a
   *  Listen setting that could not be saved), for the bar and the picker;
   *  cleared by the next passage or setting. */
  error: string | null;
  clearError: () => void;
}

export const ListenContext = createContext<ListenState | null>(null);

export function useListen(): ListenState {
  const v = useContext(ListenContext);
  if (!v) throw new Error("useListen outside ListenProvider");
  return v;
}
