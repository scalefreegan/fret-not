import { createContext, useContext } from "react";
import type { TtsModel, TtsVoice } from "../shared/wire.ts";
import type { NarrateOptions, NarrationHandle } from "./audio/speech.ts";

// Listen mode's shared state: the types, the context and the hook that
// reads it. The provider that fills it is in listen-state.tsx — split the
// same way app-data.ts/state.tsx are, so each hot-reloads cleanly.

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
}

export const ListenContext = createContext<ListenState | null>(null);

export function useListen(): ListenState {
  const v = useContext(ListenContext);
  if (!v) throw new Error("useListen outside ListenProvider");
  return v;
}
