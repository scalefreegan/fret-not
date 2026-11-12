---
id: core-0-timbre
title: Timbre
track: core
level: 0
order: 6
concepts: [timbre]
summary: Instruments sound different on the same note because they mix the harmonics in different strengths.
exercises:
  - kind: ear-timbre
    concept: timbre
    count: 6
    sources: [sine, piano, guitar]
  - kind: ear-timbre
    concept: timbre
    title: Pure shapes
    count: 5
    sources: [sine, square, saw]
  - kind: quiz
    concept: timbre
    count: 4
    questions:
      - q: A piano and a guitar both play the A at 220 Hz. What is the same about the two sounds?
        choices: [The fundamental frequency, The strength of each harmonic, The shape of the waveform]
        answer: 1
        explain: Same note means same fundamental. The mix of harmonics, and so the wave's shape, is what differs.
      - q: What mostly decides the timbre of a steady note?
        choices: [Its fundamental frequency, The relative strengths of its harmonics, How long it lasts]
        answer: 2
        explain: Timbre is the colour of a sound, and it comes mainly from which harmonics are strong and which are weak.
      - q: A sound with only a fundamental and no overtones is called
        choices: [a sine wave, a spectrum, an overtone series]
        answer: 1
        explain: A sine wave is the plainest possible sound, a single frequency. Its spectrum has one bar.
      - q: You add strong high harmonics to a note. It sounds
        choices: [lower, brighter, quieter]
        answer: 2
        explain: Strong upper harmonics make a sound bright or buzzy. Weak ones leave it dull or mellow. The pitch does not change.
      - q: Which spectrum belongs to the mellowest sound?
        choices: [One tall bar and nothing else, Ten bars all the same height, Bars that get taller toward the high end]
        answer: 1
        explain: A single bar is a pure sine wave, the mellowest sound there is.
---

Play the same note on a piano and on a guitar and nobody confuses the two. The pitch is the same and the loudness can be the same, so something else differs. That something is called **timbre** (say "TAM-ber"): the colour or character of a sound.

Play each source below and compare the pictures under them.

```widget
type: timbre-compare
note: A3
sources: [sine, piano, guitar]
```

All three have their lowest bar in the same place, at 220 Hz. That is why they are the same note. What differs is everything above it: the sine wave has nothing else at all, while the piano and the guitar each have a stack of harmonics with their own pattern of strong and weak bars.

> Timbre comes mostly from the mix of harmonics: which are strong, which are weak, and how they change as the note sounds.

## Make your own timbres

The mixer from the last lesson lets you hear this directly. It starts on a "saw" mix, with every harmonic present. Pull down every second slider (2, 4, 6, 8) and listen to the sound become hollow.

```widget
type: harmonic-mixer
note: A2
partials: 8
preset: saw
```

Now try it starting from the piano mix, and nudge the high sliders up and down.

```widget
type: harmonic-mixer
note: A2
partials: 8
preset: piano
```

More strength in the high harmonics sounds brighter. Less sounds rounder and duller. The pitch never moves.

Two classic mixes have names you will meet in the exercises. A **saw** wave has every harmonic, each a little weaker than the last, and sounds bright and buzzy. A **square** wave has only the odd-numbered harmonics (1, 3, 5 …) and sounds hollow, a little like a clarinet. A **sine** wave is the fundamental alone.

## More than a recipe

A steady mix of harmonics is most of the story but not all of it. Real instruments also change over the life of a note. A piano note begins with the knock of the hammer and its high harmonics fade faster than its low ones. A plucked guitar string starts bright and mellows within a second. Those changes are part of what your ear uses to recognise an instrument, and you will look at both instruments closely in their own lessons.
