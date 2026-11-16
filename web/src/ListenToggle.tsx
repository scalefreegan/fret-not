import { useEffect, useRef, useState } from "react";
import { Button, cx } from "./ui.tsx";
import { useListen } from "./listen-data.ts";

// The header's Listen mode control: a toggle, and — once on — a small panel
// to choose the voice and model (ElevenLabs), mirroring how the tutor's own
// model picker sits next to its drawer (src/tutor/ChatPanel.tsx). Listen
// mode itself (reading each block aloud, pausing at widgets) is driven by
// the pages that have something to read (Lesson, the tutor drawer,
// exercises); this is only the switch and the settings for it.

const selectClass = "min-w-0 rounded-lg border border-line-strong bg-panel px-2 py-1 text-sm text-fg disabled:opacity-60";

export function ListenToggle() {
  const listen = useListen();
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    if (listen.voices.length === 0 && !listen.voicesLoading && !listen.voicesError) listen.loadVoices();
  }, [open, listen]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (box.current && !box.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  return (
    <div ref={box} className="relative">
      <Button
        variant={listen.on ? "primary" : "quiet"}
        size="sm"
        aria-pressed={listen.on}
        aria-label="Listen mode: hear lessons, tutor replies and exercises read aloud"
        onClick={() => {
          listen.setOn(!listen.on);
          if (!listen.on) setOpen(true); // turning it on: offer the voice picker at once
        }}
        onContextMenu={(e) => {
          e.preventDefault();
          setOpen((o) => !o);
        }}
      >
        🔊 Listen
      </Button>
      {open && (
        <div className="absolute top-full right-0 z-20 mt-2 w-72 rounded-xl border border-line-strong bg-panel p-3 shadow-lg">
          <div className="flex items-center justify-between">
            <p className="text-sm font-semibold text-fg">Listen mode</p>
            <button type="button" className="text-sm text-fg-3 hover:text-fg" onClick={() => setOpen(false)} aria-label="Close">
              ✕
            </button>
          </div>
          {!listen.ttsConfigured ? (
            <p className="mt-2 text-sm text-fg-2">Add <code className="font-mono text-xs">ELEVENLABS_API_KEY</code> to <code className="font-mono text-xs">.env.local</code> to turn this on.</p>
          ) : (
            <div className="mt-2 flex flex-col gap-2">
              <label className="flex flex-col gap-1 text-sm text-fg-2">
                Voice
                {listen.voicesError ? (
                  <span className="text-sm text-bad">{listen.voicesError}</span>
                ) : (
                  <select className={selectClass} value={listen.voiceId ?? ""} disabled={listen.voicesLoading} onChange={(e) => listen.setVoiceId(e.target.value)}>
                    <option value="" disabled>
                      {listen.voicesLoading ? "Loading…" : "Choose a voice…"}
                    </option>
                    {listen.voices.map((v) => (
                      <option key={v.id} value={v.id}>
                        {v.name}
                      </option>
                    ))}
                  </select>
                )}
              </label>
              <label className="flex flex-col gap-1 text-sm text-fg-2">
                Quality
                <select className={selectClass} value={listen.modelId} onChange={(e) => listen.setModelId(e.target.value)}>
                  {listen.ttsModels.map((m) => (
                    <option key={m.id} value={m.id} title={m.note}>
                      {m.label}
                    </option>
                  ))}
                </select>
              </label>
              {!listen.voiceId && <p className={cx("text-sm text-fg-3")}>Choose a voice to turn reading aloud on.</p>}
            </div>
          )}
          {listen.error && <p role="alert" className="mt-2 text-sm text-bad">{listen.error}</p>}
        </div>
      )}
    </div>
  );
}
