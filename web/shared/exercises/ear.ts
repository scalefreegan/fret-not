import type { Choice, Timbre } from "../exercise-types.ts";
import { CHORDS, CHORD_ORDER } from "../music/chords.ts";
import { positionsOf } from "../music/instruments.ts";
import { intervalName, intervalOfSemitones, semitones } from "../music/intervals.ts";
import { fromMidi, isBlackKey, pc, pcBothLabels, pcLabel, pitchLabel, toMidi, type Pitch } from "../music/notes.ts";
import { parseDuration } from "../music/rhythm.ts";
import { isScaleType, scaleNotes } from "../music/scales.ts";
import { intervalChoices, intervalPool } from "./identify.ts";
import {
  arpThenChord, article, cap, choice, durationTokens, durationWords, ev, fillBar, int, joinAnd, kbRange, melodic, midiLabel, pBool, pList, pNum, pRange, pStr, pick, plural, rhythmSound, shuffle, sound,
  aStep, sayNote, spellPair, uniq, vocabOf, window5, type Generator,
} from "./util.ts";

const TIMBRES: Timbre[] = ["sine", "triangle", "square", "saw", "piano", "guitar"];
const timbreOf = (v: string, d: Timbre): Timbre => (TIMBRES.includes(v as Timbre) ? (v as Timbre) : d);

export const earHigherLower: Generator = (p, rng) => {
  const min = Math.max(1, Math.floor(pNum(p, "minSemitones", 2)));
  const max = Math.max(min, Math.min(24, Math.floor(pNum(p, "maxSemitones", 12))));
  const timbre = timbreOf(pStr(p, "timbre", "piano"), "piano");
  const gap = int(rng, min, max);
  const up = rng() < 0.5;
  // A pure tone below about 200 Hz is faint on small speakers: with a sine or
  // triangle wave neither note goes under G3.
  const thin = timbre === "sine" || timbre === "triangle";
  const first = int(rng, thin && !up ? 55 + gap : 55, thin && !up ? Math.max(72, 55 + gap) : 72);
  const second = first + (up ? gap : -gap);
  return {
    prompt: "Listen to the two notes. Is the second one higher or lower than the first?",
    stimuli: [{ type: "sound", sound: melodic([first, second], timbre), autoplay: true }],
    response: { type: "choice", choices: [choice("higher", "Higher"), choice("lower", "Lower")] },
    expected: { type: "choice", id: up ? "higher" : "lower" },
    explain:
      vocabOf(p) === "full"
        ? `The second note (${midiLabel(second)}) is ${up ? "higher" : "lower"} than the first (${midiLabel(first)}) by ${aStep(gap)}: it vibrates ${up ? "faster" : "more slowly"}.`
        : vocabOf(p) === "names"
          ? `The second note (${pcLabel(fromMidi(second))}) is ${up ? "higher" : "lower"} than the first (${pcLabel(fromMidi(first))}) by ${aStep(gap)}: it vibrates ${up ? "faster" : "more slowly"}.`
          : `The second note is ${up ? "higher" : "lower"} than the first: it vibrates ${up ? "faster" : "more slowly"}.`,
    reveal: melodic([first, second], timbre),
  };
};

export const earInterval: Generator = (p, rng) => {
  const labels = pStr(p, "labels", "names");
  const pool = intervalPool(p, true);
  const iv = pick(rng, pool);
  const semis = semitones(iv);
  const modeParam = pStr(p, "mode", "melodic");
  const harmonic = modeParam === "harmonic" || (modeParam === "both" && rng() < 0.5);
  const lo = int(rng, 55, 67);
  const midis = [lo, lo + semis];
  const said = labels === "steps" ? aStep(semis) : `${article(intervalName(iv))} ${intervalName(iv)}`;
  // Named as the interval spells them (a minor third above C is E♭); counted
  // in steps there is no spelling to honour, and a black key gets both names.
  const [loP, hiP] = spellPair(lo, iv);
  const name = (m: number, p: Pitch, octave: boolean) => (labels === "steps" && isBlackKey(m) ? pcBothLabels(m) : octave ? pitchLabel(p) : pcLabel(p));
  return {
    // "Interval" is a Level 3 word: below `full` the question does not use it.
    prompt: labels === "steps" ? "Listen. How far apart are the two notes?" : vocabOf(p) !== "full" ? "Listen to the two notes. Which of these do you hear?" : "Listen. Which interval is this?",
    stimuli: [{ type: "sound", sound: harmonic ? sound([ev(midis, 0, 2)]) : melodic(midis), autoplay: true }],
    response: { type: "choice", choices: intervalChoices(rng, pool, iv, labels) },
    expected: { type: "choice", id: iv },
    explain:
      vocabOf(p) === "full"
        ? `That was ${said}: ${name(midis[0], loP, true)} and ${name(midis[1], hiP, true)}, ${plural(semis, "half step")} apart.`
        : vocabOf(p) === "names"
          ? `That was ${said}: ${name(midis[0], loP, false)} and ${name(midis[1], hiP, false)}, ${plural(semis, "half step")} apart.`
          : `That was ${said}.`,
    reveal: sound([ev([midis[0]], 0, 1), ev([midis[1]], 1, 1), ev(midis, 2, 2)]),
  };
};

