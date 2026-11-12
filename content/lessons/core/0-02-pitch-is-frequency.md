---
id: core-0-pitch
title: Pitch is frequency
track: core
level: 0
order: 2
concepts: [pitch-frequency]
summary: How high or low a note sounds depends on how many times a second it vibrates.
exercises:
  - kind: ear-higher-lower
    concept: pitch-frequency
    vocab: plain
    count: 6
    minSemitones: 3
    maxSemitones: 12
    timbre: sine
  - kind: quiz
    concept: pitch-frequency
    count: 4
    questions:
      - q: A string vibrates 220 times every second. What is its frequency?
        choices: [110 Hz, 220 Hz, 440 Hz]
        answer: 2
        explain: Hertz (Hz) means "times per second", so 220 vibrations a second is 220 Hz.
      - q: Which of these sounds highest?
        choices: [110 Hz, 220 Hz, 880 Hz]
        answer: 3
        explain: More vibrations per second means a higher pitch.
      - q: On a waveform, a higher note looks like
        choices: [taller waves, waves packed closer together, a flatter line]
        answer: 2
        explain: Higher frequency means each back-and-forth cycle takes less time, so the cycles sit closer together.
      - q: What does "pitch" mean?
        choices: [How loud a note is, How long a note lasts, How high or low a note sounds]
        answer: 3
        explain: Pitch is the highness or lowness of a note. Loudness and length are separate things.
      - q: The note that orchestras and bands tune to, called A, is usually set to
        choices: [44 Hz, 440 Hz, 4400 Hz]
        answer: 2
        explain: Concert pitch is A = 440 Hz, that is 440 vibrations per second.
      - q: Roughly what range of frequencies can a young, healthy human ear hear?
        choices: [1 Hz to 100 Hz, 20 Hz to 20000 Hz, 1000 Hz to 1000000 Hz]
        answer: 2
        explain: Hearing runs from about 20 Hz to about 20,000 Hz, and the top of that range drops with age.
  - kind: ear-higher-lower
    concept: pitch-frequency
    vocab: plain
    title: Smaller differences
    count: 5
    minSemitones: 1
    maxSemitones: 3
    timbre: piano
---

A vibration can be slow or fast. The number of complete back-and-forth cycles it makes each second is its **frequency**, measured in **hertz** (written Hz). A string that swings back and forth 110 times in one second has a frequency of 110 Hz.

Drag the slider up slowly and listen, while watching the wave.

```widget
type: frequency-explorer
min: 55
max: 880
start: 110
showNotes: false
```

As the frequency rises, two things happen together: the waves crowd closer, and the sound gets higher. How high or low a sound seems is called its **pitch**, and pitch is simply how our ears experience frequency.

> Faster vibration, higher pitch. Slower vibration, lower pitch.

## Frequencies have names

Musicians do not usually talk in hertz. They give certain frequencies letter names, such as A or C. Drag the slider again, this time with the nearest note name showing.

```widget
type: frequency-explorer
min: 55
max: 880
start: 440
showNotes: true
```

Stop at 440 Hz. That note is the A that orchestras tune to, and the whole system of note names is anchored to it. You will learn the names properly in Level 1. For now, notice that the same letter comes back several times as you sweep: 110, 220, 440 and 880 Hz are all called A. There is a good reason, and it gets its own lesson soon.

## What you can hear

Human hearing runs from about 20 Hz, a deep rumble, to about 20,000 Hz, a thin hiss. Most music lives in the lower part of that range: the lowest note of a piano is 27.5 Hz and the highest is about 4,186 Hz.
