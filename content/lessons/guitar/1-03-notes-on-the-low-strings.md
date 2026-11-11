---
id: guitar-1-low-strings
title: Notes on the low E and A strings
track: guitar
level: 1
order: 3
mirrors: core-1-twelve
concepts: [fretboard-low-strings]
summary: The natural notes on the two lowest strings up to the fifth fret, the map most chords and scales are found from.
exercises:
  - kind: name-note
    concept: fretboard-low-strings
    title: The low E string
    count: 6
    view: fretboard
    strings: [6]
    maxFret: 5
  - kind: name-note
    concept: fretboard-low-strings
    title: The A string
    count: 6
    view: fretboard
    strings: [5]
    maxFret: 5
  - kind: play-note
    concept: fretboard-low-strings
    count: 8
    instrument: guitar
    from: name
    strings: [5, 6]
    maxFret: 5
    anyOctave: true
  - kind: name-note
    concept: fretboard-low-strings
    title: Both strings, with sharps and flats
    count: 8
    view: fretboard
    strings: [5, 6]
    maxFret: 5
    accidentals: true
---

Guitarists find chords and scales by the note under the lowest finger, and that note is nearly always on string 6 or string 5. Knowing those two strings well is the best single investment on the fretboard.

Start with the natural notes up to the fifth fret.

## String 6, the low E string

```widget
type: fretboard
frets: 5
positions: ["6/0", "6/1", "6/3", "6/5"]
labels: naturals
```

- open: **E**
- fret 1: **F**
- fret 3: **G**
- fret 5: **A**

E and F are a half step apart, so F is at the very first fret. After that the naturals are two frets apart.

## String 5, the A string

```widget
type: fretboard
frets: 5
positions: ["5/0", "5/2", "5/3", "5/5"]
labels: naturals
```

- open: **A**
- fret 2: **B**
- fret 3: **C**
- fret 5: **D**

Here the half step is B to C, at frets 2 and 3.

> String 6: E F · G · A at frets 0 1 3 5. String 5: A · B C · D at frets 0 2 3 5.

## The notes in between

The frets you skipped are the sharps and flats. Fret 2 on string 6 is between F and G, so it is F♯ or G♭. Fret 4 on string 6 is G♯ or A♭. On string 5, fret 1 is A♯ or B♭ and fret 4 is C♯ or D♭.

Play both strings below with every note named.

```widget
type: fretboard
frets: 5
positions: ["6/0", "6/1", "6/2", "6/3", "6/4", "6/5", "5/0", "5/1", "5/2", "5/3", "5/4", "5/5"]
labels: all
```

## Something to notice at fret 5

Fret 5 of string 6 is A, and the open string 5 is also A. They are the same note at the same pitch. Play both marked positions.

```widget
type: fretboard
frets: 5
highlight: [A2]
labels: all
```

That is not a coincidence. It is how the guitar is laid out, and it is the subject of the next lesson.
