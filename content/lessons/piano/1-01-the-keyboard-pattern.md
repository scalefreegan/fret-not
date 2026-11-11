---
id: piano-1-pattern
title: The keyboard pattern
track: piano
level: 1
order: 1
mirrors: core-1-alphabet
concepts: [keyboard-pattern]
summary: The black keys come in twos and threes, and that repeating pattern is how you find any note.
exercises:
  - kind: play-note
    concept: keyboard-pattern
    title: Find a C
    count: 3
    instrument: piano
    from: name
    range: [C4, C4]
    anyOctave: true
  - kind: play-note
    concept: keyboard-pattern
    title: Find an F
    count: 3
    instrument: piano
    from: name
    range: [F4, F4]
    anyOctave: true
  - kind: quiz
    concept: keyboard-pattern
    count: 4
    questions:
      - q: How are the black keys grouped along the keyboard?
        choices: [In twos and threes, alternating, In threes only, In pairs only]
        answer: 1
        explain: A group of two black keys, then a group of three, then two again, all the way along.
      - q: Where is C?
        choices: [Just left of a group of two black keys, Just left of a group of three black keys, Between the two black keys of a pair]
        answer: 1
        explain: Every C is the white key immediately to the left of a group of two black keys.
      - q: Where is F?
        choices: [Just left of a group of two black keys, Just left of a group of three black keys, Just right of a group of three black keys]
        answer: 2
        explain: Every F is the white key immediately to the left of a group of three black keys.
      - q: Which white key sits between the two black keys of a pair?
        choices: [C, D, E]
        answer: 2
        explain: The pair of black keys has C on its left, D in the middle and E on its right.
      - q: On a piano, which direction is higher in pitch?
        choices: [To the right, To the left]
        answer: 1
        explain: Strings get shorter and pitch rises as you move to the right.
      - q: How many keys, black and white together, are there from one C up to (but not including) the next C?
        choices: [7, 8, 12]
        answer: 3
        explain: Seven white and five black, the twelve notes.
      - q: Why are there two places in each octave with no black key between white keys?
        choices: [E to F and B to C are already a half step apart, To save space, Those black keys are hidden under the lid]
        answer: 1
        explain: A black key is the half step between two white keys a whole step apart. E to F and B to C are half steps already.
---

A piano keyboard looks like a long row of identical keys, but it has a pattern that repeats every octave, and once you see it you can never be lost.

Ignore the white keys for a moment and look only at the black ones.

```widget
type: keyboard
range: [C2, C6]
labels: none
```

The black keys come in groups: **two**, then **three**, then two, then three. One group of two plus one group of three, with the seven white keys around them, is one octave. Then the whole thing repeats. Higher notes are to the right and lower notes to the left.

## Two landmarks

Every white key can be found from its position against the black-key groups. Start with two:

- **C** is the white key just to the left of a group of **two**.
- **F** is the white key just to the left of a group of **three**.

Play the marked keys below. All the Cs sound like the same note at different heights, and so do all the Fs.

```widget
type: keyboard
range: [C2, C6]
highlight: [C2, C3, C4, C5, C6, F2, F3, F4, F5]
labels: c
```

> Black keys come in twos and threes. C is left of the two. F is left of the three.

## Why the pattern is uneven

The gaps in the black keys are not decoration. They are the fact from the core lessons made visible. A black key is the half step between two white keys that are a whole step apart. E and F are already a half step apart, and so are B and C, so nothing fits between them. Those two gaps are what break the black keys into a two and a three.

If the keyboard had a black key in every gap, all twelve notes would look alike and you would have no way to tell where you were.