const QUALITY_HINT: Record<string, string> = {
  maj: "its major third above the root gives it a bright, settled sound",
  min: "its minor third above the root gives it a darker sound",
  dim: "two stacked minor thirds make it tense and unstable",
  aug: "two stacked major thirds make it sound unresolved",
  "7": "a major triad with a minor seventh on top, which wants to move on",
  maj7: "a major triad with a major seventh on top, a soft, dreamy sound",
  m7: "a minor triad with a minor seventh on top, a mellow sound",
};

/** "major" → "major chord"; "power chord" stays as it is. */
function chordWord(name: string): string {
  return /chord$/.test(name) ? name : `${name} chord`;
}

export const earChord: Generator = (p, rng) => {
  let types = uniq(pList<string>(p, "types", ["maj", "min"]).filter((t) => Object.hasOwn(CHORDS, t)));
  if (!types.length) types = ["maj", "min"];
  const type = pick(rng, types);
  const offered = types.length >= 2 ? types : uniq([...types, "maj", "min"]);
  const ordered = CHORD_ORDER.filter((t) => offered.includes(t));
  const guitar = pStr(p, "instrument", "piano") === "guitar";
  const root = guitar ? int(rng, 45, 55) : int(rng, 55, 66);
  const midis = CHORDS[type].intervals.map((iv) => root + semitones(iv));
  const timbre: Timbre = guitar ? "guitar" : "piano";
  const strum = guitar ? 0.03 : undefined;
  // Spell the root the way that chord is usually written: F♯ minor, not G♭
  // minor; B♭ major, not A♯ major.
  const minorish = CHORDS[type].intervals[1] === "m3";
  const sharpRoot = minorish ? [1, 6, 8].includes(pc(root)) : pc(root) === 6;
  const rootName = pcLabel(fromMidi(root, sharpRoot ? "sharp" : "flat"));
  return {
    prompt: "Listen. What kind of chord is this?",
    stimuli: [{ type: "sound", sound: sound([ev(midis, 0, 3, strum ? { strum } : {})], timbre), autoplay: true }],
    response: { type: "choice", choices: window5(rng, ordered, ordered.indexOf(type)).map((t) => choice(t, cap(CHORDS[t].name))) },
    expected: { type: "choice", id: type },
    explain: `That was ${article(CHORDS[type].name)} ${chordWord(CHORDS[type].name)} on ${rootName}${QUALITY_HINT[type] ? `: ${QUALITY_HINT[type]}` : ""}.`,
    reveal: arpThenChord(midis, timbre, strum),
  };
};

const TIMBRE_LABEL: Record<Timbre, string> = { sine: "Pure sine tone", triangle: "Triangle wave", square: "Square wave", saw: "Sawtooth wave", piano: "Piano", guitar: "Guitar" };
const TIMBRE_WHY: Record<Timbre, string> = {
  sine: "a single frequency with no overtones at all, so it sounds smooth and plain",
  triangle: "only odd harmonics, fading quickly, so it sounds soft and hollow",
  square: "strong odd harmonics, so it sounds hollow and buzzy",
  saw: "every harmonic, strongly, so it sounds bright and buzzy",
  piano: "a struck string, with a sharp start and many harmonics that die away slowly",
  guitar: "a plucked string, with a bright pluck whose upper harmonics fade first",
};

