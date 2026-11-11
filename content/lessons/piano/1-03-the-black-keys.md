---
id: piano-1-black-keys
title: The black keys
track: piano
level: 1
order: 3
mirrors: core-1-sharps-flats
concepts: [keyboard-accidentals]
summary: Each black key is the sharp of the white key on its left and the flat of the white key on its right.
exercises:
  - kind: name-note
    concept: keyboard-accidentals
    count: 10
    view: keyboard
    range: [C3, C5]
    accidentals: true
  - kind: play-note
    concept: keyboard-accidentals
    count: 10
    instrument: piano
    from: name
    range: [C3, B4]
    accidentals: true
    anyOctave: true
  - kind: quiz
    concept: keyboard-accidentals
    count: 4
    questions:
      - q: What are the two black keys in the group of two called, using sharps?
        choices: [C♯ and D♯, D♯ and E♯, F♯ and G♯]
        answer: 1
        explain: The group of two sits between C, D and E, so its keys are C sharp and D sharp.
      - q: What are the three black keys in the group of three called, using flats?
        choices: [D♭ E♭ F♭, G♭ A♭ B♭, F♭ G♭ A♭]
        answer: 2
        explain: The group of three sits between F, G, A and B. Named from the white key on the right, they are G flat, A flat and B flat.
      - q: Which black key is immediately to the right of F?
        choices: [F♯, E♯, F♭]
        answer: 1
        explain: The key a half step above F is F sharp, also called G flat.
      - q: Which black key is immediately to the left of B?
        choices: [B♯, B♭, A♭]
        answer: 2
        explain: The key a half step below B is B flat, also called A sharp.
      - q: The middle black key of the group of three is
        choices: [F♯ or G♭, G♯ or A♭, A♯ or B♭]
        answer: 2
        explain: It sits between G and A, so it is G sharp or A flat.
      - q: Which of these is a white key?
        choices: [E♭, F♭, G♭]
        answer: 2
        explain: F flat is a half step below F, which is the white key E. E flat and G flat are black keys.
---

The core track showed that a sharp raises a note by a half step and a flat lowers it by a half step. On the piano that turns into a simple rule of position:

- the black key to the **right** of a white key is that note's **sharp**
- the black key to the **left** of a white key is that note's **flat**

So every black key has two names, one borrowed from each neighbour. Play the black keys below and read both names.

```widget
type: keyboard
range: [C4, C5]
labels: all
```

## The group of two

The two black keys sit among C, D and E:

- the left one is **C♯** or **D♭**
- the right one is **D♯** or **E♭**

## The group of three

The three black keys sit among F, G, A and B:

- the left one is **F♯** or **G♭**
- the middle one is **G♯** or **A♭**
- the right one is **A♯** or **B♭**

> Right of a white key is its sharp. Left of a white key is its flat. Five black keys, ten names.

## Sharps and flats are directions, not colours

It is tempting to think "sharp means black key". Usually it does, but the real meaning is "a half step up". A half step above E is the white key F, and a half step below C is the white key B. That is why E♯ and C♭ exist as names, even though they are rare.

Click a few black keys below and watch where each falls on the guitar, where there is nothing black or white about it.

```widget
type: linked
notes: [F#4]
views: [keyboard, fretboard]
interactive: true
```
