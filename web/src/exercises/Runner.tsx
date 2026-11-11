import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Choice, Given, Grade, Question, ResponseSpec, Sound, Stimulus } from "../../shared/exercise-types.ts";
import { grade } from "../../shared/exercises.ts";
import type { FretPos } from "../../shared/music/instruments.ts";
import { parsePitch } from "../../shared/music/notes.ts";
import { parseRhythm, parseTime, totalBeats } from "../../shared/music/rhythm.ts";
import { playSound, stopAll, type Playback } from "../audio/index.ts";
import { ErrorBoundary } from "../ErrorBoundary.tsx";
import { Button, cx, PlayButton } from "../ui.tsx";
import { ChordBox } from "../widgets/notation/ChordBox.tsx";
import { Fretboard, type FretMark } from "../widgets/notation/Fretboard.tsx";
import { Keyboard, type KeyMark } from "../widgets/notation/Keyboard.tsx";
import { Score } from "../widgets/notation/Score.tsx";
import { rhythmItems, TapPad, useTapSession } from "../widgets/notation/Time.tsx";
import { useCoarse, useShort } from "../widgets/touch.ts";
import { classifyAnswer, type Played } from "./reveal.ts";

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
  // On a phone on its side every line of height counts: draw a little smaller.
  const short = useShort();
  switch (s.type) {
    case "staff": {
      const pitches = s.notes.map(parsePitch).map((p) => (guitar ? { ...p, oct: p.oct + 1 } : p));
      const items = s.chord ? [{ pitches }] : pitches.map((p) => ({ pitches: [p] }));
      // w-full: an auto-margined block in a flex column shrinks to its
      // content, and Score draws nothing until it has a width to fill.
      return (
        <div className={cx("mx-auto w-full", compact ? "max-w-48" : "max-w-xs")}>
          <Score clef={s.clef} keySig={s.key} items={items} tone="ink" finalBar={false} space={compact ? 9 : short ? 10 : 13} />
        </div>
      );
    }
    case "keyboard":
      return <Keyboard lo={s.range[0]} hi={s.range[1]} labels="none" marks={s.marked.map((m) => ({ midi: m, tone: "accent" }))} />;
    case "fretboard":
      return <Fretboard frets={Math.max(4, s.maxFret)} labels="none" marks={s.marked.map((p) => ({ ...p, tone: "accent" }))} />;
    case "tab":
      return (
        <div className="mx-auto w-full max-w-xs">
          <Score clef="none" tab items={[{ pitches: [], tab: s.positions }]} finalBar={false} space={short ? 10 : 13} />
        </div>
      );
    case "diagram":
      return (
        <div className="flex justify-center">
          <ChordBox symbol={s.chord} showName={false} size={compact || short ? 0.9 : 1.25} neutral ariaLabel="Chord diagram: strum" />
        </div>
      );
    case "rhythm":
      return <Score clef="rhythm" time={s.time} items={rhythmItems(parseRhythm(s.pattern, s.time), s.time, false)} space={compact || short ? 9 : 12} />;
    case "sound":
      return <SoundStimulus sound={s.sound} autoplay={s.autoplay} click={click} />;
    case "text":
      return <p className="py-2 text-center font-display text-4xl font-bold text-fg short:py-0 short:text-3xl">{s.text}</p>;
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
              "flex min-h-12 items-center gap-3 rounded-xl border-2 px-3.5 py-3 text-left text-[1.02rem] font-semibold transition-colors",
              !result && "border-line bg-panel hover:border-accent hover:bg-accent-soft active:border-accent active:bg-accent-soft",
              isRight && "border-good bg-good-soft text-fg",
              isWrongPick && "border-bad bg-bad-soft text-fg",
              result && !isRight && !isWrongPick && "border-line bg-panel opacity-55",
            )}
          >
            <span aria-hidden="true" className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-raised text-xs font-bold text-fg-3 pointer-coarse:hidden">{i + 1}</span>
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
  // After answering, each note the learner gave is marked right or wrong on
  // its own merits, and the notes of the answer they left out are added
  // ("+" on a key, a ring on the fretboard). See reveal.ts for the rules.
  const single = spec.mode === "single";
  const givenNotes: Played[] = result?.given.type === "notes" ? result.given.midis.map((midi, i) => ({ midi, pos: (result.given as { positions?: FretPos[] }).positions?.[i] })) : [];
  const wrong = done && !result!.grade.correct;
  const rev = done ? classifyAnswer(q.expected, givenNotes, spec.type === "keyboard" ? { range: spec.range, single } : { maxFret: spec.maxFret, single }) : null;
  const toneOf = (i: number) => (!done ? ("accent" as const) : result!.grade.correct ? ("good" as const) : (rev?.given[i] ?? "bad"));
  const shown = done ? givenNotes : picked;
  const fixed = spec.marked ?? [];
  let board;
  if (spec.type === "keyboard") {
    const marks: KeyMark[] = [...(fixed as number[]).map((m) => ({ midi: m, tone: "ink" as const }))];
    shown.forEach((p, i) => marks.push({ midi: p.midi, tone: toneOf(i), label: spec.mode === "sequence" ? String(i + 1) : undefined }));
    if (wrong && rev) for (const m of rev.missing) if (!shown.some((p) => p.midi === m.midi)) marks.push({ midi: m.midi, tone: "good", label: single ? undefined : "+" });
    board = <Keyboard lo={spec.range[0]} hi={spec.range[1]} labels={spec.labels ?? "c"} marks={marks} onPress={(m) => press(m)} typing={!done} />;
  } else {
    const at = (a: FretPos, b: FretPos) => a.string === b.string && a.fret === b.fret;
    const marks: FretMark[] = [...(fixed as FretPos[]).map((p) => ({ ...p, tone: "ink" as const }))];
    shown.forEach((p, i) => p.pos && marks.push({ ...p.pos, tone: toneOf(i), label: spec.mode === "sequence" ? String(i + 1) : undefined }));
    if (wrong && rev) for (const m of rev.missing) if (m.pos && !shown.some((p) => p.pos && at(p.pos, m.pos!))) marks.push({ ...m.pos, tone: "good", hollow: true });
    board = <Fretboard frets={Math.max(4, spec.maxFret)} labels={spec.labels ?? "none"} marks={marks} onPress={(pos, midi) => press(midi, pos)} />;
  }
  const hasBad = wrong && !!rev?.given.includes("bad");
  const hasMissing = wrong && !!rev?.missing.length;
  return (
    <div>
      {board}
      {wrong && !single && (hasBad || hasMissing) && (
        <p className="mt-2 text-center text-sm text-fg-3">
          {[
            "Green: right.",
            hasBad && (spec.mode === "sequence" ? "Red: the wrong note, or the right note in the wrong place in the order." : "Red: not part of the answer."),
            hasMissing && (spec.type === "keyboard" ? "+ : a note of the answer you left out." : "Ring: a note of the answer you left out."),
          ]
            .filter(Boolean)
            .join(" ")}
        </p>
      )}
      {!done && spec.mode !== "single" && (
        <div className="mt-3 flex flex-wrap items-center justify-center gap-3">
          {spec.mode === "sequence" && <span className="text-sm text-fg-3">{picked.length} of {need} notes</span>}
          {spec.mode === "set" && <span className="text-sm text-fg-3">{picked.length ? `${picked.length} selected · press a note again to remove it` : "Select the notes, then check"}</span>}
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
  // Each tap has its own window (a note crowded by its neighbours gets a
  // tighter one); `toleranceBeats` alone is only the tightest of them.
  const taps = q.expected.type === "taps" ? q.expected : null;
  const tolAt = (i: number): number => taps?.tolerances?.[i] ?? taps?.toleranceBeats ?? 0.15;
  const errors = result?.grade.tapErrors;
  const inTime = (i: number) => {
    const e = errors?.[i];
    return e != null && Math.abs(e) <= tolAt(i);
  };
  let n = 0;
  const tones = errors ? events.map((e) => (e.midis.length ? (inTime(n++) ? ("good" as const) : ("bad" as const)) : undefined)) : undefined;
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
          <TapPad state={tapper.state} countBeat={tapper.countBeat} onTap={tapper.tap} className="max-w-sm" />
        )}
        {errors && (
          <p className="text-sm text-fg-2">
            {errors.map((e, i) => (
              <span key={i} className={cx("mx-0.5 inline-block rounded px-1.5 py-0.5 font-mono text-xs", inTime(i) ? "bg-good-soft" : "bg-bad-soft")}>
                {e == null ? "missed" : Math.abs(e) <= tolAt(i) / 3 ? "on it" : `${Math.round(Math.abs(e) * (60 / spec.tempo) * 1000)} ms ${e > 0 ? "late" : "early"}`}
              </span>
            ))}
          </p>
        )}
      </div>
    </div>
  );
}

