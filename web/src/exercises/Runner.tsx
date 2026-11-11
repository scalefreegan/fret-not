import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Choice, Given, Grade, Question, ResponseSpec, Sound, Stimulus } from "../../shared/exercise-types.ts";
import { grade } from "../../shared/exercises.ts";
import { fretMidi, type FretPos } from "../../shared/music/instruments.ts";
import { fromMidi, parsePitch, pc } from "../../shared/music/notes.ts";
import { parseRhythm, parseTime, totalBeats } from "../../shared/music/rhythm.ts";
import { playSound, stopAll, type Playback } from "../audio/index.ts";
import { ErrorBoundary } from "../ErrorBoundary.tsx";
import { Button, cx, PlayButton } from "../ui.tsx";
import { ChordBox } from "../widgets/notation/ChordBox.tsx";
import { Fretboard, type FretMark } from "../widgets/notation/Fretboard.tsx";
import { Keyboard, type KeyMark } from "../widgets/notation/Keyboard.tsx";
import { Score } from "../widgets/notation/Score.tsx";
import { rhythmItems, useTapSession } from "../widgets/notation/Time.tsx";

// Runs a batch of generated questions one at a time: show the stimulus,
// collect the answer, grade it with the engine, explain, move on. Used by
// lessons, review sessions and the placement check. Stimuli are drawn in
// neutral ink rather than pitch-class colours — the colours would give the
// answer away.

export interface Answered {
  question: Question;
  correct: boolean;
}

function useSound() {
  const pb = useRef<Playback | null>(null);
  const [playing, setPlaying] = useState(false);
  const stop = useCallback(() => {
    pb.current?.stop();
    pb.current = null;
    setPlaying(false);
  }, []);
  const play = useCallback(
    (sound: Sound, click = false) => {
      stop();
      setPlaying(true);
      pb.current = playSound(sound, { click, onEnd: () => setPlaying(false) });
    },
    [stop],
  );
  useEffect(() => stop, [stop]);
  return { play, stop, playing };
}

function SoundStimulus({ sound, autoplay, click, label = "Play" }: { sound: Sound; autoplay: boolean; click?: boolean; label?: string }) {
  const { play: playRaw, stop, playing } = useSound();
  const play = (s: Sound) => playRaw(s, click);
  useEffect(() => {
    if (!autoplay) return;
    const t = window.setTimeout(() => play(sound), 350);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sound]);
  return (
    <div className="flex items-center justify-center gap-3 py-2">
      <PlayButton size={56} playing={playing} onClick={() => (playing ? stop() : play(sound))} label={label} />
      <span className="text-sm text-fg-3">{playing ? "Listening…" : "Play it again as often as you like"}</span>
    </div>
  );
}

/** `guitar`: the answer is given on the fretboard, so staff notes are drawn
 *  the way guitar music is written, an octave above the sounding pitch.
 *  `click`: play sounds with a metronome click (rhythms need a pulse). */
function StimulusView({ s, compact, guitar, click }: { s: Stimulus; compact?: boolean; guitar?: boolean; click?: boolean }) {
  switch (s.type) {
    case "staff": {
      const pitches = s.notes.map(parsePitch).map((p) => (guitar ? { ...p, oct: p.oct + 1 } : p));
      const items = s.chord ? [{ pitches }] : pitches.map((p) => ({ pitches: [p] }));
      return (
        <div className={cx("mx-auto", compact ? "max-w-48" : "max-w-xs")}>
          <Score clef={s.clef} keySig={s.key} items={items} tone="ink" finalBar={false} space={compact ? 9 : 13} />
        </div>
      );
    }
    case "keyboard":
      return <Keyboard lo={s.range[0]} hi={s.range[1]} labels="none" marks={s.marked.map((m) => ({ midi: m, tone: "accent" }))} />;
    case "fretboard":
      return <Fretboard frets={Math.max(4, s.maxFret)} labels="none" marks={s.marked.map((p) => ({ ...p, tone: "accent" }))} />;
    case "tab":
      return (
        <div className="mx-auto max-w-xs">
          <Score clef="none" tab items={[{ pitches: [], tab: s.positions }]} finalBar={false} space={13} />
        </div>
      );
    case "diagram":
      return (
        <div className="flex justify-center">
          <ChordBox symbol={s.chord} showName={false} size={compact ? 0.9 : 1.25} />
        </div>
      );
    case "rhythm":
      return <Score clef="rhythm" time={s.time} items={rhythmItems(parseRhythm(s.pattern, s.time), s.time, false)} space={compact ? 9 : 12} />;
    case "sound":
      return <SoundStimulus sound={s.sound} autoplay={s.autoplay} click={click} />;
    case "text":
      return <p className="py-2 text-center font-display text-4xl font-bold text-fg">{s.text}</p>;
    default:
      return null;
  }
}

