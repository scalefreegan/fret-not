---
id: guitar-1-open-strings
title: The six open strings
track: guitar
level: 1
order: 1
mirrors: core-1-alphabet
concepts: [guitar-strings]
summary: The names and numbers of the guitar's strings in standard tuning, E A D G B E.
exercises:
  - kind: name-note
    concept: guitar-strings
    count: 8
    view: fretboard
    maxFret: 0
  - kind: play-note
    concept: guitar-strings
    count: 8
    instrument: guitar
    from: name
    maxFret: 0
    anyOctave: true
  - kind: quiz
    concept: guitar-strings
    count: 5
    questions:
      - q: Which string is string 1?
        choices: [The thinnest, highest-sounding string, The thickest, lowest-sounding string, The one in the middle]
        answer: 1
        explain: Strings are numbered from the thinnest. String 1 is the high E and string 6 is the low E.
      - q: What are the open strings from string 6 to string 1?
        choices: [E A D G B E, E B G D A E, A B C D E F]
        answer: 1
        explain: From the thickest to the thinnest the open strings are E, A, D, G, B, E.
      - q: What note is the open string 5?
        choices: [A, D, B]
        answer: 1
        explain: String 5, the second thickest, is A (A2, 110 Hz).
      - q: What note is the open string 2?
        choices: [G, B, D]
        answer: 2
        explain: String 2, the second thinnest, is B.
      - q: Strings 6 and 1 are both E. How far apart are they?
        choices: [One octave, Two octaves, They are the same pitch]
        answer: 2
        explain: The low string is E2 and the high string is E4, two octaves apart.
      - q: What does "open string" mean?
        choices: [A string played without pressing any fret, A string that is out of tune, A string that has been loosened]
        answer: 1
        explain: An open string vibrates along its whole length, from nut to bridge.
      - q: In this app's fretboard pictures, where is the low E string drawn?
        choices: [At the bottom, At the top]
        answer: 1
        explain: The pictures follow the layout of guitar tab, with the low E string at the bottom and the high E string at the top.
---

A guitar has six strings. Played without pressing anything, a string is called **open**, and in standard tuning the six open strings give six fixed notes. Everything else on the guitar is found by counting up from them.

Play each open string below, from the bottom of the picture to the top.

```widget
type: fretboard
frets: 5
positions: ["6/0", "5/0", "4/0", "3/0", "2/0", "1/0"]
labels: open
```

From the thickest string to the thinnest, the notes are

**E A D G B E**

A well-worn way to remember them: *Eddie Ate Dynamite, Good Bye Eddie*.

## String numbers

Guitarists number the strings from the *thinnest*:

- string 1: **E4**, the high E, the thinnest
- string 2: **B3**
- string 3: **G3**
- string 4: **D3**
- string 5: **A2**
- string 6: **E2**, the low E, the thickest

So "E A D G B E" reads from string 6 to string 1. The two E strings are two octaves apart.

> Standard tuning, from string 6 to string 1: E A D G B E.

## How the pictures are drawn

Fretboard pictures in this app show the neck as it appears in guitar tab: the **low E string at the bottom** and the high E string at the top, with the nut on the left. That is the view you get looking down at a guitar in your lap, and it means higher notes are both further right and further up.

## The open strings among the other notes

Here are the same six notes on a keyboard as well. Click each open string and see where it falls.

```widget
type: linked
notes: [E2]
views: [fretboard, keyboard]
interactive: true
```

Most neighbouring strings are the same distance apart: five half steps. The exception is from string 3 to string 2, G up to B, which is only four. That one odd gap matters for everything you will learn about the fretboard, and it comes back in the last lesson of this level.
