---
id: piano-2-staff-to-keys
title: From the staff to the keys
track: piano
level: 2
order: 1
mirrors: core-2-treble-clef
concepts: [reading-on-keyboard]
summary: Three landmark notes tie the grand staff to the keyboard. Everything else is a step or two from one of them.
exercises:
  - kind: play-note
    concept: reading-on-keyboard
    title: Right-hand notes
    count: 8
    instrument: piano
    from: staff
    clef: treble
    range: [C4, G5]
  - kind: play-note
    concept: reading-on-keyboard
    title: Left-hand notes
    count: 8
    instrument: piano
    from: staff
    clef: bass
    range: [F2, C4]
  - kind: name-note
    concept: reading-on-keyboard
    title: Which note is this key?
    count: 5
    view: keyboard
    range: [F2, G5]
---

On the piano, written notes and keys match one to one: each line or space is one particular white key, not just a letter. Reading piano music means going straight from a position on the staff to a place under your hand.

Piano music is written on the grand staff. As a rule of thumb the **upper staff (treble clef) is for the right hand** and the **lower staff (bass clef) is for the left hand**.

## Three landmarks

Learn exactly where these three notes are, both on the page and on the keys:

- **Middle C** (C4): one ledger line below the treble staff, or one above the bass staff. On the keyboard it is the C nearest the middle, just left of a pair of black keys.
- **Treble G** (G4): line 2 of the treble staff, where the clef curls. It is the G just above middle C.
- **Bass F** (F3): line 4 of the bass staff, between the clef's dots. It is the F just below middle C.

```widget
type: linked
notes: [F3, C4, G4]
views: [staff, keyboard]
clef: grand
interactive: false
```

Bass F and treble G sit the same distance either side of middle C, like a mirror: five letters down (C B A G F) and five letters up (C D E F G).

## Stepping from a landmark

On the staff, one step (line to space, or space to line) is **one white key** to the right or left. A skip from a line to the next line, or from a space to the next space, is **two white keys**: you jump over one.

Press different lines and spaces on the staff below and watch the key move. Then do it the other way: press a key and see where it is written.

```widget
type: linked
notes: [C4]
views: [staff, keyboard]
clef: grand
```

> Step on the staff = next white key. Skip on the staff = jump over one white key.

Follow this tune on the keyboard as it plays. It only ever moves by step or stays put, so each new note is the same key or its neighbour.

```widget
type: melody
title: Ode to Joy (Beethoven, Symphony No. 9), first phrase
notes: "E4:q E4:q F4:q G4:q | G4:q F4:q E4:q D4:q | C4:q C4:q D4:q E4:q | E4:q. D4:e D4:h"
views: [staff, keyboard]
tempo: 88
```

And one in the bass clef, for the left hand.

```widget
type: melody
title: Frère Jacques (traditional French round), opening, for the left hand
notes: "C3:q D3:q E3:q C3:q | C3:q D3:q E3:q C3:q | E3:q F3:q G3:h | E3:q F3:q G3:h"
clef: bass
views: [staff, keyboard]
tempo: 96
```