interface ResponseProps {
  q: Question;
  spec: ResponseSpec;
  /** Null until answered. */
  result: { given: Given; grade: Grade } | null;
  submit: (given: Given) => void;
}

function ChoiceResponse({ q, spec, result, submit }: ResponseProps & { spec: Extract<ResponseSpec, { type: "choice" }> }) {
  const expected = q.expected.type === "choice" ? q.expected.id : null;
  const chosen = result?.given.type === "choice" ? result.given.id : null;
  useEffect(() => {
    if (result) return;
    const on = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)) return;
      const n = Number(e.key);
      if (Number.isInteger(n) && n >= 1 && n <= spec.choices.length) submit({ type: "choice", id: spec.choices[n - 1].id });
    };
    window.addEventListener("keydown", on);
    return () => window.removeEventListener("keydown", on);
  }, [result, spec, submit]);
  const rich = spec.choices.some((c) => c.stimulus);
  return (
    <div className={cx("grid gap-2.5", rich ? "grid-cols-1 @xl:grid-cols-3" : spec.choices.length > 4 ? "grid-cols-2 @lg:grid-cols-4" : "grid-cols-1 @md:grid-cols-2")}>
      {spec.choices.map((c: Choice, i) => {
        const isRight = result && c.id === expected;
        const isWrongPick = result && c.id === chosen && c.id !== expected;
        return (
          <button
            key={c.id}
            type="button"
            disabled={!!result}
            onClick={() => submit({ type: "choice", id: c.id })}
            className={cx(
              "flex items-center gap-3 rounded-xl border-2 px-3.5 py-3 text-left text-[1.02rem] font-semibold transition-colors",
              !result && "border-line bg-panel hover:border-accent hover:bg-accent-soft",
              isRight && "border-good bg-good-soft text-fg",
              isWrongPick && "border-bad bg-bad-soft text-fg",
              result && !isRight && !isWrongPick && "border-line bg-panel opacity-55",
            )}
          >
            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-raised text-xs font-bold text-fg-3">{i + 1}</span>
            <span className="min-w-0 flex-1">
              {c.stimulus && <StimulusView s={c.stimulus} compact />}
              {(!c.stimulus || c.label) && <span>{c.label}</span>}
            </span>
          </button>
        );
      })}
    </div>
  );
}

