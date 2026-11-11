import { useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { freqOf, midiOf, midiOfFreq, pcLabel, fromMidi } from "../../../shared/music/notes.ts";
import { pluckPartials, startPartials, type PartialsHandle } from "../../audio/index.ts";
import { Button, PlayButton, Slider, WidgetFrame, cx, pcColor } from "../../ui.tsx";
import { num, str } from "../params.ts";
import type { WidgetProps } from "../types.ts";
import { fmtHz, useHeldSound, useRaf, useReducedMotion, wavePath } from "./common.ts";

// A string fixed at both ends. Everything drawn is the real sum of its
// standing-wave modes: mode n has n half-waves along the string and vibrates
// n times as fast as mode 1.

const W = 640;
const H = 210;
const X0 = 44;
const LEN = W - 2 * X0;
const MID = H / 2;
const AMP = 62;
/** How fast mode 1 is drawn, in cycles per second (the real string is far too fast to see). */
const SLOW_HZ = 0.75;
const SIM_MODES = 32;
const BARS = 12;

/** Colour of harmonic n of a note: the colour of the pitch class it lands nearest. */
function harmonicColor(baseMidi: number, n: number): string {
  return pcColor(Math.round(baseMidi + 12 * Math.log2(n)));
}
function harmonicNote(baseMidi: number, n: number): string {
  const exact = midiOfFreq(freqOf(baseMidi) * n);
  const p = fromMidi(Math.round(exact));
  return pcLabel(p) + p.oct;
}

function StringEnds() {
  return (
    <>
      <rect x={X0 - 14} y={MID - 34} width={14} height={68} rx={3} fill="var(--line-strong)" />
      <rect x={X0 + LEN} y={MID - 34} width={14} height={68} rx={3} fill="var(--line-strong)" />
      <line x1={X0} x2={X0 + LEN} y1={MID} y2={MID} stroke="var(--line)" strokeDasharray="3 5" />
    </>
  );
}

// --- harmonics mode ----------------------------------------------------------

function ModeChip({ n, on, hz, note, color, onToggle }: { n: number; on: boolean; hz: number; note: string; color: string; onToggle: () => void }) {
  const w = 96;
  const h = 34;
  const up = wavePath((x) => Math.sin(n * Math.PI * x), w - 12, h, 11, 60, 6);
  const down = wavePath((x) => -Math.sin(n * Math.PI * x), w - 12, h, 11, 60, 6);
  return (
    <button
      type="button"
      aria-pressed={on}
      onClick={onToggle}
      aria-label={`Harmonic ${n}, ${fmtHz(hz)}, about ${note}`}
      title={`Harmonic ${n}: ${fmtHz(hz)}`}
      className={cx("flex flex-col items-center rounded-xl border px-1.5 pt-1 pb-1.5 text-center transition-colors", on ? "border-line-strong bg-panel shadow-sm" : "border-line bg-raised/60 opacity-70 hover:opacity-100")}
    >
      <svg viewBox={`0 0 ${w} ${h}`} width={w} height={h} aria-hidden="true">
        <path d={up} fill="none" stroke={on ? color : "var(--fg-3)"} strokeWidth={2} />
        <path d={down} fill="none" stroke={on ? color : "var(--fg-3)"} strokeWidth={1.2} strokeDasharray="2 3" />
        {Array.from({ length: n + 1 }, (_, k) => (
          <circle key={k} cx={6 + ((w - 12) * k) / n} cy={h / 2} r={2.4} fill="var(--fg)" />
        ))}
      </svg>
      <span className="text-sm font-bold text-fg">
        {n} <span className="font-medium text-fg-3">×</span>
      </span>
      <span className="font-mono text-[0.7rem] text-fg-2 tabular-nums">{fmtHz(hz)}</span>
      <span className="text-[0.7rem] text-fg-3">≈ {note}</span>
    </button>
  );
}

function Harmonics({ baseMidi, count }: { baseMidi: number; count: number }) {
  const f0 = freqOf(baseMidi);
  const [on, setOn] = useState<boolean[]>(() => Array.from({ length: count }, (_, i) => i === 0));
  const [t, setT] = useState(0);
  const reduced = useReducedMotion();
  const held = useHeldSound();
  const handle = useRef<PartialsHandle | null>(null);
  const amps = useMemo(() => on.map((v, i) => (v ? 1 / (i + 1) : 0)), [on]);
  const active = on.map((v, i) => (v ? i + 1 : 0)).filter(Boolean);
  // Keep the drawn sum inside the frame however many modes are on.
  const scale = 1 / Math.max(1, amps.reduce((s, a) => s + a, 0) * 0.72);

  useRaf(setT, held.playing && !reduced);
  const phase = held.playing && !reduced ? 2 * Math.PI * SLOW_HZ * t : 0;

  const toggle = (i: number) => {
    const next = on.map((v, k) => (k === i ? !v : v));
    setOn(next);
    handle.current?.setAmplitudes(next.map((v, k) => (v ? 1 / (k + 1) : 0)));
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

  const sum = (x: number) => scale * amps.reduce((s, a, i) => s + a * Math.sin((i + 1) * Math.PI * x) * Math.cos((i + 1) * phase), 0);
  const single = active.length === 1 ? active[0] : 0;

  return (
    <WidgetFrame
      title="A vibrating string"
      hint={`Mode 1 is ${fmtHz(f0)}. Drawn about ${Math.round(f0 / SLOW_HZ)} times slower than real life.`}
      controls={
        <>
          <PlayButton playing={held.playing} onClick={play} label="Play these harmonics" />
          <span className="text-sm text-fg-2">
            {active.length === 0 ? "Switch on a harmonic below." : active.length === 1 ? `Harmonic ${active[0]} alone: a pure tone at ${fmtHz(f0 * active[0])}.` : `Harmonics ${active.join(", ")} sounding together: still one note, with a richer colour.`}
          </span>
        </>
      }
    >
      <svg viewBox={`0 0 ${W} ${H}`} className="block w-full" role="img" aria-label={`String vibrating in harmonics ${active.join(", ") || "none"}`}>
        <StringEnds />
        {active.length > 1 &&
          active.map((n) => (
            <path key={n} d={wavePath((x) => (scale / n) * Math.sin(n * Math.PI * x) * Math.cos(n * phase), LEN, H, AMP, 160, X0)} fill="none" stroke={harmonicColor(baseMidi, n)} strokeWidth={1.3} opacity={0.55} />
          ))}
        {single > 0 && <path d={wavePath((x) => -(scale / single) * Math.sin(single * Math.PI * x), LEN, H, AMP, 160, X0)} fill="none" stroke="var(--fg-3)" strokeWidth={1} strokeDasharray="3 4" />}
        {single > 0 && <path d={wavePath((x) => (scale / single) * Math.sin(single * Math.PI * x), LEN, H, AMP, 160, X0)} fill="none" stroke="var(--fg-3)" strokeWidth={1} strokeDasharray="3 4" />}
        <path d={wavePath(sum, LEN, H, AMP, 240, X0)} fill="none" stroke="var(--ink)" strokeWidth={3.2} strokeLinecap="round" />
        {single > 1 &&
          Array.from({ length: single - 1 }, (_, k) => {
            const x = X0 + (LEN * (k + 1)) / single;
            return (
              <g key={k}>
                <circle cx={x} cy={MID} r={5} fill="var(--panel)" stroke="var(--accent)" strokeWidth={2.2} />
                <text x={x} y={MID + 24} textAnchor="middle" fontSize={12} fill="var(--fg-3)">
                  node
                </text>
              </g>
            );
          })}
      </svg>
      <div className="mt-2 flex flex-wrap justify-center gap-2">
        {on.map((v, i) => (
          <ModeChip key={i} n={i + 1} on={v} hz={f0 * (i + 1)} note={harmonicNote(baseMidi, i + 1)} color={harmonicColor(baseMidi, i + 1)} onToggle={() => toggle(i)} />
        ))}
      </div>
    </WidgetFrame>
  );
}

// --- pluck and strike --------------------------------------------------------

/** Displacement amplitude of each mode, and its strength in the sound. */
function excite(kind: "pluck" | "strike", p: number): { shape: number[]; sound: number[] } {
  const shape: number[] = [];
  const sound: number[] = [];
  for (let n = 1; n <= SIM_MODES; n++) {
    const s = Math.sin(n * Math.PI * p);
    if (kind === "pluck") {
      // Fourier series of a triangle with its apex at p.
      shape.push((2 / (n * n * Math.PI * Math.PI * p * (1 - p))) * s);
      // What reaches the bridge goes as n × displacement.
      sound.push(Math.abs(s) / n);
    } else {
      // A hammer blow gives the string speed, not shape. A felt hammer is soft
      // and wide, which takes the edge off the highest modes.
      const felt = 1 / (1 + (n / 9) ** 2);
      shape.push((s / n) * felt);
      sound.push(Math.abs(s) * felt);
    }
  }
  const peak = Math.max(...sound, 1e-9);
  const shapePeak = kind === "strike" ? Math.max(...shape.map(Math.abs), 1e-9) * 1.3 : 1;
  return { shape: shape.map((v) => v / shapePeak), sound: sound.map((v) => v / peak) };
}

const SPOTS = [
  { p: 1 / 2, label: "middle" },
  { p: 1 / 3, label: "⅓" },
  { p: 1 / 5, label: "⅕" },
  { p: 1 / 12, label: "near the end" },
];

function Excited({ kind, baseMidi }: { kind: "pluck" | "strike"; baseMidi: number }) {
  const f0 = freqOf(baseMidi);
  const [p, setP] = useState(kind === "pluck" ? 0.2 : 0.125);
  const [dragging, setDragging] = useState(false);
  const [ringing, setRinging] = useState(false);
  const [t, setT] = useState(0);
  const reduced = useReducedMotion();
  const held = useHeldSound();
  const svg = useRef<SVGSVGElement>(null);
  const { shape, sound } = useMemo(() => excite(kind, p), [kind, p]);

  useRaf((s) => {
    setT(s);
    if (s > 16) setRinging(false);
  }, ringing && !reduced);

  const go = () => {
    setDragging(false);
    setRinging(true);
    setT(0);
    held.start(() => {
      const h = pluckPartials(f0, sound.slice(0, 20), { decay: 2.4, damping: 0.3 });
      return () => h.stop();
    });
  };
  const posFromEvent = (e: ReactPointerEvent) => {
    const r = svg.current!.getBoundingClientRect();
    const x = ((e.clientX - r.left) / r.width) * W;
    return Math.min(0.95, Math.max(0.05, (x - X0) / LEN));
  };

  const still = !ringing || reduced;
  const w = 2 * Math.PI * SLOW_HZ * t;
  const y = (x: number) => {
    if (dragging || (still && kind === "pluck")) return 0.9 * (x < p ? x / p : (1 - x) / (1 - p));
    if (still) return 0;
    let s = 0;
    for (let n = 1; n <= SIM_MODES; n++) {
      const decay = Math.exp((-t * (1 + 0.3 * (n - 1))) / 7);
      s += shape[n - 1] * Math.sin(n * Math.PI * x) * (kind === "pluck" ? Math.cos(n * w) : Math.sin(n * w)) * decay;
    }
    return 0.9 * s;
  };
  const missing = sound.slice(0, BARS).flatMap((v, i) => (v < 0.1 ? [i + 1] : []));
  const px = X0 + p * LEN;
  const verb = kind === "pluck" ? "Pluck" : "Strike";

  return (
    <WidgetFrame
      title={kind === "pluck" ? "Pluck the string" : "Strike the string"}
      hint={kind === "pluck" ? "Drag along the string to choose where, then let go." : "Drag the hammer along the string, then let go."}
      controls={
        <>
          <Button variant="primary" size="sm" onClick={go}>
            {verb}
          </Button>
          <Slider label="Where" value={Math.round(p * 100)} min={5} max={95} onChange={(v) => setP(v / 100)} format={(v) => `${v}%`} className="min-w-52 flex-1" />
          <div className="flex flex-wrap gap-1">
            {SPOTS.map((s) => (
              <Button key={s.label} size="sm" variant="ghost" onClick={() => setP(s.p)}>
                {s.label}
              </Button>
            ))}
          </div>
        </>
      }
    >
      <div className="grid gap-3 @2xl:grid-cols-[minmax(0,1.9fr)_minmax(0,1fr)] @2xl:items-center">
        <svg
          ref={svg}
          viewBox={`0 0 ${W} ${H}`}
          className="block w-full touch-none cursor-grab select-none active:cursor-grabbing"
          role="img"
          aria-label={`String ${kind === "pluck" ? "plucked" : "struck"} ${Math.round(p * 100)} percent of the way along`}
          onPointerDown={(e) => {
            e.currentTarget.setPointerCapture(e.pointerId);
            held.stop();
            setRinging(false);
            setDragging(true);
            setP(posFromEvent(e));
          }}
          onPointerMove={(e) => dragging && setP(posFromEvent(e))}
          onPointerUp={() => dragging && go()}
          onPointerCancel={() => setDragging(false)}
        >
          <StringEnds />
          <path d={wavePath(y, LEN, H, AMP, 260, X0)} fill="none" stroke="var(--ink)" strokeWidth={3.2} strokeLinecap="round" strokeLinejoin="round" />
          {kind === "pluck" ? (
            (dragging || still) && <circle cx={px} cy={MID - 0.9 * AMP} r={9} fill="var(--accent)" stroke="var(--panel)" strokeWidth={2.5} />
          ) : (
            <g transform={`translate(${px}, ${MID + (still ? 16 : 30)})`}>
              <rect x={-3} y={14} width={6} height={32} rx={2} fill="var(--line-strong)" />
              <path d="M-13,16 Q-14,0 0,-4 Q14,0 13,16 Z" fill="var(--accent)" stroke="var(--panel)" strokeWidth={2} />
            </g>
          )}
          <text x={px} y={H - 6} textAnchor="middle" fontSize={12} fill="var(--fg-3)">
            {Math.round(p * 100)}% along
          </text>
        </svg>
        <figure>
          <svg viewBox="0 0 300 150" className="block w-full" role="img" aria-label="Strength of each harmonic in the sound">
            <line x1={8} x2={292} y1={122} y2={122} stroke="var(--line-strong)" />
            {sound.slice(0, BARS).map((v, i) => {
              const bw = 284 / BARS;
              const h = v * 104;
              return (
                <g key={i}>
                  <rect x={10 + i * bw} y={122 - h} width={bw - 5} height={Math.max(h, 0.5)} rx={2.5} fill={harmonicColor(baseMidi, i + 1)} />
                  {v < 0.1 && <rect x={10 + i * bw} y={104} width={bw - 5} height={18} rx={2.5} fill="none" stroke="var(--line-strong)" strokeDasharray="2 2" />}
                  <text x={10 + i * bw + (bw - 5) / 2} y={138} textAnchor="middle" fontSize={11} fill="var(--fg-3)">
                    {i + 1}
                  </text>
                </g>
              );
            })}
          </svg>
          <figcaption className="text-center text-xs text-fg-3">How strong each harmonic is in the sound</figcaption>
        </figure>
      </div>
      <p className="mt-2 text-sm text-fg-2">
        {missing.length > 0
          ? `${verb === "Pluck" ? "Plucked" : "Struck"} here, harmonic${missing.length > 1 ? "s" : ""} ${missing.join(", ")} ${missing.length > 1 ? "are" : "is"} missing or very weak: ${missing.length > 1 ? "they have" : "it has"} a still point (a node) at or right beside this spot, and a push at a still point cannot set ${missing.length > 1 ? "them" : "it"} moving.`
          : p < 0.15 || p > 0.85
            ? "Near the end, the high harmonics are strong: the sound is bright and thin."
            : "Every harmonic is present here, the low ones strongest: a round, full sound."}
      </p>
    </WidgetFrame>
  );
}

export function StringSim({ params }: WidgetProps) {
  const mode = str(params, "mode", "harmonics");
  const baseMidi = midiOf(str(params, "note", "A2"));
  const count = Math.min(12, Math.max(1, Math.round(num(params, "modes", 6))));
  if (mode === "pluck" || mode === "strike") return <Excited kind={mode} baseMidi={baseMidi} />;
  return <Harmonics baseMidi={baseMidi} count={count} />;
}
