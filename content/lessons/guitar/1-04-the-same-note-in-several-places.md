---
id: guitar-1-unisons
title: The same note in several places
track: guitar
level: 1
order: 4
mirrors: core-1-octave-numbers
concepts: [fretboard-unisons]
summary: Most notes can be played on more than one string, and the fifth-fret rule tells you where.
exercises:
  - kind: quiz
    concept: fretboard-unisons
    count: 6
    questions:
      - q: Which fret on string 6 gives the same note as the open string 5?
        choices: [Fret 4, Fret 5, Fret 7]
        answer: 2
        explain: Fret 5 of the low E string is A2, the same pitch as the open A string.
      - q: Which fret on string 3 gives the same note as the open string 2?
        choices: [Fret 4, Fret 5, Fret 6]
        answer: 1
        explain: The G string and the B string are only four half steps apart, so the match is at fret 4. Every other pair of neighbours matches at fret 5.
      - q: Which fret on string 2 gives the same note as the open string 1?
        choices: [Fret 4, Fret 5, Fret 7]
        answer: 2
        explain: Fret 5 of the B string is E4, the same pitch as the open high E string.
      - q: The note at string 6, fret 8 is C3. Where is the same C3 on string 5?
        choices: [Fret 3, Fret 5, Fret 8]
        answer: 1
        explain: Moving to the next higher string, the same note is five frets lower. 8 minus 5 is 3.
      - q: The open string 1 is E4. Where else can exactly that pitch be played?
        choices: [String 2 fret 5 and string 3 fret 9, String 6 fret 12, String 2 fret 4]
        answer: 1
        explain: E4 is at string 2 fret 5 and string 3 fret 9. String 6 fret 12 is also an E, but it is E3, an octave lower.
      - q: How many places can the open low E string's note, E2, be played on the guitar?
        choices: [One, Two, Six]
        answer: 1
        explain: E2 is the lowest note on the guitar. There is no lower string to find it on, so the open string 6 is the only place.
      - q: A piano has one key for each pitch. A guitar
        choices: [also has one place for each pitch, often has several places for the same pitch, has no repeated pitches above fret 5]
        answer: 2
        explain: Because the strings overlap in range, most pitches appear on two or more strings.
      - q: Why would a guitarist choose one place over another for the same note?
        choices: [To keep the hand in one area and to change the tone, Because only one of them is in tune, There is never a reason]
        answer: 1
        explain: The pitch is the same, but a thicker string gives a rounder tone, and choosing nearby positions saves the hand from jumping around.
  - kind: play-note
    concept: fretboard-unisons
    title: Find it on any string
    count: 8
    instrument: guitar
    from: name
    maxFret: 5
    anyOctave: true
  - kind: ear-find-note
    concept: fretboard-unisons
    count: 4
    instrument: guitar
    scale: major
    range: [C3, C4]
---

On a piano every pitch has exactly one key. The guitar is different. Its strings overlap, so the same pitch can usually be played in two, three or even more places.

Every place the note E4 can be played within twelve frets is marked below. Play each one.

```widget
type: fretboard
frets: 12
highlight: [E4]
labels: all
```

The open string 1, fret 5 of string 2 and fret 9 of string 3 all give the same E4, at the same frequency of about 329.6 Hz. Listen closely and you will hear that the *tone* is not quite the same. A thicker string pressed high up the neck sounds rounder and darker than a thin open string. The pitch is identical. The timbre is not.

## The fifth-fret rule

The overlap follows a simple pattern. Each string is tuned five half steps above the one below it, so:

- string 6, fret 5 = open string 5 (A)
- string 5, fret 5 = open string 4 (D)
- string 4, fret 5 = open string 3 (G)
- string 3, fret **4** = open string 2 (B)
- string 2, fret 5 = open string 1 (E)

The exception is the G string. It is only four half steps below the B string, so the match is at fret 4.

> The fifth fret of a string matches the next open string, except from string 3 to string 2, where it is the fourth fret.

This is also how a guitar can be tuned to itself: get one string right, then match each next open string to the fretted note below it.

## Moving a note across strings

The same rule works anywhere on the neck, not only against open strings. To find the same pitch on the next higher string, go **five frets lower** (four when crossing from string 3 to string 2). Click any position below to see every other place that plays the same pitch, and where it sits on the keyboard, where it has only one home.

```widget
type: linked
notes: [C4]
views: [fretboard, keyboard]
interactive: true
```

Middle C, for example, is at string 2 fret 1, string 3 fret 5 and string 4 fret 10.

## Same name, different octave

Do not confuse this with octaves. Fret 12 of string 6 is an E, and so is the open string 1, but the first is E3 and the second is E4. They share a name and are an octave apart. A true match has the same name *and* the same octave number.
