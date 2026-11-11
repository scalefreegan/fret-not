---
id: guitar-0-sound
title: How a guitar makes sound
track: guitar
level: 0
order: 1
mirrors: core-0-string-modes
concepts: [guitar-sound]
summary: A plucked string drives the guitar's wooden top, and pressing a fret shortens the string to raise its pitch.
exercises:
  - kind: quiz
    concept: guitar-sound
    count: 5
    questions:
      - q: What happens to a guitar string when you press it down behind a fret?
        choices: [It gets tighter, Its vibrating part gets shorter, It gets heavier]
        answer: 2
        explain: Only the part between the fret and the bridge can vibrate. Shorter string, higher frequency.
      - q: You press a string at the 12th fret, exactly halfway along. Compared with the open string, the note is
        choices: [one octave higher, one octave lower, the same]
        answer: 1
        explain: Half the length doubles the frequency, and double the frequency is one octave up.
      - q: The open low E string vibrates at about 82.4 Hz. About what frequency does it give at the 12th fret?
        choices: [41.2 Hz, 94.4 Hz, 164.8 Hz]
        answer: 3
        explain: The 12th fret halves the string, which doubles the frequency.
      - q: What is the job of the guitar's hollow wooden body?
        choices: [To hold the strings tight, To turn the strings' small vibration into movement of a lot of air, To change the pitch of the strings]
        answer: 2
        explain: A string alone is very quiet. It shakes the bridge, the bridge shakes the top of the body, and the top and the air inside move enough air to be heard.
      - q: You pluck a string close to the bridge instead of over the sound hole. The note sounds
        choices: [brighter and thinner, lower in pitch, exactly the same]
        answer: 1
        explain: Plucking near the end puts more energy into the high harmonics. The pitch does not change.
      - q: Why are a guitar's low strings thicker than its high strings?
        choices: [Heavier strings vibrate more slowly, They need to be louder, They are easier to press]
        answer: 1
        explain: All six strings are the same length, so the low ones are made heavier to bring their frequency down.
      - q: What does turning a tuning peg change?
        choices: [The string's length, The string's tension, The string's weight]
        answer: 2
        explain: Tightening a string raises its frequency and loosening it lowers it.
  - kind: ear-higher-lower
    concept: guitar-sound
    vocab: plain
    count: 4
    minSemitones: 1
    maxSemitones: 5
    timbre: guitar
---

A guitar has six strings stretched over a long neck and a hollow wooden body. You set a string moving with a finger or a pick, and you choose its pitch with your other hand by pressing it against the neck.

Pluck a string in the picture below, then press it at different frets and pluck again.

```widget
type: instrument-anatomy
instrument: guitar
```

## From string to sound

1. **The string** runs from the **nut**, at the top of the neck, to the **bridge**, on the body. Between those two fixed points it vibrates in all its patterns at once.
2. **The bridge** sits on the thin wooden top of the body. The string rocks the bridge, and the bridge shakes the top.
3. **The top and the body** do the same job as a piano's soundboard. A string by itself moves very little air. The top is large and light, and the air inside the body moves with it, in and out of the sound hole.

> A guitar note is a plucked string made loud by the wooden top it is attached to.

## Frets shorten the string

The metal strips across the neck are **frets**. Press a string down just behind one and the string now ends at that fret instead of at the nut. The vibrating part is shorter, so the frequency is higher.

The frets are placed so that each one raises the pitch by the same musical step. The 12th fret sits exactly halfway along the string: half the length, double the frequency, one octave up. Play the two marked places below, the open string and the 12th fret.

```widget
type: fretboard
frets: 12
positions: ["6/0", "6/12"]
labels: none
```

Look at how the frets crowd together as they climb. Each fret shortens what is left of the string by the same *proportion* (a little under 6 percent), so as the string gets shorter, the distance to the next fret shrinks too.

## Where you pluck

Drag the string below aside near its middle and let go. Then do the same very close to one end.

```widget
type: string-sim
mode: pluck
note: E2
modes: 8
```

Near the middle, the low patterns dominate and the tone is round and warm. Near the end, far more of the energy goes into the high harmonics and the tone turns bright and thin. Guitarists use this all the time, moving the picking hand toward the bridge for bite and toward the neck for warmth.

## Six strings, one length

All six strings are the same length, so their different pitches come from weight and tension. The low strings are thick and wound with wire to make them heavy. The **tuning pegs** on the head adjust each string's tension: tighter is higher.
