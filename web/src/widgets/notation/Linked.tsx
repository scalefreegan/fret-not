import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { Sound, Timbre } from "../../../shared/exercise-types.ts";
import { CHORDS, chordFullName, chordLabel, chordNotes, parseChord } from "../../../shared/music/chords.ts";
import { GUITAR_SHAPES, pianoVoicing, positionsOf, positionsOfPc, shapeMidis, shapePositions, type FretPos } from "../../../shared/music/instruments.ts";
import { intervalBetween, intervalName, intervalOfSemitones, intervalText, JUST_RATIOS, semitones, transpose } from "../../../shared/music/intervals.ts";
import { freqOf, fromMidi, isBlackKey, parsePitch, parsePitchClass, pc, pcLabel, pcOfClass, pitchLabel, toMidi, type Pitch } from "../../../shared/music/notes.ts";
import { SCALES, scaleNotes, stepLabel, stepPattern } from "../../../shared/music/scales.ts";
import { clefFor } from "../../../shared/music/staff.ts";
import { playChord, playNote, playSound, stopAll, type Playback } from "../../audio/index.ts";
import { Button, cx, NoteChip, PlayButton, Segmented, WidgetFrame } from "../../ui.tsx";
import { bool, list, str } from "../params.ts";
import type { WidgetProps } from "../types.ts";
import { ChordBox } from "./ChordBox.tsx";
import { Fretboard, type FretMark } from "./Fretboard.tsx";
import { Keyboard, type KeyMark } from "./Keyboard.tsx";
import { Score, type ScoreClef, type ScoreItem, type Tone } from "./Score.tsx";

// The linked views: the same notes on staff, keyboard, fretboard and tab at
// once. Everything that shows "these notes" in the app goes through
// <LinkedViews>, so a note looks and behaves the same in a lesson, in the
// lab and in an exercise.

export type View = "staff" | "keyboard" | "fretboard" | "tab" | "diagram";

/** Keyboard range that frames a set of notes: whole octaves from a C, at
 *  least two, with a little air either side. */
export function keyboardRange(midis: number[]): [number, number] {
  if (midis.length === 0) return [48, 72];
  let lo = Math.min(...midis) - 2;
  let hi = Math.max(...midis) + 2;
  lo -= pc(lo); // down to C
  hi += (12 - pc(hi)) % 12; // up to C
  while (hi - lo < 24) {
    if (lo > 48) lo -= 12;
    else hi += 12;
  }
  return [lo, hi];
}

/** The staff that shows a set of sounding pitches without a forest of ledger lines. */
export function clefForNotes(notes: Pitch[]): ScoreClef {
  if (notes.length === 0) return "treble";
  const clefs = new Set(notes.map((n) => clefFor(n)));
  if (clefs.size === 2) return "grand";
  const midis = notes.map(toMidi);
  // A lone middle C or B3 is happier with both staves in sight.
  return clefs.has("treble") ? (Math.min(...midis) < 60 ? "grand" : "treble") : "bass";
}

/** The lowest-fret place to play a pitch (the "open position" choice). */
export function easiestPosition(midi: number, maxFret = 12): FretPos | null {
  const all = positionsOf(midi, maxFret);
  if (all.length === 0) return null;
  return all.reduce((a, b) => (b.fret < a.fret ? b : a));
}

export interface LinkedViewsProps {
  /** Sounding pitches, spelled. */
  notes: Pitch[];
  views: View[];
  clef?: ScoreClef;
  keySig?: string;
  /** Draw the notes as one chord on the staff rather than a sequence. */
  chord?: boolean;
  /** Index into `notes` of the one sounding now (for playback). */
  active?: number | null;
  tone?: Tone;
  /** Called with a MIDI note when the learner picks one on any view. */
  onPick?: (midi: number, spelled?: Pitch) => void;
  /** Explicit fretboard marks (a chord shape, a scale pattern) instead of
   *  every position of each note. */
  fretMarks?: FretMark[];
  muted?: number[];
  frets?: number;
  /** Explicit tab positions, parallel to `notes`. */
  tabPositions?: (FretPos | null)[];
  /** Explicit keyboard notes when they differ from `notes` (a voicing). */
  keyMidis?: number[];
  /** Fix the keyboard's range (MIDI) instead of framing the current notes,
   *  so it holds still while a tune moves across it. */
  keyRange?: [number, number];
  labels?: boolean;
  diagram?: string;
  typing?: boolean;
}

