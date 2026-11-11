import { diatonicIndex, parsePitch, type Letter, type Pitch } from "./notes.ts";
import type { KeySignature } from "./scales.ts";

// Where things sit on a five-line staff. A staff position counts lines AND
// spaces upward from the bottom line: 0 = bottom line, 1 = the space above
// it, 2 = second line … 8 = top line. Negative and >8 positions need ledger
// lines.

export type Clef = "treble" | "bass";

/** The pitch on the bottom line of each clef. */
const BOTTOM_LINE: Record<Clef, Pitch> = {
  treble: { letter: "E", acc: 0, oct: 4 },
  bass: { letter: "G", acc: 0, oct: 2 },
};

export function staffPosition(p: Pitch | string, clef: Clef): number {
  const pitch = typeof p === "string" ? parsePitch(p) : p;
  return diatonicIndex(pitch) - diatonicIndex(BOTTOM_LINE[clef]);
}

/** The natural pitch at a staff position (the inverse of staffPosition,
 *  ignoring accidentals). */
export function pitchAtPosition(pos: number, clef: Clef): Pitch {
  const idx = diatonicIndex(BOTTOM_LINE[clef]) + pos;
  const letters: Letter[] = ["C", "D", "E", "F", "G", "A", "B"];
  return { letter: letters[((idx % 7) + 7) % 7], acc: 0, oct: Math.floor(idx / 7) };
}

/** Staff positions of the ledger lines a note at `pos` needs (empty when it
 *  sits on the staff). Middle C in treble clef is position -2 → [-2]. */
export function ledgerLines(pos: number): number[] {
  const out: number[] = [];
  for (let p = -2; p >= pos; p -= 2) out.push(p);
  for (let p = 10; p <= pos; p += 2) out.push(p);
  return out;
}

/** Stems go down from the middle line upward. */
export function stemUp(pos: number): boolean {
  return pos < 4;
}

/** The clef a pitch reads most comfortably in on a grand staff: middle C and
 *  above go in the treble. */
export function clefFor(p: Pitch | string): Clef {
  const pitch = typeof p === "string" ? parsePitch(p) : p;
  return diatonicIndex(pitch) >= diatonicIndex({ letter: "C", acc: 0, oct: 4 }) ? "treble" : "bass";
}

// Key signatures are written at fixed heights, not wherever the note happens
// to fall. These are the treble-clef positions; bass clef is two lower.
const SHARP_POS = [8, 5, 9, 6, 3, 7, 4]; // F C G D A E B
const FLAT_POS = [4, 7, 3, 6, 2, 5, 1]; // B E A D G C F

/** Staff positions of a key signature's accidentals, in written order. */
export function keySignaturePositions(sig: KeySignature, clef: Clef): number[] {
  const src = sig.count >= 0 ? SHARP_POS : FLAT_POS;
  const shift = clef === "bass" ? -2 : 0;
  return src.slice(0, Math.abs(sig.count)).map((p) => p + shift);
}

/** Whether a note needs an accidental drawn in a key: returns the accidental
 *  to draw (-1 flat, 0 natural, 1 sharp …) or null when the key signature
 *  already says it. Ignores accidentals carried through a bar. */
export function accidentalToDraw(p: Pitch, sig: KeySignature): number | null {
  const inSig = sig.letters.includes(p.letter) ? Math.sign(sig.count) : 0;
  return p.acc === inSig ? null : p.acc;
}
