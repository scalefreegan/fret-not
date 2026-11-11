import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Sound, Timbre } from "../../../shared/exercise-types.ts";
import { chordLabel, chordSymbol, diatonicTriads, parseChord, romanToChord } from "../../../shared/music/chords.ts";
import { GUITAR_SHAPES, GUITAR_WRITTEN_OFFSET, pianoVoicing } from "../../../shared/music/instruments.ts";
import { fromMidi, parsePitch } from "../../../shared/music/notes.ts";
import { countLabel, parseMelody, parseRhythm, parseTab, parseTime, totalBeats, type TimedEvent } from "../../../shared/music/rhythm.ts";
import { keySignature } from "../../../shared/music/scales.ts";
import { audioContext, audioNow, playChord, playClick, playSound, startMetronome, type MetronomeHandle, type Playback } from "../../audio/index.ts";
import { Button, cx, PlayButton, Segmented, Slider, WidgetFrame } from "../../ui.tsx";
import { tapTolerances } from "../../../shared/exercises/play.ts";
import { bool, list, num, str } from "../params.ts";
import { eventAudioTime, useCoarse } from "../touch.ts";
import type { WidgetProps } from "../types.ts";
import { ChordView, keyboardRange, LinkedViews, strumMidis, type View } from "./Linked.tsx";
import { Score, type ScoreClef, type ScoreItem } from "./Score.tsx";

// Widgets for music in time: metronome, rhythm, melody, tab, progression.

/** Play a list of timed events and track which one is sounding. */
export function useTimedPlayback() {
  const [active, setActive] = useState<number | null>(null);
  const [playing, setPlaying] = useState(false);
  const pb = useRef<Playback | null>(null);
  const stop = useCallback(() => {
    pb.current?.stop();
    pb.current = null;
    setActive(null);
    setPlaying(false);
  }, []);
  const play = useCallback(
    (sound: Sound, opts: { timbre?: Timbre; click?: boolean } = {}) => {
      stop();
      setPlaying(true);
      pb.current = playSound(sound, { ...opts, onEvent: setActive, onEnd: () => { setActive(null); setPlaying(false); } });
    },
    [stop],
  );
  useEffect(() => () => pb.current?.stop(), []);
  return { active, playing, play, stop };
}

export function soundOf(events: TimedEvent[], tempo: number, timbre?: Timbre, strum?: number): Sound {
  return { tempo, timbre, events: events.map((e) => ({ midis: e.midis, at: e.at, beats: e.duration.beats, ...(strum && e.midis.length > 1 ? { strum } : {}) })) };
}

/** Counting syllables for events, restarting each bar. */
export function countsOf(events: TimedEvent[], time: string): string[] {
  const bar = parseTime(time).barBeats;
  const hasBars = events.some((e) => e.bar > 0);
  const barStart = new Map<number, number>();
  for (const e of events) if (!barStart.has(e.bar)) barStart.set(e.bar, e.at);
  return events.map((e) => countLabel(hasBars ? e.at - (barStart.get(e.bar) ?? 0) : e.at % bar, time));
}

// --- metronome -------------------------------------------------------------