/** How long after a tapped rhythm ends Next ignores the space bar, clicks
 *  and touches: the last tap of the pattern must not land on Next. */
const TAP_GUARD_MS = 900;

export function QuestionCard({ q, onAnswered, onNext, last }: { q: Question; onAnswered: (correct: boolean) => void; onNext: () => void; last: boolean }) {
  const [result, setResult] = useState<{ given: Given; grade: Grade } | null>(null);
  const reveal = useSound();
  const nextRef = useRef<HTMLButtonElement | null>(null);
  const resultRef = useRef<HTMLDivElement | null>(null);
  // The answer sound starts a moment after the answer. The timer is kept so
  // that moving on (or leaving) cancels it: otherwise it fires over the next
  // question, after the stopAll() that was meant to silence it.
  const revealTimer = useRef<number | null>(null);
  const cancelReveal = useCallback(() => {
    if (revealTimer.current !== null) window.clearTimeout(revealTimer.current);
    revealTimer.current = null;
  }, []);
  /** When the answer landed, for the tap guard below. */
  const answeredAt = useRef(0);
  const isTap = q.response.type === "tap";
  // A touch screen has no space bar: the prompt should not ask for one.
  const coarse = useCoarse();
  const short = useShort();
  useEffect(() => {
    setResult(null);
    stopAll();
    return cancelReveal;
  }, [q.id, cancelReveal]);
  // Side effects (recording, sound) happen here, once — not inside a state
  // updater, which StrictMode runs twice.
  const answeredId = useRef<string | null>(null);
  const submit = useCallback(
    (given: Given) => {
      if (answeredId.current === q.id) return;
      answeredId.current = q.id;
      const g = grade(q, given);
      setResult({ given, grade: g });
      answeredAt.current = performance.now();
      onAnswered(g.correct);
      if (q.reveal) {
        cancelReveal();
        revealTimer.current = window.setTimeout(() => {
          revealTimer.current = null;
          reveal.play(q.reveal!, q.kind.includes("rhythm"));
        }, 250);
      }
    },
    [q, onAnswered, reveal, cancelReveal],
  );
  // Next takes the focus so Enter moves on. After a tapped rhythm it waits:
  // the learner is still tapping the space bar when the pattern ends, and a
  // late tap on a focused Next would skip the feedback unread.
  useEffect(() => {
    if (!result) return;
    // The verdict appears below the answer area: bring it into view (a phone
    // screen rarely shows both), without moving a page that already shows it.
    resultRef.current?.scrollIntoView({ block: "nearest", behavior: "smooth" });
    // Not at once: an answer given with the mouse on a key or a fret arrives
    // inside its pointerdown, and the browser then moves the focus to what
    // was pressed. Next takes it after that has happened.
    const t = window.setTimeout(() => nextRef.current?.focus({ preventScroll: true }), isTap ? TAP_GUARD_MS : 40);
    return () => window.clearTimeout(t);
  }, [result, isTap]);
  // Enter moves on wherever the focus is (a piano key, a fret), except on a
  // control that has its own use for Enter.
  const nextFn = useRef<() => void>(() => {});
  useEffect(() => {
    if (!result) return;
    const on = (e: KeyboardEvent) => {
      if (e.key !== "Enter" || e.repeat || e.metaKey || e.ctrlKey || e.altKey || e.shiftKey) return;
      const t = e.target as HTMLElement | null;
      if (t && (["BUTTON", "A", "INPUT", "TEXTAREA", "SELECT", "SUMMARY"].includes(t.tagName) || t.isContentEditable)) return;
      e.preventDefault();
      e.stopPropagation();
      nextFn.current();
    };
    window.addEventListener("keydown", on, true);
    return () => window.removeEventListener("keydown", on, true);
  }, [result]);
  useEffect(() => {
    if (!result || !isTap) return;
    // Until the guard has passed, a late space bar does nothing at all.
    const on = (e: KeyboardEvent) => {
      if (e.code === "Space" && performance.now() - answeredAt.current < TAP_GUARD_MS) e.preventDefault();
    };
    window.addEventListener("keydown", on, true);
    window.addEventListener("keyup", on, true);
    return () => {
      window.removeEventListener("keydown", on, true);
      window.removeEventListener("keyup", on, true);
    };
  }, [result, isTap]);
  const next = () => {
    if (isTap && performance.now() - answeredAt.current < TAP_GUARD_MS) return;
    cancelReveal();
    onNext();
  };
  nextFn.current = next;
  const props = { q, result, submit };
  // A tapped rhythm is drawn once, by the answer area (which also colours
  // each note afterwards), not a second time as a stimulus above it.
  const stimuli = isTap ? q.stimuli.filter((s) => s.type !== "rhythm") : q.stimuli;
  return (
    // On a phone on its side (`short:`) the card is two columns: what is asked
    // and, once answered, the verdict on the left; the place the answer is
    // given on the right. Stacked, the three do not fit a screen that low,
    // and the learner scrolled back and forth between them.
    <div data-question="" className="short:grid short:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] short:items-start short:gap-x-4">
      <div className="short:col-start-1 short:row-start-1">
        <h3 className="text-center text-[1.2rem] leading-snug font-semibold text-balance text-fg sm:text-[1.35rem] short:text-[1.05rem]">{coarse ? q.prompt.replace(" on the space bar", "") : q.prompt}</h3>
        <div className={cx("flex flex-col gap-4 short:gap-2", stimuli.length > 0 && "mt-4 short:mt-2")}>
          {stimuli.map((s, i) => (
            <StimulusView key={`${q.id}-${i}`} s={s} guitar={q.response.type === "fretboard"} click={q.kind === "ear-rhythm"} />
          ))}
        </div>
      </div>
      <div className="@container mt-5 short:sticky short:top-2 short:col-start-2 short:row-span-2 short:row-start-1 short:mt-0">
        {q.response.type === "choice" && <ChoiceResponse {...props} spec={q.response} />}
        {(q.response.type === "keyboard" || q.response.type === "fretboard") && <NotesResponse {...props} spec={q.response} />}
        {q.response.type === "tap" && <TapResponse {...props} spec={q.response} />}
      </div>
      {result && (
        // On a short screen the way on sits in the verdict's own top corner:
        // below it, it was off the bottom of the screen.
        <div className="relative short:col-start-1 short:row-start-2 short:mt-2">
          <div ref={resultRef} role="status" className={cx("mt-5 scroll-mb-20 rounded-xl border-2 px-4 py-3 short:mt-0 short:scroll-mb-2 short:px-3 short:py-1.5", result.grade.correct ? "border-good bg-good-soft" : "border-bad bg-bad-soft")}>
            <p className="font-display text-lg font-bold text-fg short:flex short:min-h-12 short:items-center">{result.grade.correct ? "Correct" : "Not quite"}</p>
            <p className="text-fg-2 short:text-sm">{q.explain}</p>
          </div>
          {/* Sticks to the bottom of the scrolling page, so on a phone the
              way on is always under the thumb however tall the question is.
              Not on a short screen (a phone on its side): there the bar
              would cover the very notes the answer is shown on. */}
          <div className="z-10 -mx-1 mt-2 flex items-center justify-end gap-3 bg-panel/95 px-1 py-2.5 backdrop-blur-sm short:absolute short:top-1.5 short:right-3 short:m-0 short:gap-2 short:bg-transparent short:p-0 short:backdrop-blur-none [@media(min-height:560px)]:sticky [@media(min-height:560px)]:bottom-0">
            <span className={cx("mr-auto font-display font-bold sm:hidden", result.grade.correct ? "text-good" : "text-bad")}>{result.grade.correct ? "Correct" : "Not quite"}</span>
            {q.reveal && <Button size="sm" onClick={() => reveal.play(q.reveal!, q.kind.includes("rhythm"))}>{short ? "Hear it" : "Hear the answer"}</Button>}
            <Button ref={nextRef} variant="primary" className="min-w-24 short:min-w-20" onClick={next}>
              {last ? "Finish" : "Next"} <span className="text-xs opacity-80 pointer-coarse:hidden">↵</span>
            </Button>
          </div>
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
  // onDone fires once per batch, however fast Finish is clicked.
  const finished = useRef<Question[] | null>(null);
  const top = useRef<HTMLDivElement | null>(null);
  // A new question starts at its prompt: after a tall question on a phone
  // the page is scrolled well past where the next one begins.
  // On a phone on its side the question takes the whole screen: every one,
  // the first included, starts at the top of it, clear of the page heading.
  const short = useShort();
  useEffect(() => {
    const el = top.current;
    if (!el) return;
    const y = el.getBoundingClientRect().top;
    if (short ? Math.abs(y) > 24 : index > 0 && y < 56) el.scrollIntoView({ block: "start" });
  }, [index, short]);
  if (batch !== questions) {
    // A new batch: start again (state reset during render, not in an effect).
    // Callers keep `questions` the same array for as long as the batch is the
    // same one, so a content reload mid-practice does not land here.
    setBatch(questions);
    setIndex(0);
    setAnswered([]);
  }
  const q = questions[index];
  if (!q) return null;
  const right = answered.filter((a) => a.correct).length;
  return (
    <div ref={top} className="scroll-mt-4 short:scroll-mt-2">
      <div className="mb-5 flex items-center gap-3 short:mb-2">
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
          if (index < questions.length - 1) return setIndex(index + 1);
          if (finished.current === questions) return;
          finished.current = questions;
          onDone(answered);
        }}
      />
      </ErrorBoundary>
    </div>
  );
}
