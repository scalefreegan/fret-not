---
id: core-2-staff
title: The staff and its clefs
track: core
level: 2
order: 6
concepts: [staff-basics]
summary: Five lines and four spaces show how high a note is. A clef says which notes the lines stand for.
exercises:
  - kind: quiz
    concept: staff-basics
    count: 5
    questions:
      - q: How many lines does a staff have?
        choices: [4, 5, 6]
        answer: 2
        explain: Five lines, with four spaces between them.
      - q: A note is drawn higher up the staff than the one before it. What does that mean?
        choices: [It is louder, It is higher in pitch, It lasts longer]
        answer: 2
        explain: Height on the staff is pitch. Length is shown by the note's shape.
      - q: One note sits on a line. The next sits in the space just above that line. How far apart are their letter names?
        choices: [They are the same letter, One letter apart, Two letters apart]
        answer: 2
        explain: "Each step from a line to the next space, or a space to the next line, moves one letter name."
      - q: The treble clef is also called the G clef. Why?
        choices: [It was invented by a man named G, It curls around the line where G sits, It is used for guitars]
        answer: 2
        explain: The curl of the treble clef wraps around the second line from the bottom, and that line is the G above middle C.
      - q: Which clef is used for low notes, such as the left hand of the piano?
        choices: [Treble clef, Bass clef]
        answer: 2
        explain: The bass clef covers the notes below middle C. The treble clef covers those above.
      - q: The two dots of the bass clef sit either side of one line. Which note is on that line?
        choices: [C, F, G]
        answer: 2
        explain: The bass clef is the F clef. Its dots mark the fourth line from the bottom, the F below middle C.
      - q: When counting the lines of a staff, which line is line 1?
        choices: [The top line, The bottom line]
        answer: 2
        explain: Lines and spaces are always counted from the bottom up.
---

Written music uses a ladder of five horizontal lines called the **staff**. Notes are placed **on a line** (the line runs through the middle of the note) or **in a space** between two lines.

The rule is simple: **the higher a note sits on the staff, the higher it sounds.**

Click each note from left to right and listen to it climb.

```widget
type: staff
clef: treble
notes: [E4, F4, G4, A4, B4, C5, D5, E5, F5]
labels: true
```

Those nine notes go line, space, line, space, all the way up. Each step up, from a line to the space above it or from a space to the line above it, moves **one letter name** forward: E, F, G, then round to A, B, C, D, E, F.

Lines and spaces are counted from the **bottom**. The bottom line is line 1 and the top line is line 5.

## Clefs

Five lines cannot say on their own *which* E or F is meant. The symbol at the far left of the staff, the **clef**, settles that by pinning one line to one exact note.

The **treble clef** is used for higher notes. Its curl wraps around line 2, and that line is the **G above middle C** (G4). It is also called the G clef.

```widget
type: staff
clef: treble
notes: [G4]
labels: true
```

The **bass clef** is used for lower notes. Its two dots sit either side of line 4, and that line is the **F below middle C** (F3). It is also called the F clef.

```widget
type: staff
clef: bass
notes: [F3]
labels: true
```

> A clef names one line. Every other line and space follows from it by counting letter names up or down.

The same position means different notes in the two clefs, so always check the clef first. The next two lessons take the clefs one at a time.