export function MetronomeWidget({ params }: WidgetProps) {
  const [tempo, setTempo] = useState(num(params, "tempo", 80));
  const [time, setTime] = useState(str(params, "time", "4/4"));
  const [beat, setBeat] = useState<number | null>(null);
  const [swing, setSwing] = useState(1);
  const handle = useRef<MetronomeHandle | null>(null);
  const ts = parseTime(time);
  const stop = useCallback(() => {
    handle.current?.stop();
    handle.current = null;
    setBeat(null);
  }, []);
  const start = () => {
    stop();
    handle.current = startMetronome(tempo, ts.beats, (b) => {
      setBeat(b);
      setSwing((s) => -s);
    });
  };
  useEffect(() => stop, [stop]);
  // Restart on the new settings if it is running.
  useEffect(() => {
    if (handle.current) start();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tempo, time]);
  const running = beat !== null;
  const tempoWord = tempo < 60 ? "Largo — very slow" : tempo < 76 ? "Adagio — slow" : tempo < 108 ? "Andante — walking pace" : tempo < 120 ? "Moderato" : tempo < 156 ? "Allegro — fast" : "Presto — very fast";
  return (
    <WidgetFrame
      title="Metronome"
      hint={tempoWord}
      controls={
        <>
          <PlayButton playing={running} onClick={() => (running ? stop() : start())} label="Start" />
          <Slider className="min-w-52 flex-1" label="Tempo" value={tempo} min={40} max={200} onChange={setTempo} format={(v) => `${v} bpm`} />
          <Segmented label="Time signature" value={time} onChange={setTime} options={["2/4", "3/4", "4/4", "6/8"].map((t) => ({ value: t, label: t }))} />
        </>
      }
    >
      <div className="flex flex-wrap items-center justify-center gap-8">
        <svg width={120} height={130} viewBox="0 0 120 130" aria-hidden="true">
          <path d="M40 124 L52 14 Q60 6 68 14 L80 124 Z" fill="var(--raised)" stroke="var(--line-strong)" strokeWidth={2} />
          <g style={{ transformOrigin: "60px 118px", transform: `rotate(${running ? swing * 24 : 0}deg)`, transition: `transform ${60 / tempo}s ease-in-out` }}>
            <line x1={60} y1={118} x2={60} y2={18} stroke="var(--ink)" strokeWidth={3} strokeLinecap="round" />
            <rect x={52} y={96 - ((tempo - 40) / 160) * 60} width={16} height={12} rx={2} fill="var(--accent)" />
          </g>
          <circle cx={60} cy={118} r={5} fill="var(--ink)" />
        </svg>
        <div className="flex flex-wrap justify-center gap-2.5" aria-label={`Beat ${beat === null ? "stopped" : beat + 1} of ${ts.beats}`}>
          {Array.from({ length: ts.beats }, (_, i) => (
            <span key={i} className={cx("flex h-11 w-11 items-center justify-center rounded-full border-2 text-lg font-bold transition-colors duration-75", beat === i ? (i === 0 ? "border-accent bg-accent text-accent-ink" : "border-accent bg-accent-soft text-fg") : "border-line text-fg-3")}>
              {i + 1}
            </span>
          ))}
        </div>
      </div>
    </WidgetFrame>
  );
}

// --- rhythm ----------------------------------------------------------------

const TAP_PITCH = 76;

/** Tap-along: after a count-in, collect taps (space bar or the pad) on the
 *  audio clock and report each as beats from the first written beat. It only
 *  measures: how close a tap must be is the grader's business (the engine's
 *  `tapTolerances`), never decided here.
 *
 *  Pass the DOM event to `tap` (`onPointerDown={tapper.tap}`): the tap is
 *  timed from the event's own timestamp, the moment the finger or key landed,
 *  not from whenever the handler got to run. */
