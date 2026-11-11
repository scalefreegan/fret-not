---
id: core-3-major-scale
title: The major scale
track: core
level: 3
order: 4
concepts: [major-scale]
summary: Seven notes in a fixed pattern of whole and half steps. Most Western music is built on it.
exercises:
  - kind: build-scale
    concept: major-scale
    title: Build it from the pattern
    count: 5
    types: [major]
    tonics: [C, G, F, D]
  - kind: quiz
    concept: major-scale
    count: 3
    questions:
      - q: What is the pattern of steps in a major scale?
        choices: [W W H W W W H, W H W W H W W, W W W H W W H]
        answer: 1
        explain: "Whole, whole, half, whole, whole, whole, half. The half steps come after the third and seventh notes."
      - q: In any major scale, between which notes are the two half steps?
        choices: ["2–3 and 6–7", "3–4 and 7–8", "1–2 and 5–6"]
        answer: 2
        explain: "The pattern W W H W W W H puts the half steps between notes 3 and 4 and between 7 and 8."
      - q: The G major scale is G A B C D E and then which note before the top G?
        choices: [F, F sharp, G flat]
        answer: 2
        explain: The seventh note must be a half step below G, and the scale needs one of each letter, so it is F sharp.
      - q: The F major scale begins F G A. What is the fourth note?
        choices: [B, B flat, A sharp]
        answer: 2
        explain: The step from the third note to the fourth must be a half step. A half step above A is B flat, and it must be spelled as a B because the scale uses each letter once.
      - q: How many different notes are in a major scale before it repeats at the octave?
        choices: [5, 7, 12]
        answer: 2
        explain: Seven notes, one for each letter name. The eighth is the starting note again, an octave up.
  - kind: play-scale
    concept: major-scale
    count: 3
    instrument: piano
    types: [major]
    tonics: [C, G, F]
---

A **scale** is a set of notes arranged in order from low to high, used as the raw material for a piece of music. Out of the twelve notes available, most tunes use only seven at a time. The most common choice of seven is the **major scale**. "Do re mi fa sol la ti do" is a major scale.

Play this one up and down. It is the C major scale: every white key from one C to the next.

```widget
type: scale
tonic: C
scale: major
views: [staff, keyboard]
```

## The pattern

Look at the steps between neighbouring notes, marked under the scale above. Most are whole steps (two keys apart, with a key in between). Two are half steps (adjacent keys): **E to F** and **B to C**, the two places with no black key between the white keys.

Writing **W** for a whole step and **H** for a half step, the major scale is:

> W W H W W W H

That pattern *is* the major scale. Start on any of the twelve notes, follow whole-whole-half-whole-whole-whole-half, and you get a major scale that sounds like the same tune moved higher or lower.

The half steps always fall between notes **3 and 4** and between notes **7 and 8**.

## Starting somewhere else

Change the tonic in this widget to G and look at what happens to the seventh note.

```widget
type: scale
tonic: C
scale: major
views: [staff, keyboard]
interactive: true
```

Starting on G, the white keys work until the end: E to F is only a half step where the pattern needs a whole step. So F is raised to **F♯**. That also leaves the required half step from F♯ up to G.

Now set the tonic to F. This time the fourth note is the problem: A to B is a whole step where the pattern wants a half step, so B is lowered to **B♭**.

Try a few more tonics. The notes change, but the row of W and H steps underneath never does.

## One of each letter

A major scale always uses **each letter name exactly once**. That is why the black key in G major is called F♯, not G♭ (there is already a G), and the one in F major is called B♭, not A♯ (there is already an A).

The note a scale starts on, and feels at rest on, is its **tonic**. The scale takes its name from it. Play this tune: it uses only notes of C major and comes home to C at the end.

```widget
type: melody
title: Frère Jacques (traditional French round), in C major
notes: "C4:q D4:q E4:q C4:q | C4:q D4:q E4:q C4:q | E4:q F4:q G4:h | E4:q F4:q G4:h | G4:e A4:e G4:e F4:e E4:q C4:q | G4:e A4:e G4:e F4:e E4:q C4:q | C4:q G3:q C4:h | C4:q G3:q C4:h"
tempo: 108
```
