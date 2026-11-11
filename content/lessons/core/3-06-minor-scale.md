---
id: core-3-minor-scale
title: The natural minor scale
track: core
level: 3
order: 6
concepts: [minor-scale]
summary: A second seven-note pattern with a darker sound, and its close tie to the major scale.
exercises:
  - kind: build-scale
    concept: minor-scale
    count: 5
    types: [natural-minor]
    tonics: [A, E, D]
  - kind: play-scale
    concept: minor-scale
    count: 3
    instrument: piano
    types: [natural-minor]
    tonics: [A, E, D]
  - kind: name-key
    concept: minor-scale
    title: Name the minor key
    count: 5
    maxAccidentals: 2
    mode: minor
  - kind: quiz
    concept: minor-scale
    count: 3
    questions:
      - q: What is the pattern of steps in a natural minor scale?
        choices: [W W H W W W H, W H W W H W W, W H W W W H W]
        answer: 2
        explain: "Whole, half, whole, whole, half, whole, whole."
      - q: Which minor scale uses only the white keys of the piano?
        choices: [C minor, E minor, A minor]
        answer: 3
        explain: A to A on the white keys is the A natural minor scale. It shares its notes with C major.
      - q: What is the relative minor of G major?
        choices: [E minor, A minor, B minor]
        answer: 1
        explain: The relative minor starts on the sixth note of the major scale. The sixth note of G major is E. Both have one sharp.
      - q: Compared with the major scale on the same starting note, which notes of the natural minor scale are lower?
        choices: ["The 3rd, 6th and 7th", "The 2nd and 5th", "Only the 3rd"]
        answer: 1
        explain: "C major is C D E F G A B. C natural minor is C D E flat F G A flat B flat."
      - q: A minor and C major share exactly the same seven notes. What makes a piece one or the other?
        choices: [How loud it is, "Which note feels like home, the tonic", How fast it is]
        answer: 2
        explain: Same notes, different centre. Music in A minor keeps returning to and resting on A.
---

Play the white keys from C to C and you get the major scale. Play the same white keys from **A to A** and the mood shifts: darker, more serious. This is the **natural minor scale**.

```widget
type: scale
tonic: A
scale: natural-minor
views: [staff, keyboard]
```

## The pattern

The half steps are still B to C and E to F, but because the scale starts on A they now fall in different places:

> W H W W H W W

The half steps sit between notes **2 and 3** and between notes **5 and 6**. The first of those is what matters most: the third note of a minor scale is only a **minor third** (3 half steps) above the tonic, where the major scale has a major third. That lowered third is the source of the minor sound.

As with the major scale, the pattern can start on any note. Here is E natural minor, which needs one sharp to keep the pattern. Switch the scale between natural minor and major on the same tonic and watch the third, sixth and seventh notes move.

```widget
type: scale
tonic: E
scale: natural-minor
views: [staff, keyboard]
interactive: true
```

## Relative major and minor

A minor and C major contain exactly the same seven notes. So do E minor and G major. Scales paired like this are called **relatives**.

- The **relative minor** starts on the **sixth note** of a major scale. The sixth note of C major is A, so its relative minor is A minor.
- Going the other way, the **relative major** starts on the **third note** of a minor scale.

Relatives share a **key signature**. No sharps or flats means C major *or* A minor. One sharp means G major *or* E minor. Press a few keys on the circle and read off each one's relative minor.

```widget
type: circle-of-fifths
key: C
```

> Every key signature stands for two keys: a major key and its relative minor, which starts on the major scale's sixth note.

How do you tell which one a piece is in? By which note feels like home. Music in a minor key keeps returning to its own tonic, and usually ends there.

This old English carol is in E minor. It has the one-sharp signature of G major, but listen to how it pulls toward E.

```widget
type: melody
title: God Rest Ye Merry, Gentlemen (traditional English carol), opening
notes: "r:h. E4:q | E4:q B4:q B4:q A4:q | G4:q F#4:q E4:q D4:q | E4:q F#4:q G4:q A4:q | B4:h. r:q"
key: Em
tempo: 104
```

There are two other common minor scales, the harmonic and melodic minor, which raise one or two notes of this one. They wait for a later level. "Natural" means the plain form, with nothing altered.