export function useTapSession() {
  const [state, setState] = useState<"idle" | "count-in" | "go" | "done">("idle");
  const [countBeat, setCountBeat] = useState(0);
  const [taps, setTaps] = useState<number[]>([]);
  const ref = useRef<{ t0: number; spb: number; taps: number[]; timers: number[]; clicks: { stop(): void }[]; live: boolean; end: number } | null>(null);
  const cancel = useCallback(() => {
    ref.current?.timers.forEach((t) => window.clearTimeout(t));
    // The clicks were put on the audio clock up front: take back the ones
    // that have not sounded, or they carry on after the page has moved on.
    ref.current?.clicks.forEach((c) => c.stop());
    if (ref.current) {
      ref.current.clicks = [];
      ref.current.live = false;
    }
    setState("idle");
  }, []);
  const tap = useCallback((e?: { timeStamp: number } | null) => {
    const s = ref.current;
    if (!s || !s.live) return;
    const ac = audioContext();
    const latency = (ac.outputLatency || 0) + (ac.baseLatency || 0);
    const beats = (eventAudioTime(e, audioNow()) - latency - s.t0) / s.spb;
    if (beats < -0.75 || beats > s.end) return;
    playClick({ accent: true });
    s.taps.push(beats);
    setTaps([...s.taps]);
  }, []);
  const start = useCallback(
    (tempo: number, countInBeats: number, lengthBeats: number, onDone: (taps: number[]) => void) => {
      cancel();
      const spb = 60 / tempo;
      const tStart = audioNow() + 0.15;
      const t0 = tStart + countInBeats * spb;
      const s = { t0, spb, taps: [] as number[], timers: [] as number[], clicks: [] as { stop(): void }[], live: true, end: lengthBeats + 0.4 };
      ref.current = s;
      setTaps([]);
      setState("count-in");
      const total = countInBeats + Math.ceil(lengthBeats);
      for (let b = 0; b < total; b++) {
        const delay = 0.15 + b * spb;
        s.clicks.push(playClick({ accent: b === 0 || b === countInBeats, delay }));
        s.timers.push(window.setTimeout(() => { setCountBeat(b < countInBeats ? b + 1 : 0); if (b === countInBeats) setState("go"); }, delay * 1000));
      }
      s.timers.push(window.setTimeout(() => { s.live = false; setState("done"); onDone([...s.taps]); }, (0.15 + (countInBeats + lengthBeats + 0.4) * spb) * 1000));
    },
    [cancel],
  );
  useEffect(() => {
    if (state !== "count-in" && state !== "go") return;
    const on = (e: KeyboardEvent) => {
      if (e.code !== "Space" || e.repeat) return;
      e.preventDefault();
      tap(e);
    };
    window.addEventListener("keydown", on);
    return () => window.removeEventListener("keydown", on);
  }, [state, tap]);
  useEffect(() => cancel, [cancel]);
  return { state, countBeat, taps, start, tap, cancel };
}

/** The pad a rhythm is tapped on: big enough for a thumb, and deaf to
 *  everything a touch screen does with a repeated tap (zoom, selection, the
 *  long-press menu). Shows the count-in, then invites the taps. */
export function TapPad({ state, countBeat, onTap, className }: { state: "idle" | "count-in" | "go" | "done"; countBeat: number; onTap: (e: React.PointerEvent) => void; className?: string }) {
  const coarse = useCoarse();
  return (
    <button
      type="button"
      onPointerDown={(e) => {
        if (e.pointerType === "mouse" && e.button !== 0) return;
        onTap(e);
      }}
      onContextMenu={(e) => e.preventDefault()}
      className={cx("touch-surface flex min-h-28 w-full items-center justify-center rounded-2xl border-2 px-4 text-xl font-bold transition-colors active:brightness-95", coarse && "min-h-36", state === "go" ? "border-accent bg-accent-soft text-fg" : "border-line bg-raised text-fg-3", className)}
    >
      {state === "count-in" ? `Count-in: ${countBeat || "…"}` : coarse ? "Tap here" : "Tap here, or press the space bar"}
    </button>
  );
}

export function rhythmItems(events: TimedEvent[], time: string, withCount: boolean, tones?: (ScoreItem["tone"] | undefined)[]): ScoreItem[] {
  const counts = withCount ? countsOf(events, time) : [];
  return events.map((e, i) => ({ pitches: e.midis.length ? [{ letter: "B", acc: 0, oct: 4 }] : [], duration: e.duration, bar: e.bar, count: counts[i], tone: tones?.[i] }));
}

