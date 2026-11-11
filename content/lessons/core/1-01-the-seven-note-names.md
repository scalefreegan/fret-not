---
id: core-1-alphabet
title: The seven note names
track: core
level: 1
order: 1
concepts: [musical-alphabet]
summary: Notes are named with the letters A to G, and the names start again at every octave.
exercises:
  - kind: quiz
    concept: musical-alphabet
    count: 5
    questions:
      - q: Which letters are used to name notes?
        choices: [A to G, A to H, A to Z]
        answer: 1
        explain: There are seven letter names, A B C D E F G.
      - q: Going up, which note comes after G?
        choices: [H, A, F]
        answer: 2
        explain: After G the names start again at A, one octave higher than the last A.
      - q: Going down, which note comes just below C?
        choices: [B, D, A]
        answer: 1
        explain: Downward the alphabet runs backwards, so below C is B.
      - q: Going up from E, which note is three letter names later?
        choices: [G, A, H]
        answer: 2
        explain: E, then F, G, A. Counting past G wraps round to A.
      - q: Two notes are both called D, but one is higher. How are their frequencies related?
        choices: [They are the same frequency, The higher one is a doubling (or several doublings) of the lower, The higher one is 7 Hz more]
        answer: 2
        explain: Notes with the same name are one or more octaves apart, and each octave doubles the frequency.
      - q: A note with a plain letter name, with nothing added to it, is called
        choices: [a natural, a harmonic, an octave]
        answer: 1
        explain: A, B, C, D, E, F and G are the seven natural notes.
      - q: Going up from C, how many letter names do you pass before you reach the next C?
        choices: [5, 6, 7]
        answer: 2
        explain: D, E, F, G, A, B are the six names between one C and the next. That makes C to C eight notes, counting both ends, which is where the word octave comes from.
  - kind: name-note
    concept: musical-alphabet
    title: Name the white key
    count: 6
    view: keyboard
    range: [C4, B4]
---

In Level 0 you saw that a note at double the frequency sounds like the same note again. Music takes advantage of that: it names only the notes inside one octave, and then reuses those names in every other octave.

There are seven basic names, the letters **A B C D E F G**. After G comes A again, an octave above the first one.

Play the white keys below from left to right and read the names as you go.

```widget
type: keyboard
range: [C3, C5]
labels: naturals
```

The names climb through the alphabet, reach G, and start over. Going down, they run backwards: below C is B, below A is G.

> Seven letters, A to G, name the notes. The eighth note up has the same letter as the first and sounds an octave higher.

The word *octave* comes from this count: from any note to the next one with the same name is eight notes, if you count both ends (C D E F G A B C).

These seven are called the **natural** notes. On a piano they are the white keys. There are other notes between some of them, the black keys, and they are the subject of the next two lessons.

## Finding your place

The keyboard is the clearest picture of the notes, so the core lessons use it even though the piano has its own track. The only landmark you need for now: the black keys come in groups of two and three, and **C is the white key just to the left of a group of two**. From C, the white keys run C D E F G A B.

## The same note everywhere

A note's name does not depend on the instrument. Click different keys below and watch the same note appear on the guitar's fretboard.

```widget
type: linked
notes: [C4]
views: [keyboard, fretboard]
interactive: true
```
