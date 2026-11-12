import { useRef, useState } from "react";
import { fromMidi, nearestNote, pcLabel } from "../../../shared/music/notes.ts";
import { startPartials, type PartialsHandle } from "../../audio/index.ts";
import { NoteChip, PlayButton, Slider, WidgetFrame } from "../../ui.tsx";
import { bool, num } from "../params.ts";
import type { WidgetProps } from "../types.ts";
import { useHeldSound, wavePath } from "./common.ts";

// A pure tone whose frequency (and optionally loudness) the learner drags.
// The time axis is fixed, so a higher pitch visibly packs more waves into
// the same stretch of time.

const WINDOW_MS = 20;
const STEPS = 1000;

export function FrequencyExplorer({ params }: WidgetProps) {
  const min = Math.max(20, num(params, "min", 55));
  const max = Math.max(min * 2, num(params, "max", 1760));
  const showNotes = bool(params, "showNotes", true);
  const withLoudness = bool(params, "loudness", false);
  const toHz = (s: number) => min * (max / min) ** (s / STEPS);
  const toStep = (hz: number) => Math.round((STEPS * Math.log(hz / min)) / Math.log(max / min));
  const [step, setStep] = useState(() => toStep(Math.min(max, Math.max(min, num(params, "start", 220)))));
  const [loud, setLoud] = useState(70);
  const held = useHeldSound();
  const handle = useRef<PartialsHandle | null>(null);
  const hz = toHz(step);
  const level = withLoudness ? loud / 100 : 0.7;
  const near = nearestNote(hz);
  const p = fromMidi(near.midi);
  const cycles = (hz * WINDOW_MS) / 1000;
  // Enough points per wave that the drawing never aliases into a false,
  // slower wave: at very high frequencies it honestly fills in to a band.
  const wavePoints = Math.min(12000, Math.max(900, Math.ceil(cycles * 24)));

  const play = () => {
    if (held.playing) return held.stop();
    held.start(() => {
      const h = startPartials(hz, [1], { level: level * 1.6 });
      handle.current = h;
      return () => {
        h.stop();
        handle.current = null;
      };
    });
  };

  return (
    <WidgetFrame
      title="Frequency and pitch"
      hint="Drag the slider and listen."
      controls={
        <>
          <PlayButton playing={held.playing} onClick={play} label="Play the tone" />
          <div className="flex min-w-56 flex-1 flex-col gap-1.5">
            <Slider
              label="Frequency"
              value={step}
              min={0}
              max={STEPS}
              onChange={(s) => {
                setStep(s);
                handle.current?.setFrequency(toHz(s));
              }}
              format={(s) => `${toHz(s) >= 100 ? Math.round(toHz(s)) : toHz(s).toFixed(1)} Hz`}
            />
            {withLoudness && (
              <Slider
                label="Loudness"
                value={loud}
                min={0}
                max={100}
                onChange={(v) => {
                  setLoud(v);
                  handle.current?.setLevel((v / 100) * 1.6);
                }}
                format={(v) => `${v}%`}
              />
            )}
          </div>
        </>
      }
    >
      <div className="grid gap-3 @xl:grid-cols-[minmax(0,1fr)_11rem] @xl:items-center">
        <div>
        <svg viewBox="0 0 640 190" className="block w-full" role="img" aria-label={`A wave of ${Math.round(hz)} hertz over ${WINDOW_MS} thousandths of a second`}>
          <line x1={0} x2={640} y1={95} y2={95} stroke="var(--line)" strokeDasharray="3 5" />
          <path d={wavePath((x) => level * Math.sin(2 * Math.PI * cycles * x), 640, 190, 80, wavePoints)} fill="none" stroke="var(--ink)" strokeWidth={2.4} strokeLinejoin="round" />
          <line x1={2} x2={638} y1={182} y2={182} stroke="var(--fg-3)" />
          <line x1={2} x2={2} y1={177} y2={187} stroke="var(--fg-3)" />
          <line x1={638} x2={638} y1={177} y2={187} stroke="var(--fg-3)" />
        </svg>
        <p className="text-center text-xs text-fg-3">The picture always shows the same stretch of time: {WINDOW_MS} thousandths of a second.</p>
        </div>
        <div className="flex flex-wrap items-baseline justify-center gap-x-4 gap-y-1 text-center @xl:flex-col @xl:items-center">
          <div>
            <span className="font-display text-4xl font-bold text-fg tabular-nums">{hz >= 100 ? Math.round(hz) : hz.toFixed(1)}</span>
            <span className="ml-1 text-lg font-semibold text-fg-2">Hz</span>
          </div>
          <div className="text-sm text-fg-3">vibrations each second</div>
          <div className="text-sm text-fg-2">{cycles.toFixed(1)} waves fit in the picture</div>
          {showNotes && (
            <div className="mt-1 flex items-center gap-2 text-sm text-fg-2">
              <NoteChip midi={near.midi}>
                {pcLabel(p)}
                {p.oct}
              </NoteChip>
              <span className="tabular-nums">{near.cents === 0 ? "exactly" : `${Math.abs(near.cents)} cents ${near.cents > 0 ? "above" : "below"}`}</span>
            </div>
          )}
        </div>
      </div>
    </WidgetFrame>
  );
}
