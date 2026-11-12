---
id: core-2-time-signatures
title: Bars and time signatures
track: core
level: 2
order: 4
concepts: [time-signatures]
summary: Beats are grouped into bars. The time signature says how many beats are in each.
exercises:
  - kind: count-bar
    concept: time-signatures
    title: Complete the bar in 4/4
    count: 5
    time: 4/4
    values: [w, h, q]
  - kind: count-bar
    concept: time-signatures
    title: Complete the bar in 3/4
    count: 5
    time: 3/4
    values: [h, q]
  - kind: quiz
    concept: time-signatures
    count: 3
    questions:
      - q: What does the top number of a time signature tell you?
        choices: [How fast the music goes, How many beats are in each bar, Which note is the loudest]
        answer: 2
        explain: The top number counts the beats in a bar. Speed is tempo, which is separate.
      - q: In 3/4 time, how many quarter notes fill one bar?
        choices: [2, 3, 4]
        answer: 2
        explain: "3/4 means three beats in a bar, and each beat is a quarter note."
      - q: In 4/4 time, a bar already holds a half note. How many more beats does it need?
        choices: [1, 2, 3]
        answer: 2
        explain: A half note is 2 beats and the bar needs 4, so 2 more.
      - q: What does the bottom number 4 in 3/4 mean?
        choices: [Each beat is a quarter note, There are four bars, Play four times]
        answer: 1
        explain: The bottom number names the note value that gets one beat. 4 stands for a quarter note.
---

Tap along to almost any song and you will feel that the beats are not all equal. Some feel stronger, and they come round regularly: **ONE** two three four, **ONE** two three four.

Music is written in groups of beats called **bars** (also called measures). Each bar starts on a strong beat. On the page, bars are separated by vertical **bar lines**.

Start the metronome and listen for the accented first beat of each bar.

```widget
type: metronome
tempo: 90
time: 4/4
```

## The time signature

At the start of a piece are two numbers, one above the other. This is the **time signature**.

- The **top number** says how many beats are in each bar.
- The **bottom number** says which note value counts as one beat. A 4 means a quarter note.

So **4/4** means four quarter-note beats in every bar. It is by far the most common. **3/4** means three beats in a bar, the swaying feel of a waltz. **2/4** means two, the feel of a march.

Set the metronome above to 3/4 and hear how the strong beat now comes every three.

> Every bar holds exactly the number of beats the time signature says. The notes and rests inside can be any mix, but they must add up.

Here is a tune in 4/4. Count "1 2 3 4" in each bar as it plays. In the last bar one note has a small **dot** after it, which makes it half as long again: a dotted quarter lasts 1½ beats, and the quick eighth note after it fills the other half. The next lesson covers dots properly. For now, check that the bar still adds up: 1½ + ½ + 2 = 4.

```widget
type: melody
title: Ode to Joy (Beethoven, Symphony No. 9), opening
notes: "E4:q E4:q F4:q G4:q | G4:q F4:q E4:q D4:q | C4:q C4:q D4:q E4:q | E4:q. D4:e D4:h"
time: 4/4
tempo: 100
```

And one in 3/4. Count "1 2 3". The tune starts on beat 3, after two beats of rest. Its last note is a dotted half: 2 beats plus half as much again, 3 beats, a whole bar of 3/4.

```widget
type: melody
title: Amazing Grace (traditional American hymn tune), opening
notes: "r:h D4:q | G4:h B4:e G4:e | B4:h A4:q | G4:h E4:q | D4:h."
time: 3/4
tempo: 84
```

In the exercises you will be shown a bar with one note missing and asked which note value completes it. Add up what is there and see what is left.
