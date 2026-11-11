import { useRef, useState } from "react";
import { freqOf, midiOf, midiOfFreq } from "../../../shared/music/notes.ts";
import { startPartials, type PartialsHandle } from "../../audio/index.ts";
import { Button, PlayButton, WidgetFrame, cx, pcColor } from "../../ui.tsx";
import { num, str } from "../params.ts";
import type { WidgetProps } from "../types.ts";
import { fmtHz, useHeldSound, wavePath } from "./common.ts";

// One slider per harmonic. The waveform drawn is Σ aₙ·sin(2π·n·x), the same
// sum the audio engine plays.

const PRESETS: Record<string, { label: string; amp: (n: number) => number }> = {
  sine: { label: "Pure tone", amp: (n) => (n === 1 ? 1 : 0) },
  saw: { label: "Sawtooth", amp: (n) => 1 / n },
  square: { label: "Square", amp: (n) => (n % 2 ? 1 / n : 0) },
  // A triangle's odd harmonics alternate in sign as well as falling off fast.
  triangle: { label: "Triangle", amp: (n) => (n % 2 ? (n % 4 === 1 ? 1 : -1) / (n * n) : 0) },
  // Rough likenesses: a struck string with a strong second harmonic, and a
  // string plucked a fifth of the way along (no fifth harmonic).
  piano: { label: "Piano-like", amp: (n) => [1, 0.62, 0.34, 0.26, 0.16, 0.1, 0.03, 0.06, 0.04, 0.03, 0.02, 0.02][n - 1] ?? 0.01 },
  guitar: { label: "Guitar-like", amp: (n) => Math.sin((n * Math.PI) / 5) / n / Math.sin(Math.PI / 5) },
};

export function HarmonicMixer({ params }: WidgetProps) {
  const baseMidi = midiOf(str(params, "note", "A2"));
  const f0 = freqOf(baseMidi);
  const count = Math.min(16, Math.max(1, Math.round(num(params, "partials", 8))));
  const initial = str(params, "preset", "sine");
  const make = (preset: string) => Array.from({ length: count }, (_, i) => (PRESETS[preset] ?? PRESETS.sine).amp(i + 1));
  const [amps, setAmps] = useState(() => make(initial));
  const [preset, setPreset] = useState<string | null>(initial);
  const held = useHeldSound();
  const handle = useRef<PartialsHandle | null>(null);

  const update = (next: number[], name: string | null) => {
    setAmps(next);
    setPreset(name);
    handle.current?.setAmplitudes(next);
  };
  const play = () => {
    if (held.playing) return held.stop();
    held.start(() => {
      const h = startPartials(f0, amps);
      handle.current = h;
      return () => {
        h.stop();
        handle.current = null;
      };
    });
  };

  const total = amps.reduce((s, a) => s + Math.abs(a), 0);
  const scale = 1 / Math.max(1, total * 0.62);
  const wave = (x: number) => scale * amps.reduce((s, a, i) => s + a * Math.sin(2 * Math.PI * (i + 1) * 2 * x), 0);
  const color = (n: number) => pcColor(Math.round(midiOfFreq(f0 * n)));

  return (
    <WidgetFrame
      title="Mix your own tone"
      hint={`Each slider is one harmonic of ${fmtHz(f0)}.`}
      controls={
        <>
          <PlayButton playing={held.playing} onClick={play} label="Play this mix" />
          <div className="flex flex-wrap gap-1" role="group" aria-label="Presets">
            {Object.entries(PRESETS).map(([key, p]) => (
              <Button key={key} size="sm" variant={preset === key ? "quiet" : "ghost"} aria-pressed={preset === key} onClick={() => update(make(key), key)}>
                {p.label}
              </Button>
            ))}
          </div>
        </>
      }
    >
      <svg viewBox="0 0 640 170" className="block w-full" role="img" aria-label="Two cycles of the combined wave">
        <line x1={0} x2={640} y1={85} y2={85} stroke="var(--line)" strokeDasharray="3 5" />
        <line x1={320} x2={320} y1={12} y2={158} stroke="var(--line)" strokeDasharray="3 5" />
        <path d={wavePath(wave, 640, 170, 68, 480)} fill="none" stroke="var(--ink)" strokeWidth={2.8} strokeLinejoin="round" />
        <text x={8} y={164} fontSize={12} fill="var(--fg-3)">
          two cycles of the wave: {(2000 / f0).toFixed(1)} thousandths of a second
        </text>
      </svg>
      <div className="mt-3 flex justify-between gap-1 @lg:gap-2">
        {amps.map((a, i) => {
          const n = i + 1;
          return (
            <label key={n} className="flex min-w-0 flex-1 flex-col items-center gap-1">
              <span className="relative block h-32 w-full max-w-10 overflow-hidden rounded-lg border border-line bg-raised">
                <span className={cx("absolute inset-x-0 bottom-0 rounded-b-md")} style={{ height: `${Math.abs(a) * 100}%`, background: color(n) }} />
                <input
                  type="range"
                  min={0}
                  max={100}
                  value={Math.round(Math.abs(a) * 100)}
                  onChange={(e) => {
                    const v = Number(e.target.value) / 100;
                    update(amps.map((old, k) => (k === i ? (old < 0 ? -v : v) : old)), null);
                  }}
                  aria-label={`Harmonic ${n}, ${fmtHz(f0 * n)}`}
                  className="absolute inset-0 h-full w-full cursor-ns-resize opacity-0"
                  style={{ writingMode: "vertical-lr", direction: "rtl" }}
                />
              </span>
              <span className="text-sm font-bold text-fg">{n}</span>
              <span className="hidden font-mono text-[0.65rem] text-fg-3 tabular-nums @lg:block">{Math.round(f0 * n)}</span>
            </label>
          );
        })}
      </div>
      <p className="mt-2 text-center text-xs text-fg-3">Drag a bar up or down. The number under each bar is the harmonic; the small figure is its frequency in Hz.</p>
    </WidgetFrame>
  );
}