export function LinkedViews({ notes, views, clef, keySig, chord, active, tone = "pc", onPick, fretMarks, muted, frets = 12, tabPositions, keyMidis, keyRange, labels = true, diagram, typing }: LinkedViewsProps) {
  const midis = notes.map(toMidi);
  const staffClef = clef ?? clefForNotes(notes);
  const items: ScoreItem[] = chord
    ? notes.length
      ? [{ pitches: notes, tone: active != null ? "accent" : undefined }]
      : []
    : notes.map((p, i) => ({ pitches: [p], label: labels ? pitchLabel(p) : undefined, tone: active === i ? "accent" : undefined }));
  const kb = keyMidis ?? midis;
  const range = keyRange ?? keyboardRange(kb);
  const keyMarks: KeyMark[] = kb.map((m, i) => ({ midi: m, tone: active != null && (chord || midis[active] === m) ? "accent" : tone, label: labels ? pcLabel(notes[i] && toMidi(notes[i]) === m ? notes[i] : fromMidi(m)) : undefined }));
  const marks: FretMark[] =
    fretMarks ??
    notes.flatMap((p, i) => {
      const m = toMidi(p);
      const all = positionsOf(m, frets);
      const few = notes.length <= 3;
      const best = easiestPosition(m, frets);
      return all
        .filter((pos) => few || (best && pos.string === best.string && pos.fret === best.fret))
        .map((pos) => ({ ...pos, label: labels ? pcLabel(p) : undefined, hollow: few && !(best && pos.string === best.string && pos.fret === best.fret), tone: active === i ? ("accent" as Tone) : tone }));
    });
  const tabItems: ScoreItem[] = chord
    ? [{ pitches: [], tab: (tabPositions ?? midis.map((m) => easiestPosition(m, frets))).filter((p): p is FretPos => p !== null) }]
    : notes.map((p, i) => {
        const pos = tabPositions ? tabPositions[i] : easiestPosition(toMidi(p), frets);
        return { pitches: [], tab: pos ? [pos] : [], tone: active === i ? "accent" : undefined };
      });
  const outOfRange = (views.includes("fretboard") || views.includes("tab")) && !fretMarks && midis.some((m) => positionsOf(m, 24).length === 0);

  return (
    <div className="flex flex-col gap-4">
      {views.map((v) => {
        if (v === "staff") return <Score key={v} clef={staffClef} items={items} keySig={keySig} tone={tone} active={chord ? null : active} onPick={onPick ? (p) => onPick(toMidi(p), p) : undefined} onItemClick={chord ? () => playChord(midis, { timbre: "piano" }) : (i) => playNote(midis[i], { timbre: "piano" })} finalBar={false} />;
        if (v === "keyboard") return <Keyboard key={v} lo={range[0]} hi={range[1]} marks={keyMarks} labels={labels ? "c" : "none"} onPress={onPick ? (m) => onPick(m) : undefined} typing={typing} />;
        if (v === "fretboard") return <Fretboard key={v} frets={frets} marks={marks} muted={muted} labels="open" onPress={onPick ? (_p, m) => onPick(m) : undefined} />;
        if (v === "tab") return <Score key={v} clef="none" tab items={tabItems} active={chord ? null : active} finalBar={false} ariaLabel="Guitar tablature" />;
        if (v === "diagram" && diagram) return <div key={v} className="flex justify-center">{GUITAR_SHAPES[diagram] ? <ChordBox symbol={diagram} /> : <p className="text-sm text-fg-3">No chord box is stored for {diagram}.</p>}</div>;
        return null;
      })}
      {outOfRange && <p className="text-sm text-fg-3">Some of these notes are outside the guitar's range.</p>}
    </div>
  );
}

function usePlayback(): [number | null, (sound: Sound, timbre?: Timbre) => void, () => void, boolean] {
  const [active, setActive] = useState<number | null>(null);
  const [playing, setPlaying] = useState(false);
  const pb = useRef<Playback | null>(null);
  const stop = () => {
    pb.current?.stop();
    pb.current = null;
    setActive(null);
    setPlaying(false);
  };
  const play = (sound: Sound, timbre?: Timbre) => {
    stop();
    setPlaying(true);
    pb.current = playSound(sound, { timbre, onEvent: setActive, onEnd: () => { setActive(null); setPlaying(false); } });
  };
  useEffect(() => () => pb.current?.stop(), []);
  return [active, play, stop, playing];
}

const parseViews = (p: Record<string, unknown>, d: View[]): View[] => list<View>(p, "views", d);
const guitarOnly = (views: View[]) => !views.includes("keyboard") && (views.includes("fretboard") || views.includes("tab") || views.includes("diagram"));

// --- linked ----------------------------------------------------------------

export function LinkedWidget({ params }: WidgetProps) {
  const initial = useMemo(() => list<string>(params, "notes", ["C4"]).map(parsePitch), [params]);
  const [notes, setNotes] = useState(initial);
  useEffect(() => setNotes(initial), [initial]);
  const views = parseViews(params, ["staff", "keyboard", "fretboard"]);
  const chord = bool(params, "chord", false);
  const interactive = bool(params, "interactive", true);
  const clefParam = typeof params.clef === "string" ? (params.clef as ScoreClef) : undefined;
  const timbre: Timbre = guitarOnly(views) ? "guitar" : "piano";
  const pick = (midi: number, spelled?: Pitch) => {
    const p = spelled ?? fromMidi(midi);
    playNote(toMidi(p), { timbre });
    setNotes((cur) => {
      if (!chord || initial.length === 1) return [p];
      const has = cur.findIndex((n) => toMidi(n) === toMidi(p));
      if (has >= 0) return cur.length > 1 ? cur.filter((_, i) => i !== has) : cur;
      return [...cur, p].sort((a, b) => toMidi(a) - toMidi(b)).slice(-6);
    });
  };
  const single = notes.length === 1 ? notes[0] : null;
  return (
    <WidgetFrame
      title={single ? <span className="flex items-center gap-2"><NoteChip midi={toMidi(single)}>{pcLabel(single)}</NoteChip> {pitchLabel(single)} <span className="font-sans text-sm font-normal text-fg-3">{freqOf(toMidi(single)).toFixed(1)} Hz</span></span> : notes.map(pitchLabel).join("  ")}
      hint={interactive ? "Click a key, a fret or the staff" : undefined}
      controls={
        <>
          <PlayButton size={34} onClick={() => (chord ? playChord(notes.map(toMidi), { timbre, strum: timbre === "guitar" ? 0.04 : 0 }) : notes.forEach((n, i) => playNote(toMidi(n), { timbre, delay: i * 0.45 })))} />
          {interactive && notes !== initial && <Button size="sm" variant="ghost" onClick={() => setNotes(initial)}>Reset</Button>}
        </>
      }
    >
      <LinkedViews notes={notes} views={views} clef={clefParam} chord={chord} onPick={interactive ? pick : undefined} />
    </WidgetFrame>
  );
}

// --- interval --------------------------------------------------------------

export function IntervalWidget({ params }: WidgetProps) {
  const from = useMemo(() => parsePitch(str(params, "from", "C4")), [params]);
  const to0 = useMemo(() => parsePitch(str(params, "to", "G4")), [params]);
  const [to, setTo] = useState(to0);
  useEffect(() => setTo(to0), [to0]);
  const views = parseViews(params, ["staff", "keyboard"]);
  const interactive = bool(params, "interactive", true);
  const lo = toMidi(from);
  const hi = toMidi(to);
  let name = "";
  let text = "";
  try {
    const iv = intervalBetween(from, to);
    text = intervalText(iv);
    name = intervalName(iv);
  } catch {
    name = `${Math.abs(hi - lo)} half steps`;
  }
  const semis = Math.abs(hi - lo);
  const ratio = JUST_RATIOS[text];
  const pick = (midi: number, spelled?: Pitch) => {
    if (midi === lo) return;
    let p = spelled ?? fromMidi(midi);
    // From the keyboard there is no spelling: use the one the interval's usual name implies.
    if (!spelled && midi > lo && midi - lo <= 12) p = transpose(from, intervalOfSemitones(midi - lo));
    playNote(lo, { timbre: "piano" });
    playNote(midi, { timbre: "piano", delay: 0.45 });
    setTo(p);
  };
  const timbre: Timbre = guitarOnly(views) ? "guitar" : "piano";
  return (
    <WidgetFrame
      title={<span className="capitalize">{name}</span>}
      hint={interactive ? "Click another note to move the upper one" : undefined}
      controls={
        <>
          <Button size="sm" onClick={() => { playNote(Math.min(lo, hi), { timbre }); playNote(Math.max(lo, hi), { timbre, delay: 0.55 }); }}>Play one after the other</Button>
          <Button size="sm" onClick={() => playChord([lo, hi], { timbre, duration: 1.6 })}>Play together</Button>
        </>
      }
    >
      <div className="mb-3 flex flex-wrap items-center gap-x-5 gap-y-1 text-sm text-fg-2">
        <span className="flex items-center gap-1.5"><NoteChip midi={lo}>{pcLabel(from)}</NoteChip>→<NoteChip midi={hi}>{pcLabel(to)}</NoteChip></span>
        <span><strong className="text-fg">{semis}</strong> half step{semis === 1 ? "" : "s"}</span>
        {ratio && <span>frequency ratio about <strong className="text-fg">{ratio[0]}:{ratio[1]}</strong></span>}
        <span className="text-fg-3">{freqOf(Math.min(lo, hi)).toFixed(1)} Hz and {freqOf(Math.max(lo, hi)).toFixed(1)} Hz</span>
      </div>
      <LinkedViews notes={lo <= hi ? [from, to] : [to, from]} views={views} onPick={interactive ? pick : undefined} />
    </WidgetFrame>
  );
}

// --- scale -----------------------------------------------------------------

const TONICS = ["C", "Db", "D", "Eb", "E", "F", "F#", "G", "Ab", "A", "Bb", "B"];
const SCALE_CHOICES = ["major", "natural-minor", "major-pentatonic", "minor-pentatonic", "blues", "harmonic-minor", "dorian", "mixolydian"];

/** Scale notes in a comfortable octave: around middle C for staff and keys,
 *  from the low strings for guitar-only views. */
function scaleFor(tonic: string, type: string, guitar: boolean): Pitch[] {
  const t = parsePitchClass(tonic);
  const tpc = pcOfClass(t);
  const oct = guitar ? (tpc >= 4 ? 2 : 3) : tpc >= 9 ? 3 : 4;
  return scaleNotes({ ...t, oct }, type, true);
}

/** A playable one-octave fingering in open position: each note on the lowest
 *  fret available, preferring to stay on or above the previous string. */
function scaleTab(midis: number[]): (FretPos | null)[] {
  return midis.map((m) => {
    const opts = positionsOf(m, 12).filter((p) => p.fret <= 4);
    return opts[0] ?? easiestPosition(m, 12);
  });
}

export function ScaleWidget({ params }: WidgetProps) {
  const [tonic, setTonic] = useState(str(params, "tonic", "C"));
  const [type, setType] = useState(str(params, "scale", "major"));
  useEffect(() => { setTonic(str(params, "tonic", "C")); setType(str(params, "scale", "major")); }, [params]);
  const views = parseViews(params, ["staff", "keyboard"]);
  const interactive = bool(params, "interactive", false);
  const guitar = guitarOnly(views);
  const timbre: Timbre = guitar ? "guitar" : "piano";
  const notes = useMemo(() => scaleFor(tonic, type, guitar), [tonic, type, guitar]);
  const midis = notes.map(toMidi);
  const steps = stepPattern(type);
  const [active, play, stop, playing] = usePlayback();
  const pcs = new Set(midis.map(pc));
  const rootPc = pc(midis[0]);
  const boxFrets = Number(params.frets) || 12;
  const fretMarks: FretMark[] = [...pcs].flatMap((p) => positionsOfPc(p, boxFrets).map((pos) => ({ ...pos, label: pcLabel(notes.find((n) => pc(toMidi(n)) === p)!), hollow: p !== rootPc && false, tone: (active != null && pc(midis[active]) === p ? "accent" : "pc") as Tone })));
  const run = (down: boolean) => {
    const seq = down ? [...midis].reverse() : midis;
    const idx = down ? midis.map((_, i) => midis.length - 1 - i) : midis.map((_, i) => i);
    stop();
    const pb = playSound({ tempo: 132, events: seq.map((m, i) => ({ midis: [m], at: i, beats: 1 })) }, { timbre, onEvent: (i) => setActiveIdx(idx[i]), onEnd: () => setActiveIdx(null) });
    holder.current = pb;
  };
  // usePlayback tracks its own index; scales also need down-runs mapped back.
  const [activeIdx, setActiveIdx] = useState<number | null>(null);
  const holder = useRef<Playback | null>(null);
  useEffect(() => () => holder.current?.stop(), []);
  void play; void playing;
  const current = activeIdx ?? active;
  return (
    <WidgetFrame
      title={`${pcLabel(parsePitchClass(tonic))} ${SCALES[type].name} scale`}
      controls={
        <>
          <Button size="sm" onClick={() => run(false)}>▲ Play up</Button>
          <Button size="sm" onClick={() => run(true)}>▼ Play down</Button>
          {interactive && (
            <>
              <label className="flex items-center gap-1.5 text-sm text-fg-2">Start on
                <select value={tonic} onChange={(e) => setTonic(e.target.value)} className="rounded-md border border-line bg-panel px-1.5 py-1 text-fg">
                  {(TONICS.includes(tonic) ? TONICS : [tonic, ...TONICS]).map((t) => <option key={t} value={t}>{pcLabel(parsePitchClass(t))}</option>)}
                </select>
              </label>
              <label className="flex items-center gap-1.5 text-sm text-fg-2">Scale
                <select value={type} onChange={(e) => setType(e.target.value)} className="rounded-md border border-line bg-panel px-1.5 py-1 text-fg">
                  {(SCALE_CHOICES.includes(type) ? SCALE_CHOICES : [type, ...SCALE_CHOICES]).map((t) => <option key={t} value={t}>{SCALES[t].name}</option>)}
                </select>
              </label>
            </>
          )}
        </>
      }
    >
      <div className="mb-4 flex flex-wrap items-center gap-y-2" aria-label="Step pattern">
        {notes.map((n, i) => (
          <span key={i} className="flex items-center">
            <button type="button" onClick={() => playNote(midis[i], { timbre })} className={cx("rounded-full transition-transform", current === i && "scale-125")}>
              <NoteChip midi={midis[i]}>{pcLabel(n)}</NoteChip>
            </button>
            {i < steps.length && (
              <span className="mx-0.5 flex flex-col items-center px-1 text-[0.7rem] font-bold text-fg-3" title={`${steps[i]} half step${steps[i] === 1 ? "" : "s"}`}>
                <span>{stepLabel(steps[i])}</span>
                <span className="h-px bg-line-strong" style={{ width: 10 + steps[i] * 9 }} />
              </span>
            )}
          </span>
        ))}
      </div>
      <p className="mb-3 text-sm text-fg-3">W = whole step (2 half steps), H = half step{steps.includes(3) ? ", W+H = a step and a half" : ""}.</p>
      <LinkedViews notes={notes} views={views} active={current} fretMarks={views.includes("fretboard") ? fretMarks : undefined} frets={boxFrets} tabPositions={scaleTab(midis)} keySig={undefined} />
    </WidgetFrame>
  );
}

// --- chord -----------------------------------------------------------------

const CHORD_TYPE_CHOICES = ["maj", "min", "dim", "aug", "7", "maj7", "m7", "sus4"];

export function ChordView({ symbol, views, active }: { symbol: string; views: View[]; active?: boolean }) {
  const ref = parseChord(symbol);
  const rootPc = pcOfClass(ref.root);
  const spelled = chordNotes(ref, rootPc >= 7 ? 3 : 4);
  const shape = GUITAR_SHAPES[symbol];
  const fretMarks: FretMark[] | undefined = shape
    ? shapePositions(shape).map((pos, i) => ({ ...pos, label: pcLabel(fromMidi(shapeMidis(shape)[i], ref.root.acc < 0 || [1, 3, 8, 10].includes(rootPc) && ref.root.acc !== 1 ? "flat" : "sharp")), tone: active ? "accent" : "pc" }))
    : undefined;
  const muted = shape ? shape.frets.map((f, i) => (f === null ? 6 - i : 0)).filter(Boolean) : undefined;
  const voiced = pianoVoicing(symbol);
  return <LinkedViews notes={spelled} views={views} chord active={active ? 0 : null} fretMarks={fretMarks ?? spelled.flatMap((p) => positionsOfPc(pc(toMidi(p)), 4).map((pos) => ({ ...pos, label: pcLabel(p) })))} muted={muted} frets={shape ? Math.max(5, ...shape.frets.map((f) => f ?? 0)) : 5} keyMidis={voiced} diagram={symbol} />;
}

export function strumMidis(symbol: string): number[] {
  const shape = GUITAR_SHAPES[symbol];
  return shape ? shapeMidis(shape) : pianoVoicing(symbol).map((m) => m - 12);
}

export function ChordWidget({ params }: WidgetProps) {
  const [symbol, setSymbol] = useState(str(params, "symbol", "C"));
  useEffect(() => setSymbol(str(params, "symbol", "C")), [params]);
  const views = parseViews(params, ["staff", "keyboard"]);
  const interactive = bool(params, "interactive", false);
  const ref = parseChord(symbol);
  const def = CHORDS[ref.type];
  const notes = chordNotes(ref, 4);
  const guitar = guitarOnly(views);
  const sound = () => (guitar ? playChord(strumMidis(symbol), { timbre: "guitar", strum: 0.045, duration: 2.2 }) : playChord(pianoVoicing(symbol), { timbre: "piano", duration: 1.8 }));
  const arpeggio = () => (guitar ? strumMidis(symbol) : pianoVoicing(symbol)).forEach((m, i) => playNote(m, { timbre: guitar ? "guitar" : "piano", delay: i * 0.38 }));
  const rootName = `${ref.root.letter}${ref.root.acc > 0 ? "#" : ref.root.acc < 0 ? "b" : ""}`;
  const set = (root: string, type: string) => setSymbol(root + CHORDS[type].suffix);
  const parts: ReactNode[] = notes.map((n, i) => {
    const gap = i === 0 ? null : semitones(def.intervals[i]) - semitones(def.intervals[i - 1]);
    return (
      <span key={i} className="flex items-center">
        {gap !== null && <span className="mx-1 text-xs font-semibold text-fg-3">+{gap}</span>}
        <span className="flex flex-col items-center gap-0.5">
          <NoteChip midi={toMidi(n)}>{pcLabel(n)}</NoteChip>
          <span className="text-[0.68rem] text-fg-3">{i === 0 ? "root" : intervalName(def.intervals[i]).replace(/^(major|minor|perfect|diminished|augmented) /, (m) => m)}</span>
        </span>
      </span>
    );
  });
  return (
    <WidgetFrame
      title={<span><span className="mr-2 text-xl">{chordLabel(ref)}</span><span className="font-sans text-sm font-normal text-fg-3">{chordFullName(ref)}</span></span>}
      controls={
        <>
          <PlayButton size={34} onClick={sound} label="Play chord" />
          <Button size="sm" onClick={arpeggio}>One note at a time</Button>
          {interactive && (
            <>
              <label className="flex items-center gap-1.5 text-sm text-fg-2">Root
                <select value={TONICS.includes(rootName) ? rootName : rootName} onChange={(e) => set(e.target.value, ref.type)} className="rounded-md border border-line bg-panel px-1.5 py-1 text-fg">
                  {(TONICS.includes(rootName) ? TONICS : [rootName, ...TONICS]).map((t) => <option key={t} value={t}>{pcLabel(parsePitchClass(t))}</option>)}
                </select>
              </label>
              <Segmented label="Chord type" value={ref.type} onChange={(t) => set(rootName, t)} options={(CHORD_TYPE_CHOICES.includes(ref.type) ? CHORD_TYPE_CHOICES : [ref.type, ...CHORD_TYPE_CHOICES]).map((t) => ({ value: t, label: CHORDS[t].name.replace("dominant ", "").replace("suspended fourth", "sus4") }))} />
            </>
          )}
        </>
      }
    >
      <div className="mb-4 flex flex-wrap items-start gap-y-2" title="Numbers are half steps between neighbouring chord notes">{parts}<span className="ml-3 self-center text-xs text-fg-3">numbers = half steps between notes</span></div>
      <ChordView symbol={symbol} views={views} />
    </WidgetFrame>
  );
}

/** White-key-only check used by a few captions. */
export const isNatural = (midi: number) => !isBlackKey(midi);
export { stopAll };
