---
id: core-0-octave
title: The octave
track: core
level: 0
order: 7
concepts: [octave]
summary: Doubling a frequency gives a note so similar to the first that it gets the same name.
exercises:
  - kind: ear-same-note
    concept: octave
    vocab: plain
    count: 6
    timbre: piano
  - kind: quiz
    concept: octave
    count: 4
    questions:
      - q: A note has a frequency of 220 Hz. What is the frequency of the note one octave above it?
        choices: [230 Hz, 330 Hz, 440 Hz]
        answer: 3
        explain: Going up an octave doubles the frequency.
      - q: A note has a frequency of 440 Hz. What is the frequency of the note one octave below it?
        choices: [220 Hz, 400 Hz, 110 Hz]
        answer: 1
        explain: Going down an octave halves the frequency.
      - q: A note is at 110 Hz. What is the frequency two octaves above it?
        choices: [220 Hz, 330 Hz, 440 Hz]
        answer: 3
        explain: Each octave doubles, so two octaves is times four. 110, then 220, then 440.
      - q: What is the frequency ratio of an octave?
        choices: ["2:1", "3:2", "10:1"]
        answer: 1
        explain: The upper note of an octave vibrates exactly twice for every one vibration of the lower note.
      - q: Why do two notes an octave apart blend so well?
        choices: [They are equally loud, Every harmonic of the upper note is already a harmonic of the lower note, They have no harmonics]
        answer: 2
        explain: The upper note's harmonics (2, 4, 6 … times the lower fundamental) all sit exactly on harmonics of the lower note.
      - q: Which harmonic of a note lies exactly one octave above its fundamental?
        choices: [The second, The third, The fifth]
        answer: 1
        explain: The second harmonic has twice the fundamental's frequency, which is one octave up.
---

Earlier you saw that 110, 220, 440 and 880 Hz are all called A. Each is double the one before. Doubling a frequency produces a note that sounds higher, yet somehow the *same* note again. The distance between a note and the note at double its frequency is called an **octave**.

Listen to the two tones below, first one after the other and then together.

```widget
type: consonance
base: A3
ratios: ["2:1"]
```

Together they blend so completely that it can be hard to tell there are two notes at all. Look at the two ladders of harmonics: every harmonic of the upper note lands exactly on a harmonic of the lower one. The upper note adds nothing new. It only strengthens what is already there.

> An octave is a frequency ratio of 2 to 1. Notes an octave apart sound alike and share the same letter name.

## Octaves across the keyboard

Each highlighted key below is an A. Play them from left to right.

```widget
type: keyboard
range: [A1, A5]
highlight: [A1, A2, A3, A4, A5]
labels: none
```

Their frequencies are 55, 110, 220, 440 and 880 Hz. Notice that the keys are evenly spaced even though the frequencies are not: each step to the right adds the same distance on the keyboard but *doubles* the frequency. Our ears judge pitch by ratio, not by difference. Going from 55 to 110 Hz feels like the same size of step as going from 440 to 880 Hz.

## The octave inside every note

You have met the octave already without its name. The second harmonic of a string vibrates at twice the fundamental, so it is one octave up. The fourth harmonic is two octaves up, and the eighth is three. Every note you hear already contains its own higher octaves.

Since octaves repeat, all of music's variety has to fit *inside* one octave. Level 1 is about how that space is divided up.
