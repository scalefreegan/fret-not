---
id: core-3-interval-numbers
title: Counting intervals
track: core
level: 3
order: 1
concepts: [interval-numbers]
summary: An interval is the distance between two notes. Its number comes from counting letter names.
exercises:
  - kind: quiz
    concept: interval-numbers
    title: Count the letters
    count: 5
    questions:
      - q: What is the interval number from C up to E?
        choices: [A second, A third, A fourth]
        answer: 2
        explain: "Count both ends: C (1), D (2), E (3). Three letters, so a third."
      - q: What is the interval number from D up to A?
        choices: [A fourth, A fifth, A sixth]
        answer: 2
        explain: "D (1), E (2), F (3), G (4), A (5). A fifth."
      - q: What is the interval number from G up to the next A?
        choices: [A second, A third, A seventh]
        answer: 1
        explain: "G (1), A (2). Neighbouring letters are a second apart."
      - q: What is the interval number from E up to the next E?
        choices: [A seventh, An octave, A unison]
        answer: 2
        explain: "E F G A B C D E is eight letters. An eighth is called an octave."
      - q: What is the interval number from F up to B?
        choices: [A third, A fourth, A fifth]
        answer: 2
        explain: "F (1), G (2), A (3), B (4). A fourth."
      - q: Two notes sit on neighbouring lines of the staff, with one space between them. What is the interval?
        choices: [A second, A third, A fourth]
        answer: 2
        explain: Line to the next line skips one letter, so three letters are involved. A third.
      - q: On the staff, one note is on a line and the other is in the space right above it. What is the interval?
        choices: [A second, A third]
        answer: 1
        explain: Line to the adjacent space is one step, a second.
      - q: Does the number of an interval change if one of the notes has a sharp or flat?
        choices: ["Yes, it gets bigger", "No, only the letter names count for the number"]
        answer: 2
        explain: C to E and C to E flat are both thirds. The sharp or flat changes the kind of third, not the number.
  - kind: build-interval
    concept: interval-numbers
    title: Seconds and thirds on the keyboard
    count: 5
    intervals: [M2, M3]
  - kind: name-interval
    concept: interval-numbers
    title: Step or skip?
    count: 5
    view: staff
    intervals: [M2, M3, P5]
---

An **interval** is the distance between two notes. Intervals are the real building blocks of music: a melody is a chain of intervals, and a chord is a stack of them.

Every interval has a two-part name, such as "major third" or "perfect fifth". This lesson covers the second part, the **number**. The next lesson covers the first.

## Count the letters, both ends included

To find the number, count letter names from the lower note to the upper note, **counting both the note you start on and the note you land on**.

- C to D: C, D. Two letters. A **second**.
- C to E: C, D, E. Three letters. A **third**.
- C to G: C, D, E, F, G. Five letters. A **fifth**.

Move the upper note in this widget and watch the number change. Try to predict it before you look.

```widget
type: interval
from: C4
to: E4
```

The eight basic numbers have names: **unison** (the same note), **second, third, fourth, fifth, sixth, seventh**, and **octave** (eight).

> Count letters, including both ends. C up to G is C-D-E-F-G: five letters, a fifth.

The commonest slip is to count the *gaps* instead of the notes and come out one too small. C to E is two steps away, but it is a third.

## Seeing the number on the staff

Because each line and space is one letter, you can read an interval's number straight off the staff without naming the notes.

- **Second**: line to the very next space (or space to the next line). The notes touch.
- **Third**: line to the next line, or space to the next space.
- **Fifth**: line to line with one line between, or space to space with one space between.

Click the pairs: a second, a third, then a fifth, all starting on E.

```widget
type: staff
clef: treble
notes: [E4, F4, E4, G4, E4, B4]
labels: true
```

Odd-numbered intervals (third, fifth, seventh) always go line-to-line or space-to-space. Even-numbered ones (second, fourth, sixth, octave) always go from a line to a space or the reverse.

The number ignores sharps and flats entirely. C to E and C to E♭ are both thirds, because both span the letters C, D, E. They are not the *same* third, though, which is where the next lesson picks up.
