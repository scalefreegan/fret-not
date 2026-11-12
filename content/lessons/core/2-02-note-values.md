---
id: core-2-note-values
title: Note values
track: core
level: 2
order: 2
concepts: [note-values]
summary: The shape of a note tells you how many beats it lasts.
exercises:
  - kind: name-duration
    concept: note-values
    title: Name the note value
    count: 6
    values: [w, h, q, e]
    ask: name
  - kind: name-duration
    concept: note-values
    title: How many beats?
    count: 6
    values: [w, h, q, e]
    ask: beats
  - kind: ear-rhythm
    concept: note-values
    count: 4
    values: [h, q]
    tempo: 80
  - kind: tap-rhythm
    concept: note-values
    count: 4
    values: [h, q]
    tempo: 72
---

A written note tells you two things. Its height on the page says *which* pitch (that comes later in this level). Its **shape** says *how long* it lasts, counted in beats.

The four most common shapes each last half as long as the one before:

- A **whole note** is an empty oval. It lasts **4 beats**.
- A **half note** is an empty oval with a stem. It lasts **2 beats**.
- A **quarter note** is a filled oval with a stem. It lasts **1 beat**.
- An **eighth note** is a filled oval with a stem and a flag. It lasts **half a beat**, so two of them fit in one beat.

Play this and watch the cursor. The numbers underneath are the beats. Notice how the whole note sits there for four of them.

```widget
type: rhythm
pattern: "w | h h | q q q q | e e e e e e e e"
tempo: 80
```

Each line of that example fills the same amount of time: one whole note, two half notes, four quarter notes, or eight eighth notes.

> The names are fractions of a whole note. Two halves, four quarters or eight eighths make one whole.

## Mixing them

Real rhythms mix the shapes. Play this one, then press tap-along and tap it (space bar, or the tap pad on a touch screen). A long note gets one tap: you tap when it *starts* and wait while it lasts.

```widget
type: rhythm
pattern: "q q h | h q q | q q q q | w"
tempo: 80
tap: true
```

A "beat" here is a quarter note. That is the usual choice, and it is the one this app uses throughout.
