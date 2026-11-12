import { GUITAR_SHAPES, shapeMidis } from "../../../shared/music/instruments.ts";
import { chordLabel, parseChord } from "../../../shared/music/chords.ts";
import { playChord } from "../../audio/index.ts";
import { pcColor } from "../../ui.tsx";

// The guitar chord box as printed in songbooks: nut at the top, string 6
// (low E) on the left, a dot where each finger goes with the finger number
// in it, ○ over an open string and × over a string that is not played.

export interface ChordBoxProps {
  symbol: string;
  size?: number;
  active?: boolean;
  showName?: boolean;
  /** Draw the dots and open-string rings in plain ink instead of pitch-class
   *  colours, and do not name the chord in the accessible label. For exercise
   *  stimuli, where the colours (or the name) would give the answer away. */
  neutral?: boolean;
  /** Accessible label for the button. Default names the chord, unless `neutral`. */
  ariaLabel?: string;
  onClick?: () => void;
}

export function ChordBox({ symbol, size = 1, active = false, showName = true, neutral = false, ariaLabel, onClick }: ChordBoxProps) {
  const shape = GUITAR_SHAPES[symbol];
  if (!shape) return null;
  const midis = shapeMidis(shape);
  const fretted = shape.frets.filter((f): f is number => f !== null && f > 0);
  const maxFret = Math.max(4, ...fretted);
  const base = maxFret > 5 ? Math.min(...fretted) : 1;
  const rows = Math.max(4, maxFret - base + 1);
  const gx = 18;
  const gy = 22;
  const x0 = 16;
  const y0 = showName ? 44 : 24;
  // A shape up the neck has no nut; its first fret is named beside the grid.
  const w = x0 * 2 + gx * 5 + (base > 1 ? 22 : 0);
  const h = y0 + gy * rows + 10;
  const sx = (i: number) => x0 + i * gx; // i: 0 = string 6
  const fy = (fret: number) => y0 + (fret - base + 0.5) * gy;
  let mi = 0;
  const strum = () => {
    playChord(midis, { timbre: "guitar", strum: 0.05, duration: 2.2 });
    onClick?.();
  };
  const barreStrings = shape.barre ? shape.frets.map((f, i) => (f === shape.barre ? i : -1)).filter((i) => i >= 0) : [];
  return (
    <button type="button" onClick={strum} aria-label={ariaLabel ?? (neutral ? "Chord diagram: strum" : `${symbol} chord: strum`)} className="rounded-xl p-1 transition-colors hover:bg-raised" style={{ outline: active ? "2px solid var(--accent)" : undefined }}>
      <svg width={w * size} height={h * size} viewBox={`0 0 ${w} ${h}`} style={{ display: "block" }}>
        {showName && (
          <text x={x0 + (gx * 5) / 2} y={16} textAnchor="middle" fontSize={17} fontWeight={700} fill="var(--fg)" style={{ fontFamily: "var(--font-display)" }}>
            {chordLabel(parseChord(symbol))}
          </text>
        )}
        {base === 1 ? <rect x={x0 - 1} y={y0 - 4} width={gx * 5 + 2} height={4.5} rx={1} fill="var(--ink)" /> : <text x={x0 + gx * 5 + 9} y={fy(base)} textAnchor="start" dominantBaseline="central" fontSize={10} fontWeight={600} fill="var(--fg-3)" style={{ fontFamily: "var(--font-sans)" }}>{base}fr</text>}
        {Array.from({ length: rows + 1 }, (_, r) => (
          <line key={`f${r}`} x1={x0} x2={x0 + gx * 5} y1={y0 + r * gy} y2={y0 + r * gy} stroke="var(--staff-line)" strokeWidth={1} />
        ))}
        {Array.from({ length: 6 }, (_, i) => (
          <line key={`s${i}`} x1={sx(i)} x2={sx(i)} y1={y0} y2={y0 + rows * gy} stroke="var(--ink)" strokeWidth={1.1} />
        ))}
        {shape.barre && barreStrings.length > 1 && <rect x={sx(barreStrings[0]) - 6} y={fy(shape.barre) - 6} width={sx(barreStrings[barreStrings.length - 1]) - sx(barreStrings[0]) + 12} height={12} rx={6} fill="var(--ink)" opacity={0.85} />}
        {shape.frets.map((fret, i) => {
          if (fret === null)
            return (
              <text key={i} x={sx(i)} y={y0 - 10} textAnchor="middle" fontSize={12} fontWeight={700} fill="var(--fg-3)" style={{ fontFamily: "var(--font-sans)" }}>
                ×
              </text>
            );
          const midi = midis[mi++];
          const color = neutral ? "var(--ink)" : pcColor(midi);
          if (fret === 0) return <circle key={i} cx={sx(i)} cy={y0 - 13} r={4.2} fill="none" stroke={color} strokeWidth={2} />;
          return (
            <g key={i}>
              <circle cx={sx(i)} cy={fy(fret)} r={7.4} fill={color} stroke="var(--ink)" strokeWidth={0.6} />
              {shape.fingers[i] > 0 && (
                <text x={sx(i)} y={fy(fret)} textAnchor="middle" dominantBaseline="central" fontSize={9.5} fontWeight={800} fill={neutral ? "var(--panel)" : "var(--pc-ink)"} style={{ fontFamily: "var(--font-sans)" }}>
                  {shape.fingers[i]}
                </text>
              )}
            </g>
          );
        })}
      </svg>
    </button>
  );
}
