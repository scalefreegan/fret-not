# Fret Not — content format

Everything under `content/` is the curriculum. It is plain markdown and YAML,
tracked by git, loaded fresh on every request (no cache, no database). This
document is the contract between the content, the loader
(`web/server/loader.ts`), and the UI. The parameter tables for every widget and
exercise kind are generated from `web/shared/registry.ts` into
[`CONTENT-REFERENCE.md`](CONTENT-REFERENCE.md) — read that alongside this.

```
content/
  curriculum.yaml         tracks, levels, concepts
  instruments/<id>.yaml   one per instrument
  lessons/<track>/*.md    one file per lesson
```

**Always validate after editing:** `npm run check:content` (add `-- --gaps` to
list concepts that no lesson teaches or no exercise tests). A lesson with any
problem is refused whole and listed with the reason; the app shows the same
list under "Content problems".

## curriculum.yaml

- **tracks** — `id`, `title`, `summary`, and for an instrument track
  `instrument:` (a file in `instruments/`). `core` is the theory track.
- **levels** — `id` (0, 1, 2 …), `title`, `summary`. `status: outline` marks a
  level that has no lessons yet and lists its `topics`.
- **concepts** — the unit mastery is tracked on. `id` (lowercase-with-dashes),
  `title`, `level`, `track` (default `core`), `requires` (concept ids that
  should come first).

A concept is small enough to test directly: "the octave", "notes on the low E
and A strings". Add a concept before writing the lesson that teaches it.

## Lessons

`content/lessons/<track>/<level>-<order>-<slug>.md`, for example
`content/lessons/core/0-02-pitch-is-frequency.md`:

````markdown
---
id: core-0-pitch
title: Pitch is frequency
track: core
level: 0
order: 2
concepts: [pitch-frequency]
summary: Faster vibration sounds higher. Frequency is how we measure it.
exercises:
  - kind: ear-higher-lower
    concept: pitch-frequency
    count: 5
    minSemitones: 3
  - kind: quiz
    concept: pitch-frequency
    count: 2
    questions:
      - q: A string vibrates 220 times a second. What is its frequency?
        choices: [110 Hz, 220 Hz, 440 Hz]
        answer: 2
        explain: Hertz means "times per second".
---

A short paragraph. Then something to play with:

```widget
type: frequency-explorer
min: 55
max: 880
```

Another short paragraph that says what to notice in the widget above.
````

Frontmatter:

| Field | |
|---|---|
| `id` | Unique, lowercase-with-dashes. Convention: `<track>-<level>-<slug>`. Never change an id once the lesson is live: progress is stored against it. |
| `title` | Short. |
| `track`, `level` | Must exist in `curriculum.yaml`. |
| `order` | Number. Lessons in a level run core first, then piano, then guitar, each by `order`. |
| `concepts` | Concept ids this lesson teaches (at least one). |
| `summary` | One sentence, shown on the path. |
| `mirrors` | Optional, on instrument lessons: the id of the core lesson this is the counterpart of. |
| `exercises` | Optional list of exercise declarations (below). |

### Body

Ordinary markdown, rendered by a small built-in renderer. Supported: `##` and
`###` headings, paragraphs, `**bold**`, `*italic*`, `` `code` ``, bulleted and
numbered lists, and `>` block quotes (rendered as a highlighted "key idea"
box). Not supported: images, tables, links, raw HTML. If something needs a
picture, it needs a widget.

A widget is a fenced block with the info string `widget` containing YAML: a
`type` from the registry plus that widget's parameters.

### Writing lessons that work

- **One idea per lesson, ten minutes or less.** Three to six short blocks of
  prose, two to four widgets, then exercises.
- **Show before telling.** Put the widget right after the sentence that sets up
  what to try in it, and follow it with what the learner should have noticed.
  Tell the learner what to *do* in each widget ("drag the slider up slowly").
- **Write for an adult beginner** with no music background: plain words, every
  term defined the first time it appears, no assumed knowledge beyond earlier
  lessons. Do not talk down.