export const earTimbre: Generator = (p, rng) => {
  let sources = uniq(pList<string>(p, "sources", ["sine", "piano", "guitar"]).filter((s): s is Timbre => TIMBRES.includes(s as Timbre)));
  if (!sources.length) sources = ["sine", "piano", "guitar"];
  const source = pick(rng, sources);
  const offered = sources.length >= 3 ? sources : uniq<Timbre>([...sources, "sine", "piano", "guitar"]);
  const ordered = TIMBRES.filter((t) => offered.includes(t));
  const midi = int(rng, 52, 67);
  const s = sound([ev([midi], 0, 2)], source);
  return {
    prompt: "Listen. What is making this sound?",
    stimuli: [{ type: "sound", sound: s, autoplay: true }],
    response: { type: "choice", choices: window5(rng, ordered, ordered.indexOf(source)).map((t) => choice(t, TIMBRE_LABEL[t])) },
    expected: { type: "choice", id: source },
    explain: `That was ${source === "piano" || source === "guitar" ? `a ${source}` : `a ${TIMBRE_LABEL[source].toLowerCase()}`}: ${TIMBRE_WHY[source]}.`,
    reveal: s,
  };
};

export const earSameNote: Generator = (p, rng) => {
  const timbre = timbreOf(pStr(p, "timbre", "piano"), "piano");
  const kind = pick(rng, ["same", "octave", "different"] as const);
  const first = int(rng, 55, 67);
  const gap = kind === "same" ? 0 : kind === "octave" ? 12 : pick(rng, [2, 3, 4, 5, 7, 9]);
  const second = first + (kind !== "same" && rng() < 0.3 ? -gap : gap);
  const a = fromMidi(first);
  const b = fromMidi(second);
  const vocab = vocabOf(p);
  const plainWhy =
    kind === "same"
      ? "Both were the same note: the same frequency twice."
      : kind === "octave"
        ? `The second note was the same note an octave ${second > first ? "higher" : "lower"}: one vibrates exactly twice as fast as the other.`
        : "They were different notes, and not an octave apart: neither frequency is double the other.";
  const namesWhy =
    kind === "same"
      ? `Both were ${pcLabel(a)}: the same frequency twice.`
      : kind === "octave"
        ? `${pcLabel(a)} then ${pcLabel(b)}: the same note name an octave apart, one vibrating exactly twice as fast as the other.`
        : `${pcLabel(a)} then ${pcLabel(b)}: different notes, ${plural(gap, "half step")} apart.`;
  const fullWhy =
    kind === "same"
      ? `Both were ${pitchLabel(a)}: the same frequency twice.`
      : kind === "octave"
        ? `${pitchLabel(a)} then ${pitchLabel(b)}: the same note name an octave apart, one vibrating exactly twice as fast as the other.`
        : `${pitchLabel(a)} then ${pitchLabel(b)}: different notes, ${plural(gap, "half step")} apart.`;
  return {
    prompt: "Listen to the two notes. Are they the same note, an octave apart, or different notes?",
    stimuli: [{ type: "sound", sound: melodic([first, second], timbre), autoplay: true }],
    response: { type: "choice", choices: [choice("same", "The same note"), choice("octave", "An octave apart"), choice("different", "Different notes")] },
    expected: { type: "choice", id: kind },
    explain: vocab === "full" ? fullWhy : vocab === "names" ? namesWhy : plainWhy,
    reveal: sound([ev([first], 0, 1), ev([second], 1, 1), ev([first, second], 2, 2)], timbre),
  };
};

/** What a bar sounds like: where notes start (rests only move later onsets). */
function heard(tokens: string[]): string {
  let at = 0;
  const on: number[] = [];
  for (const t of tokens) {
    const d = parseDuration(t);
    if (!d.rest) on.push(at);
    at += d.beats;
  }
  return on.join(",");
}

export const earRhythm: Generator = (p, rng) => {
  const time = pStr(p, "time", "4/4");
  const values = durationTokens(pList(p, "values", ["h", "q", "e"]));
  const tempo = Math.max(30, Math.min(240, pNum(p, "tempo", 80)));
  const syncopation = pBool(p, "syncopation", false);
  const answer = fillBar(rng, values, time, { syncopation });
  const bars = [answer];
  const wide = uniq([...values, "h", "q", "e"]);
  for (let tries = 0; tries < 80 && bars.length < 3; tries++) {
    const cand = fillBar(rng, tries < 40 ? values : wide, time, { syncopation });
    if (!bars.some((b) => heard(b) === heard(cand))) bars.push(cand);
  }
  // A bar with only one possible rhythm (one sixteenth in 1/16): the only
  // thing left to tell it from is the same bar with a note silenced.
  for (let i = 0; i < answer.length && bars.length < 2; i++) {
    if (parseDuration(answer[i]).rest) continue;
    const cand = answer.map((t, j) => (j === i ? `${t}r` : t));
    if (!bars.some((b) => heard(b) === heard(cand))) bars.push(cand);
  }
  const letters = ["A", "B", "C"];
  const order = shuffle(rng, bars);
  const choices: Choice[] = order.map((b, i) => ({ id: letters[i], label: letters[i], stimulus: { type: "rhythm", pattern: b.join(" "), time } }));
  const s = rhythmSound(answer, tempo);
  const words = answer.map((t) => durationWords(parseDuration(t)).replace(/ note$/, ""));
  return {
    prompt: "Listen to the rhythm. Which of these is it?",
    stimuli: [{ type: "sound", sound: s, autoplay: true }],
    response: { type: "choice", choices },
    expected: { type: "choice", id: letters[order.indexOf(answer)] },
    explain: `The rhythm was ${joinAnd(words)}: ${letters[order.indexOf(answer)]}. Count the beats and listen for where each note starts.`,
    reveal: s,
  };
};

