---
id: core-3-interval-qualities
title: Major, minor and perfect intervals
track: core
level: 3
order: 2
concepts: [interval-qualities]
summary: The quality of an interval comes from its exact size in half steps.
exercises:
  - kind: name-interval
    concept: interval-qualities
    title: Seconds and thirds
    count: 6
    view: keyboard
    intervals: [m2, M2, m3, M3]
  - kind: name-interval
    concept: interval-qualities
    title: Up to an octave
    count: 8
    view: keyboard
    intervals: [m2, M2, m3, M3, P4, P5, P8]
  - kind: build-interval
    concept: interval-qualities
    count: 8
    intervals: [m2, M2, m3, M3, P4, P5, P8]
  - kind: name-interval
    concept: interval-qualities
    title: On the staff
    count: 5
    view: staff
    intervals: [m3, M3, P4, P5]
---

C up to E is a third. C up to E♭ is also a third: three letter names either way. But they are different sizes, and they sound different. The first part of an interval's name, its **quality**, says exactly which size is meant.

The size is measured in **half steps**, the smallest step there is: one key to the very next key on the piano, or one fret on the guitar.

Move the top note in this widget one key at a time and watch the name and the half-step count.

```widget
type: interval
from: C4
to: E4
```

C to E is 4 half steps: a **major third**. C to E♭ is 3 half steps: a **minor third**.

## Major and minor

Seconds, thirds, sixths and sevenths each come in two common sizes. The larger is called **major** and the smaller, one half step less, is called **minor**.

- **Minor second**: 1 half step. **Major second**: 2 half steps.
- **Minor third**: 3. **Major third**: 4.
- **Minor sixth**: 8. **Major sixth**: 9.
- **Minor seventh**: 10. **Major seventh**: 11.

You already know the seconds by another name: a minor second is a half step and a major second is a whole step.

## Perfect

Unisons, fourths, fifths and octaves do not come in major and minor versions. They have one standard size, called **perfect**.

- **Perfect unison**: 0 half steps.
- **Perfect fourth**: 5.
- **Perfect fifth**: 7.
- **Perfect octave**: 12.

These are the intervals with the simplest frequency ratios (2:1 for the octave, 3:2 for the fifth, 4:3 for the fourth) that you met in Level 0. That purity is where the word "perfect" comes from.

> Major and minor for seconds, thirds, sixths and sevenths. Perfect for unisons, fourths, fifths and octaves.

One size is left over: **6 half steps**, sitting between the perfect fourth and the perfect fifth. It is called the **tritone**, and it is the most restless-sounding interval of all. Set the widget above to C and F♯ to hear it.

## Shorthand

Intervals are abbreviated with a letter and a number: capital **M** for major, small **m** for minor, **P** for perfect. So M3 is a major third, m7 a minor seventh, P5 a perfect fifth.

Here are all the intervals from C in order of size. Press the low C and then one of the other notes to hear each interval, from the smallest to the largest.

```widget
type: keyboard
range: [C4, C5]
highlight: [C4, D4, E4, F4, G4, A4, B4, C5]
labels: naturals
```

From C, the white keys happen to give M2, M3, P4, P5, M6, M7 and P8: every major and perfect interval. That is no accident, and it is the subject of the lesson on the major scale.
