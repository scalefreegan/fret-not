---
id: core-1-twelve
title: The twelve notes
track: core
level: 1
order: 4
concepts: [twelve-notes]
summary: Seven naturals and five sharps or flats make twelve equally spaced notes that repeat in every octave.
exercises:
  - kind: play-note
    concept: twelve-notes
    count: 8
    instrument: piano
    from: name
    range: [C4, B4]
    accidentals: true
  - kind: build-interval
    concept: twelve-notes
    vocab: names
    count: 5
    intervals: [m2, M2]
    direction: both
    instrument: piano
    labels: steps
  - kind: quiz
    concept: twelve-notes
    count: 4
    questions:
      - q: How many different notes are there in one octave before the names repeat?
        choices: [7, 8, 12]
        answer: 3
        explain: Seven naturals plus five sharps or flats make twelve.
      - q: Starting on C and going up one half step at a time, what are the first five notes?
        choices: [C C♯ D D♯ E, C D E F G, C C♯ D E F]
        answer: 1
        explain: Every half step counts, so the black keys are included. C, C sharp, D, D sharp, E.
      - q: What is a scale that uses all twelve notes in order called?
        choices: [The chromatic scale, The natural scale, The harmonic series]
        answer: 1
        explain: Moving by half steps through all twelve notes is the chromatic scale.
      - q: Going up twelve half steps from any note brings you to
        choices: [the same note an octave higher, a note a whole step higher, the highest note on the instrument]
        answer: 1
        explain: Twelve half steps make one octave, which doubles the frequency and returns to the same note name.
      - q: In standard modern tuning, how does the frequency change with each half step up?
        choices: [It rises by the same number of hertz each time, It is multiplied by the same number each time, It doubles each time]
        answer: 2
        explain: Each half step multiplies the frequency by the same amount, about 1.0595. Twelve of those multiplications make exactly 2.
      - q: Going up from A by half steps, which note comes after A sharp?
        choices: [B, B sharp, C]
        answer: 1
        explain: A sharp is the black key between A and B, so the next half step up is B.
---

Put the last three lessons together. Inside one octave there are seven natural notes and five notes between them. That makes **twelve notes** in all, each a half step from the next:

C, C♯/D♭, D, D♯/E♭, E, F, F♯/G♭, G, G♯/A♭, A, A♯/B♭, B

and then C again, an octave higher.

Play every key below from left to right, black keys included.

```widget
type: keyboard
range: [C4, C5]
labels: all
```

Playing all twelve in order like this is called the **chromatic scale**. It sounds like a smooth, even climb, with no step bigger than any other.

> There are only twelve different notes. Everything else is the same twelve in a higher or lower octave.

## Twelve equal steps

Level 0 showed that an octave doubles the frequency. Modern instruments divide that doubling into twelve *equal* steps, where equal means each half step multiplies the frequency by the same number: about 1.0595. Multiply by it twelve times and you arrive at exactly 2.

This system is called **equal temperament**. It has a small cost. The simple ratios from Level 0 are no longer met exactly. Seven half steps give a ratio of about 1.498 instead of the 1.5 of a pure 3:2. The difference is tiny, and in return every half step is the same size, so music can start on any of the twelve notes and sound the same.

## The same twelve on a string

On a guitar the twelve notes are laid out in a straight line. Each fret is one half step, so twelve frets along one string cover one octave. Play the marked positions on the A string below from left to right.

```widget
type: fretboard
frets: 12
positions: ["5/0", "5/1", "5/2", "5/3", "5/4", "5/5", "5/6", "5/7", "5/8", "5/9", "5/10", "5/11", "5/12"]
labels: all
```

It is the same chromatic scale you played on the keyboard, starting from A instead of C. With no black and white keys to mark them, the two places where natural notes sit side by side (B–C and E–F) look like any other fret.
