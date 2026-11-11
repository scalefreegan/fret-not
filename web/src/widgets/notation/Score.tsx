import { useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { FretPos } from "../../../shared/music/instruments.ts";
import { toMidi, type Pitch } from "../../../shared/music/notes.ts";
import { parseTime, type Duration } from "../../../shared/music/rhythm.ts";
import { keySignature, type KeySignature } from "../../../shared/music/scales.ts";
import { clefFor, keySignaturePositions, ledgerLines, pitchAtPosition, staffPosition, type Clef } from "../../../shared/music/staff.ts";
import { pcColor } from "../../ui.tsx";

// Engraving. One component draws everything written down in the app: a
// single note to name, a chord, a key signature, a rhythm on one line, a
// melody over several systems, and guitar tab aligned under its staff.
// Glyphs are Bravura (SMuFL code points) set as SVG text; SMuFL fixes the
// font size at four staff spaces, so everything is measured in spaces (S).

export type ScoreClef = "treble" | "bass" | "grand" | "rhythm" | "none";
export type Tone = "pc" | "ink" | "accent" | "good" | "bad";

export interface ScoreItem {
  /** Written pitches; empty = a rest (needs a duration). */
  pitches: Pitch[];
  /** Absent → a plain stemless notehead, for "here is a note" displays. */
  duration?: Duration;
  /** Fretboard positions for the tab row, same order as nothing in particular. */
  tab?: FretPos[];
  /** Text under the staff (a note name, a scale degree). */
  label?: string;
  /** Counting syllable under the staff ("1", "&"). */
  count?: string;
  /** Bar index, for bar lines and line breaks. */
  bar?: number;
  tone?: Tone;
}

export interface ScoreProps {
  clef: ScoreClef;
  items: ScoreItem[];
  keySig?: string;
  time?: string;
  /** Draw a tab staff under the notation (or alone with clef "none"). */
  tab?: boolean;
  /** Index of the item being played. */
  active?: number | null;
  /** Default tone for noteheads. "pc" colours each by pitch class. */
  tone?: Tone;
  onItemClick?: (index: number) => void;
  /** Makes the staff clickable: called with the natural pitch at the clicked
   *  line or space. */
  onPick?: (pitch: Pitch) => void;
  /** Staff-space size in px. Default 10. */
  space?: number;
  /** Draw a final double bar line. Default: when the items have durations. */
  finalBar?: boolean;
  ariaLabel?: string;
}

const G = {
  gClef: "",
  fClef: "",
  percClef: "",
  whole: "",
  half: "",
  black: "",
  flat: "",
  natural: "",
  sharp: "",
  dsharp: "",
  dflat: "",
  flag8Up: "",
  flag8Down: "",
  flag16Up: "",
  flag16Down: "",
  restW: "",
  restH: "",
  restQ: "",
  rest8: "",
  rest16: "",
  dot: "",
  brace: "",
  time0: 0xe080,
};
const ACC_GLYPH: Record<number, string> = { [-2]: G.dflat, [-1]: G.flat, 0: G.natural, 1: G.sharp, 2: G.dsharp };
const HEAD_W = 1.18; // black/half notehead width in spaces
const WHOLE_W = 1.69;

export function useWidth<T extends HTMLElement>(): [React.RefObject<T | null>, number] {
  const ref = useRef<T | null>(null);
  const [w, setW] = useState(0);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    setW(el.clientWidth);
    const ro = new ResizeObserver(() => setW(el.clientWidth));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, w];
}

function toneFill(tone: Tone, midi: number): string {
  if (tone === "pc") return pcColor(midi);
  if (tone === "accent") return "var(--accent)";
  if (tone === "good") return "var(--good)";
  if (tone === "bad") return "var(--bad)";
  return "var(--ink)";
}

interface Placed {
  item: ScoreItem;
  index: number;
  /** Natural width in spaces. */
  w: number;
  /** Accidentals to draw, parallel to item.pitches (null = none). */
  accs: (number | null)[];
}
interface System {
  items: Placed[];
  first: boolean;
  last: boolean;
}

function itemWidth(it: ScoreItem, hasAcc: boolean): number {
  const base = it.duration ? 2.6 + 1.1 * Math.log2(it.duration.beats * 4 + 1) : 5;
  return base + (hasAcc ? 0.9 : 0) + (it.label && it.label.length > 3 ? 0.6 : 0);
}

/** Decide which accidentals are drawn: those the key signature does not
 *  already give, remembered until the end of the bar. */
