---
id: piano-3-triads
title: Triads on the keyboard
track: piano
level: 3
order: 2
mirrors: core-3-triads
concepts: [piano-triads]
summary: Every triad is play-one-skip-one. Learn the two shapes that cover the common major and minor chords.
exercises:
  - kind: play-chord
    concept: piano-triads
    title: All-white triads
    count: 6
    instrument: piano
    chords: [C, F, G, Am, Dm, Em]
  - kind: play-chord
    concept: piano-triads
    title: Triads with a black key in the middle
    count: 6
    instrument: piano
    chords: [D, E, A, Cm, Fm, Gm]
  - kind: name-chord
    concept: piano-triads
    count: 8
    view: keyboard
    chords: [C, F, G, Am, Dm, Em, D, E, A, Cm, Fm, Gm]
  - kind: play-chord
    concept: piano-triads
    title: Mixed
    count: 6
    instrument: piano
    chords: [C, Cm, D, Dm, E, Em, F, Fm, G, Gm, A, Am]
---

On the keyboard a triad in its basic position, with the root at the bottom (called **root position**), always has the same feel: **play a key, skip a letter, play, skip a letter, play**. Root, third, fifth. What changes from chord to chord is whether the middle note is a white key or a black key.

## Shape 1: all white

Seven triads use white keys only. Three are major, three are minor, and one is diminished.

- Major: **C** (C–E–G), **F** (F–A–C), **G** (G–B–D).
- Minor: **Am** (A–C–E), **Dm** (D–F–A), **Em** (E–G–B).
- Diminished: **B°** (B–D–F), the odd one out, which you will rarely play on its own.

```widget
type: chord
symbol: C
views: [keyboard, staff]
```

Play the three major and three minor ones in turn and listen for which are bright and which are dark. (B° is left out of the line: it sounds tense and unsettled, neither bright nor dark.)

```widget
type: progression
chords: "C F G Am Dm Em"
tempo: 72
views: [keyboard]
```

## Shape 2: black key in the middle

A major triad needs its third 4 half steps above the root. On D, E and A, the white key in the middle is only 3 half steps up, so the major triads on these notes **raise the middle note to a black key**.

- **D** (D–F♯–A), **E** (E–G♯–B), **A** (A–C♯–E).

```widget
type: chord
symbol: D
views: [keyboard, staff]
```

The same white-black-white shape also gives the *minor* triads on C, F and G, where the middle note is **lowered** to a black key.

- **Cm** (C–E♭–G), **Fm** (F–A♭–C), **Gm** (G–B♭–D).

```widget
type: chord
symbol: Cm
views: [keyboard, staff]
```

> To turn a major triad into minor, move the middle note down one key. To turn minor into major, move it up one key. The outer two notes stay where they are.

Try that with this chord. Switch between major and minor on several roots and watch only the middle note move.

```widget
type: chord
symbol: A
views: [keyboard, staff]
interactive: true
```

## Checking a chord by counting

When unsure, count keys (black and white alike) from the root:

- **Major**: up 4 keys to the third, then up 3 more to the fifth.
- **Minor**: up 3 keys to the third, then up 4 more to the fifth.

Either way the fifth ends up 7 keys above the root.

Here is a chord sequence that uses both shapes. Watch which chords have a black key.

```widget
type: progression
chords: "D G A D"
tempo: 84
views: [keyboard]
```

In the exercises, press all three notes of the chord and then check your answer. Any octave is fine.
