---
id: core-0-string-modes
title: How a string vibrates
track: core
level: 0
order: 4
concepts: [string-modes]
summary: A string fixed at both ends can only vibrate in whole-number patterns, and each pattern has its own frequency.
exercises:
  - kind: harmonic-frequency
    concept: string-modes
    count: 5
    fundamentals: [100, 110, 200]
    maxHarmonic: 4
  - kind: quiz
    concept: string-modes
    count: 4
    questions:
      - q: A string is vibrating in its second pattern, in two equal halves. What is the still point in the middle called?
        choices: [A node, A fret, A beat]
        answer: 1
        explain: A node is a point on a vibrating string that stays still.
      - q: A string's simplest pattern, one single arc, vibrates at 110 Hz. How fast does the two-halves pattern vibrate?
        choices: [55 Hz, 165 Hz, 220 Hz]
        answer: 3
        explain: The second pattern vibrates at twice the frequency of the first.
      - q: What is the frequency of a string's simplest, single-arc pattern called?
        choices: [The fundamental, The amplitude, The node]
        answer: 1
        explain: The fundamental is the lowest frequency a string can vibrate at, and it is the pitch we name the note by.
      - q: Why can a string not vibrate in two and a half arcs?
        choices: [It would be too loud, Both ends are fixed so the arcs must fit exactly, The string is too heavy]
        answer: 2
        explain: The ends cannot move, so only patterns with a whole number of arcs fit between them.
      - q: You make a string shorter without changing anything else. Its fundamental frequency
        choices: [goes up, goes down, stays the same]
        answer: 1
        explain: A shorter string vibrates faster. Halving the length doubles the frequency.
      - q: How many still points (not counting the two ends) does the third pattern have?
        choices: [1, 2, 3]
        answer: 2
        explain: Three arcs meet at two points between the ends.
---

A guitar string and a piano string have one thing in common: both ends are held still. That one fact limits the ways the string can move, and those limits are where musical notes come from.

Below is a string with its possible patterns of vibration. Switch on pattern 1 by itself and listen. Then switch it off and try 2, then 3, then 4, one at a time.

```widget
type: string-sim
mode: harmonics
note: A2
modes: 6
```

Pattern 1 is a single arc swinging up and down. Pattern 2 is two half-length arcs, with a point in the middle that does not move at all. Pattern 3 is three arcs with two still points. A still point is called a **node**.

There is no pattern with one and a half arcs, or two and a quarter. Because the ends are fixed, only a **whole number** of arcs can fit.

## Each pattern has its own frequency

You heard the pitch jump each time. The jumps follow a very simple rule. If pattern 1 vibrates at 110 Hz:

- pattern 2 vibrates at 220 Hz (2 × 110)
- pattern 3 vibrates at 330 Hz (3 × 110)
- pattern 4 vibrates at 440 Hz (4 × 110)

> Pattern number *n* vibrates at *n* times the frequency of pattern 1.

The frequency of pattern 1 is called the **fundamental**. It is the lowest the string can go, and it is the pitch we mean when we name the note the string plays. The patterns are called **harmonics**: the fundamental is the first harmonic, pattern 2 is the second harmonic, and so on.

## What sets the fundamental

Three things decide a string's fundamental frequency:

- **Length.** A shorter string vibrates faster. Half the length gives twice the frequency.
- **Tension.** A tighter string vibrates faster. This is what tuning pegs adjust.
- **Weight.** A heavier string vibrates more slowly. This is why low strings are thick.

A real plucked string does not choose one pattern. It does several at once, which is the subject of the next lesson.