export function RhythmWidget({ params }: WidgetProps) {
  const time = str(params, "time", "4/4");
  const [tempo, setTempo] = useState(num(params, "tempo", 80));
  const events = useMemo(() => parseRhythm(str(params, "pattern", "q q q q"), time), [params, time]);
  const { active, playing, play, stop } = useTimedPlayback();
  const tapper = useTapSession();
  const [errors, setErrors] = useState<(number | null)[] | null>(null);
  const onsets = events.filter((e) => e.midis.length).map((e) => e.at);
  // How close counts as "in time" is the engine's rule, per note.
  const tols = useMemo(() => tapTolerances(onsets, tempo), [events, tempo]); // eslint-disable-line react-hooks/exhaustive-deps
  const inTime = (err: number | null | undefined, i: number) => err !== null && err !== undefined && Math.abs(err) <= tols[i];
  const tol = tols.length ? Math.min(...tols) : 0.1;
  const tapping = tapper.state === "count-in" || tapper.state === "go";
  const sound: Sound = { tempo, events: events.map((e) => ({ midis: e.midis.length ? [TAP_PITCH] : [], at: e.at, beats: Math.min(e.duration.beats, 0.4) })) };
  const begin = () => {
    stop();
    setErrors(null);
    tapper.start(tempo, parseTime(time).beats * (4 / parseTime(time).unit) >= 3 ? parseTime(time).barBeats : parseTime(time).barBeats * 2, totalBeats(events), (taps) => {
      const used = new Set<number>();
      setErrors(onsets.map((o) => {
        let best = -1;
        taps.forEach((t, i) => { if (!used.has(i) && Math.abs(t - o) < 0.5 && (best < 0 || Math.abs(t - o) < Math.abs(taps[best] - o))) best = i; });
        if (best < 0) return null;
        used.add(best);
        return taps[best] - o;
      }));
    });
  };
  let n = 0;
  const tones = errors ? events.map((e) => (e.midis.length ? ((inTime(errors[n], n++) ? "good" : "bad") as ScoreItem["tone"]) : undefined)) : undefined;
  const hits = errors ? errors.filter((e, i) => inTime(e, i)).length : 0;
  return (
    <WidgetFrame
      title="Rhythm"
      hint={`${time} time`}
      controls={
        <>
          <PlayButton playing={playing} onClick={() => (playing ? stop() : play(sound, { timbre: "triangle", click: true }))} label="Play with a click on each beat" />
          <Slider className="min-w-44 flex-1" label="Tempo" value={tempo} min={50} max={160} onChange={setTempo} format={(v) => `${v} bpm`} />
          {bool(params, "tap", false) && (tapping ? <Button size="sm" onClick={tapper.cancel}>Stop tapping</Button> : <Button size="sm" onClick={begin}>Tap along</Button>)}
        </>
      }
    >
      <Score clef="rhythm" time={time} items={rhythmItems(events, time, bool(params, "count", true), tones)} active={active} space={11} />
      {tapping && <TapPad className="mt-3" state={tapper.state} countBeat={tapper.countBeat} onTap={tapper.tap} />}
      {errors && (
        <p className="mt-2 text-sm text-fg-2">
          <strong className="text-fg">{hits} of {onsets.length}</strong> notes in time. {errors.some((e) => e === null) ? "Some notes had no tap. " : ""}
          {(() => { const real = errors.filter((e): e is number => e !== null); const mean = real.reduce((a, b) => a + b, 0) / (real.length || 1); return Math.abs(mean) > tol / 2 ? (mean > 0 ? "You are tapping a little late overall: listen for the click and aim to land on it." : "You are tapping a little early overall: let the click come to you.") : ""; })()}
        </p>
      )}
    </WidgetFrame>
  );
}

// --- melody ----------------------------------------------------------------

export function melodyItems(events: TimedEvent[], opts: { writtenOffset?: number; flats?: boolean; counts?: string[] } = {}): ScoreItem[] {
  return events.map((e, i) => ({
    pitches: e.names && !opts.writtenOffset ? e.names.map(parsePitch) : e.midis.map((m) => fromMidi(m + (opts.writtenOffset ?? 0), opts.flats ? "flat" : "sharp")),
    duration: e.duration,
    bar: e.bar,
    tab: e.positions,
    count: opts.counts?.[i],
  }));
}

