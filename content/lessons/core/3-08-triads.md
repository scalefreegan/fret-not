---
id: core-3-triads
title: Major and minor triads
track: core
level: 3
order: 8
concepts: [triads]
summary: A triad is three notes stacked in thirds. The order of the two thirds makes it major or minor.
exercises:
  - kind: build-chord
    concept: triads
    title: Build major triads
    count: 5
    types: [maj]
    roots: [C, F, G, D, A, E]
  - kind: build-chord
    concept: triads
    title: Build major and minor triads
    count: 6
    types: [maj, min]
    roots: [C, D, E, F, G, A]
  - kind: ear-chord
    concept: triads
    title: Major or minor?
    count: 8
    types: [maj, min]
  - kind: name-chord
    concept: triads
    title: Major or minor, by sight
    count: 5
    view: keyboard
    types: [maj, min]
    roots: [C, D, E, F, G, A]
    qualityOnly: true
---

A **chord** is several notes sounded together. The simplest and most important chords have three notes and are called **triads**.

A triad is built by **stacking thirds**: pick a note, add the note a third above it, then add the note a third above that. On the white keys this means play one, skip one, play one, skip one, play one.

```widget
type: chord
symbol: C
views: [staff, keyboard]
```

The three notes have names:

- The **root** is the note the chord is built on and named after. Here it is C.
- The **third** is a third above the root. Here, E.
- The **fifth** is a fifth above the root. Here, G.

On the staff, a triad in this basic position looks like a snowman: three notes on three neighbouring lines, or three neighbouring spaces.

## Major and minor

There are two kinds of third, major (4 half steps) and minor (3 half steps). The order you stack them in decides the character of the triad.

- **Major triad**: a major third on the bottom, then a minor third on top. Root, +4 half steps, +3 half steps. C–E–G.
- **Minor triad**: a minor third on the bottom, then a major third on top. Root, +3 half steps, +4 half steps. C–E♭–G.

In both, the root and fifth are a perfect fifth apart (7 half steps). **Only the middle note differs**, by a single half step.

> Major triad: 4 half steps, then 3. Minor triad: 3 half steps, then 4. The outer notes are the same. The third decides.

Change this chord between major and minor and listen to the middle note move. Major sounds bright and settled. Minor sounds darker.

```widget
type: chord
symbol: Cm
views: [staff, keyboard]
interactive: true
```

## Triads from the white keys

Build a play-one-skip-one triad on each white key and you get a mix of major and minor triads, because the thirds between white keys are not all the same size.

- On **C, F and G** the triad is **major**: C–E–G, F–A–C, G–B–D.
- On **D, E and A** the triad is **minor**: D–F–A, E–G–B, A–C–E.

Hear them one after another:

```widget
type: progression
chords: "C Dm Em F G Am"
tempo: 72
views: [staff, keyboard]
```

(The triad on B, B–D–F, is neither major nor minor. Its fifth is too small. It is called diminished and can wait.)

To make a major triad on D, E or A, raise the middle note a half step to a black key: D–F♯–A, E–G♯–B, A–C♯–E. In the exercises, count half steps from the root: 4 then 3 for major, 3 then 4 for minor.
