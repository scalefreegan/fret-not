---
id: piano-3-major-scales
title: Major scales on the keyboard
track: piano
level: 3
order: 1
mirrors: core-3-major-scale
concepts: [piano-scales]
summary: See C, G, D and F major as shapes on the keys, each with its own black keys.
exercises:
  - kind: play-scale
    concept: piano-scales
    title: C and G major
    count: 4
    instrument: piano
    types: [major]
    tonics: [C, G]
  - kind: play-scale
    concept: piano-scales
    title: C, G, D and F major
    count: 6
    instrument: piano
    types: [major]
    tonics: [C, G, D, F]
  - kind: build-scale
    concept: piano-scales
    count: 4
    types: [major]
    tonics: [D, A, F, Bb]
  - kind: quiz
    concept: piano-scales
    count: 3
    questions:
      - q: Which black keys does the G major scale use?
        choices: [None, F sharp only, F sharp and C sharp]
        answer: 2
        explain: "G A B C D E F sharp. One sharp, the black key just below the top G."
      - q: Which black keys does the D major scale use?
        choices: [F sharp only, F sharp and C sharp, B flat only]
        answer: 2
        explain: "D E F sharp G A B C sharp. Its key signature has two sharps."
      - q: Which black key does the F major scale use?
        choices: [F sharp, B flat, E flat]
        answer: 2
        explain: "F G A B flat C D E. The fourth note is lowered to keep the half step between notes 3 and 4."
      - q: You are playing up a major scale and have just played the third note. How far is the next key?
        choices: [A half step, A whole step]
        answer: 1
        explain: "W W H: after two whole steps comes the first half step, from note 3 to note 4."
---

The pattern of a major scale never changes: whole, whole, half, whole, whole, whole, half. But the keyboard is not even, so the same pattern makes a different **shape** of white and black keys depending on where it starts. Pianists come to know each scale as a shape under the hand.

## C major: all white

C is the one starting note where the pattern lands on white keys only. The keyboard is laid out around this scale.

```widget
type: keyboard
range: [C4, C5]
highlight: [C4, D4, E4, F4, G4, A4, B4, C5]
labels: naturals
```

Play it up from C. Feel the two places where the next white key is right next door with no black key between: E to F and B to C. Those are the scale's two half steps.

## G major: one black key

Starting on G, everything is white until the seventh note. The pattern needs a whole step from E, so F is skipped in favour of **F♯**, the lowest of the group of three black keys.

```widget
type: keyboard
range: [G3, G4]
highlight: [G3, A3, B3, C4, D4, E4, F#4, G4]
labels: all
```

## D major: two black keys

D major keeps G major's F♯ and adds **C♯**. Its shape is tidy: the third note and the seventh note are black, each sitting just below a white-key half-step neighbour (F♯ below G, C♯ below D).

```widget
type: keyboard
range: [D4, D5]
highlight: [D4, E4, F#4, G4, A4, B4, C#5, D5]
labels: all
```

## F major: one flat

F major goes the other way. Its only black key is the fourth note, **B♭**, the highest of the group of three black keys.

```widget
type: keyboard
range: [F3, F4]
highlight: [F3, G3, A3, Bb3, C4, D4, E4, F4]
labels: all
```

> C major: no black keys. G major: F♯. D major: F♯ and C♯. F major: B♭.

These match the key signatures exactly. A key signature is a list of which black keys the scale uses.

## Any tonic

Change the tonic here and watch the shape of white and black keys change while the row of whole and half steps stays the same. Try A (three black keys) and B♭ (two).

```widget
type: scale
tonic: G
scale: major
views: [keyboard, staff]
interactive: true
```

Then play the scales yourself on this keyboard.

```widget
type: keyboard
range: [C3, C5]
labels: c
```

In the exercises you play each scale upward for one octave, starting on its tonic. Say "whole, whole, half, whole, whole, whole, half" as you go until the shapes are familiar.