export function MelodyWidget({ params }: WidgetProps) {
  const time = str(params, "time", "4/4");
  const key = str(params, "key", "C");
  const [tempo, setTempo] = useState(num(params, "tempo", 90));
  const views = list<View>(params, "views", ["staff", "keyboard"]);
  const instrument = str(params, "instrument", "piano") as Timbre;
  const events = useMemo(() => parseMelody(str(params, "notes", "C4:q"), time), [params, time]);
  const { active, playing, play, stop } = useTimedPlayback();
  const clef = (typeof params.clef === "string" ? params.clef : "treble") as ScoreClef;
  const items = useMemo(() => melodyItems(events), [events]);
  const now = active != null ? events[active] : null;
  const others = views.filter((v) => v !== "staff");
  const range = useMemo(() => keyboardRange(events.flatMap((e) => e.midis)), [events]);
  return (
    <WidgetFrame
      title={str(params, "title", "Melody")}
      hint={`${time} · ${keySignature(key).count === 0 ? "no sharps or flats" : `key of ${chordLabel(parseChord(key))}`}`}
      controls={
        <>
          <PlayButton playing={playing} onClick={() => (playing ? stop() : play(soundOf(events, tempo), { timbre: instrument }))} />
          <Slider className="min-w-44 flex-1" label="Tempo" value={tempo} min={40} max={180} onChange={setTempo} format={(v) => `${v} bpm`} />
        </>
      }
    >
      {views.includes("staff") && <Score clef={clef} keySig={key} time={time} items={items} active={active} tone="pc" onItemClick={(i) => events[i].midis.length && playChord(events[i].midis, { timbre: instrument })} />}
      {others.length > 0 && (
        <div className="mt-4">
          <LinkedViews notes={now ? now.midis.map((m) => fromMidi(m, keySignature(key).count < 0 ? "flat" : "sharp")) : []} views={others} chord keyRange={range} />
        </div>
      )}
    </WidgetFrame>
  );
}

// --- tab -------------------------------------------------------------------

export function TabWidget({ params }: WidgetProps) {
  const time = str(params, "time", "4/4");
  const [tempo, setTempo] = useState(num(params, "tempo", 90));
  const events = useMemo(() => parseTab(str(params, "notes", "6/0:q"), time), [params, time]);
  const { active, playing, play, stop } = useTimedPlayback();
  const withStaff = bool(params, "staff", true);
  const items = useMemo(() => melodyItems(events, { writtenOffset: GUITAR_WRITTEN_OFFSET }), [events]);
  return (
    <WidgetFrame
      title={str(params, "title", "Tab")}
      hint={withStaff ? "Staff above (written an octave higher than it sounds), tab below" : "The six lines are the six strings; numbers are frets"}
      controls={
        <>
          <PlayButton playing={playing} onClick={() => (playing ? stop() : play(soundOf(events, tempo, "guitar", 0.03), { timbre: "guitar" }))} />
          <Slider className="min-w-44 flex-1" label="Tempo" value={tempo} min={40} max={180} onChange={setTempo} format={(v) => `${v} bpm`} />
        </>
      }
    >
      <Score clef={withStaff ? "treble" : "none"} tab time={time} items={items} active={active} tone="pc" onItemClick={(i) => events[i].midis.length && playChord(events[i].midis, { timbre: "guitar", strum: 0.03 })} />
    </WidgetFrame>
  );
}

// --- progression -----------------------------------------------------------

export function resolveProgression(chords: string, key?: string): { symbol: string; roman?: string }[] {
  return chords.trim().split(/[\s|]+/).filter(Boolean).map((tok) => {
    try {
      parseChord(tok);
      const roman = key ? diatonicTriads(key).find((d) => chordSymbol(d.chord) === tok)?.roman : undefined;
      return { symbol: tok, roman };
    } catch {
      if (!key) throw new Error(`"${tok}" is not a chord symbol (Roman numerals need a key)`);
      return { symbol: chordSymbol(romanToChord(key, tok)), roman: tok };
    }
  });
}