- **Be exactly right.** Frequencies, ratios, note names and spellings must be
  correct; prefer saying less to saying something loose.
- **Pitches are sounding pitches** everywhere (`C4` is middle C, 261.6 Hz). The
  guitar's octave transposition on the staff is handled by the widgets.
- **Music examples** must be public domain (traditional tunes, composers dead
  long enough, e.g. Bach, Beethoven) or written for the lesson. Give the source
  in the widget's `title`. No copyrighted songs: the repository is public.
- **Instrument lessons** teach where things are and how they are shaped, not
  physical technique.

## Exercises

Each declaration names a `kind`, the `concept` it tests (which must be in the
lesson's `concepts`), a `count` (questions asked, default 5, at most 20), an
optional `title`, and the kind's own parameters, all at the same level:

```yaml
exercises:
  - kind: name-note
    concept: treble-clef-notes
    count: 8
    view: staff
    clef: treble
    range: [E4, F5]
```

Questions are **generated and graded by the app's music engine**
(`web/shared/exercises.ts`), with fresh random questions each run. The only
kind with authored answers is `quiz`, for ideas no generator covers; its
`answer` is the 1-based index of the correct choice and is checked by the
loader. Give every quiz question an `explain`.

Aim for two to four exercises per lesson, mixing groups (identify, ear, play,
build) where the concept allows, and make sure every concept the lesson lists
is tested by at least one.

## Token formats

| What | Form | Examples |
|---|---|---|
| Pitch | letter, optional `#`/`b`, octave | `C4` (middle C), `F#3`, `Bb2` |
| Note name | letter, optional `#`/`b` | `C`, `F#`, `Bb` |
| Interval | quality + number | `m2 M2 m3 M3 P4 A4 d5 P5 m6 M6 m7 M7 P8` |
| Chord symbol | root + suffix | `C`, `Am`, `G7`, `Fmaj7`, `Bdim`, `Dsus4`, `E5` |
| Chord type | | `maj min dim aug sus2 sus4 5 6 m6 7 maj7 m7 m7b5 dim7` |
| Scale type | | `major natural-minor harmonic-minor melodic-minor major-pentatonic minor-pentatonic blues dorian phrygian lydian mixolydian locrian` |
| Key | tonic, `m` for minor | `C`, `G`, `Em`, `Bb`, `F#m` |
| Fretboard position | string/fret, string 1 = high E, 6 = low E | `6/0` (open low E), `2/1` (C4) |
| Duration | `w h q e s`, optional `.` (dotted), optional `r` (rest) | `q`, `h.`, `er` |
| Rhythm | durations, `\|` for bar lines | `q q e e h \| w` |
| Melody | `pitch:duration`, `r:duration` rest, `+` joins a chord | `C4:q D4:q E4:h \| r:q G4+B4:h.` |
| Tab line | `string/fret:duration` | `6/0:q 6/3:q 5/0:h` |

One beat is a quarter note. When bar lines are written, every bar except the
last must hold exactly what the time signature says, or the loader refuses the
lesson.

Guitar chord boxes (`chord-diagram`, and `chord` with the `diagram` view) can
only show chords with a stored shape: `C D E G A F B Am Dm Em Bm F#m A7 B7 C7 D7
E7 G7 Am7 Dm7 Em7 Cmaj7 Fmaj7 Gmaj7 Dsus4 Asus4 E5 A5 G5`. New shapes go in
`GUITAR_SHAPES` in `web/shared/music/instruments.ts` (a test checks each really
spells its chord).

## Adding an instrument

1. `content/instruments/<id>.yaml`: `title`, `layout` (`keyboard` or
   `fretboard`), `range`, `timbre`, and for fretted instruments `tuning`
   (lowest string first) and `frets`; `writtenOffset` if its notation is
   transposed.
2. A track in `curriculum.yaml` with `instrument: <id>`, plus its concepts.
3. Lessons under `content/lessons/<id>/`.
4. If the layout is new (not a keyboard or a fretboard), a renderer in
   `web/src/widgets/` and a sample set or synth voice in `web/src/audio/`.
