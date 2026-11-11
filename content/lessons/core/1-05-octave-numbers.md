---
id: core-1-octave-numbers
title: Octave numbers and middle C
track: core
level: 1
order: 5
concepts: [octave-numbers]
summary: A number after the letter says which octave a note is in, and C4 is middle C.
exercises:
  - kind: play-note
    concept: octave-numbers
    count: 8
    instrument: piano
    from: name
    range: [C3, B5]
    anyOctave: false
  - kind: quiz
    concept: octave-numbers
    count: 5
    questions:
      - q: Which note is middle C?
        choices: [C3, C4, C5]
        answer: 2
        explain: Middle C is C4, at about 261.6 Hz.
      - q: Going up the white keys, which note comes straight after B3?
        choices: [C3, C4, A4]
        answer: 2
        explain: The octave number changes at C, so the note after B3 is C4.
      - q: Going down, which note comes just below C4?
        choices: [B4, B3, C3]
        answer: 2
        explain: Everything from C4 up to B4 is octave 4. Just below C4 is the top of octave 3, which is B3.
      - q: Which is higher, A3 or C4?
        choices: [A3, C4]
        answer: 2
        explain: Octave 4 starts at C4. A3 is in the octave below it, two white keys under C4.
      - q: A4 is 440 Hz. What is A3?
        choices: [220 Hz, 330 Hz, 880 Hz]
        answer: 1
        explain: A3 is one octave below A4, so its frequency is half.
      - q: How far apart are C2 and C5?
        choices: [Two octaves, Three octaves, Five octaves]
        answer: 2
        explain: C2 to C3, C3 to C4 and C4 to C5 make three octaves.
      - q: Which of these notes is in the same octave as G4?
        choices: [B3, D4, C5]
        answer: 2
        explain: Octave 4 runs from C4 up to B4. D4 is inside it. B3 is just below and C5 just above.
---

A piano has eight different keys called C. To say which one you mean, add a number after the letter: C1, C2, C3 and so on. The number is the **octave number**.

The C keys below are labelled. Play them from left to right.

```widget
type: keyboard
range: [C2, C6]
labels: c
```

Each numbered C begins a new octave. Every note from that C up to the next B carries the same number:

C4, D4, E4, F4, G4, A4, B4, and then **C5**.

> The octave number goes up at C, not at A. The note after B3 is C4.

That is the one thing that trips people up. The alphabet starts at A, but the octaves are counted from C.

## Middle C

**C4** is known as **middle C**. It sits near the middle of the piano keyboard, at about 261.6 Hz, and it is the usual reference point for finding everything else. The A that orchestras tune to, 440 Hz, is **A4**: the A above middle C.

Click around the instruments below and watch the octave number in the note's name.

```widget
type: linked
notes: [C4]
views: [keyboard, fretboard]
interactive: true
```

Middle C is roughly in the middle of a piano but fairly high on a guitar. The guitar's lowest string is E2, more than an octave and a half below middle C, and its highest open string is E4.

From here on, lessons write notes with their octave numbers whenever the exact octave matters.
