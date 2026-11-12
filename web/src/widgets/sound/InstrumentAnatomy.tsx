import { useState } from "react";
import { freqOf, fromMidi, pcLabel } from "../../../shared/music/notes.ts";
import { playNote } from "../../audio/index.ts";
import { Button, NoteChip, Slider, WidgetFrame, cx } from "../../ui.tsx";
import { str } from "../params.ts";
import type { WidgetProps } from "../types.ts";
import { fmtHz, useRaf, useReducedMotion, wavePath } from "./common.ts";
import { usePressWord } from "../touch.ts";

// Cutaway diagrams of how each instrument turns a movement of the hand into
// sound. Schematic, not to scale: the parts and what each one does.

const ease = (x: number) => {
  const c = Math.min(1, Math.max(0, x));
  return c * c * (3 - 2 * c);
};

function Label({ x, y, tx, ty, children, anchor = "middle" }: { x: number; y: number; tx: number; ty: number; children: string; anchor?: "start" | "middle" | "end" }) {
  return (
    <g>
      <line x1={x} y1={y} x2={tx} y2={ty + (ty > y ? -12 : 4)} stroke="var(--fg-3)" strokeWidth={1} />
      <circle cx={x} cy={y} r={2.5} fill="var(--fg-3)" />
      <text x={tx} y={ty} textAnchor={anchor} fontSize={13} fontWeight={600} fill="var(--fg-2)">
        {children}
      </text>
    </g>
  );
}

/** Rings of sound spreading from a point while something is sounding. */
function Radiating({ cx: x, cy: y, t, strength, flip = 1 }: { cx: number; cy: number; t: number; strength: number; flip?: 1 | -1 }) {
  if (strength < 0.03) return null;
  return (
    <g fill="none" stroke="var(--accent)" strokeLinecap="round">
      {[0, 1, 2].map((k) => {
        const ph = (t * 1.4 + k / 3) % 1;
        const r = 14 + ph * 46;
        return <path key={k} d={`M${x - r * 0.8},${y + flip * r * 0.6} Q${x},${y + flip * r * 1.25} ${x + r * 0.8},${y + flip * r * 0.6}`} strokeWidth={2.2} opacity={(1 - ph) * strength} />;
      })}
    </g>
  );
}

// --- piano ---------------------------------------------------------------------

const P_STEPS = ["The key is a lever: press the front and the back rises.", "The back of the key throws the hammer up at the string. It hits and bounces straight off.", "At the same moment the damper lifts, leaving the string free to ring.", "The string shakes the bridge, and the bridge shakes the soundboard: a big sheet of wood that moves enough air to hear.", "Let go, and the damper drops back onto the string and stops it."];
const P_STRINGS = [
  { midi: 33, len: 1, w: 5.5 },
  { midi: 45, len: 0.74, w: 4 },
  { midi: 57, len: 0.5, w: 2.8 },
  { midi: 69, len: 0.3, w: 2 },
  { midi: 81, len: 0.17, w: 1.4 },
];
const HOLD = 1.7; // seconds the key stays down
const STRIKE = 0.09; // seconds from key press to the hammer reaching the string