function placeItems(items: ScoreItem[], sig: KeySignature): Placed[] {
  let bar = -1;
  let memo = new Map<string, number>();
  return items.map((item, index) => {
    if ((item.bar ?? 0) !== bar) {
      bar = item.bar ?? 0;
      memo = new Map();
    }
    const accs = item.pitches.map((p) => {
      const key = `${p.letter}${p.oct}`;
      const inForce = memo.get(key) ?? (sig.letters.includes(p.letter) ? Math.sign(sig.count) : 0);
      if (p.acc === inForce) return null;
      memo.set(key, p.acc);
      return p.acc;
    });
    return { item, index, accs, w: itemWidth(item, accs.some((a) => a !== null)) };
  });
}

function prefixWidth(clef: ScoreClef, sig: KeySignature, time: string | undefined, first: boolean): number {
  let w = 0.8;
  if (clef !== "none") w += clef === "rhythm" ? 2.6 : 3.4;
  else w += 2.4; // "TAB"
  if (clef !== "rhythm" && clef !== "none") w += Math.abs(sig.count) * 1.05 + (sig.count ? 0.6 : 0);
  if (time && first) w += 2.6;
  return w + 0.8;
}

function breakSystems(placed: Placed[], maxSpaces: number, prefix: (first: boolean) => number): System[] {
  const systems: System[] = [];
  let cur: Placed[] = [];
  let used = prefix(true);
  const byBar = placed.some((p) => (p.item.bar ?? 0) > 0);
  // Group into unbreakable chunks: whole bars when there are bar lines.
  const chunks: Placed[][] = [];
  for (const p of placed) {
    const lastChunk = chunks[chunks.length - 1];
    if (byBar && lastChunk && (lastChunk[0].item.bar ?? 0) === (p.item.bar ?? 0)) lastChunk.push(p);
    else chunks.push([p]);
  }
  for (const chunk of chunks) {
    const w = chunk.reduce((s, p) => s + p.w, 0) + (byBar ? 1 : 0);
    if (cur.length && used + w > maxSpaces) {
      systems.push({ items: cur, first: systems.length === 0, last: false });
      cur = [];
      used = prefix(false);
    }
    cur.push(...chunk);
    used += w;
  }
  systems.push({ items: cur, first: systems.length === 0, last: true });
  return systems;
}

export function Score(props: ScoreProps) {
  const [ref, width] = useWidth<HTMLDivElement>();
  return (
    <div ref={ref} className="w-full">
      {width > 0 && <ScoreSvg {...props} width={width} />}
    </div>
  );
}

