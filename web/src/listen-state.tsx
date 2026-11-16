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
  /** A setting that could not be saved (kept until the next setting or a
   *  dismiss: a narration it restarts must not wipe it), and a passage that
   *  could not be read (until the next passage). */
  const [settingsError, setError] = useState<string | null>(null);
  const [speechError, setSpeechError] = useState<string | null>(null);
  const error = settingsError ?? speechError;
  const current = useRef<NarrationHandle | null>(null);
  /** The last single passage spoken, for Start/Back to replay when no page
   *  sequence is registered. Text only: replaying must not call back into
   *  the page that spoke it (it may be gone, or be a lesson). */
  const last = useRef<string | null>(null);
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
    last.current = null;
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
      setError(null);
      if (!next) stop();
      void putSettings(learnerId, { listenMode: next }).catch((e: Error) => {
        setOnState(!next);
        setError(`Could not turn Listen mode ${next ? "on" : "off"}: ${e.message}`);
      });
    },
    [learnerId, stop],
  );
  const setVoiceId = useCallback(
    (id: string) => {
      const was = voiceId;
      setVoiceIdState(id);
      setError(null);
      void putSettings(learnerId, { ttsVoiceId: id }).catch((e: Error) => {
        setVoiceIdState(was);
        setError(`Could not save the voice: ${e.message}`);
      });
    },
    [learnerId, voiceId],
  );
  const setModelId = useCallback(
    (id: string) => {
      const was = modelId;
      setModelIdState(id);
      setError(null);
      void putSettings(learnerId, { ttsModelId: id }).catch((e: Error) => {
        setModelIdState(was);
        setError(`Could not save the quality: ${e.message}`);
      });
    },
    [learnerId, modelId],
  );

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
        setSpeechError("Choose a voice before using Listen mode.");
        opts.onError?.(new Error("Choose a voice before using Listen mode."));
        return null;
      }
      last.current = text;
      setSpeechError(null);
      // Ended, failed, or stopped from outside (a widget or key taking the
      // speakers: claimStage): back to idle, so Start works again.
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
          if (current.current !== made) return;
          if (s === "done") done();
          else setTransport(s);
        },
        onEnd: () => {
          done();
          opts.onEnd?.();
        },
        onError: (e) => {
          // Shown in the bar whatever the page does: the page that asked may
          // have gone (a resume that fails after leaving it).
          setSpeechError(`Could not read this aloud: ${e.message}`);
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
    last.current = null;
    return () => {
      if (sequence.current === s) sequence.current = null;
      last.current = null;
    };
  }, []);
  const play = useCallback(() => {
    const h = current.current;
    if (h && h.state === "paused") return h.resume();
    if (h && h.state !== "done") return;
    if (sequence.current) sequence.current.start();
    else if (last.current) speak(last.current);
  }, [speak]);
  const pause = useCallback(() => current.current?.pause(), []);
  const seek = useCallback((d: number) => current.current?.seek(d), []);
  const back = useCallback(() => {
    if (sequence.current) sequence.current.back(current.current?.currentTime ?? 0);
    else if (last.current) speak(last.current);
  }, [speak]);
  const skip = useCallback(() => {
    if (sequence.current) sequence.current.skip();
    else stop();
  }, [stop]);
  const stopAll = useCallback(() => {
    stop();
    sequence.current?.stop();
  }, [stop]);
  const clearError = useCallback(() => {
    setError(null);
    setSpeechError(null);
  }, []);

  const value = useMemo<ListenState>(
    () => ({
      on, setOn, voiceId, setVoiceId, modelId, setModelId, ttsModels, ttsConfigured, voices, voicesLoading, voicesError, loadVoices, speak, stop, speaking,
      transport, current: handle, registerSequence, play, pause, seek, back, skip, stopAll, error, clearError,
    }),
    [on, setOn, voiceId, setVoiceId, modelId, setModelId, ttsModels, ttsConfigured, voices, voicesLoading, voicesError, loadVoices, speak, stop, speaking, transport, handle, registerSequence, play, pause, seek, back, skip, stopAll, error, clearError],
  );
  return <ListenContext.Provider value={value}>{children}</ListenContext.Provider>;
}
