import { useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { FretPos } from "../../../shared/music/instruments.ts";
import { toMidi, type Pitch } from "../../../shared/music/notes.ts";
import { parseTime, type Duration } from "../../../shared/music/rhythm.ts";
import { keySignature, type KeySignature } from "../../../shared/music/scales.ts";
import { clefFor, keySignaturePositions, ledgerLines, pitchAtPosition, staffPosition, type Clef } from "../../../shared/music/staff.ts";
import { pcColor } from "../../ui.tsx";
import { useCoarse } from "../touch.ts";

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

const tabClashWarned = new Set<number>();
function warnTabClash(string: number): void {
  if (tabClashWarned.has(string)) return;
  tabClashWarned.add(string);
  console.warn(`[score] a tab asks for two frets at once on string ${string}; one string can only sound one note`);
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
  /** The line ends in the middle of a bar (a bar too long for the window):
   *  no bar line is drawn there, the bar simply carries on below. */
  open?: boolean;
}

function itemWidth(it: ScoreItem, hasAcc: boolean): number {
  const base = it.duration ? 2.6 + 1.1 * Math.log2(it.duration.beats * 4 + 1) : 5;
  return base + (hasAcc ? 0.9 : 0) + (it.label && it.label.length > 3 ? 0.6 : 0);
}

/** Decide which accidentals are drawn: those the key signature does not
 *  already give, remembered until the end of the bar. `restateAt` lists item
 *  indexes that start a new line in the middle of a bar: an accidental still
 *  in force from before the break is written again the first time its note
 *  comes back after it (a courtesy accidental), since the reader can no
 *  longer see the one it comes from on the same line. */
function placeItems(items: ScoreItem[], sig: KeySignature, restateAt: ReadonlySet<number> = new Set()): Placed[] {
  let bar = -1;
  let memo = new Map<string, number>();
  let restated = new Set<string>();
  let afterBreak = false;
  return items.map((item, index) => {
    if ((item.bar ?? 0) !== bar) {
      bar = item.bar ?? 0;
      memo = new Map();
      afterBreak = false;
    }
    if (restateAt.has(index)) {
      afterBreak = true;
      restated = new Set();
    }
    const accs = item.pitches.map((p) => {
      const key = `${p.letter}${p.oct}`;
      const inForce = memo.get(key) ?? (sig.letters.includes(p.letter) ? Math.sign(sig.count) : 0);
      if (p.acc === inForce) {
        if (!afterBreak || !memo.has(key) || restated.has(key)) return null;
        restated.add(key);
        return p.acc;
      }
      memo.set(key, p.acc);
      restated.add(key);
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

/** A staff position in words, as it looks ("line 2", "space 3"): the place,
 *  not the note's name, so that an exercise is not answered by its label. */
function describePosition(pos: number, clef: Clef | null): string {
  // Outside the staff, positions alternate space, ledger line, space, …:
  // the first step out is the space touching the staff, the second is the
  // first ledger line.
  const outside = (n: number, side: "above" | "below") => {
    const ledger = Math.floor(n / 2);
    if (n % 2 === 0) return `ledger line ${ledger} ${side} the staff`;
    return ledger === 0 ? `the space just ${side} the staff` : `the space ${side} ledger line ${ledger} ${side} the staff`;
  };
  const where = pos > 8 ? outside(pos - 8, "above") : pos < 0 ? outside(-pos, "below") : pos % 2 === 0 ? `line ${pos / 2 + 1}` : `space ${(pos + 1) / 2}`;
  return clef ? `${clef} staff, ${where}` : where;
}

/** How far a line that is too full may be squeezed before it is broken instead. */
const MIN_STRETCH = 0.72;
/** How far the whole score may shrink (share of its size, and px per staff
 *  space) to keep a wide bar whole. */
const MIN_SPACE_SHARE = 0.7;
const MIN_SPACE = 7;
/** Staff-space size of a staff that takes notes from a finger. */
const PICK_SPACE_TOUCH = 15;
/** Spaces kept clear at the right end of a system. */
const TAIL = 1.2;

function breakSystems(placed: Placed[], maxSpaces: number, prefix: (first: boolean) => number): System[] {
  const systems: System[] = [];
  let cur: Placed[] = [];
  let used = prefix(true);
  // Music with note values is in bars, even when it is all one bar (every
  // item in bar 0): a bar stays on one line. A plain list of notes with no
  // values (a scale to look at, five notes to name) has no bars and wraps
  // wherever it must, with no bar lines.
  const byBar = isMetered(placed);
  if (!byBar) return wrapUnmetered(placed, maxSpaces, prefix);
  // Group into chunks kept on one line: whole bars.
  const bars: Placed[][] = [];
  for (const p of placed) {
    const lastChunk = bars[bars.length - 1];
    if (byBar && lastChunk && (lastChunk[0].item.bar ?? 0) === (p.item.bar ?? 0)) lastChunk.push(p);
    else bars.push([p]);
  }
  // A bar too wide for a whole line even when squeezed (a narrow window) is
  // broken between its notes rather than left to run off the edge.
  const widest = maxSpaces - Math.max(prefix(true), prefix(false)) - TAIL;
  const chunks = bars.flatMap((bar) => (bar.length > 1 && bar.reduce((s, p) => s + p.w, 0) * MIN_STRETCH > widest + 1e-6 ? bar.map((p) => [p]) : [bar]));
  for (const chunk of chunks) {
    const startsBar = byBar && (cur.length === 0 || (cur[cur.length - 1].item.bar ?? 0) !== (chunk[0].item.bar ?? 0));
    const w = chunk.reduce((s, p) => s + p.w, 0) + (startsBar ? 1 : 0);
    if (cur.length && used + w + TAIL > maxSpaces) {
      systems.push({ items: cur, first: systems.length === 0, last: false });
      cur = [];
      used = prefix(false);
    }
    cur.push(...chunk);
    used += w;
  }
  systems.push({ items: cur, first: systems.length === 0, last: true });
  systems.forEach((sys, i) => {
    const next = systems[i + 1];
    sys.open = Boolean(next && sys.items.length && next.items.length && (sys.items[sys.items.length - 1].item.bar ?? 0) === (next.items[0].item.bar ?? 0));
  });
  return systems;
}

/** Eighths and sixteenths that share a beat are joined by beams instead of
 *  each carrying flags. A group is consecutive notes shorter than a quarter
 *  (eighth, dotted eighth, sixteenth; no rests) in one bar, inside one beat (a
 *  dotted-quarter beat in 6/8, 9/8, 12/8), all on one staff. Returns groups of
 *  item indexes with the stem direction the whole group takes and where in
 *  the bar each member starts (which decides the way a lone sixteenth's
 *  partial beam points). */
interface BeamGroup {
  members: number[];
  up: boolean;
  at: Map<number, number>;
}
function beamGroups(items: ScoreItem[], clef: ScoreClef, time: string | undefined, staffOf: (p: Pitch) => Clef): BeamGroup[] {
  if (clef === "none") return [];
  const ts = time ? parseTime(time) : null;
  const beat = ts && ts.unit === 8 && ts.beats % 3 === 0 ? 1.5 : 1;
  const totals = new Map<number, number>();
  for (const it of items) totals.set(it.bar ?? 0, (totals.get(it.bar ?? 0) ?? 0) + (it.duration?.beats ?? 0));
  const firstBar = Math.min(...items.map((it) => it.bar ?? 0));
  // A pickup bar holds the END of a bar: its notes count from where they fall.
  const pickup = ts && totals.size > 1 && (totals.get(firstBar) ?? 0) < ts.barBeats - 1e-6 ? ts.barBeats - (totals.get(firstBar) ?? 0) : 0;
  const groups: (BeamGroup & { key: string })[] = [];
  let bar = NaN;
  let onset = 0;
  items.forEach((it, i) => {
    if ((it.bar ?? 0) !== bar) {
      bar = it.bar ?? 0;
      onset = bar === firstBar ? pickup : 0;
    }
    const d = it.duration;
    const at = onset;
    onset += d?.beats ?? 0;
    if (!d || (d.value !== "e" && d.value !== "s") || d.rest || it.pitches.length === 0) return;
    const staves = new Set(it.pitches.map((p) => (clef === "rhythm" ? "rhythm" : staffOf(p))));
    if (staves.size !== 1) return;
    const key = `${bar}/${Math.floor((at + 1e-6) / beat)}/${[...staves][0]}`;
    const last = groups[groups.length - 1];
    if (last && last.key === key && last.members[last.members.length - 1] === i - 1) {
      last.members.push(i);
      last.at.set(i, at);
    } else groups.push({ members: [i], up: true, key, at: new Map([[i, at]]) });
  });
  return groups
    .filter((g) => g.members.length > 1)
    .map((g) => {
      if (clef === "rhythm") return { members: g.members, up: true, at: g.at };
      const pos = g.members.flatMap((i) => items[i].pitches.map((p) => staffPosition(p, staffOf(p))));
      return { members: g.members, up: pos.reduce((s, n) => s + n, 0) / pos.length < 4, at: g.at };
    });
}

const isMetered = (placed: Placed[]) => placed.some((p) => p.item.duration);

/** A list of notes without values: one line if it fits when squeezed,
 *  otherwise lines of about equal length (never one orphan note below). */
function wrapUnmetered(placed: Placed[], maxSpaces: number, prefix: (first: boolean) => number): System[] {
  const total = placed.reduce((s, p) => s + p.w, 0);
  if (placed.length === 0 || prefix(true) + total * MIN_STRETCH + TAIL <= maxSpaces + 1e-6) return [{ items: placed, first: true, last: true }];
  const room = Math.max(1, maxSpaces - Math.max(prefix(true), prefix(false)) - TAIL);
  const lines = Math.max(2, Math.ceil((total * MIN_STRETCH) / room));
  const per = Math.ceil(placed.length / lines);
  const systems: System[] = [];
  for (let i = 0; i < placed.length; i += per) systems.push({ items: placed.slice(i, i + per), first: i === 0, last: i + per >= placed.length });
  return systems;
}

/** Spaces the widest bar needs on a line of its own, squeezed as far as
 *  allowed. For a list of notes without values, the whole list (so that it
 *  shrinks onto one line when that is within reach). */
function widestBar(placed: Placed[], prefix: (first: boolean) => number): number {
  if (placed.length === 0) return 0;
  if (!isMetered(placed)) return placed.reduce((s, p) => s + p.w, 0) * MIN_STRETCH + prefix(true) + TAIL;
  const byBar = new Map<number, number>();
  for (const p of placed) byBar.set(p.item.bar ?? 0, (byBar.get(p.item.bar ?? 0) ?? 0) + p.w);
  return Math.max(...byBar.values()) * MIN_STRETCH + Math.max(prefix(true), prefix(false)) + TAIL;
}

/** Width a score is drawn at until its box has been measured, or when the
 *  box measures 0 (a shrink-to-fit parent): better a staff at a guess than
 *  no staff at all, which once left note-reading questions blank. */
const FALLBACK_W = 300;

export function Score(props: ScoreProps) {
  const [ref, width] = useWidth<HTMLDivElement>();
  useFollow(props.active, ref);
  return (
    <div ref={ref} className="w-full min-w-48">
      <ScoreSvg {...props} width={width > 0 ? width : FALLBACK_W} />
    </div>
  );
}

function ScoreSvg({ clef, items, keySig, time, tab, active, tone = "ink", onItemClick, onPick, space = 11, finalBar, width, ariaLabel }: ScoreProps & { width: number }) {
  const coarse = useCoarse();
  const sig = useMemo(() => (keySig ? keySignature(keySig) : { count: 0, letters: [] }), [keySig]);
  const placed0 = useMemo(() => placeItems(items, sig), [items, sig]);
  // A grand staff is set in from the left to make room for its brace.
  const inset = clef === "grand" ? 1.4 : 0;
  // A staff you place notes on with a finger is drawn larger (lines further
  // apart). A bar too wide for the window first shrinks the whole score, down
  // to MIN_SPACE_SHARE of its size, before any bar is broken across lines.
  const S0 = onPick && coarse ? Math.max(space, PICK_SPACE_TOUCH) : space;
  const S = useMemo(() => {
    const need = widestBar(placed0, (first) => prefixWidth(clef, sig, time, first)) + inset;
    if (!need || need * S0 <= width) return S0;
    const floor = Math.max(S0 * MIN_SPACE_SHARE, MIN_SPACE);
    // A long list of plain notes will wrap whatever its size: shrink it only
    // when that puts it on one line.
    if (!isMetered(placed0) && need * floor > width) return S0;
    return Math.max(floor, Math.min(S0, width / need));
  }, [placed0, clef, sig, time, inset, S0, width]);
  const maxSpaces = Math.max(12, width / S - inset);
  const { placed, systems } = useMemo(() => {
    const prefix = (first: boolean) => prefixWidth(clef, sig, time, first);
    const sys0 = breakSystems(placed0, maxSpaces, prefix);
    const breaks = new Set(sys0.slice(0, -1).flatMap((sys, i) => (sys.open && sys0[i + 1].items.length ? [sys0[i + 1].items[0].index] : [])));
    if (breaks.size === 0) return { placed: placed0, systems: sys0 };
    // Bars were broken: place again so accidentals are restated after each
    // break, keeping the same lines.
    const again = placeItems(items, sig, breaks);
    return { placed: again, systems: sys0.map((sys) => ({ ...sys, items: sys.items.map((p) => again[p.index]) })) };
  }, [placed0, items, maxSpaces, clef, sig, time]);
  void placed;
  const staves: Clef[] = clef === "grand" ? ["treble", "bass"] : clef === "bass" ? ["bass"] : clef === "treble" ? ["treble"] : [];
  const hasDur = items.some((i) => i.duration);
  const drawFinal = finalBar ?? hasDur;
  const hasLabels = items.some((i) => i.label);
  const hasCounts = items.some((i) => i.count);
  const [hover, setHover] = useState<{ sys: number; clef: Clef; pos: number } | null>(null);
  // Where the keyboard's note cursor sits on a clickable staff (arrow keys).
  const [kbd, setKbd] = useState<{ clef: Clef; pos: number } | null>(null);
  const [kbdOn, setKbdOn] = useState(false);
  const touching = useRef<number | null>(null);
  const lastTouch = useRef(-1e9);

  // Which staff a pitch goes on.
  const staffOf = (p: Pitch): Clef => (clef === "grand" ? clefFor(p) : clef === "bass" ? "bass" : "treble");
  const beams = beamGroups(items, clef, time, staffOf);

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
    const room = maxSpaces - prefix - TAIL;
    // Stretch full lines to the right margin; leave a short last line ragged.
    // A line that is over-full (one long bar in a narrow window) is squeezed.
    const fit = room / natural;
    const stretch = fit < 1 ? Math.max(MIN_STRETCH, fit) : !sys.last || natural > room * 0.7 ? Math.min(1.7, fit) : 1;
    const sysW = Math.min(width - inset * S, (prefix + natural * stretch + TAIL) * S);
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

    // Beams: the groups (or the parts of them) that sit on this line.
    const onLine = new Set(sys.items.map((q) => q.index));
    const beamOf = new Map<number, { id: number; up: boolean }>();
    beams.forEach((grp, id) => {
      const here = grp.members.filter((m) => onLine.has(m));
      if (here.length > 1) for (const m of here) beamOf.set(m, { id, up: grp.up });
    });
    const beamStems = new Map<number, { sx: number; yHead: number; tip: number; up: boolean; color: string; sixteenth: boolean; at: number }[]>();

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
      if (isActive) ig.push(<rect key="act" data-active-item="" x={x + 1} y={topY - 1.5 * S} width={w - 2} height={botY - topY + 3 * S + labelsH * S} rx={6} fill="var(--accent-soft)" />);
      const baseTone = it.tone ?? tone;
      const fillFor = (pitch: Pitch) => toneFill(isActive && baseTone === "ink" ? "accent" : baseTone, toMidi(pitch));

      if (clef !== "none") {
        const d = it.duration;
        if (d && (d.rest || it.pitches.length === 0)) {
          const ch = { w: G.restW, h: G.restH, q: G.restQ, e: G.rest8, s: G.rest16 }[d.value];
          // On a grand staff both hands rest, so both staves show it.
          for (const c of clef === "rhythm" ? (["rhythm"] as const) : staves) {
            const ry = c === "rhythm" ? yOf("rhythm", 0) : yOf(c, d.value === "w" ? 6 : 4);
            ig.push(glyph(`rest${c}`, ch, cx - 0.55 * S, ry, isActive ? "var(--accent)" : "var(--ink)"));
            if (d.dotted) ig.push(glyph(`rdot${c}`, G.dot, cx + 0.9 * S, ry - S / 2));
          }
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
            const beam = beamOf.get(p.index);
            const up = beam ? beam.up : c === "rhythm" ? true : avg < 4;
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
              ig.push(glyph(`acc${c}${notes.indexOf(n)}`, ACC_GLYPH[n.acc], hx - (1.4 + col * 1.05) * S, yOf(c, n.pos)));
            });
            notes.forEach((n, ni) => {
              const nx = hx + (shifted[ni] ? (up ? headW - 1 : -headW + 1) : 0);
              // Keyed by place in the chord: two notes can share a staff position (G and G sharp).
              ig.push(glyph(`h${c}${ni}`, headGlyph, nx, yOf(c, n.pos), fillFor(n.pitch)));
              if (d?.dotted) ig.push(glyph(`dot${c}${ni}`, G.dot, hx + headW + 0.45 * S, yOf(c, n.pos + (n.pos % 2 === 0 ? 1 : 0))));
            });
            // Stem and flag.
            if (d && d.value !== "w") {
              const lo = notes[0].pos;
              const hi = notes[notes.length - 1].pos;
              const sx = up ? hx + headW - 0.06 * S : hx + 0.06 * S;
              const yStart = yOf(c, up ? lo : hi) + (up ? -0.15 : 0.15) * S;
              // An octave long, and for a note on ledger lines far from the
              // staff, as far as the middle line.
              const usual = yOf(c, up ? hi : lo) + (up ? -3.5 : 3.5) * S;
              const yEnd = c === "rhythm" ? usual : up ? Math.min(usual, yOf(c, 4)) : Math.max(usual, yOf(c, 4));
              if (beam) {
                // Stem and beam are drawn together once the whole group is placed.
                const list = beamStems.get(beam.id) ?? [];
                list.push({ sx, yHead: yStart, tip: yEnd, up, color: "var(--ink)", sixteenth: d.value === "s", at: beams[beam.id].at.get(p.index) ?? 0 });
                beamStems.set(beam.id, list);
              } else ig.push(<line key={`stem${c}`} x1={sx} x2={sx} y1={yStart} y2={yEnd} stroke="var(--ink)" strokeWidth={Math.max(1.1, S * 0.12)} />);
              if (!beam && (d.value === "e" || d.value === "s")) {
                const ch = d.value === "e" ? (up ? G.flag8Up : G.flag8Down) : up ? G.flag16Up : G.flag16Down;
                ig.push(glyph(`flag${c}`, ch, sx - 0.06 * S, yEnd));
              }
            }
          }
        }
      }
      // Tab numbers.
      if (tab && it.tab) {
        // One string sounds one note at a time. A second fret on the same
        // string at the same moment cannot be played: it is drawn beside the
        // first in the warning colour rather than on top of it, and reported.
        const onString = new Map<number, number>();
        it.tab.forEach((pos, ti) => {
          const clash = onString.get(pos.string) ?? 0;
          onString.set(pos.string, clash + 1);
          if (clash === 1) warnTabClash(pos.string);
          const ty = tabTop + (pos.string - 1) * tabLine * S;
          const text = String(pos.fret);
          const tx = cx + clash * 1.7 * S;
          ig.push(<rect key={`tb${ti}`} x={tx - (text.length * 0.45 + 0.25) * S} y={ty - 0.62 * S} width={(text.length * 0.9 + 0.5) * S} height={1.24 * S} fill="var(--panel)" />);
          ig.push(
            <text key={`tn${ti}`} data-tab-clash={clash ? "" : undefined} x={tx} y={ty} textAnchor="middle" dominantBaseline="central" fontSize={S * 1.35} fontWeight={700} fill={clash ? "var(--bad)" : isActive ? "var(--accent)" : "var(--ink)"} style={{ fontFamily: "var(--font-sans)" }}>
              {text}
              {clash > 0 && <title>Two frets on one string at the same time cannot be played</title>}
            </text>,
          );
        });
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

    // Beamed groups: one straight beam, every stem drawn to meet it. The
    // beam leans with the notes, by no more than one staff space, and sits
    // far enough out that no stem is shorter than its usual length.
    for (const [id, stems] of beamStems) {
      const a = stems[0];
      const b = stems[stems.length - 1];
      const lean = Math.max(-S, Math.min(S, b.tip - a.tip));
      const run = b.sx - a.sx || 1;
      const lineAt = (sx: number) => a.tip + (lean * (sx - a.sx)) / run;
      const off = a.up ? Math.min(0, ...stems.map((s) => s.tip - lineAt(s.sx))) : Math.max(0, ...stems.map((s) => s.tip - lineAt(s.sx)));
      const yAt = (sx: number) => lineAt(sx) + off;
      const th = (a.up ? 0.5 : -0.5) * S;
      const sw = Math.max(1.1, S * 0.12);
      for (const [n, s] of stems.entries()) g.push(<line key={k(`bstem${id}-${n}`)} x1={s.sx} x2={s.sx} y1={s.yHead} y2={yAt(s.sx)} stroke={s.color} strokeWidth={sw} style={{ pointerEvents: "none" }} />);
      const bar = (key: string, x1: number, x2: number, level: number) => {
        const dy = level * (a.up ? 0.75 : -0.75) * S;
        return <polygon key={k(key)} data-beam={level ? "secondary" : ""} points={`${x1},${yAt(x1) + dy} ${x2},${yAt(x2) + dy} ${x2},${yAt(x2) + dy + th} ${x1},${yAt(x1) + dy + th}`} fill="var(--ink)" style={{ pointerEvents: "none" }} />;
      };
      g.push(bar(`beam${id}`, a.sx - sw / 2, b.sx + sw / 2, 0));
      // Sixteenths take a second beam: joined to a neighbouring sixteenth, or,
      // alone among eighths, a short stub pointing into the eighth-note part
      // of the beat it belongs to (left after a dotted eighth, right before one).
      for (let n = 0; n < stems.length; n++) {
        if (!stems[n].sixteenth) continue;
        let m = n;
        while (m + 1 < stems.length && stems[m + 1].sixteenth) m++;
        if (m > n) g.push(bar(`beam2-${id}-${n}`, stems[n].sx - sw / 2, stems[m].sx + sw / 2, 1));
        else {
          const onEighth = Math.abs(stems[n].at * 2 - Math.round(stems[n].at * 2)) < 1e-6;
          const right = n === 0 || (n < stems.length - 1 && onEighth);
          const len = Math.min(1.1 * S, Math.abs((right ? stems[n + 1] : stems[n - 1]).sx - stems[n].sx) * 0.5);
          g.push(right ? bar(`beam2-${id}-${n}`, stems[n].sx - sw / 2, stems[n].sx + len, 1) : bar(`beam2-${id}-${n}`, stems[n].sx - len, stems[n].sx + sw / 2, 1));
        }
        n = m;
      }
    }

    // Closing bar line.
    if (sys.last && drawFinal) {
      g.push(<line key={k("fin1")} x1={sysW - 0.75 * S} x2={sysW - 0.75 * S} y1={topY} y2={botY} stroke="var(--ink)" strokeWidth={1.1} />);
      g.push(<line key={k("fin2")} x1={sysW - 0.22 * S} x2={sysW - 0.22 * S} y1={topY} y2={botY} stroke="var(--ink)" strokeWidth={0.45 * S} />);
    } else if (hasDur && !sys.open) g.push(<line key={k("end")} x1={sysW - 0.5} x2={sysW - 0.5} y1={topY} y2={botY} stroke="var(--ink)" strokeWidth={1.1} />);

    // Click-to-place: a transparent sheet over the music area.
    if (onPick && staves.length) {
      const locate = (e: { currentTarget: Element; clientY: number }): { clef: Clef; pos: number } => {
        const box = e.currentTarget.getBoundingClientRect();
        const y = e.clientY - box.top + (topY - 4 * S);
        let c = staves[0];
        if (staves.length === 2 && y > (yOf("treble", 0) + yOf("bass", 8)) / 2) c = "bass";
        const pos = Math.round((yOf(c, 0) - y) / (S / 2));
        return { clef: c, pos: Math.max(-8, Math.min(16, pos)) };
      };
      // The ghost note: under the pointer, or (on the last line) where the
      // keyboard's cursor is while the staff has focus.
      const kbdHere = kbdOn && sys.last ? (kbd ?? { clef: staves[0], pos: 4 }) : null;
      const ghost = hover && hover.sys === si ? hover : kbdHere;
      if (ghost) {
        const hx = Math.max(musicX + 2 * S, centers[centers.length - 1] ?? musicX + 2 * S);
        for (const l of ledgerLines(ghost.pos)) g.push(<line key={k(`hl${l}`)} x1={hx + 3.4 * S} x2={hx + 5.8 * S} y1={yOf(ghost.clef, l)} y2={yOf(ghost.clef, l)} stroke="var(--fg-3)" strokeWidth={1.2} />);
        g.push(glyph("hover", G.whole, hx + 3.75 * S, yOf(ghost.clef, ghost.pos), "var(--fg-3)", { opacity: 0.55 }));
      }
      // Up and down walk the lines and spaces (across the two staves of a
      // grand staff: bass position p is treble position p − 12).
      const step = (from: { clef: Clef; pos: number }, by: number): { clef: Clef; pos: number } => {
        let { clef: c, pos } = from;
        pos += by;
        if (staves.length === 2) {
          if (c === "bass" && pos > 10) [c, pos] = ["treble", pos - 12];
          else if (c === "treble" && pos < -2) [c, pos] = ["bass", pos + 12];
        }
        return { clef: c, pos: Math.max(-8, Math.min(16, pos)) };
      };
      const at = kbd ?? { clef: staves[0], pos: 4 };
      const keyboard = sys.last
        ? {
            tabIndex: 0,
            role: "slider",
            "aria-orientation": "vertical" as const,
            "aria-label": "Place a note on the staff: up and down arrows choose the line or space, Enter places it",
            "aria-valuetext": describePosition(at.pos, staves.length === 2 ? at.clef : null),
            "aria-valuenow": at.pos + (at.clef === "bass" && staves.length === 2 ? -12 : 0),
            "aria-valuemin": staves.length === 2 ? -20 : -8,
            "aria-valuemax": 16,
            onFocus: () => setKbdOn(true),
            onBlur: () => setKbdOn(false),
            onKeyDown: (e: React.KeyboardEvent) => {
              if (e.metaKey || e.ctrlKey || e.altKey) return;
              if (e.key === "ArrowUp" || e.key === "ArrowRight") setKbd(step(at, 1));
              else if (e.key === "ArrowDown" || e.key === "ArrowLeft") setKbd(step(at, -1));
              else if (e.key === "PageUp") setKbd(step(at, 7));
              else if (e.key === "PageDown") setKbd(step(at, -7));
              else if (e.key === "Enter" || e.key === " ") {
                if (!e.repeat) onPick(pitchAtPosition(at.pos, at.clef));
              } else return;
              e.preventDefault();
              e.stopPropagation();
            },
          }
        : {};
      g.push(
        <rect
          key={k("pick")}
          className="staff-pick"
          rx={6}
          {...keyboard}
          x={musicX}
          y={topY - 4 * S}
          width={Math.max(0, sysW - musicX)}
          height={botY - topY + 8 * S}
          fill="transparent"
          style={{ cursor: "pointer", touchAction: "none", WebkitTapHighlightColor: "transparent" }}
          // Mouse: the ghost note follows the pointer, a click places it.
          // Finger: lines and spaces are closer together than a fingertip is
          // wide, so the ghost follows the finger as it slides and the note
          // is placed where the finger lifts.
          onPointerDown={(e) => {
            if (e.pointerType === "mouse") return;
            e.currentTarget.setPointerCapture(e.pointerId);
            touching.current = e.pointerId;
            setHover({ sys: si, ...locate(e) });
          }}
          onPointerMove={(e) => {
            if (e.pointerType !== "mouse" && touching.current !== e.pointerId) return;
            const h = locate(e);
            setHover((cur) => (cur && cur.sys === si && cur.clef === h.clef && cur.pos === h.pos ? cur : { sys: si, ...h }));
          }}
          onPointerUp={(e) => {
            if (e.pointerType === "mouse" || touching.current !== e.pointerId) return;
            touching.current = null;
            lastTouch.current = e.timeStamp;
            const h = locate(e);
            setHover(null);
            setKbd(h);
            onPick(pitchAtPosition(h.pos, h.clef));
          }}
          onPointerCancel={() => {
            touching.current = null;
            setHover(null);
          }}
          onPointerLeave={(e) => {
            if (e.pointerType === "mouse") setHover(null);
          }}
          onClick={(e) => {
            if (e.timeStamp - lastTouch.current < 800) return; // the click a touch leaves behind: already placed
            const h = locate(e);
            setKbd(h);
            onPick(pitchAtPosition(h.pos, h.clef));
          }}
        />,
      );
    }
    if (clef === "grand") g.push(glyph("brace", G.brace, -1.1 * S, yOf("bass", 0), "var(--ink)", { fontSize: (staffH * 2 + grandGap) * S, transform: undefined }));
    out.push(
      <g key={si} data-system="" transform={`translate(${inset * S}, ${y0})`}>
        {g}
      </g>,
    );
  });

  return (
    <svg width={width} height={Math.ceil(totalH) + 2} viewBox={`0 0 ${width} ${Math.ceil(totalH) + 2}`} role="img" aria-label={ariaLabel ?? "Music notation"} className={onPick ? "touch-surface" : undefined} style={{ display: "block", overflow: "visible" }}>
      {out}
    </svg>
  );
}

/** Keep the note being played in view while a tune that runs over several
 *  lines plays: when the playback moves to a line that is off screen, scroll
 *  just far enough to show it. A one-line score never moves the page. The
 *  moment the learner scrolls for themselves (wheel, finger, scrollbar,
 *  keyboard) following stops, until playback next starts: the page is theirs.
 *  And the page is never moved so far that the widget's own controls (the
 *  Play/Stop button under the score) leave the window, when both can fit. */
function useFollow(active: number | null | undefined, ref: React.RefObject<HTMLElement | null>): void {
  const off = useRef(false);
  const playing = active != null;
  useEffect(() => {
    if (!playing) return;
    off.current = false;
    let ours = 0; // time of our own last scroll, whose scroll events are not the learner's
    const mark = () => (ours = performance.now());
    const user = () => (off.current = true);
    const onScroll = () => {
      if (performance.now() - ours > 900) off.current = true; // a scrollbar drag or anything else not ours
    };
    const onKey = (e: KeyboardEvent) => {
      if (["ArrowUp", "ArrowDown", "PageUp", "PageDown", "Home", "End", " "].includes(e.key)) off.current = true;
    };
    const root = ref.current;
    root?.addEventListener("fretnot-follow", mark);
    window.addEventListener("wheel", user, { passive: true });
    window.addEventListener("touchmove", user, { passive: true });
    window.addEventListener("keydown", onKey);
    window.addEventListener("scroll", onScroll, { passive: true, capture: true });
    return () => {
      root?.removeEventListener("fretnot-follow", mark);
      window.removeEventListener("wheel", user);
      window.removeEventListener("touchmove", user);
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("scroll", onScroll, { capture: true });
    };
  }, [playing, ref]);
  useEffect(() => {
    const root = ref.current;
    if (active == null || off.current || !root || root.querySelectorAll("g[data-system]").length < 2) return;
    const system = root.querySelector("rect[data-active-item]")?.closest("g[data-system]");
    if (!system) return;
    const box = system.getBoundingClientRect();
    const vh = window.innerHeight;
    if (box.top >= 0 && box.bottom <= vh) return;
    // How far to move to bring the line just inside the window…
    let dy = box.top < 0 ? box.top - 12 : box.bottom - vh + 12;
    // …adjusted, when the line and the controls under the score fit in the
    // window together, so that the controls are in it too.
    const frame = root.closest("figure");
    if (frame) {
      const f = frame.getBoundingClientRect();
      const fits = f.bottom - box.top + 20 <= vh;
      if (fits && dy > 0) dy = Math.max(dy, f.bottom - vh + 8);
      if (fits && dy < 0) dy = Math.max(dy, Math.min(0, f.bottom - vh + 8));
    }
    if (Math.abs(dy) < 1) return;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    root.dispatchEvent(new Event("fretnot-follow"));
    window.scrollBy({ top: dy, behavior: reduced ? "auto" : "smooth" });
  }, [active, ref]);
}
