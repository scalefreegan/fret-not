---
id: core-0-overtones
title: The overtone series
track: core
level: 0
order: 5
concepts: [overtone-series]
summary: One note is really a stack of frequencies, all whole-number multiples of the lowest one.
exercises:
  - kind: harmonic-frequency
    concept: overtone-series
    count: 6
    fundamentals: [55, 110, 220, 100]
    maxHarmonic: 6
  - kind: quiz
    concept: overtone-series
    count: 4
    questions:
      - q: When you pluck one string and hear one note, how many frequencies are actually sounding?
        choices: [Exactly one, Many at once; the fundamental and its harmonics, Two; one for each end of the string]
        answer: 2
        explain: A real string vibrates in several of its patterns at the same time, so the note contains a whole stack of frequencies.
      - q: A note has a fundamental of 100 Hz. Which of these is NOT one of its harmonics?
        choices: [200 Hz, 250 Hz, 300 Hz]
        answer: 2
        explain: Harmonics are whole-number multiples of the fundamental. 250 is two and a half times 100.
      - q: The harmonics of a note are spaced
        choices: [the same number of hertz apart, further apart the higher you go, closer together in hertz the higher you go]
        answer: 1
        explain: Each harmonic is one more multiple of the fundamental, so neighbours are always one fundamental apart (110, 220, 330, 440 and so on).
      - q: If so many frequencies are sounding, why do we hear a single note?
        choices: [The ear blends a harmonic stack into one pitch at the fundamental, The harmonics are too quiet to matter, The harmonics cancel out]
        answer: 1
        explain: Frequencies in a whole-number stack fuse in our hearing. We hear one pitch, and the harmonics colour it.
      - q: What is an overtone?
        choices: [Any harmonic above the fundamental, A note that is too loud, The lowest frequency in a note]
        answer: 1
        explain: Overtones are the harmonics above the fundamental. The first overtone is the second harmonic.
      - q: A spectrum display shows
        choices: [how a wave moves over time, how strong each frequency in a sound is, the note names on a keyboard]
        answer: 2
        explain: A spectrum has frequency along the bottom and one bar or peak for each frequency present. The height shows its strength.
---

In the last lesson you switched a string's patterns on one at a time. A real string does not do that. Pluck it and it vibrates in pattern 1, pattern 2, pattern 3 and more, all at once, layered on top of each other.

Pluck the string below near one end, then again near the middle, and watch which patterns take part each time.

```widget
type: string-sim
mode: pluck
note: A2
modes: 8
```

So a single note is not a single frequency. An A string tuned to 110 Hz also sounds 220, 330, 440, 550 Hz and upward, each quieter than the one before, more or less. This ladder of whole-number multiples is called the **overtone series** or **harmonic series**. The harmonics above the fundamental are the **overtones**.

## Build a note from its harmonics

Each slider below controls one harmonic of a 110 Hz note. Start with only the first slider up. Then raise the second, then the third, and keep going, watching both displays.

```widget
type: harmonic-mixer
note: A2
partials: 8
preset: sine
```

Two things are worth noticing.

First, the pitch you hear does not change. Adding harmonics makes the note brighter and fuller, but it stays the same note. Your ear fuses a whole-number stack into one pitch, the fundamental.

Second, look at the two pictures. One is the waveform you already know: the wave's shape grows more complicated with each harmonic you add, but it still repeats at the same rate. The other is new. It is a **spectrum**: frequency runs left to right, and each bar shows how strong one frequency is. The bars are evenly spaced, because each harmonic is exactly one fundamental higher than the last.

> A musical note is a fundamental plus harmonics at 2, 3, 4, 5 … times its frequency. We hear the stack as one pitch.

Now pull the first slider all the way down while leaving the others up. The pitch still seems to be 110 Hz, even though nothing is vibrating at 110 Hz any more. Your ear works out the missing fundamental from the spacing of the others.