function NotesResponse({ q, spec, result, submit }: ResponseProps & { spec: Extract<ResponseSpec, { type: "keyboard" | "fretboard" }> }) {
  const [picked, setPicked] = useState<{ midi: number; pos?: FretPos }[]>([]);
  useEffect(() => setPicked([]), [q.id]);
  const done = !!result;
  const need = spec.mode === "sequence" ? (spec.length ?? (q.expected.type === "notes" ? q.expected.midis.length : 1)) : 1;
  const send = (list: { midi: number; pos?: FretPos }[]) => submit({ type: "notes", midis: list.map((p) => p.midi), ...(spec.type === "fretboard" ? { positions: list.map((p) => p.pos!).filter(Boolean) } : {}) });
  const press = (midi: number, pos?: FretPos) => {
    if (done) return;
    if (spec.mode === "single") return send([{ midi, pos }]);
    if (spec.mode === "sequence") {
      const next = [...picked, { midi, pos }];
      setPicked(next);
      if (next.length >= need) send(next);
      return;
    }
    setPicked((cur) => {
      const same = (p: { midi: number; pos?: FretPos }) => (pos ? p.pos?.string === pos.string && p.pos?.fret === pos.fret : p.midi === midi);
      if (cur.some(same)) return cur.filter((p) => !same(p));
      // One note per string on the guitar: a new fret replaces the old one.
      const rest = pos ? cur.filter((p) => p.pos?.string !== pos.string) : cur;
      return [...rest, { midi, pos }];
    });
  };
  // After answering: what was expected (green) and what was wrong (red).
  const exp = q.expected.type === "notes" ? q.expected : null;
  const isExpected = (midi: number) => !!exp && (exp.match === "pc" ? exp.midis.some((m) => pc(m) === pc(midi)) : exp.midis.includes(midi));
  const fixed = spec.marked ?? [];
  let board;
  if (spec.type === "keyboard") {
    const marks: KeyMark[] = [...(fixed as number[]).map((m) => ({ midi: m, tone: "ink" as const }))];
    for (const p of picked) marks.push({ midi: p.midi, tone: done ? (isExpected(p.midi) ? "good" : "bad") : "accent", label: spec.mode === "sequence" ? String(picked.indexOf(p) + 1) : undefined });
    if (done && exp && !result?.grade.correct) for (const m of exp.midis) if (exp.match === "exact" && !marks.some((k) => k.midi === m && k.tone !== "ink")) marks.push({ midi: m, tone: "good" });
    if (done && result?.given.type === "notes" && spec.mode === "single") {
      const g = result.given.midis[0];
      marks.push({ midi: g, tone: result.grade.correct ? "good" : "bad" });
      if (!result.grade.correct && exp) {
        // Show the right key nearest to where they played.
        const target = exp.match === "exact" ? exp.midis[0] : [...Array(spec.range[1] - spec.range[0] + 1).keys()].map((i) => spec.range[0] + i).filter((m) => isExpected(m)).sort((a, b) => Math.abs(a - g) - Math.abs(b - g))[0];
        if (target !== undefined) marks.push({ midi: target, tone: "good" });
      }
    }
    board = <Keyboard lo={spec.range[0]} hi={spec.range[1]} labels={spec.labels ?? "c"} marks={marks} onPress={(m) => press(m)} typing={!done} />;
  } else {
    const marks: FretMark[] = [...(fixed as FretPos[]).map((p) => ({ ...p, tone: "ink" as const }))];
    for (const p of picked) if (p.pos) marks.push({ ...p.pos, tone: done ? (q.expected.type === "chord-shape" ? (result?.grade.correct ? "good" : "bad") : isExpected(p.midi) ? "good" : "bad") : "accent" });
    if (done && result?.given.type === "notes" && spec.mode === "single" && result.given.positions?.[0]) {
      marks.push({ ...result.given.positions[0], tone: result.grade.correct ? "good" : "bad" });
      if (!result.grade.correct && exp) {
        for (let s = 1; s <= 6; s++) for (let f = 0; f <= spec.maxFret; f++) if (isExpected(fretMidi({ string: s, fret: f })) && (exp.match === "exact" || marks.length < 8)) marks.push({ string: s, fret: f, tone: "good", hollow: true });
      }
    }
    board = <Fretboard frets={Math.max(4, spec.maxFret)} labels={spec.labels ?? "none"} marks={marks} onPress={(pos, midi) => press(midi, pos)} />;
  }
  return (
    <div>
      {board}
      {!done && spec.mode !== "single" && (
        <div className="mt-3 flex flex-wrap items-center justify-center gap-3">
          {spec.mode === "sequence" && <span className="text-sm text-fg-3">{picked.length} of {need} notes</span>}
          {spec.mode === "set" && <span className="text-sm text-fg-3">{picked.length ? `${picked.length} selected · click a note again to remove it` : "Select the notes, then check"}</span>}
          {picked.length > 0 && <Button size="sm" variant="ghost" onClick={() => setPicked(spec.mode === "sequence" ? picked.slice(0, -1) : [])}>{spec.mode === "sequence" ? "Undo" : "Clear"}</Button>}
          {spec.mode === "set" && <Button variant="primary" disabled={picked.length === 0} onClick={() => send(picked)}>Check</Button>}
        </div>
      )}
    </div>
  );
}

