---
id: core-3-key-signatures
title: Keys and key signatures
track: core
level: 3
order: 5
concepts: [key-signatures]
summary: A piece built on a scale is "in" that key. The key signature writes the scale's sharps or flats once, at the start.
exercises:
  - kind: name-key
    concept: key-signatures
    title: Name the major key
    count: 8
    maxAccidentals: 3
    mode: major
  - kind: build-key-signature
    concept: key-signatures
    count: 6
    maxAccidentals: 3
    mode: major
  - kind: quiz
    concept: key-signatures
    count: 3
    questions:
      - q: A key signature has one sharp. Which note is sharp?
        choices: [C sharp, F sharp, G sharp]
        answer: 2
        explain: Sharps are always added in the same order, and F sharp comes first. One sharp is the key of G major.
      - q: A key signature has one flat. Which note is flat?
        choices: [B flat, E flat, A flat]
        answer: 1
        explain: Flats are always added in the same order, and B flat comes first. One flat is the key of F major.
      - q: The key signature has an F sharp. You see a note on the top line of the treble staff (F) with no sign in front of it. What do you play?
        choices: [F, F sharp]
        answer: 2
        explain: The key signature applies to every F in the piece, in every octave, unless a natural sign cancels it.
      - q: Which major key has no sharps and no flats?
        choices: [C major, G major, F major]
        answer: 1
        explain: C major is all white keys.
      - q: A sharp key signature ends with C sharp as its last sharp. Which major key is it?
        choices: [C major, D major, B major]
        answer: 2
        explain: The key is a half step above the last sharp. A half step above C sharp is D. D major has two sharps, F sharp and C sharp.
      - q: Moving one step clockwise on the circle of fifths does what to the key signature?
        choices: [Adds one sharp or removes one flat, Adds one flat, Changes nothing]
        answer: 1
        explain: Each step clockwise is a fifth up and one more sharp. Each step anticlockwise is one more flat.
---

When a piece of music is built from the notes of the G major scale and feels at home on G, we say it is **in the key of G major**. The key is the piece's home base.

The G major scale has one sharp: F♯. In a piece in G, nearly every F will be an F♯. Writing a sharp sign in front of each one would clutter the page, so instead the sharp is written **once, at the start of every line**, right after the clef. That is the **key signature**.

```widget
type: staff
clef: treble
key: G
notes: [G4, A4, B4, C5, D5, E5, F#5, G5]
labels: true
```

The single sharp on the top line says: every F in this piece, high or low, is F♯ unless a natural sign says otherwise. Notice that the F♯ near the end of the scale has no sign of its own. The key signature has already taken care of it.

Here is a tune in G major. Its key signature has one sharp.

```widget
type: melody
title: Amazing Grace (traditional American hymn tune), first line
notes: "r:h D4:q | G4:h B4:e G4:e | B4:h A4:q | G4:h E4:q | D4:h D4:q | G4:h B4:e G4:e | B4:h A4:q | D5:h."
time: 3/4
key: G
tempo: 84
```

## The circle of fifths

The twelve major keys form a tidy pattern. Click around this circle, starting from C at the top and going clockwise.

```widget
type: circle-of-fifths
key: C
```

- **C major** has no sharps or flats.
- Each step **clockwise** moves up a perfect fifth and **adds one sharp**: G has 1, D has 2, A has 3.
- Each step **anticlockwise** moves down a perfect fifth and **adds one flat**: F has 1, B♭ has 2, E♭ has 3.

> Sharps always arrive in the order F C G D A E B. Flats arrive in the reverse order: B E A D G C F.

So a signature of two sharps is always F♯ and C♯, never any other two.

## Naming a key from its signature

Two quick rules:

- **Sharps**: the key is a half step *above the last sharp*. Two sharps end with C♯, so the key is D major.
- **Flats**: the key is the *second-to-last flat*. Three flats are B♭, E♭, A♭, so the key is E♭ major. One flat on its own is F major, which you just have to remember.

Every key signature also belongs to one minor key. That comes in the next lesson.
