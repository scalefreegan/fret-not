---
id: core-3-pentatonic
title: Pentatonic scales
track: core
level: 3
order: 7
concepts: [pentatonic-scales]
summary: Five-note scales with no half steps. They are the backbone of folk, blues and rock melody.
exercises:
  - kind: build-scale
    concept: pentatonic-scales
    title: Build a major pentatonic
    count: 4
    types: [major-pentatonic]
    tonics: [C, G, F]
  - kind: build-scale
    concept: pentatonic-scales
    title: Build a minor pentatonic
    count: 4
    types: [minor-pentatonic]
    tonics: [A, E, D]
  - kind: play-scale
    concept: pentatonic-scales
    title: Play C major pentatonic
    count: 2
    instrument: piano
    types: [major-pentatonic]
    tonics: [C]
  - kind: play-scale
    concept: pentatonic-scales
    title: Play A minor pentatonic
    count: 2
    instrument: piano
    types: [minor-pentatonic]
    tonics: [A]
  - kind: quiz
    concept: pentatonic-scales
    count: 3
    questions:
      - q: How many different notes does a pentatonic scale have?
        choices: [5, 6, 7]
        answer: 1
        explain: "\"Penta\" means five."
      - q: Which two notes of the major scale are left out to make the major pentatonic?
        choices: ["The 2nd and 6th", "The 4th and 7th", "The 3rd and 5th"]
        answer: 2
        explain: "C major is C D E F G A B. Remove F (the 4th) and B (the 7th) and you have C D E G A."
      - q: Which two notes of the natural minor scale are left out to make the minor pentatonic?
        choices: ["The 2nd and 6th", "The 4th and 7th", "The 3rd and 5th"]
        answer: 1
        explain: "A natural minor is A B C D E F G. Remove B (the 2nd) and F (the 6th) and you have A C D E G."
      - q: The C major pentatonic is C D E G A. Which minor pentatonic has the same five notes?
        choices: [C minor pentatonic, A minor pentatonic, E minor pentatonic]
        answer: 2
        explain: A minor is the relative minor of C major, and the pentatonic versions are relatives in the same way.
      - q: What is special about the steps inside a pentatonic scale?
        choices: [They are all half steps, There are no half steps at all, They are all the same size]
        answer: 2
        explain: Every step is either a whole step or a minor third. With no half steps there are no harsh clashes.
---

Take away two notes from a seven-note scale and you get a five-note scale, a **pentatonic** scale. Pentatonic scales turn up in folk music all over the world, and they are the first scale most rock and blues guitarists learn. They are hard to make sound bad.

## Major pentatonic

Start from the C major scale, C D E F G A B, and leave out the **4th and 7th** notes, F and B. What remains is **C D E G A**.

```widget
type: scale
tonic: C
scale: major-pentatonic
views: [staff, keyboard]
```

F and B were the two notes that made half steps with their neighbours (E–F and B–C). With both gone, **no two notes of the scale are a half step apart**. Every step is a whole step or a minor third. That is why pentatonic melodies sound open and smooth, and why almost any order of the notes makes a decent tune.

> Major pentatonic = major scale without its 4th and 7th notes. No half steps anywhere.

"Amazing Grace" is purely pentatonic. This line is in G, and uses only G, A, B, D and E.

```widget
type: melody
title: Amazing Grace (traditional American hymn tune), first line
notes: "r:h D4:q | G4:h B4:e G4:e | B4:h A4:q | G4:h E4:q | D4:h D4:q | G4:h B4:e G4:e | B4:h A4:q | D5:h."
time: 3/4
key: G
tempo: 84
```

## Minor pentatonic

Do the same to the natural minor scale. From A minor, A B C D E F G, leave out the **2nd and 6th**, B and F. What remains is **A C D E G**.

```widget
type: scale
tonic: A
scale: minor-pentatonic
views: [staff, keyboard]
interactive: true
```

Look closely (switch the widget to C major pentatonic to compare): A C D E G are the same five notes as C D E G A. Just as A minor is the relative minor of C major, **A minor pentatonic and C major pentatonic share their notes**. Which one you hear depends on which note the music treats as home.

The minor pentatonic is the sound of blues and rock melody and soloing. Here is a short phrase in that style.

```widget
type: melody
title: A blues-style phrase written for this lesson, in A minor pentatonic
notes: "A4:q C5:q A4:e G4:e E4:q | G4:q A4:h. | C5:q A4:q G4:e E4:e D4:q | E4:q A3:h."
clef: grand
tempo: 96
```

## The black keys

The five black keys of the piano form a pentatonic scale on their own. Play only black keys on this keyboard, in any order. Start and end on F♯ for a major pentatonic sound, or on E♭ (the same key as D♯) for a minor one.

```widget
type: keyboard
range: [C4, C6]
highlight: [F#4, G#4, A#4, C#5, D#5, F#5]
labels: none
```
