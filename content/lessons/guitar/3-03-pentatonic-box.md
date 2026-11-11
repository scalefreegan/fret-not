---
id: guitar-3-pentatonic-box
title: The pentatonic box
track: guitar
level: 3
order: 3
mirrors: core-3-pentatonic
concepts: [guitar-pentatonic]
summary: The minor pentatonic scale makes a simple two-notes-per-string pattern, first with open strings and then anywhere on the neck.
exercises:
  - kind: play-scale
    concept: guitar-pentatonic
    title: E minor pentatonic
    count: 1
    instrument: guitar
    types: [minor-pentatonic]
    tonics: [E]
  - kind: play-scale
    concept: guitar-pentatonic
    title: E and A minor pentatonic
    count: 4
    instrument: guitar
    types: [minor-pentatonic]
    tonics: [E, A]
  - kind: quiz
    concept: guitar-pentatonic
    count: 3
    questions:
      - q: What are the five notes of the E minor pentatonic scale?
        choices: ["E, G, A, B, D", "E, F, G, A, B", "E, F sharp, G, B, C"]
        answer: 1
        explain: "E natural minor is E F sharp G A B C D. Leave out the 2nd (F sharp) and the 6th (C)."
      - q: In the pentatonic box, how many notes are played on each string?
        choices: [One, Two, Three]
        answer: 2
        explain: Two notes on each of the six strings, twelve in all, covering two octaves and a bit.
      - q: In the open E minor pentatonic box, which fret do you play on string 6 after the open string?
        choices: [Fret 2, Fret 3, Fret 5]
        answer: 2
        explain: Open string 6 is E. The next scale note is G, three half steps up, at fret 3.
      - q: You move the whole box shape up so that its lowest note is at fret 5 of string 6. Which minor pentatonic scale is it now?
        choices: [E minor pentatonic, G minor pentatonic, A minor pentatonic]
        answer: 3
        explain: Fret 5 of string 6 is A. The lowest note of this box is the tonic, so the scale is A minor pentatonic.
      - q: Which strings have their two box notes three frets apart (open and fret 3 in the open box)?
        choices: ["Strings 6, 2 and 1", "Strings 5, 4 and 3", All six]
        answer: 1
        explain: "Strings 6, 2 and 1 use open and fret 3. Strings 5, 4 and 3 use open and fret 2."
---

The minor pentatonic scale, A C D E G or its equivalent in any key, is the first scale most guitarists learn, and the one behind countless blues and rock solos. The reason is its shape on the fretboard: **two notes on every string**, in a compact block called the **box**.

## The open box: E minor pentatonic

E minor pentatonic is E, G, A, B, D. Five of those are open strings, so the scale sits right at the nut. On each string you play the open string and then one fretted note.

```widget
type: fretboard
frets: 5
positions: ["6/0", "6/3", "5/0", "5/2", "4/0", "4/2", "3/0", "3/2", "2/0", "2/3", "1/0", "1/3"]
labels: all
```

String by string, from the lowest:

- String 6: open, fret **3** (E, G)
- String 5: open, fret **2** (A, B)
- String 4: open, fret **2** (D, E)
- String 3: open, fret **2** (G, A)
- String 2: open, fret **3** (B, D)
- String 1: open, fret **3** (E, G)

The fretted notes go 3, 2, 2, 2, 3, 3. Play it up and back.

```widget
type: scale
tonic: E
scale: minor-pentatonic
views: [fretboard, tab]
```

And the whole box, across all six strings:

```widget
type: tab
title: E minor pentatonic, up and down
notes: "6/0:e 6/3:e 5/0:e 5/2:e 4/0:e 4/2:e 3/0:e 3/2:e | 2/0:e 2/3:e 1/0:e 1/3:e 1/0:e 2/3:e 2/0:e 3/2:e | 3/0:e 4/2:e 4/0:e 5/2:e 5/0:e 6/3:e 6/0:q"
tempo: 80
```

> The open box: every open string, plus frets 3, 2, 2, 2, 3, 3 from string 6 to string 1.

## A phrase from the box

Because the pentatonic has no half steps, almost any path through the box sounds like music. Here is a short blues-style phrase that stays inside it.

```widget
type: tab
title: A blues-style phrase written for this lesson
notes: "1/0:q 2/3:e 2/0:e 3/2:q 3/0:q | 3/2:e 2/0:e 2/3:q 1/0:h | 1/3:q 1/0:e 2/3:e 2/0:q 3/2:q | 3/0:e 4/2:e 4/0:h."
tempo: 84
```

## Moving the box: A minor pentatonic

Here is the real power of the shape. The open strings were acting as "fret 0". Slide every note up five frets, so that fret 5 takes the place of the open strings, and the same pattern gives **A minor pentatonic**: A, C, D, E, G.

```widget
type: fretboard
frets: 9
positions: ["6/5", "6/8", "5/5", "5/7", "4/5", "4/7", "3/5", "3/7", "2/5", "2/8", "1/5", "1/8"]
labels: all
```

Fret 5 on every string, then frets 8, 7, 7, 7, 8, 8: the same gaps of 3, 2, 2, 2, 3, 3 frets as before.

```widget
type: tab
title: A minor pentatonic at the fifth fret
notes: "6/5:e 6/8:e 5/5:e 5/7:e 4/5:e 4/7:e 3/5:e 3/7:e | 2/5:e 2/8:e 1/5:e 1/8:e 1/5:e 2/8:e 2/5:e 3/7:e | 3/5:e 4/7:e 4/5:e 5/7:e 5/5:e 6/8:e 6/5:q"
tempo: 80
```

The lowest note of the box, on string 6, is the **tonic**. Fret 5 of string 6 is A, so this is A minor pentatonic. Put the same shape at fret 3 and it is G minor pentatonic. One shape, twelve keys.

Change the tonic here and watch where the scale's notes land on the fretboard.

```widget
type: scale
tonic: A
scale: minor-pentatonic
views: [fretboard, tab]
interactive: true
```

In the exercises, play each scale upward from its tonic for one octave: for E, from open string 6 up to fret 2 of string 4.
