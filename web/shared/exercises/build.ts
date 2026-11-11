import { CHORDS, chordNotes, chordPcs, type ChordRef } from "../music/chords.ts";
import { fretMidi, positionsOf, type FretPos } from "../music/instruments.ts";
import { intervalName, semitones, transpose } from "../music/intervals.ts";
import { accSymbol, fromMidi, isBlackKey, isPitchClass, parsePitchClass, pc, pcLabel, toMidi } from "../music/notes.ts";
import { keySignature, parseKey, SCALES, scaleNotes } from "../music/scales.ts";
import { aNumber, chordWhy, intervalPool, naturalAt, numberPool, numberWhy, pickKey } from "./identify.ts";
import { scaleKeyboard, scalePick, scaleWhy } from "./play.ts";
import { arpThenChord, article, cap, choice, ev, kbRange, melodic, pList, pStr, pick, plural, sayNote, shuffle, sound, aStep, uniq, vocabOf, type Generator } from "./util.ts";

export const buildInterval: Generator = (p, rng) => {
  const labels = pStr(p, "labels", "names");
  const byNumber = labels === "numbers";
  const num = byNumber ? pick(rng, numberPool(p)) : 0;
  const iv = byNumber ? "P1" : pick(rng, intervalPool(p, false));
  // By number, the target is the natural note that many letters away, so its
  // distance in half steps depends on where the count starts.
  const semisFrom = (m: number, goUp: boolean) => (byNumber ? Math.abs(toMidi(naturalAt(fromMidi(m), num, goUp ? 1 : -1)) - m) : semitones(iv));
  const guitar = pStr(p, "instrument", "piano") === "guitar";
  const dirParam = pStr(p, "direction", "up");
  let up = dirParam === "up" || (dirParam === "both" && rng() < 0.5);

  let startMidi: number;
  let startPos: FretPos | null = null;
  if (guitar) {
    const all: FretPos[] = [];
    for (let string = 3; string <= 6; string++) for (let fret = 0; fret <= 5; fret++) all.push({ string, fret });
    const natural = all.filter((x) => !isBlackKey(fretMidi(x)));
    const playable = (x: FretPos, goUp: boolean) => positionsOf(fretMidi(x) + (goUp ? 1 : -1) * semisFrom(fretMidi(x), goUp), 12).length > 0;
    let cands = natural.filter((x) => playable(x, up));
    if (!cands.length) {
      up = true;
      cands = natural.filter((x) => playable(x, true));
    }
    startPos = pick(rng, cands.length ? cands : natural);
    startMidi = fretMidi(startPos);
  } else {
    startMidi = pick(rng, [60, 62, 64, 65, 67, 69, 71]);
  }
  const start = fromMidi(startMidi);
  const target = byNumber ? naturalAt(start, num, up ? 1 : -1) : transpose(start, iv, up ? 1 : -1);
  const targetMidi = toMidi(target);
  const semis = Math.abs(targetMidi - startMidi);
  const dir = up ? "above" : "below";
  const timbre = guitar ? "guitar" : "piano";
  if (byNumber) {
    const said = aNumber(num);
    // The number counts letter names only, so the same letter with a sharp or
    // flat is just as right (C up to E♭ is also a third). A sharp or flat that
    // lands on a white key is left out: that key is counted as another letter.
    // Only where the instrument shown can play it: within the keys drawn, or
    // on the first twelve frets.
    const keys = kbRange(Math.min(48, targetMidi), Math.max(84, targetMidi));
    const reachable = (m: number) => (guitar ? positionsOf(m, 12).length > 0 : m >= keys[0] && m <= keys[1]);
    const alsoAccept = [targetMidi - 1, targetMidi + 1].filter((m) => isBlackKey(m) && reachable(m));
    const also = alsoAccept.map((m) => pcLabel({ letter: target.letter, acc: m - targetMidi }));
    return {
      prompt: num === 1 ? `Play the note a unison from the marked ${pcLabel(start)}.` : `Play the note ${said} ${dir} the marked ${pcLabel(start)}.`,
      stimuli: [{ type: "text", text: num === 1 ? `Unison on ${pcLabel(start)}` : `${cap(said)} ${dir} ${pcLabel(start)}` }],
      response: guitar
        ? { type: "fretboard", maxFret: 12, mode: "single", labels: "none", marked: [startPos!] }
        : { type: "keyboard", range: kbRange(Math.min(48, targetMidi), Math.max(84, targetMidi)), mode: "single", labels: "none", marked: [startMidi] },
      expected: { type: "notes", midis: [targetMidi], match: "exact", ordered: false, ...(alsoAccept.length ? { alsoAccept } : {}) },
      explain: `${numberWhy(start, target, num)}${also.length ? ` ${joinOr(also)} would also be ${aNumber(num)}: a sharp or flat does not change the letter count.` : ""}`,
      reveal: sound([ev([startMidi], 0, 1), ev([targetMidi], 1, 1), ev([startMidi, targetMidi], 2, 2)], timbre),
    };
  }
  const said = labels === "steps" ? aStep(semis) : `${article(intervalName(iv))} ${intervalName(iv)}`;
  const vocab = vocabOf(p);
  // On the guitar, the place nearest the marked note: the same string when
  // the fret exists there, else the neighbouring string.
  const places = guitar ? positionsOf(targetMidi, 12) : [];
  const targetPos = places.length ? [...places].sort((a, b) => Math.abs(a.string - startPos!.string) - Math.abs(b.string - startPos!.string))[0] : undefined;
  // Below `full`, notes are named only as far as the learner can read them.
  const from = vocab === "plain" ? "the marked note" : sayNote(start, vocab);
  const to = vocab === "plain" ? (guitar && targetPos ? `at string ${targetPos.string}, fret ${targetPos.fret}` : "the key shown") : sayNote(target, vocab, targetPos);
  return {
    prompt: `Play the note ${said} ${dir} the marked ${pcLabel(start)}.`,
    stimuli: [{ type: "text", text: `${cap(said)} ${dir} ${pcLabel(start)}` }],
    response: guitar
      ? { type: "fretboard", maxFret: 12, mode: "single", labels: "none", marked: [startPos!] }
      : { type: "keyboard", range: kbRange(Math.min(48, targetMidi), Math.max(84, targetMidi)), mode: "single", labels: "none", marked: [startMidi] },
    expected: { type: "notes", midis: [targetMidi], match: "exact", ordered: false },
    explain:
      labels === "steps"
        ? `${cap(said)} ${dir} ${from} is ${to}: ${semis === 1 ? "the very next note" : semis === 2 ? "two half steps, so one key or fret is skipped" : `${semis} half steps, counting every key or fret`}.`
        : `${cap(said)} ${dir} ${from} is ${to}: ${plural(semis, "half step")} ${up ? "up" : "down"}, ${plural(iv.length ? Number(iv.slice(1)) : 1, "letter name")} counting both ends.`,
    reveal: sound([ev([startMidi], 0, 1), ev([targetMidi], 1, 1), ev([startMidi, targetMidi], 2, 2)], guitar ? "guitar" : "piano"),
  };
};