function ScoreSvg({ clef, items, keySig, time, tab, active, tone = "ink", onItemClick, onPick, space = 11, finalBar, width, ariaLabel }: ScoreProps & { width: number }) {
  const S = space;
  const sig = useMemo(() => (keySig ? keySignature(keySig) : { count: 0, letters: [] }), [keySig]);
  const placed = useMemo(() => placeItems(items, sig), [items, sig]);
  const maxSpaces = Math.max(24, width / S);
  const systems = useMemo(() => breakSystems(placed, maxSpaces, (first) => prefixWidth(clef, sig, time, first)), [placed, maxSpaces, clef, sig, time]);
  const staves: Clef[] = clef === "grand" ? ["treble", "bass"] : clef === "bass" ? ["bass"] : clef === "treble" ? ["treble"] : [];
  const hasDur = items.some((i) => i.duration);
  const drawFinal = finalBar ?? hasDur;
  const hasLabels = items.some((i) => i.label);
  const hasCounts = items.some((i) => i.count);
  const [hover, setHover] = useState<{ sys: number; clef: Clef; pos: number } | null>(null);

  // Which staff a pitch goes on.
  const staffOf = (p: Pitch): Clef => (clef === "grand" ? clefFor(p) : clef === "bass" ? "bass" : "treble");

  // Vertical extent: how far notes reach above and below the staves.
  let top = 8;
  let bottom = 0;
  for (const it of items) {
    for (const p of it.pitches) {
      const c = staffOf(p);
      const pos = staffPosition(p, c);
      if (c === staves[0]) top = Math.max(top, pos + 7);
      if (c === staves[staves.length - 1]) bottom = Math.min(bottom, pos - 7);
    }
  }
  if (onPick) {
    top = Math.max(top, 14);
    bottom = Math.min(bottom, -6);
  }
  const padTop = clef === "rhythm" ? 4 : clef === "none" ? 0.5 : Math.max(2.5, (top - 8) / 2 + 1.2);
  const staffH = clef === "rhythm" ? 0 : 4;
  const grandGap = 7;
  const stavesH = clef === "none" ? 0 : staves.length === 2 ? staffH * 2 + grandGap : staffH;
  const padBottom = clef === "rhythm" ? 3.2 : clef === "none" ? 0 : Math.max(2.2, -bottom / 2 + 1.2);
  const labelsH = (hasLabels ? 2 : 0) + (hasCounts ? 2 : 0);
  const tabGap = clef === "none" ? 0.5 : 1.5;
  const tabLine = 1.25;
  const tabH = tab ? tabGap + 5 * tabLine + 1.2 : 0;
  const sysH = (padTop + stavesH + padBottom + labelsH + tabH) * S;
  const sysGap = 1.6 * S;

  /** y of a staff position on a given staff, within a system. */
  const yOf = (c: Clef | "rhythm", pos: number): number => {
    if (c === "rhythm") return padTop * S;
    const staffTop = padTop * S + (clef === "grand" && c === "bass" ? (staffH + grandGap) * S : 0);
    return staffTop + (8 - pos) * (S / 2);
  };
  const labelsY = (padTop + stavesH + padBottom) * S;
  const tabTop = (padTop + stavesH + padBottom + labelsH + tabGap) * S;

  const out: ReactNode[] = [];
  let cursorY = 0;
  const totalH = systems.length * sysH + (systems.length - 1) * sysGap;

  systems.forEach((sys, si) => {
    const y0 = cursorY;
    cursorY += sysH + sysGap;
    const prefix = prefixWidth(clef, sig, time, sys.first);
    const natural = sys.items.reduce((s, p) => s + p.w, 0) + sys.items.filter((p, i) => i > 0 && (p.item.bar ?? 0) !== (sys.items[i - 1].item.bar ?? 0)).length;
    const room = maxSpaces - prefix - 1.2;
    // Stretch full lines to the right margin; leave a short last line ragged.
    const stretch = !sys.last || natural > room * 0.7 ? Math.min(1.7, Math.max(1, room / natural)) : 1;
    const sysW = Math.min(width, (prefix + natural * stretch + 1.2) * S);
    const g: ReactNode[] = [];
    const k = (s: string) => `${si}-${s}`;

    // Staff lines.
    const lineProps = { stroke: "var(--staff-line)", strokeWidth: Math.max(1, S * 0.11) };
    for (const c of staves) for (let l = 0; l < 5; l++) g.push(<line key={k(`l${c}${l}`)} x1={0} x2={sysW} y1={yOf(c, l * 2)} y2={yOf(c, l * 2)} {...lineProps} />);
    if (clef === "rhythm") g.push(<line key={k("rl")} x1={0} x2={sysW} y1={yOf("rhythm", 0)} y2={yOf("rhythm", 0)} {...lineProps} />);
    if (tab) {
      for (let l = 0; l < 6; l++) g.push(<line key={k(`t${l}`)} x1={0} x2={sysW} y1={tabTop + l * tabLine * S} y2={tabTop + l * tabLine * S} {...lineProps} />);
      g.push(
        <text key={k("tab")} x={0.7 * S} y={tabTop + 2.5 * tabLine * S} fontSize={S * 1.5} fontWeight={800} fill="var(--fg-3)" style={{ fontFamily: "var(--font-sans)" }} dominantBaseline="middle">
          <tspan x={0.7 * S} dy={-1.5 * S}>T</tspan>
          <tspan x={0.7 * S} dy={1.5 * S}>A</tspan>
          <tspan x={0.7 * S} dy={1.5 * S}>B</tspan>
        </text>,
      );
    }
    // Left edge line joining a grand staff or staff + tab.
    const topY = clef === "none" ? tabTop : clef === "rhythm" ? yOf("rhythm", 0) - S : yOf(staves[0], 8);
    const botY = tab ? tabTop + 5 * tabLine * S : clef === "rhythm" ? yOf("rhythm", 0) + S : yOf(staves[staves.length - 1], 0);
    if (clef === "grand" || (tab && clef !== "none")) g.push(<line key={k("edge")} x1={0.5} x2={0.5} y1={topY} y2={botY} stroke="var(--ink)" strokeWidth={1.2} />);

    // Clef, key signature, time signature.
    let x = 0.8 * S;
    const glyph = (key: string, ch: string, gx: number, gy: number, fill = "var(--ink)", extra: Record<string, unknown> = {}) => (
      <text key={k(key)} className="smufl" x={gx} y={gy} fontSize={4 * S} style={{ fill }} {...extra}>
        {ch}
      </text>
    );
    if (clef === "rhythm") {
      g.push(glyph("clef", G.percClef, x, yOf("rhythm", 0)));
      x += 2.6 * S;
    } else if (clef === "none") {
      x += 2.4 * S;
    } else {
      for (const c of staves) g.push(glyph(`clef${c}`, c === "treble" ? G.gClef : G.fClef, x, yOf(c, c === "treble" ? 2 : 6)));
      x += 3.4 * S;
      if (sig.count) {
        for (const c of staves) keySignaturePositions(sig, c).forEach((pos, i) => g.push(glyph(`ks${c}${i}`, sig.count > 0 ? G.sharp : G.flat, x + i * 1.05 * S, yOf(c, pos))));
        x += (Math.abs(sig.count) * 1.05 + 0.6) * S;
      }
    }
    if (time && sys.first) {
      const ts = parseTime(time);
      const digits = (n: number, gx: number, gy: number, key: string) => {
        const s = String(n);
        return [...s].map((d, i) => glyph(`${key}${i}`, String.fromCodePoint(G.time0 + Number(d)), gx + (i - (s.length - 1) / 2) * 1.6 * S, gy, "var(--ink)", { textAnchor: "middle" }));
      };
      if (clef === "rhythm" || clef === "none") {
        const cy = clef === "rhythm" ? yOf("rhythm", 0) : tabTop + 2.5 * tabLine * S;
        g.push(...digits(ts.beats, x + 1.1 * S, cy - S, "tn"), ...digits(ts.unit, x + 1.1 * S, cy + S, "td"));
      } else for (const c of staves) g.push(...digits(ts.beats, x + 1.1 * S, yOf(c, 6), `tn${c}`), ...digits(ts.unit, x + 1.1 * S, yOf(c, 2), `td${c}`));
      x += 2.6 * S;
    }
    x += 0.8 * S;
    const musicX = x;

    // Items.
    const centers: number[] = [];
    sys.items.forEach((p, i) => {
      const prev = sys.items[i - 1];
      if (prev && (prev.item.bar ?? 0) !== (p.item.bar ?? 0)) {
        const bx = x + 0.5 * S * stretch;
        g.push(<line key={k(`bar${i}`)} x1={bx} x2={bx} y1={topY} y2={botY} stroke="var(--ink)" strokeWidth={1.1} />);
        x += S * stretch;
      }
      const w = p.w * S * stretch;
      const hasAcc = p.accs.some((a) => a !== null);
      const cx = x + (hasAcc ? 0.9 * S : 0) + (w - (hasAcc ? 0.9 * S : 0)) * 0.42;
      centers.push(cx);
      const it = p.item;
      const isActive = active === p.index;
      const ig: ReactNode[] = [];
      if (isActive) ig.push(<rect key="act" x={x + 1} y={topY - 1.5 * S} width={w - 2} height={botY - topY + 3 * S + labelsH * S} rx={6} fill="var(--accent-soft)" />);
      const baseTone = it.tone ?? tone;
      const fillFor = (pitch: Pitch) => toneFill(isActive && baseTone === "ink" ? "accent" : baseTone, toMidi(pitch));

      if (clef !== "none") {
        const d = it.duration;
        if (d && (d.rest || it.pitches.length === 0)) {
          const c = clef === "rhythm" ? "rhythm" : staves[0];
          const ch = { w: G.restW, h: G.restH, q: G.restQ, e: G.rest8, s: G.rest16 }[d.value];
          const ry = clef === "rhythm" ? yOf("rhythm", 0) : yOf(c as Clef, d.value === "w" ? 6 : 4);
          ig.push(glyph("rest", ch, cx - 0.55 * S, ry, isActive ? "var(--accent)" : "var(--ink)"));
          if (d.dotted) ig.push(glyph("rdot", G.dot, cx + 0.9 * S, ry - S / 2));
        } else if (it.pitches.length) {
          // Group the notes by staff; each group gets its own stem.
          const groups = new Map<Clef | "rhythm", { pitch: Pitch; pos: number; acc: number | null }[]>();
          it.pitches.forEach((pitch, pi) => {
            const c: Clef | "rhythm" = clef === "rhythm" ? "rhythm" : staffOf(pitch);
            const pos = c === "rhythm" ? 0 : staffPosition(pitch, c);
            const list = groups.get(c) ?? [];
            list.push({ pitch, pos, acc: p.accs[pi] });
            groups.set(c, list);
          });
          for (const [c, notes] of groups) {
            notes.sort((a, b) => a.pos - b.pos);
            const avg = notes.reduce((s, n) => s + n.pos, 0) / notes.length;
            const up = c === "rhythm" ? true : avg < 4;
            const headGlyph = !d ? G.black : d.value === "w" ? G.whole : d.value === "h" ? G.half : G.black;
            const headW = (headGlyph === G.whole ? WHOLE_W : HEAD_W) * S;
            const hx = cx - headW / 2;
            // Notes a second apart cannot share a column: shift every other one across the stem.
            const shifted = notes.map(() => false);
            const order = up ? notes.map((_, n) => n) : notes.map((_, n) => notes.length - 1 - n);
            for (let o = 1; o < order.length; o++) {
              const a = order[o - 1];
              const b = order[o];
              if (Math.abs(notes[a].pos - notes[b].pos) === 1 && !shifted[a]) shifted[b] = true;
            }
            // Ledger lines.
            const ledgers = new Set<number>();
            for (const n of notes) if (c !== "rhythm") for (const l of ledgerLines(n.pos)) ledgers.add(l);
            for (const l of ledgers) ig.push(<line key={`led${c}${l}`} x1={hx - 0.35 * S} x2={hx + headW + 0.35 * S} y1={yOf(c, l)} y2={yOf(c, l)} stroke="var(--ink)" strokeWidth={Math.max(1.1, S * 0.14)} />);
            // Accidentals, in columns so that close ones do not collide.
            const cols: number[] = [];
            [...notes].reverse().forEach((n) => {
              if (n.acc === null) return;
              let col = 0;
              while (cols[col] !== undefined && Math.abs(cols[col] - n.pos) < 6) col++;
              cols[col] = n.pos;
              ig.push(glyph(`acc${c}${n.pos}`, ACC_GLYPH[n.acc], hx - (1.15 + col * 1.0) * S, yOf(c, n.pos)));
            });
            notes.forEach((n, ni) => {
              const nx = hx + (shifted[ni] ? (up ? headW - 1 : -headW + 1) : 0);
              ig.push(glyph(`h${c}${n.pos}`, headGlyph, nx, yOf(c, n.pos), fillFor(n.pitch)));
              if (d?.dotted) ig.push(glyph(`dot${c}${n.pos}`, G.dot, hx + headW + 0.45 * S, yOf(c, n.pos + (n.pos % 2 === 0 ? 1 : 0))));
            });
            // Stem and flag.
            if (d && d.value !== "w") {
              const lo = notes[0].pos;
              const hi = notes[notes.length - 1].pos;
              const sx = up ? hx + headW - 0.06 * S : hx + 0.06 * S;
              const yStart = yOf(c, up ? lo : hi) + (up ? -0.15 : 0.15) * S;
              const yEnd = yOf(c, up ? hi : lo) + (up ? -3.5 : 3.5) * S;
              ig.push(<line key={`stem${c}`} x1={sx} x2={sx} y1={yStart} y2={yEnd} stroke="var(--ink)" strokeWidth={Math.max(1.1, S * 0.12)} />);
              if (d.value === "e" || d.value === "s") {
                const ch = d.value === "e" ? (up ? G.flag8Up : G.flag8Down) : up ? G.flag16Up : G.flag16Down;
                ig.push(glyph(`flag${c}`, ch, sx - 0.06 * S, yEnd));
              }
            }
          }
        }
      }
      // Tab numbers.
      if (tab && it.tab) {
        for (const pos of it.tab) {
          const ty = tabTop + (pos.string - 1) * tabLine * S;
          const text = String(pos.fret);
          ig.push(<rect key={`tb${pos.string}`} x={cx - (text.length * 0.45 + 0.25) * S} y={ty - 0.62 * S} width={(text.length * 0.9 + 0.5) * S} height={1.24 * S} fill="var(--panel)" />);
          ig.push(
            <text key={`tn${pos.string}`} x={cx} y={ty} textAnchor="middle" dominantBaseline="central" fontSize={S * 1.35} fontWeight={700} fill={isActive ? "var(--accent)" : "var(--ink)"} style={{ fontFamily: "var(--font-sans)" }}>
              {text}
            </text>,
          );
        }
      }
      if (it.label)
        ig.push(
          <text key="label" x={cx} y={labelsY + 1.3 * S} textAnchor="middle" fontSize={S * 1.35} fontWeight={650} fill="var(--fg-2)" style={{ fontFamily: "var(--font-sans)" }}>
            {it.label}
          </text>,
        );
      if (it.count)
        ig.push(
          <text key="count" x={cx} y={labelsY + (hasLabels ? 3.3 : 1.3) * S} textAnchor="middle" fontSize={S * 1.3} fontWeight={isActive ? 800 : 600} fill={isActive ? "var(--accent)" : "var(--fg-3)"} style={{ fontFamily: "var(--font-sans)" }}>
            {it.count}
          </text>,
        );
      g.push(
        <g key={k(`item${p.index}`)} onClick={onItemClick ? () => onItemClick(p.index) : undefined} style={onItemClick ? { cursor: "pointer" } : undefined}>
          {onItemClick && <rect x={x} y={topY - 2 * S} width={w} height={botY - topY + 4 * S} fill="transparent" />}
          {ig}
        </g>,
      );
      x += w;
    });

    // Closing bar line.
    if (sys.last && drawFinal) {
      g.push(<line key={k("fin1")} x1={sysW - 0.75 * S} x2={sysW - 0.75 * S} y1={topY} y2={botY} stroke="var(--ink)" strokeWidth={1.1} />);
      g.push(<line key={k("fin2")} x1={sysW - 0.22 * S} x2={sysW - 0.22 * S} y1={topY} y2={botY} stroke="var(--ink)" strokeWidth={0.45 * S} />);
    } else if (hasDur) g.push(<line key={k("end")} x1={sysW - 0.5} x2={sysW - 0.5} y1={topY} y2={botY} stroke="var(--ink)" strokeWidth={1.1} />);

    // Click-to-place: a transparent sheet over the music area.
    if (onPick && staves.length) {
      const locate = (e: React.MouseEvent<SVGRectElement>): { clef: Clef; pos: number } => {
        const box = e.currentTarget.getBoundingClientRect();
        const y = e.clientY - box.top + (topY - 4 * S);
        let c = staves[0];
        if (staves.length === 2 && y > (yOf("treble", 0) + yOf("bass", 8)) / 2) c = "bass";
        const pos = Math.round((yOf(c, 0) - y) / (S / 2));
        return { clef: c, pos: Math.max(-8, Math.min(16, pos)) };
      };
      if (hover && hover.sys === si) {
        const hx = Math.max(musicX + 2 * S, centers[centers.length - 1] ?? musicX + 2 * S);
        for (const l of ledgerLines(hover.pos)) g.push(<line key={k(`hl${l}`)} x1={hx + 3.4 * S} x2={hx + 5.8 * S} y1={yOf(hover.clef, l)} y2={yOf(hover.clef, l)} stroke="var(--fg-3)" strokeWidth={1.2} />);
        g.push(glyph("hover", G.whole, hx + 3.75 * S, yOf(hover.clef, hover.pos), "var(--fg-3)", { opacity: 0.55 }));
      }
      g.push(
        <rect
          key={k("pick")}
          x={musicX}
          y={topY - 4 * S}
          width={Math.max(0, sysW - musicX)}
          height={botY - topY + 8 * S}
          fill="transparent"
          style={{ cursor: "pointer" }}
          onMouseMove={(e) => {
            const h = locate(e);
            setHover((cur) => (cur && cur.sys === si && cur.clef === h.clef && cur.pos === h.pos ? cur : { sys: si, ...h }));
          }}
          onMouseLeave={() => setHover(null)}
          onClick={(e) => {
            const h = locate(e);
            onPick(pitchAtPosition(h.pos, h.clef));
          }}
        />,
      );
    }
    if (clef === "grand") g.push(glyph("brace", G.brace, -1.1 * S, yOf("bass", 0), "var(--ink)", { fontSize: (staffH * 2 + grandGap) * S, transform: undefined }));
    out.push(
      <g key={si} transform={`translate(${clef === "grand" ? 1.4 * S : 0}, ${y0})`}>
        {g}
      </g>,
    );
  });

  return (
    <svg width={width} height={Math.ceil(totalH) + 2} viewBox={`0 0 ${width} ${Math.ceil(totalH) + 2}`} role="img" aria-label={ariaLabel ?? "Music notation"} style={{ display: "block", overflow: "visible" }}>
      {out}
    </svg>
  );
}

/** Scroll the active item's system into view while a tune plays. */
export function useFollow(active: number | null | undefined, ref: React.RefObject<HTMLElement | null>): void {
  useEffect(() => {
    if (active == null) return;
    ref.current?.querySelector("rect[fill='var(--accent-soft)']")?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [active, ref]);
}