function TapResponse({ q, spec, result, submit }: ResponseProps & { spec: Extract<ResponseSpec, { type: "tap" }> }) {
  const tapper = useTapSession();
  const events = useMemo(() => parseRhythm(spec.pattern, spec.time), [spec]);
  const tol = q.expected.type === "taps" ? q.expected.toleranceBeats : 0.15;
  const errors = result?.grade.tapErrors;
  let n = 0;
  const tones = errors ? events.map((e) => (e.midis.length ? ((x: number | null | undefined) => (x != null && Math.abs(x) <= tol ? ("good" as const) : ("bad" as const)))(errors[n++]) : undefined)) : undefined;
  const ts = parseTime(spec.time);
  return (
    <div>
      <Score clef="rhythm" time={spec.time} items={rhythmItems(events, spec.time, true, tones)} space={12} />
      <div className="mt-4 flex flex-col items-center gap-2">
        {!result && (tapper.state === "idle" || tapper.state === "done") && (
          <Button variant="primary" onClick={() => tapper.start(spec.tempo, spec.countInBeats || ts.barBeats, totalBeats(events), (taps) => submit({ type: "taps", onsets: taps }))}>
            Start ({spec.countInBeats || ts.barBeats} clicks count you in)
          </Button>
        )}
        {!result && (tapper.state === "count-in" || tapper.state === "go") && (
          <button type="button" onPointerDown={tapper.tap} className={cx("h-24 w-full max-w-sm rounded-2xl border-2 text-xl font-bold transition-colors", tapper.state === "go" ? "border-accent bg-accent-soft text-fg" : "border-line bg-raised text-fg-3")}>
            {tapper.state === "count-in" ? `Count-in: ${tapper.countBeat || "…"}` : "Tap here, or press the space bar"}
          </button>
        )}
        {errors && (
          <p className="text-sm text-fg-2">
            {errors.map((e, i) => (
              <span key={i} className={cx("mx-0.5 inline-block rounded px-1.5 py-0.5 font-mono text-xs", e != null && Math.abs(e) <= tol ? "bg-good-soft" : "bg-bad-soft")}>
                {e == null ? "missed" : Math.abs(e) <= tol / 3 ? "on it" : `${Math.round(Math.abs(e) * (60 / spec.tempo) * 1000)} ms ${e > 0 ? "late" : "early"}`}
              </span>
            ))}
          </p>
        )}
      </div>
    </div>
  );
}