export const earFindNote: Generator = (p, rng) => {
  const guitar = pStr(p, "instrument", "piano") === "guitar";
  const scaleParam = pStr(p, "scale", "major");
  const type = isScaleType(scaleParam) ? scaleParam : "major";
  const fallback: [number, number] = guitar ? [48, 60] : [60, 72];
  const pcs = new Set(scaleNotes("C4", type).map((n) => pc(toMidi(n))));
  const playable = (m: number) => !guitar || positionsOf(m, 12).length > 0;
  const scaleNotesIn = ([lo, hi]: [number, number]) => {
    const out: number[] = [];
    for (let m = lo; m <= hi; m++) if (pcs.has(pc(m)) && playable(m)) out.push(m);
    return out;
  };
  // A range holding fewer than two notes of the scale cannot make a
  // question (the loader refuses it): fall back to the default octave, so
  // the note asked for is always on the instrument shown.
  let range = pRange(p) ?? fallback;
  let notes = scaleNotesIn(range);
  if (notes.length < 2) {
    range = fallback;
    notes = scaleNotesIn(range);
  }
  const ref = notes.find((m) => pc(m) === 0) ?? notes[0];
  const others = notes.filter((m) => m !== ref);
  const target = others.length ? pick(rng, others) : ref;
  const timbre: Timbre = guitar ? "guitar" : "piano";
  const gap = Math.abs(target - ref);
  const vocab = vocabOf(p);
  // Spelled as the scale spells them: the third of C natural minor is E♭.
  const spelledByPc = new Map(scaleNotes("C4", type).map((n) => [pc(toMidi(n)), n] as const));
  const pitchOf = (m: number): Pitch => {
    const n = spelledByPc.get(pc(m)) ?? fromMidi(m);
    return { letter: n.letter, acc: n.acc, oct: Math.floor((m - n.acc) / 12) - 1 };
  };
  const where = (m: number) => (guitar ? positionsOf(m, 12)[0] : undefined);
  // Below `letters` no note is named at all; at `letters` a black key is
  // described by where it is.
  const say = (m: number) => sayNote(pitchOf(m), vocab, where(m));
  const refSaid = vocab === "plain" ? "the marked note" : say(ref);
  const plainDist = gap === 0 ? "the same note" : `${gap === 12 ? "an octave " : vocab === "names" ? `${plural(gap, "half step")} ` : ""}${target > ref ? "above" : "below"} it`;
  const dist = vocab !== "full" ? plainDist : gap === 0 ? "the same note" : gap <= 12 ? `${article(intervalName(intervalOfSemitones(gap)))} ${intervalName(intervalOfSemitones(gap))} ${target > ref ? "above" : "below"} it` : `${plural(gap, "half step")} ${target > ref ? "above" : "below"} it`;
  return {
    prompt: `You will hear ${vocab === "plain" ? "the marked note" : `${refSaid} (marked)`}, then a second note. Find the second note on the ${guitar ? "fretboard" : "keyboard"}.`,
    stimuli: [
      { type: "text", text: vocab === "plain" ? "Starts on the marked note" : `Starts on ${refSaid}` },
      { type: "sound", sound: sound([ev([ref], 0, 1.5), ev([target], 2, 1.5)], timbre), autoplay: true },
    ],
    response: guitar
      ? { type: "fretboard", maxFret: 12, mode: "single", labels: "none", marked: positionsOf(ref, 12).slice(0, 1) }
      : { type: "keyboard", range: kbRange(range[0], range[1]), mode: "single", labels: "none", marked: [ref] },
    expected: { type: "notes", midis: [target], match: "exact", ordered: false },
    explain: vocab === "plain" ? `The second note was ${dist === "the same note" ? dist : dist.replace(/ it$/, " the marked note")}.` : `The second note was ${say(target)}, ${dist}.`,
    reveal: sound([ev([ref], 0, 1), ev([target], 1, 2)], timbre),
  };
};
