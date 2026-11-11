---
id: guitar-1-frets
title: Each fret is a half step
track: guitar
level: 1
order: 2
mirrors: core-1-steps
concepts: [frets-half-steps]
summary: Moving one fret along a string moves one half step, so two frets make a whole step and twelve make an octave.
exercises:
  - kind: name-interval
    concept: frets-half-steps
    count: 6
    view: fretboard
    intervals: [m2, M2]
    labels: steps
  - kind: build-interval
    concept: frets-half-steps
    count: 6
    intervals: [m2, M2]
    direction: both
    instrument: guitar
    labels: steps
  - kind: quiz
    concept: frets-half-steps
    count: 5
    questions:
      - q: You move your finger one fret toward the body along the same string. The note goes
        choices: [up a half step, up a whole step, down a half step]
        answer: 1
        explain: Each fret toward the body shortens the string and raises the pitch by one half step.
      - q: How many frets make a whole step?
        choices: [1, 2, 3]
        answer: 2
        explain: A whole step is two half steps, so two frets.
      - q: The open string 6 is E. What note is at fret 1?
        choices: [E♯ or F, F♯, G]
        answer: 1
        explain: One half step above E is F. E and F are natural neighbours with no sharp between them.
      - q: The open string 5 is A. What note is at fret 2?
        choices: [A♯, B, C]
        answer: 2
        explain: Two frets is a whole step, and a whole step above A is B.
      - q: The open string 5 is A. What note is at fret 3?
        choices: [B, C, C♯]
        answer: 2
        explain: Fret 2 is B, and B to C is only a half step, so fret 3 is C.
      - q: At which fret does a string sound one octave above its open note?
        choices: [Fret 7, Fret 10, Fret 12]
        answer: 3
        explain: Twelve half steps make an octave. The 12th fret is also the midpoint of the string.
      - q: Open string 6 is E. On that string, E to F and F to G are how many frets?
        choices: [One fret, then two frets, Two frets, then two frets, One fret, then one fret]
        answer: 1
        explain: E to F is a half step (one fret). F to G is a whole step (two frets).
---

In Level 0 you saw that pressing a string behind a fret shortens it and raises its pitch. The frets are spaced so that each one raises the pitch by exactly one **half step**. That makes the guitar very regular:

- one fret is a half step
- two frets are a whole step
- twelve frets are an octave

Play the marked positions on the low E string below, from left to right.

```widget
type: fretboard
frets: 12
positions: ["6/0", "6/1", "6/2", "6/3", "6/4", "6/5"]
labels: all
```

Open E, then F, F♯, G, G♯, A. Every fret is the next of the twelve notes. There are no black and white keys here, so sharps and flats look exactly like any other note.

> One fret is one half step, on every string, everywhere on the neck.

## Finding the natural notes

Since every fret is a half step, the natural notes are not evenly spaced along a string. Most are two frets apart. But E–F and B–C are only a half step apart, so they sit on neighbouring frets.

The natural notes on the A string are marked below. Play them in order and notice where they sit next to each other.

```widget
type: fretboard
frets: 12
positions: ["5/0", "5/2", "5/3", "5/5", "5/7", "5/8", "5/10", "5/12"]
labels: naturals
```

A, B, C, D, E, F, G, A. B and C are neighbours (frets 2 and 3) and so are E and F (frets 7 and 8). Everything else is two frets apart. At fret 12 you arrive back at A, an octave above the open string.

## Compare with the keyboard

Click along one string below and watch the keyboard. One fret always moves to the very next key, whether that key is black or white.

```widget
type: linked
notes: [A2]
views: [fretboard, keyboard]
interactive: true
```

Real guitars help you count: most have dots on the neck at frets 3, 5, 7 and 9, and a double dot at fret 12, the octave.
