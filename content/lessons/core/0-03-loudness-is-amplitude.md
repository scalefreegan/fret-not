---
id: core-0-loudness
title: Loudness is amplitude
track: core
level: 0
order: 3
concepts: [loudness-amplitude]
summary: How loud a note sounds depends on how big the vibration is, not how fast.
exercises:
  - kind: quiz
    concept: loudness-amplitude
    count: 5
    questions:
      - q: What is the amplitude of a vibration?
        choices: [How many times it repeats each second, How far it swings from its resting place, How long it lasts]
        answer: 2
        explain: Amplitude is the size of the swing. Frequency is how often it repeats.
      - q: You pluck a string gently, then pluck the same string hard. What changes?
        choices: [The amplitude, and so the loudness, The frequency, and so the pitch, Nothing]
        answer: 1
        explain: A harder pluck pulls the string further, so it swings wider and sounds louder. Its pitch stays the same.
      - q: On a waveform, a louder note looks like
        choices: [taller waves, waves packed closer together, fewer waves]
        answer: 1
        explain: Height on a waveform is amplitude. Spacing is frequency.
      - q: Two waveforms have the same height but one has its waves packed closer together. The closer one is
        choices: [louder, higher in pitch, quieter]
        answer: 2
        explain: Same height means the same amplitude. Closer spacing means higher frequency, so higher pitch.
      - q: A note fades away after you pluck it. What is happening to the vibration?
        choices: [Its frequency is dropping, Its amplitude is shrinking, Both are dropping together]
        answer: 2
        explain: The swings get smaller, so the note gets quieter, while the string keeps vibrating at the same rate. That is why a fading note does not slide down in pitch.
      - q: Which pair describes a quiet, high note?
        choices: [Small amplitude and high frequency, Large amplitude and low frequency, Small amplitude and low frequency]
        answer: 1
        explain: Quiet means small amplitude. High means high frequency. The two are independent.
---

Frequency is how *often* a vibration repeats. The other basic property is how *big* it is: how far the string, or the air, swings away from rest on each cycle. That size is called the **amplitude**.

The slider you used in the last lesson now has a second control. Leave the frequency alone and move the loudness slider up and down.

```widget
type: frequency-explorer
min: 110
max: 880
start: 220
loudness: true
```

The waves get taller and shorter, and the sound gets louder and quieter, but the pitch does not move. Now hold the loudness still and change the frequency: the waves squeeze together and spread apart, but stay the same height.

> Amplitude is the height of the wave and we hear it as loudness. Frequency is the spacing of the wave and we hear it as pitch. Each can change without the other.

## Why a note fades without sinking

Pluck the string below and watch it die away.

```widget
type: string-sim
mode: pluck
note: A2
```

The swings shrink, so the sound gets quieter. But the string keeps going back and forth at the same rate the whole time, so the pitch holds steady until the note is gone. A hard pluck and a soft pluck of the same string give the same note at different loudness, for the same reason.
