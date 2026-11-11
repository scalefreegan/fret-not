---
id: guitar-2-tablature
title: Reading tablature
track: guitar
level: 2
order: 1
concepts: [tablature]
summary: Tab is a picture of the strings. Each number tells you which fret to press on which string.
exercises:
  - kind: play-note
    concept: tablature
    title: Play what the tab says
    count: 8
    instrument: guitar
    from: tab
    maxFret: 5
  - kind: name-note
    concept: tablature
    title: Which note is this?
    count: 6
    view: tab
    strings: [5, 6]
    maxFret: 5
  - kind: quiz
    concept: tablature
    count: 3
    questions:
      - q: How many lines does guitar tab have, and what do they stand for?
        choices: ["Five lines, standing for pitches", "Six lines, one for each string", "Six lines, one for each fret"]
        answer: 2
        explain: Tab is a diagram of the instrument. One line per string.
      - q: Which string is the top line of the tab?
        choices: ["String 1, the thin high E string", "String 6, the thick low E string"]
        answer: 1
        explain: Tab is drawn with the highest-sounding string at the top, so higher notes appear higher on the page.
      - q: What does a 0 on a tab line mean?
        choices: [Do not play that string, Play that string open with no fret pressed, Press the string at the nut]
        answer: 2
        explain: The number is the fret. Fret 0 is the open string.
      - q: A 3 is written on the bottom line of the tab. What do you play?
        choices: ["Fret 3 on the low E string", "Fret 3 on the high E string", "String 3, open"]
        answer: 1
        explain: The bottom line is string 6, the low E string. Fret 3 there is the note G.
      - q: Two numbers are stacked directly above one another in tab. What does that mean?
        choices: [Play them one after the other, Play them at the same time, Choose either one]
        answer: 2
        explain: Tab reads left to right in time. Numbers in the same vertical slice sound together.
---

Guitarists have their own way of writing music, called **tablature**, or **tab**. Where the staff shows *which pitch* to play, tab shows *where to put your finger*.

Tab has **six lines, one for each string**. It is drawn the way the sound goes, highest at the top:

- The **top line** is string 1, the thin high E string.
- The **bottom line** is string 6, the thick low E string.

That matches the fretboard picture in this app, which also has the low E string at the bottom.

A **number on a line** means: press that string at that fret and pluck it. **0** means the open string. You read from left to right, just like the staff.

Play this and watch each number light up on the fretboard. It walks up the low E string and then the A string.

```widget
type: tab
title: Walking up the two lowest strings
notes: "6/0:q 6/1:q 6/3:q 6/5:q | 5/0:q 5/2:q 5/3:q 5/5:q"
tempo: 80
staff: false
```

Those were the notes E, F, G, A on string 6, then A, B, C, D on string 5. The fifth fret of string 6 and the open string 5 are the same A, as you found in Level 1.

> In tab, the line tells you the string and the number tells you the fret.

## A tune in tab

Here is a tune on the two highest strings. Play it, and follow the numbers.

```widget
type: tab
title: Ode to Joy (Beethoven, Symphony No. 9), first phrase
notes: "1/0:q 1/0:q 1/1:q 1/3:q | 1/3:q 1/1:q 1/0:q 2/3:q | 2/1:q 2/1:q 2/3:q 1/0:q | 1/0:q. 2/3:e 2/3:h"
tempo: 88
staff: false
```

## What tab leaves out

Plain tab found in songbooks and online often shows only the numbers, with no rhythm at all. You are expected to know how the song goes. Better tab adds stems and flags to the numbers, or prints a staff above with the same music, so you get the rhythm too.

Here is the same phrase with the staff shown above the tab. Each number lines up with its note.

```widget
type: tab
title: Ode to Joy with the staff above
notes: "1/0:q 1/0:q 1/1:q 1/3:q | 1/3:q 1/1:q 1/0:q 2/3:q | 2/1:q 2/1:q 2/3:q 1/0:q | 1/0:q. 2/3:e 2/3:h"
tempo: 88
```

The next lesson looks at how that staff relates to the guitar.
