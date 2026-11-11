---
id: piano-0-sound
title: How a piano makes sound
track: piano
level: 0
order: 1
mirrors: core-0-string-modes
concepts: [piano-sound]
summary: Each key throws a felt hammer at tuned strings, and a large wooden board turns their vibration into sound.
exercises:
  - kind: quiz
    concept: piano-sound
    count: 5
    questions:
      - q: What sets a piano string vibrating?
        choices: [A felt-covered hammer strikes it, A pick plucks it, A bow rubs it]
        answer: 1
        explain: Pressing a key throws a hammer at the string. The hammer bounces straight off so the string can ring.
      - q: Why does the hammer bounce away instead of staying against the string?
        choices: [To make the note louder, So it does not stop the string vibrating, To change the pitch]
        answer: 2
        explain: Anything resting on a string damps it. The hammer hits and falls back so the string is free.
      - q: What does a damper do?
        choices: [It rests on the string to silence it when the key is released, It tightens the string, It strikes the string a second time]
        answer: 1
        explain: While a key is down its damper is lifted. Let go and the felt damper drops back and stops the string.
      - q: What is the soundboard for?
        choices: [It holds the keys in place, It is a large wooden panel that the strings set vibrating so it moves much more air, It keeps the strings in tune]
        answer: 2
        explain: A thin string moves very little air. The strings pass their vibration to the soundboard, which has a big surface and makes the sound loud.
      - q: Why are the lowest strings of a piano long, thick and wrapped in wire?
        choices: [Longer and heavier strings vibrate more slowly, Thick strings are louder, To make the keys heavier]
        answer: 1
        explain: Low notes need low frequencies. More length and more weight both lower a string's frequency.
      - q: You press a piano key harder. What changes?
        choices: [The hammer hits faster so the note is louder and brighter, The pitch goes up, A different string is struck]
        answer: 1
        explain: A harder press means a faster hammer and a bigger vibration. The string is the same, so the pitch is the same.
      - q: How many keys does a full-size piano have?
        choices: [61, 76, 88]
        answer: 3
        explain: A standard piano has 88 keys, from the A at 27.5 Hz up to the C at about 4,186 Hz.
  - kind: ear-timbre
    concept: piano-sound
    count: 4
    sources: [piano, guitar, sine]
---

A piano is a string instrument that you play with a keyboard. Inside the case are more than two hundred steel strings, and each of the 88 keys is the end of a small machine for hitting them.

Press the key in the picture below and watch what each part does. Then hold the key down and let go.

```widget
type: instrument-anatomy
instrument: piano
```

## From key to sound

1. **The key** is a lever. Pressing its front end lifts its back end.
2. **The hammer**, a wooden arm tipped with dense felt, is thrown upward at the strings. It hits and immediately falls back, so that it does not smother the vibration it has just started.
3. **The damper**, a felt pad that normally rests on the strings, lifts off when the key goes down. When you release the key it drops back and the note stops.
4. **The strings** vibrate, in all their patterns at once, exactly as in the core lessons.
5. **The soundboard** makes it audible. A string is too thin to push much air by itself. The strings cross a wooden bridge that passes their vibration into a large thin panel of wood, and that panel moves the air.

> A piano note is a struck string, kept ringing as long as the key is held and made loud by the soundboard.

## Striking a string

A hammer blow is different from a pluck: the string is knocked into motion rather than pulled aside and released. Strike the string below, then move the striking point along the string and strike again.

```widget
type: string-sim
mode: strike
note: A2
modes: 8
```

Where the hammer hits decides which harmonics get going. A pattern that has a still point exactly at the striking place barely sounds at all, because you cannot start a pattern moving by pushing on a point where it does not move. Piano makers choose the striking point carefully for this reason.

## One string per note, more or less

Unlike a guitar, a piano does not change a string's length while playing. Every note has its own strings, already tuned. Low notes use long, heavy strings wrapped in copper wire to slow them down, and high notes use short thin ones. Most notes have two or three strings tuned alike and struck together, which makes the sound fuller.

Because the hammer is thrown, how hard you press matters. A faster hammer makes a bigger vibration, so the note is louder, and it also excites more of the high harmonics, so the note is brighter. The pitch does not change.

```widget
type: timbre-compare
note: A3
sources: [piano, sine]
```