function Piano() {
  const word = usePressWord();
  const [pressed, setPressed] = useState(false);
  const [t, setT] = useState(0);
  const reduced = useReducedMotion();
  useRaf((s) => {
    setT(s);
    if (s > HOLD + 0.9) setPressed(false);
  }, pressed);

  const press = () => {
    setT(0);
    setPressed(true);
    playNote(57, { timbre: "piano", duration: HOLD - STRIKE, delay: STRIKE });
  };

  const time = pressed ? t : -1;
  const down = time >= 0 && time < HOLD;
  const keyIn = time < 0 ? 0 : down ? ease(time / 0.07) : 1 - ease((time - HOLD) / 0.12);
  // Hammer: thrown up to the string, then falls back to rest just below it while the key is held.
  const hammer = time < 0 ? 0 : time < STRIKE ? ease(time / STRIKE) : down ? 1 - 0.55 * ease((time - STRIKE) / 0.16) : 0.45 * (1 - ease((time - HOLD) / 0.15));
  const damper = keyIn;
  const ring = time >= STRIKE ? Math.exp(-(time - STRIKE) / 1.1) * (time < HOLD ? 1 : Math.max(0, 1 - (time - HOLD) / 0.12)) : 0;
  const step = time < 0 ? -1 : time < 0.05 ? 0 : time < 0.3 ? 1 : time < 0.6 ? 2 : time < HOLD ? 3 : 4;

  const sy = 74; // string height
  const pivot = { x: 396, y: 206 };
  const R = 176;
  const th = (-4 + 44 * hammer) * (Math.PI / 180);
  const head = { x: pivot.x - R * Math.cos(th), y: pivot.y - R * Math.sin(th) };
  const keyAngle = -3.2 * keyIn;
  const wob = reduced ? 1 : Math.cos(time * 60);

  return (
    <WidgetFrame
      title="Inside a piano: one key"
      hint="Press the key and watch what it sets off."
      controls={
        <>
          <Button variant="primary" size="sm" onClick={press}>
            Press the key
          </Button>
          <span className="min-w-48 flex-1 text-sm text-fg-2">{step >= 0 ? P_STEPS[step] : "A piano is a set of strings, each struck by its own felt hammer."}</span>
        </>
      }
    >
      <div className="overflow-x-auto [contain:inline-size]">
      <svg viewBox="0 0 640 300" className="block w-full min-w-[520px]" role="img" aria-label="Side view of a piano key, hammer, damper, string, bridge and soundboard">
        {/* soundboard and bridge */}
        <rect x={300} y={118} width={322} height={12} rx={3} fill="var(--rosewood)" stroke="var(--line-strong)" />
        <rect x={548} y={sy} width={14} height={44} rx={2} fill="var(--rosewood-dark)" stroke="var(--line-strong)" />
        <Radiating cx={470} cy={134} t={time} strength={ring} />
        {/* string between its two fixed points */}
        <circle cx={96} cy={sy} r={6} fill="var(--line-strong)" />
        <line x1={62} x2={96} y1={sy} y2={sy} stroke="var(--string-wound)" strokeWidth={3} />
        <line x1={555} x2={622} y1={sy} y2={sy} stroke="var(--string-wound)" strokeWidth={3} />
        <g transform={`translate(0, ${sy - 30})`}>
          <path d={wavePath((x) => ring * 0.7 * Math.sin(Math.PI * x) * wob, 459, 60, 30, 80, 96)} fill="none" stroke="var(--string-wound)" strokeWidth={3.4} strokeLinecap="round" />
          {ring > 0.05 && reduced === false && <path d={wavePath((x) => -ring * 0.7 * Math.sin(Math.PI * x) * wob, 459, 60, 30, 80, 96)} fill="none" stroke="var(--string-wound)" strokeWidth={1.2} opacity={0.45} />}
        </g>
        {/* damper */}
        <g transform={`translate(0, ${-20 * damper})`}>
          <rect x={356} y={22} width={5} height={34} fill="var(--line-strong)" />
          <rect x={338} y={54} width={42} height={16} rx={4} fill="var(--bad)" opacity={0.85} />
        </g>
        {/* hammer */}
        <line x1={pivot.x} y1={pivot.y} x2={head.x} y2={head.y} stroke="var(--line-strong)" strokeWidth={7} strokeLinecap="round" />
        <circle cx={pivot.x} cy={pivot.y} r={7} fill="var(--fg-3)" />
        <g transform={`translate(${head.x}, ${head.y}) rotate(${(-th * 180) / Math.PI})`}>
          <path d="M-13,6 Q-15,-14 0,-18 Q15,-14 13,6 Z" fill="var(--ivory)" stroke="var(--ivory-edge)" strokeWidth={2} />
        </g>
        {/* key: a lever on a pivot */}
        <path d="M250,262 l12,-18 l12,18 z" fill="var(--fg-3)" />
        <g transform={`rotate(${keyAngle} 262 244)`}>
          <rect x={28} y={226} width={400} height={18} rx={3} fill="var(--ivory)" stroke="var(--ivory-edge)" strokeWidth={2} />
          <rect x={28} y={226} width={86} height={18} rx={3} fill="var(--ivory-edge)" opacity={0.5} />
          <rect x={390} y={206} width={8} height={20} fill="var(--line-strong)" />
        </g>
        <g onClick={press} className="cursor-pointer">
          <rect x={20} y={196} width={110} height={70} fill="transparent" />
          <path d={`M70,${196 + 10 * keyIn} l0,18 m-7,-8 l7,8 l7,-8`} fill="none" stroke="var(--accent)" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" />
        </g>
        <Label x={150} y={236} tx={150} ty={290}>
          key
        </Label>
        <Label x={head.x} y={head.y - 4} tx={182} ty={150} anchor="end">
          hammer
        </Label>
        <Label x={360} y={40 - 20 * damper} tx={420} ty={24} anchor="start">
          damper
        </Label>
        <Label x={200} y={sy} tx={200} ty={28}>
          string
        </Label>
        <Label x={555} y={96} tx={600} ty={56}>
          bridge
        </Label>
        <Label x={590} y={126} tx={560} ty={176}>
          soundboard
        </Label>
      </svg>
      </div>
      <div className="mt-3 border-t border-line pt-3">
        <p className="text-sm text-fg-2">
          <strong className="text-fg">Low strings are long and thick, high strings short and thin.</strong> {word.Press} each one to hear it.
        </p>
        <svg viewBox="0 0 640 118" className="mt-1 block w-full" role="group" aria-label="Five piano strings from low to high">
          {P_STRINGS.map((s, i) => {
            const p = fromMidi(s.midi);
            const y = 14 + i * 22;
            return (
              <g key={s.midi} role="button" tabIndex={0} aria-label={`Play ${pcLabel(p)}${p.oct}, ${fmtHz(freqOf(s.midi))}`} className="cursor-pointer outline-none [&:focus-visible>line]:stroke-(--accent) [&:hover>line]:stroke-(--accent)" onClick={() => playNote(s.midi, { timbre: "piano", duration: 1.6 })} onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && (e.preventDefault(), playNote(s.midi, { timbre: "piano", duration: 1.6 }))}>
                <rect x={0} y={y - 10} width={640} height={20} fill="transparent" />
                <text x={4} y={y + 4.5} fontSize={13} fontWeight={700} fill="var(--fg)">
                  {pcLabel(p)}
                  {p.oct}
                </text>
                <text x={36} y={y + 4.5} fontSize={11.5} fill="var(--fg-3)">
                  {fmtHz(freqOf(s.midi))}
                </text>
                <line x1={104} x2={104 + 526 * s.len} y1={y} y2={y} stroke="var(--string-wound)" strokeWidth={s.w} strokeLinecap="round" />
              </g>
            );
          })}
        </svg>
      </div>
    </WidgetFrame>
  );
}