export function QuestionCard({ q, onAnswered, onNext, last }: { q: Question; onAnswered: (correct: boolean) => void; onNext: () => void; last: boolean }) {
  const [result, setResult] = useState<{ given: Given; grade: Grade } | null>(null);
  const reveal = useSound();
  const nextRef = useRef<HTMLButtonElement | null>(null);
  useEffect(() => {
    setResult(null);
    stopAll();
  }, [q.id]);
  // Side effects (recording, sound) happen here, once — not inside a state
  // updater, which StrictMode runs twice.
  const answeredId = useRef<string | null>(null);
  const submit = useCallback(
    (given: Given) => {
      if (answeredId.current === q.id) return;
      answeredId.current = q.id;
      const g = grade(q, given);
      setResult({ given, grade: g });
      onAnswered(g.correct);
      if (q.reveal) window.setTimeout(() => reveal.play(q.reveal!, q.kind.includes("rhythm")), 250);
    },
    [q, onAnswered, reveal],
  );
  useEffect(() => {
    if (result) nextRef.current?.focus();
  }, [result]);
  const props = { q, result, submit };
  return (
    <div className="@container">
      <h3 className="text-center text-[1.35rem] font-semibold text-fg">{q.prompt}</h3>
      <div className="mt-4 flex flex-col gap-4">
        {q.stimuli.map((s, i) => (
          <StimulusView key={`${q.id}-${i}`} s={s} guitar={q.response.type === "fretboard"} click={q.kind === "ear-rhythm"} />
        ))}
      </div>
      <div className="mt-5">
        {q.response.type === "choice" && <ChoiceResponse {...props} spec={q.response} />}
        {(q.response.type === "keyboard" || q.response.type === "fretboard") && <NotesResponse {...props} spec={q.response} />}
        {q.response.type === "tap" && <TapResponse {...props} spec={q.response} />}
      </div>
      {result && (
        <div role="status" className={cx("mt-5 flex flex-wrap items-center gap-x-4 gap-y-3 rounded-xl border-2 px-4 py-3", result.grade.correct ? "border-good bg-good-soft" : "border-bad bg-bad-soft")}>
          <div className="min-w-0 flex-1 basis-64">
            <p className="font-display text-lg font-bold text-fg">{result.grade.correct ? "Correct" : "Not quite"}</p>
            <p className="text-fg-2">{q.explain}</p>
          </div>
          {q.reveal && <Button size="sm" onClick={() => reveal.play(q.reveal!, q.kind.includes("rhythm"))}>Hear the answer</Button>}
          <Button ref={nextRef} variant="primary" onClick={onNext}>
            {last ? "Finish" : "Next"} <span className="text-xs opacity-80">↵</span>
          </Button>
        </div>
      )}
    </div>
  );
}

/** Ask every question in order, then report. */
export function ExerciseRunner({ questions, onDone, onAnswer }: { questions: Question[]; onDone: (answered: Answered[]) => void; onAnswer?: (a: Answered) => void }) {
  const [index, setIndex] = useState(0);
  const [answered, setAnswered] = useState<Answered[]>([]);
  const [batch, setBatch] = useState(questions);
  if (batch !== questions) {
    // A new batch: start again (state reset during render, not in an effect).
    setBatch(questions);
    setIndex(0);
    setAnswered([]);
  }
  const q = questions[index];
  if (!q) return null;
  const right = answered.filter((a) => a.correct).length;
  return (
    <div>
      <div className="mb-5 flex items-center gap-3">
        <div className="h-2 flex-1 overflow-hidden rounded-full bg-raised" role="progressbar" aria-valuemin={0} aria-valuemax={questions.length} aria-valuenow={index}>
          <div className="h-full rounded-full bg-accent transition-[width] duration-300" style={{ width: `${(answered.length / questions.length) * 100}%` }} />
        </div>
        <span className="text-sm font-semibold tabular-nums text-fg-3">
          {index + 1} / {questions.length}
          {answered.length > 0 && <span className="ml-2 text-good">{right} right</span>}
        </span>
      </div>
      <ErrorBoundary key={q.id} label={`${q.kind} question`}>
      <QuestionCard
        q={q}
        last={index === questions.length - 1}
        onAnswered={(correct) => {
          const a = { question: q, correct };
          setAnswered((cur) => [...cur, a]);
          onAnswer?.(a);
        }}
        onNext={() => {
          stopAll();
          if (index === questions.length - 1) onDone(answered);
          else setIndex(index + 1);
        }}
      />
      </ErrorBoundary>
    </div>
  );
}

/** Spelled pitch for a MIDI note, for captions. */
export const midiLabel = (m: number) => fromMidi(m);