export const buildScale: Generator = (p, rng) => {
  const { tonic, type } = scalePick(p, rng);
  const { tonicMidi, range } = scaleKeyboard(tonic);
  const spelled = scaleNotes({ ...tonic, oct: 4 }, type, true);
  const offset = tonicMidi - toMidi(spelled[0]);
  const midis = spelled.map((n) => toMidi(n) + offset);
  const name = `${pcLabel(tonic)} ${SCALES[type].name}`;
  return {
    prompt: `Select every note of the ${name} scale on the keyboard, then check. The ${pcLabel(tonic)} is marked.`,
    stimuli: [{ type: "text", text: `${name} scale` }],
    response: { type: "keyboard", range, mode: "set", labels: "none", marked: [tonicMidi] },
    expected: { type: "notes", midis: uniq(midis.map(pc)).map((x) => 60 + x), match: "pc", ordered: false },
    explain: scaleWhy(tonic, type),
    reveal: melodic(midis, "piano", 0.5),
  };
};

function joinOr(items: string[]): string {
  return items.join(" or ");
}

/** "a major triad", "a dominant seventh chord", "a power chord". */
function chordKind(type: string): string {
  const name = CHORDS[type].name;
  const full = ["maj", "min", "dim", "aug"].includes(type) ? `${name} triad` : name.endsWith("chord") ? name : `${name} chord`;
  return `${article(full)} ${full}`;
}

export const buildChord: Generator = (p, rng) => {
  const types = pList<string>(p, "types", ["maj", "min"]).filter((t) => Object.hasOwn(CHORDS, t));
  const roots = pList<unknown>(p, "roots", ["C", "F", "G"]).filter(isPitchClass);
  const c: ChordRef = { root: parsePitchClass(roots.length ? pick(rng, roots) : "C"), type: types.length ? pick(rng, types) : "maj" };
  const notes = chordNotes(c, 4);
  let midis = notes.map(toMidi);
  while (Math.max(...midis) > 72) midis = midis.map((m) => m - 12);
  return {
    prompt: `Build ${chordKind(c.type)} on ${pcLabel(c.root)}: select its notes on the keyboard, then check.`,
    stimuli: [{ type: "text", text: `${cap(chordKind(c.type).replace(/^an? /, ""))} on ${pcLabel(c.root)}` }],
    response: { type: "keyboard", range: [48, 72], mode: "set", labels: "none" },
    expected: { type: "notes", midis: chordPcs(c).map((x) => 60 + x), match: "pc", ordered: false },
    explain: chordWhy(c),
    reveal: arpThenChord(midis),
  };
};

function sigLabel(count: number): string {
  return count === 0 ? "No sharps or flats" : plural(Math.abs(count), count > 0 ? "sharp" : "flat");
}

export const buildKeySignature: Generator = (p, rng) => {
  const { key, count, mode } = pickKey(p, rng);
  const k = parseKey(key);
  const cands = uniq([count - 2, count - 1, count + 1, count + 2, -count].filter((n) => n >= -7 && n <= 7 && n !== count));
  const counts = [count, ...shuffle(rng, cands).slice(0, 4)].sort((a, b) => a - b);
  const sig = keySignature(key);
  const listed = sig.letters.map((l) => l + accSymbol(Math.sign(sig.count))).join(", ");
  return {
    prompt: `How many sharps or flats are in the key signature of ${pcLabel(k.tonic)} ${mode}?`,
    stimuli: [{ type: "text", text: `${pcLabel(k.tonic)} ${mode}` }],
    response: { type: "choice", choices: counts.map((n) => choice(String(n), sigLabel(n))) },
    expected: { type: "choice", id: String(count) },
    explain: count === 0 ? `${pcLabel(k.tonic)} ${mode} uses only the natural notes, so its key signature is empty.` : `${pcLabel(k.tonic)} ${mode} has ${sigLabel(count).toLowerCase()}: ${listed}.`,
    reveal: melodic(scaleNotes({ ...k.tonic, oct: 4 }, mode === "minor" ? "natural-minor" : "major", true).map(toMidi), "piano", 0.5),
  };
};