// --- guitar --------------------------------------------------------------------

const NUT = 74;
const SADDLE = 566;
const SCALE = SADDLE - NUT;
const fretX = (n: number) => NUT + SCALE * (1 - 2 ** (-n / 12));
const STRING_Y = [121, 132, 143, 154, 165, 176]; // string 1 (top of picture) … string 6
const ACTIVE = 4; // the A string (string 5)
const OPEN_MIDI = 45;
const FRACTIONS: Record<number, string> = { 0: "the whole string", 3: "about ⅚ of the string", 4: "about ⅘ of the string", 5: "almost exactly ¾ of the string", 7: "almost exactly ⅔ of the string", 12: "exactly ½ of the string" };
const INTERVALS: Record<number, string> = { 5: "a perfect fourth higher", 7: "a perfect fifth higher", 12: "an octave higher" };

function Guitar() {
  const word = usePressWord();
  const [fret, setFret] = useState(0);
  const [plucked, setPlucked] = useState(false);
  const [t, setT] = useState(0);
  const reduced = useReducedMotion();
  useRaf((s) => {
    setT(s);
    if (s > 2.4) setPlucked(false);
  }, plucked);

  const pluck = (n: number) => {
    setFret(n);
    setT(0);
    setPlucked(true);
    playNote(OPEN_MIDI + n, { timbre: "guitar", duration: 2.2 });
  };

  const ring = plucked ? Math.exp(-t / 0.9) : 0;
  const from = fret === 0 ? NUT : fretX(fret);
  const y = STRING_Y[ACTIVE];
  const ratio = 2 ** (-fret / 12);
  const midi = OPEN_MIDI + fret;
  const p = fromMidi(midi);
  const wob = reduced ? 1 : Math.cos(t * 55);

  return (
    <WidgetFrame
      title="How a guitar makes a note"
      hint={`${word.Press} anywhere along the neck to press the A string there and pluck it.`}
      controls={
        <>
          <Button variant="primary" size="sm" onClick={() => pluck(fret)}>
            Pluck
          </Button>
          <Slider label="Fret" value={fret} min={0} max={14} onChange={pluck} format={(v) => (v === 0 ? "open" : `fret ${v}`)} className="min-w-52 flex-1" />
          <div className="flex gap-1">
            {[0, 5, 7, 12].map((n) => (
              <Button key={n} size="sm" variant="ghost" aria-pressed={fret === n} onClick={() => pluck(n)}>
                {n === 0 ? "Open" : n}
              </Button>
            ))}
          </div>
        </>
      }
    >
      <div className="overflow-x-auto [contain:inline-size]">
      <svg viewBox="0 0 640 330" className="block w-full min-w-[520px] select-none" role="img" aria-label={`Guitar seen from the front, A string pressed at ${fret === 0 ? "no fret" : `fret ${fret}`}`}>
        {/* body */}
        <path d="M352,96 C352,70 372,62 400,64 C430,66 440,80 462,80 C490,80 500,40 548,40 C600,40 632,90 632,148.5 C632,207 600,257 548,257 C500,257 490,217 462,217 C440,217 430,231 400,233 C372,235 352,227 352,201 Z" fill="var(--string-wound)" opacity={0.55} stroke="var(--rosewood)" strokeWidth={3} />
        <circle cx={444} cy={148.5} r={36} fill="var(--ebony)" />
        <circle cx={444} cy={148.5} r={41} fill="none" stroke="var(--rosewood)" strokeWidth={2} />
        <Radiating cx={444} cy={196} t={t} strength={ring} />
        <Radiating cx={444} cy={101} t={t} strength={ring} flip={-1} />
        {/* bridge and saddle */}
        <rect x={552} y={104} width={30} height={89} rx={5} fill="var(--rosewood-dark)" />
        <rect x={SADDLE - 2} y={110} width={4} height={77} rx={1.5} fill="var(--nut)" />
        {/* neck, head, nut, frets */}
        <path d="M74,112 L20,104 L20,193 L74,185 Z" fill="var(--rosewood-dark)" />
        <rect x={NUT} y={112} width={fretX(14) - NUT + 14} height={73} fill="var(--rosewood)" />
        {[3, 5, 7, 9].map((n) => (
          <circle key={n} cx={(fretX(n - 1) + fretX(n)) / 2} cy={148.5} r={4.5} fill="var(--inlay)" opacity={0.8} />
        ))}
        <circle cx={(fretX(11) + fretX(12)) / 2} cy={132} r={4.5} fill="var(--inlay)" opacity={0.8} />
        <circle cx={(fretX(11) + fretX(12)) / 2} cy={165} r={4.5} fill="var(--inlay)" opacity={0.8} />
        {Array.from({ length: 14 }, (_, i) => (
          <line key={i} x1={fretX(i + 1)} x2={fretX(i + 1)} y1={112} y2={185} stroke="var(--fret-wire)" strokeWidth={i + 1 === fret ? 4 : 2.4} />
        ))}
        <rect x={NUT - 4} y={110} width={6} height={77} rx={1.5} fill="var(--nut)" />
        {/* strings */}
        {STRING_Y.map((sy, i) => i !== ACTIVE && <line key={i} x1={28} x2={SADDLE} y1={sy} y2={sy} stroke="var(--string)" strokeWidth={0.9 + i * 0.35} opacity={0.75} />)}
        <line x1={28} x2={from} y1={y} y2={y} stroke="var(--string)" strokeWidth={2.4} opacity={0.6} />
        <g transform={`translate(0, ${y - 20})`}>
          <path d={wavePath((x) => (0.12 + ring * 0.6) * Math.sin(Math.PI * x) * wob, SADDLE - from, 40, 20, 60, from)} fill="none" stroke="var(--accent)" strokeWidth={3} strokeLinecap="round" />
          {!reduced && ring > 0.05 && <path d={wavePath((x) => -(0.12 + ring * 0.6) * Math.sin(Math.PI * x) * wob, SADDLE - from, 40, 20, 60, from)} fill="none" stroke="var(--accent)" strokeWidth={1.2} opacity={0.5} />}
        </g>
        {fret > 0 && <circle cx={fretX(fret) - Math.min(14, (fretX(fret) - fretX(fret - 1)) * 0.4)} cy={y} r={8} fill="var(--fg)" stroke="var(--panel)" strokeWidth={2} />}
        {/* click zones, one per fret */}
        {Array.from({ length: 15 }, (_, n) => {
          const x0 = n === 0 ? 20 : fretX(n - 1);
          const x1 = n === 0 ? NUT : fretX(n);
          return <rect key={n} x={x0} y={100} width={x1 - x0} height={97} fill="transparent" className="cursor-pointer" onClick={() => pluck(n)} />;
        })}
        {/* the length that vibrates */}
        <g>
          <line x1={from} x2={SADDLE} y1={300} y2={300} stroke="var(--accent)" strokeWidth={3} />
          <line x1={from} x2={from} y1={292} y2={308} stroke="var(--accent)" strokeWidth={3} />
          <line x1={SADDLE} x2={SADDLE} y1={292} y2={308} stroke="var(--accent)" strokeWidth={3} />
          <text x={Math.min(440, (from + SADDLE) / 2)} y={324} textAnchor="middle" fontSize={13} fontWeight={600} fill="var(--accent)">
            the part that vibrates: {Math.round(ratio * 100)}% of the string
          </text>
          <line x1={NUT} x2={from} y1={300} y2={300} stroke="var(--line-strong)" strokeWidth={2} strokeDasharray="3 4" />
        </g>
        <Label x={NUT - 1} y={112} tx={NUT - 1} ty={84}>
          nut
        </Label>
        <Label x={fretX(2)} y={114} tx={fretX(2) + 6} ty={66}>
          fret
        </Label>
        <Label x={SADDLE} y={186} tx={548} ty={282} anchor="end">
          saddle
        </Label>
        <Label x={577} y={190} tx={592} ty={282} anchor="start">
          bridge
        </Label>
        <Label x={444} y={114} tx={444} ty={22}>
          sound hole
        </Label>
        <Label x={604} y={112} tx={636} ty={22} anchor="end">
          soundboard (the top)
        </Label>
      </svg>
      </div>
      <div className={cx("mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 rounded-xl bg-raised/60 px-3 py-2 text-sm text-fg-2")}>
        <NoteChip midi={midi}>
          {pcLabel(p)}
          {p.oct}
        </NoteChip>
        <span className="font-mono tabular-nums text-fg">{fmtHz(freqOf(midi))}</span>
        <span>
          {fret === 0 ? "Open string: the whole length from nut to saddle vibrates." : `Fret ${fret}: the string now ends at the fret, so ${FRACTIONS[fret] ?? `${Math.round(ratio * 100)}% of it`} vibrates, ${(1 / ratio).toFixed(2)} times as fast${INTERVALS[fret] ? ` — ${INTERVALS[fret]}` : ""}.`}
        </span>
      </div>
      <p className="mt-2 text-sm text-fg-2">A bare string moves very little air. Its vibration passes through the saddle and bridge into the thin wooden top, the soundboard, which moves a lot of air; the hollow body and sound hole strengthen the low notes.</p>
    </WidgetFrame>
  );
}

export function InstrumentAnatomy({ params }: WidgetProps) {
  return str(params, "instrument", "piano") === "guitar" ? <Guitar /> : <Piano />;
}
