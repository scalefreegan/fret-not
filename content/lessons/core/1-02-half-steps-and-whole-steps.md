---
id: core-1-steps
title: Half steps and whole steps
track: core
level: 1
order: 2
concepts: [half-whole-steps]
summary: The half step is the smallest distance between two notes, and two of them make a whole step.
exercises:
  - kind: name-interval
    concept: half-whole-steps
    vocab: letters
    count: 6
    view: keyboard
    intervals: [m2, M2]
    labels: steps
  - kind: ear-interval
    concept: half-whole-steps
    vocab: letters
    count: 6
    intervals: [m2, M2]
    mode: melodic
    labels: steps
  - kind: build-interval
    concept: half-whole-steps
    vocab: letters
    count: 5
    intervals: [m2, M2]
    direction: up
    instrument: piano
    labels: steps
  - kind: quiz
    concept: half-whole-steps
    count: 3
    questions:
      - q: Which two pairs of natural notes are only a half step apart?
        choices: [E to F and B to C, C to D and F to G, A to B and D to E]
        answer: 1
        explain: There is no black key between E and F or between B and C, so those neighbours are a half step apart.
      - q: How many half steps make a whole step?
        choices: [1, 2, 3]
        answer: 2
        explain: A whole step is two half steps.
      - q: From C up to D is
        choices: [a half step, a whole step]
        answer: 2
        explain: There is a black key between C and D, so C to D is two half steps, a whole step.
      - q: How many half steps are there in one octave?
        choices: [7, 8, 12]
        answer: 3
        explain: Counting every key, black and white, from one C up to the next C takes twelve half steps.
---

Look at a keyboard and count every key from one C up to the next, black and white together. There are twelve steps. Each one, from any key to its nearest neighbour, is a **half step**. It is the smallest distance between notes in almost all the music you know.

Play the two marked keys, E and F. Then play each neighbouring pair of keys going up from C, black keys included.

```widget
type: keyboard
range: [C4, C5]
highlight: [E4, F4]
labels: naturals
```

Two half steps make a **whole step**. C to D is a whole step, because a black key sits between them. E to F is only a half step, because nothing sits between them.

> A half step is from one key to the very next key, black or white. A whole step is two half steps.

## The white keys are unevenly spaced

This is the single most useful fact about the seven natural notes. Going up from C:

- C to D: whole step
- D to E: whole step
- **E to F: half step**
- F to G: whole step
- G to A: whole step
- A to B: whole step
- **B to C: half step**

The white keys look evenly spaced, but they are not evenly spaced in sound. Most neighbours are a whole step apart, while E–F and B–C are a half step apart. Those are exactly the two places with no black key in between.

## Hear the difference

Below, the upper note starts a half step above the lower one. Play them one after the other. Then press the key one further to the right to make it a whole step, and compare.

```widget
type: interval
from: E4
to: F4
interactive: true
views: [keyboard]
labels: steps
```

A half step is tight and close, the clashing sound from the end of Level 0 when the two notes are played together. A whole step is still close but more relaxed. You may hear other names for these: a half step is also called a *semitone* and a whole step a *tone*.
