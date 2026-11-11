---
id: core-2-accidentals
title: Sharps and flats on the staff
track: core
level: 2
order: 10
concepts: [accidentals-on-staff]
summary: A sharp, flat or natural sign in front of a note raises, lowers or restores it.
exercises:
  - kind: name-note
    concept: accidentals-on-staff
    title: Name the note, accidental included
    count: 8
    view: staff
    clef: treble
    range: [E4, F5]
    accidentals: true
  - kind: play-note
    concept: accidentals-on-staff
    title: Play it on the keyboard
    count: 8
    instrument: piano
    from: staff
    clef: treble
    range: [E4, F5]
    accidentals: true
  - kind: quiz
    concept: accidentals-on-staff
    count: 3
    questions:
      - q: Where is a sharp or flat sign written?
        choices: [Just before the note it changes, Just after the note it changes, Above the staff]
        answer: 1
        explain: "We say \"F sharp\", but on the staff the sign comes first, so you see it before you play the note."
      - q: A note on the F line has a sharp in front of it. Later in the same bar there is another note on the same F line with no sign. What is it?
        choices: [F natural, F sharp]
        answer: 2
        explain: An accidental lasts until the end of the bar for notes on that same line or space.
      - q: What does a natural sign do?
        choices: [Raises the note a half step, Cancels a sharp or flat, Makes the note longer]
        answer: 2
        explain: The natural sign returns the note to its plain letter name.
      - q: A flat sign in front of a B on the staff means you play which note?
        choices: [The note a half step below B, The note a half step above B, B itself]
        answer: 1
        explain: A flat lowers a note by one half step. B flat is the black key just left of B.
---

Every line and space of the staff belongs to a plain letter: A, B, C, D, E, F or G. Those are the white keys of the piano. There is no line or space for the black keys.

To write a black-key note, you write the letter next to it and add a sign **in front of the note**, on the same line or space:

- A **sharp** (♯) raises the note by a half step.
- A **flat** (♭) lowers the note by a half step.

These signs are called **accidentals**.

Click these three notes. They all sit in the same space, the F space. Only the sign changes.

```widget
type: staff
clef: treble
notes: [F4, F#4, G4, Gb4]
labels: true
```

The second and fourth notes are written in different places, an F with a sharp and a G with a flat, but they sound identical. They are the same black key under two names, as you saw in Level 1.

> We say "F sharp" but we write "sharp F": the sign comes before the note, so you see it in time.

Try it yourself. Click a black key and see how it is written. Click a white key and see the sign disappear.

```widget
type: linked
notes: [F#4]
views: [staff, keyboard]
clef: treble
```

## How long an accidental lasts

Two rules save a lot of ink:

1. An accidental applies to **every later note on that same line or space until the next bar line**. Then it is forgotten.
2. A **natural** sign (♮) cancels a sharp or flat and returns the note to its plain letter.

Find the one sharp in this tune before you play it. It is in the third bar, and it changes an F into an F sharp.

```widget
type: melody
title: A phrase written for this lesson
notes: "G4:q A4:q B4:q C5:q | D5:h B4:h | C5:q A4:q F#4:q A4:q | G4:w"
tempo: 96
```

When a piece uses the same sharps or flats all the way through, they are written once at the start of every line instead. That is a key signature, and it arrives in Level 3.
