import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { TtsModel, TtsVoice } from "../shared/wire.ts";
import { getVoices } from "./api/tts.ts";
import { narrate, type NarrateOptions, type NarrationHandle } from "./audio/speech.ts";
import { ListenContext, type ListenState } from "./listen-data.ts";
import { getSettings, putSettings } from "./tutor/api.ts";

export function ListenProvider({ learnerId, children }: { learnerId: string; children: ReactNode }) {
  const [on, setOnState] = useState(false);
  const [voiceId, setVoiceIdState] = useState<string | null>(null);
  const [modelId, setModelIdState] = useState("eleven_v4");
  const [ttsModels, setTtsModels] = useState<TtsModel[]>([]);
  const [ttsConfigured, setTtsConfigured] = useState(false);
  const [voices, setVoices] = useState<TtsVoice[]>([]);
  const [voicesLoading, setVoicesLoading] = useState(false);
  const [voicesError, setVoicesError] = useState<string | null>(null);
  const [speaking, setSpeaking] = useState(false);
  const current = useRef<NarrationHandle | null>(null);
  const touched = useRef(false);

  useEffect(() => {
    let live = true;
    getSettings(learnerId).then(
      (s) => {
        if (!live) return;
        // A click on the toggle before this load came back wins over it.
        if (!touched.current) setOnState(s.listenMode);
        setVoiceIdState(s.ttsVoiceId);
        setModelIdState(s.ttsModelId);
        setTtsModels(s.ttsModels);
        setTtsConfigured(s.ttsConfigured);
      },
      () => {
        /* Listen mode just stays off; nothing else on the page depends on this */
      },
    );
    return () => {
      live = false;
    };
  }, [learnerId]);

  const stop = useCallback(() => {
    current.current?.stop();
    current.current = null;
    setSpeaking(false);
  }, []);

  const setOn = useCallback(
    (next: boolean) => {
      touched.current = true;
      setOnState(next);
      if (!next) stop();
      void putSettings(learnerId, { listenMode: next }).catch(() => setOnState(!next));
    },
    [learnerId, stop],
  );
  const setVoiceId = useCallback((id: string) => {
    setVoiceIdState(id);
    void putSettings(learnerId, { ttsVoiceId: id }).catch(() => {});
  }, [learnerId]);
  const setModelId = useCallback((id: string) => {
    setModelIdState(id);
    void putSettings(learnerId, { ttsModelId: id }).catch(() => {});
  }, [learnerId]);

  const loadVoices = useCallback(() => {
    setVoicesLoading(true);
    setVoicesError(null);
    getVoices(learnerId).then(
      (r) => {
        setVoices(r.voices);
        setVoicesLoading(false);
      },
      (e: Error) => {
        setVoicesError(e.message);
        setVoicesLoading(false);
      },
    );
  }, [learnerId]);

  const speak = useCallback(
    (text: string, opts: NarrateOptions = {}): NarrationHandle | null => {
      current.current?.stop();
      if (!voiceId) {
        opts.onError?.(new Error("Choose a voice before using Listen mode."));
        return null;
      }
      const handle = narrate(learnerId, text, {
        ...opts,
        onWord: opts.onWord,
        onEnd: () => {
          if (current.current === handle) {
            current.current = null;
            setSpeaking(false);
          }
          opts.onEnd?.();
        },
        onError: (e) => {
          if (current.current === handle) {
            current.current = null;
            setSpeaking(false);
          }
          opts.onError?.(e);
        },
      });
      current.current = handle;
      setSpeaking(true);
      return handle;
    },
    [learnerId, voiceId],
  );

  useEffect(() => stop, [stop]); // leaving the app entirely: stop any voice

  const value = useMemo<ListenState>(
    () => ({ on, setOn, voiceId, setVoiceId, modelId, setModelId, ttsModels, ttsConfigured, voices, voicesLoading, voicesError, loadVoices, speak, stop, speaking }),
    [on, setOn, voiceId, setVoiceId, modelId, setModelId, ttsModels, ttsConfigured, voices, voicesLoading, voicesError, loadVoices, speak, stop, speaking],
  );
  return <ListenContext.Provider value={value}>{children}</ListenContext.Provider>;
}
