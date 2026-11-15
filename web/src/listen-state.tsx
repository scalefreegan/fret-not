import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { TtsModel, TtsVoice } from "../shared/wire.ts";
import { getVoices } from "./api/tts.ts";
import { narrate, type NarrateOptions, type NarrationHandle } from "./audio/speech.ts";
import { ListenContext, type ListenSequence, type ListenState, type TransportState } from "./listen-data.ts";
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
  const [transport, setTransport] = useState<TransportState>("idle");
  const [handle, setHandle] = useState<NarrationHandle | null>(null);
  const current = useRef<NarrationHandle | null>(null);
  /** The last single passage spoken, for Back to restart (no sequence). */
  const last = useRef<{ text: string; opts: NarrateOptions } | null>(null);
  const sequence = useRef<ListenSequence | null>(null);
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
    setTransport("idle");
    setHandle(null);
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
      last.current = { text, opts };
      const done = () => {
        if (current.current !== made) return;
        current.current = null;
        setSpeaking(false);
        setTransport("idle");
        setHandle(null);
      };
      const made = narrate(learnerId, text, {
        ...opts,
        onWord: opts.onWord,
        onState: (s) => {
          if (current.current === made && s !== "done") setTransport(s);
        },
        onEnd: () => {
          done();
          opts.onEnd?.();
        },
        onError: (e) => {
          done();
          opts.onError?.(e);
        },
      });
      current.current = made;
      setSpeaking(true);
      setTransport("loading");
      setHandle(made);
      return made;
    },
    [learnerId, voiceId],
  );

  useEffect(() => stop, [stop]); // leaving the app entirely: stop any voice

  // The transport. A page with a block sequence (a lesson) decides Start,
  // Back and Skip; otherwise they act on the last single passage.
  const registerSequence = useCallback((s: ListenSequence) => {
    sequence.current = s;
    return () => {
      if (sequence.current === s) sequence.current = null;
    };
  }, []);
  const play = useCallback(() => {
    const h = current.current;
    if (h && h.state === "paused") return h.resume();
    if (h && h.state !== "done") return;
    if (sequence.current) sequence.current.start();
    else if (last.current) speak(last.current.text, last.current.opts);
  }, [speak]);
  const pause = useCallback(() => current.current?.pause(), []);
  const seek = useCallback((d: number) => current.current?.seek(d), []);
  const back = useCallback(() => {
    if (sequence.current) sequence.current.back(current.current?.currentTime ?? 0);
    else if (last.current) speak(last.current.text, last.current.opts);
  }, [speak]);
  const skip = useCallback(() => {
    if (sequence.current) sequence.current.skip();
    else stop();
  }, [stop]);
  const stopAll = useCallback(() => {
    stop();
    sequence.current?.stop();
  }, [stop]);

  const value = useMemo<ListenState>(
    () => ({
      on, setOn, voiceId, setVoiceId, modelId, setModelId, ttsModels, ttsConfigured, voices, voicesLoading, voicesError, loadVoices, speak, stop, speaking,
      transport, current: handle, registerSequence, play, pause, seek, back, skip, stopAll,
    }),
    [on, setOn, voiceId, setVoiceId, modelId, setModelId, ttsModels, ttsConfigured, voices, voicesLoading, voicesError, loadVoices, speak, stop, speaking, transport, handle, registerSequence, play, pause, seek, back, skip, stopAll],
  );
  return <ListenContext.Provider value={value}>{children}</ListenContext.Provider>;
}