export function ProgressionWidget({ params }: WidgetProps) {
  const key = typeof params.key === "string" ? params.key : undefined;
  const time = str(params, "time", "4/4");
  const [tempo, setTempo] = useState(num(params, "tempo", 90));
  const [loop, setLoop] = useState(false);
  const instrument = str(params, "instrument", "piano") as "piano" | "guitar";
  const views = list<View>(params, "views", ["keyboard"]);
  const chords = useMemo(() => {
    try {
      return resolveProgression(str(params, "chords", "C G Am F"), key);
    } catch {
      return [];
    }
  }, [params, key]);
  const bar = parseTime(time).barBeats;
  const { active, playing, play, stop } = useTimedPlayback();
  const [shown, setShown] = useState(0);
  // One strike per beat keeps the pulse audible.
  const beatsPerBarHits = Math.round(bar);
  useEffect(() => {
    if (active != null) setShown(Math.floor(active / beatsPerBarHits));
  }, [active, beatsPerBarHits]);
  const sound: Sound = {
    tempo,
    events: chords.flatMap((c, i) => Array.from({ length: beatsPerBarHits }, (_, b) => ({ midis: instrument === "guitar" ? strumMidis(c.symbol) : pianoVoicing(c.symbol), at: i * bar + b, beats: b === 0 ? 1 : 0.9, ...(instrument === "guitar" ? { strum: 0.03 } : {}) }))),
  };
  const loopRef = useRef(loop);
  loopRef.current = loop;
  const start = () => play(sound, { timbre: instrument });
  // Loop: when playback ends naturally and loop is on, go again.
  const wasPlaying = useRef(false);
  useEffect(() => {
    if (wasPlaying.current && !playing && loopRef.current) start();
    wasPlaying.current = playing;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playing]);
  const current = chords[Math.min(shown, chords.length - 1)];
  return (
    <WidgetFrame
      title="Chord progression"
      hint={key ? `in ${chordLabel(parseChord(key))}${key.endsWith("m") ? "" : " major"} · one bar each` : "one bar each"}
      controls={
        <>
          <PlayButton playing={playing} onClick={() => { if (playing) { loopRef.current = false; setLoop(false); stop(); } else start(); }} />
          <Slider className="min-w-44 flex-1" label="Tempo" value={tempo} min={50} max={180} onChange={setTempo} format={(v) => `${v} bpm`} />
          <label className="flex items-center gap-1.5 text-sm text-fg-2"><input type="checkbox" checked={loop} onChange={(e) => setLoop(e.target.checked)} className="accent-(--accent)" /> Loop</label>
        </>
      }
    >
      <div className="mb-4 flex flex-wrap gap-2">
        {chords.map((c, i) => {
          const on = playing ? Math.floor((active ?? -1) / beatsPerBarHits) === i : shown === i;
          return (
            <button key={i} type="button" onClick={() => { setShown(i); playChord(instrument === "guitar" ? strumMidis(c.symbol) : pianoVoicing(c.symbol), { timbre: instrument, strum: instrument === "guitar" ? 0.04 : 0, duration: 1.6 }); }} className={cx("min-w-16 rounded-xl border-2 px-3 py-2 text-center transition-colors", on ? "border-accent bg-accent-soft" : "border-line bg-raised hover:border-line-strong")}>
              <span className="block font-display text-xl font-bold text-fg">{chordLabel(parseChord(c.symbol))}</span>
              {c.roman && <span className="block text-xs font-semibold text-fg-3">{c.roman}</span>}
            </button>
          );
        })}
      </div>
      {current && <ChordView symbol={current.symbol} views={views.filter((v) => v !== "diagram" || GUITAR_SHAPES[current.symbol])} active={playing} />}
    </WidgetFrame>
  );
}
