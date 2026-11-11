---
id: core-2-ledger-lines
title: Ledger lines and the grand staff
track: core
level: 2
order: 9
concepts: [ledger-lines]
summary: Short extra lines carry notes above and below the staff, and middle C joins the two clefs.
exercises:
  - kind: name-note
    concept: ledger-lines
    title: Around middle C, treble clef
    count: 6
    view: staff
    clef: treble
    range: [A3, E4]
  - kind: name-note
    concept: ledger-lines
    title: Around middle C, bass clef
    count: 6
    view: staff
    clef: bass
    range: [A3, E4]
  - kind: name-note
    concept: ledger-lines
    title: Above the treble staff
    count: 5
    view: staff
    clef: treble
    range: [F5, C6]
  - kind: quiz
    concept: ledger-lines
    count: 2
    questions:
      - q: Where is middle C written in the treble clef?
        choices: [On the bottom line, On one ledger line below the staff, In the space below the staff]
        answer: 2
        explain: The space just below the bottom line is D. One more step down needs a ledger line, and that is middle C.
      - q: Where is middle C written in the bass clef?
        choices: [On the top line, In the space above the staff, On one ledger line above the staff]
        answer: 3
        explain: The top line is A, the space above it is B, and the ledger line above that is middle C.
      - q: The treble and bass staffs joined together are called what?
        choices: [The grand staff, The double clef, The full staff]
        answer: 1
        explain: Piano music is written on the grand staff, roughly right hand on top and left hand below.
---

Five lines hold only nine notes. When a note is higher or lower than the staff, the staff is extended just for that note with a short extra line called a **ledger line**.

Ledger lines continue the same pattern: line, space, line, space. Click these from left to right. They walk down off the bottom of the treble staff.

```widget
type: staff
clef: treble
notes: [F4, E4, D4, C4, B3, A3]
labels: true
```

E is the bottom line. D hangs in the space just below it and needs no extra line. C sits **on** the first ledger line. B hangs below that line, and A sits on a second ledger line.

## Middle C

That C on one ledger line below the treble staff is **middle C** (C4), the C nearest the middle of a piano.

Now look at the bass clef, walking *up* off the top.

```widget
type: staff
clef: bass
notes: [G3, A3, B3, C4, D4, E4]
labels: true
```

A is the top line, B sits above it, and C is on one ledger line above the staff. It is the **same middle C**, the very same key and sound, reached from the other side.

> Middle C is one ledger line below the treble staff and one ledger line above the bass staff. It is where the two clefs meet.

## The grand staff

Piano music uses both staffs at once, treble above bass, joined by a brace. This pair is the **grand staff**. Notes around middle C can be written in either staff. Click through these and watch the notes cross from the lower staff to the upper one at middle C.

```widget
type: staff
clef: grand
notes: [F3, G3, A3, B3, C4, D4, E4, F4, G4]
labels: true
```

Click keys below and above middle C on this keyboard and watch which staff each note lands on.

```widget
type: linked
notes: [C4]
views: [staff, keyboard]
clef: grand
```

Ledger lines also go upward. Above the top line F of the treble staff come G (sitting on top), then A on the first ledger line, B above it, and C on the second.

```widget
type: staff
clef: treble
notes: [F5, G5, A5, B5, C6]
labels: true
```
