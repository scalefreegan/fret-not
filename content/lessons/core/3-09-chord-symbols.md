---
id: core-3-chord-symbols
title: Chord symbols
track: core
level: 3
order: 9
concepts: [chord-symbols]
summary: A letter, sometimes with an m, names a whole chord. Songbooks write harmony this way.
exercises:
  - kind: name-chord
    concept: chord-symbols
    title: Write the symbol
    count: 8
    view: keyboard
    answers: symbols
    chords: [C, F, G, Am, Dm, Em, D, A, E]
  - kind: name-chord
    concept: chord-symbols
    title: From the staff
    count: 5
    view: staff
    answers: symbols
    chords: [C, F, G, Am, Dm, Em]
  - kind: play-chord
    concept: chord-symbols
    title: Play from the symbol
    count: 6
    instrument: piano
    ask: symbol
    chords: [C, F, G, Am, Dm, Em]
  - kind: quiz
    concept: chord-symbols
    count: 3
    questions:
      - q: What does the chord symbol G mean?
        choices: [The single note G, A G major triad, A G minor triad]
        answer: 2
        explain: A capital letter on its own means the major triad built on that note.
      - q: What does the small m in Am mean?
        choices: [Major, Minor, Middle]
        answer: 2
        explain: "A small m after the letter means minor. Am is the triad A, C, E."
      - q: Which notes are in the chord Dm?
        choices: ["D, F, A", "D, F sharp, A", "D, G, A"]
        answer: 1
        explain: "A minor triad is the root, then 3 half steps, then 4 more. D, F, A."
      - q: Which notes are in the chord D?
        choices: ["D, F, A", "D, F sharp, A", "D, E, F"]
        answer: 2
        explain: "D on its own means D major. The third is 4 half steps above D, which is F sharp."
      - q: What does F♯m mean?
        choices: [An F major chord played sharp, A minor triad built on F sharp, F and F sharp together]
        answer: 2
        explain: "The root is everything before the m, here F sharp. The m makes it minor."
      - q: A chord symbol is written above a bar of melody. How long do you keep playing that chord?
        choices: [For one beat only, Until the next chord symbol appears, For the whole song]
        answer: 2
        explain: A chord symbol stays in force until it is replaced by another.
---

Writing out every note of every chord takes space. Songbooks, lead sheets and guitar charts use a shorthand instead: a **chord symbol** written above the music.

The system for triads is short:

- A **capital letter alone** means the **major** triad on that root. **C** is C major: C, E, G.
- A capital letter followed by a **small m** means the **minor** triad. **Am** is A minor: A, C, E.
- If the root is a black key, the sharp or flat is part of the root's name: **B♭** is B flat major, **F♯m** is F sharp minor.

```widget
type: chord
symbol: Am
views: [staff, keyboard]
interactive: true
```

Change the root and type in the widget above and watch the symbol and the notes change together.

> A letter alone is major. A letter with a small m is minor. The letter is the root.

A chord symbol tells you *which notes*, not *how to play them*. A pianist might play the three notes together in one hand. A guitarist will strum a shape that uses those same three notes spread over five or six strings, some of them doubled. Both are playing "C".

## Reading a chord chart

Chord symbols are read left to right in time, like everything else. Each chord lasts until the next symbol appears. Here are four bars, one chord in each.

```widget
type: progression
chords: "C G Am F"
key: C
tempo: 88
views: [staff, keyboard]
```

That particular sequence, C, G, Am, F, is one of the most used in pop music. Because this chart is in the key of C, each chord can also be given a Roman numeral for its place in the scale. That is the starting point of Level 4.

Here is another, with a more folk-like sound. Before you press play, say the notes of each chord to yourself.

```widget
type: progression
chords: "Am Dm Em Am"
tempo: 88
views: [staff, keyboard]
```

Later levels add more suffixes, such as the 7 in G7, for chords with four or more notes. They all extend this same idea: root first, then the kind of chord.
