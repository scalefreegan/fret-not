# Fret Not — PRD

Personal, single-user, localhost, no auth. A **highly visual app for learning how
music works**: sound and harmonics, notes, rhythm, reading notation, intervals,
scales, chords, harmony and composition, with every idea shown, heard and drilled
on real instruments. Piano and guitar come first. The design must take more
instruments and more advanced learners without rework.

Decided 2026-11-10 in the intake interview (16 questions; all answers below are
final for v1):

| Decision | Choice |
|---|---|
| Focus | **Core theory track + one linked track per instrument.** The core teaches how music works; each instrument track shows and drills the same ideas on that instrument. A new instrument is a new track plus an instrument definition |
| Session shape | **Guided path + free lab.** A levelled path of short lessons (explain, see, hear, try, exercises) and an open sandbox of explorers with no order or scoring |
| AI agent | **Tutor + lesson author.** A side chat that knows the current lesson and recent exercise results, and that can write new lessons and exercises under `content/` (auto-committed, like Lingo Dojo) |
| Real instruments | None owned yet. **v1 is on-screen only** (virtual keyboard and fretboard, played by mouse or computer keyboard). Input is a pluggable layer so MIDI and microphone can be added later without touching exercises |
| Sound physics | **Interactive physics foundation** as a full first level: vibrating string, overtone series, live waveform and spectrum, why octaves and fifths are consonant, how a struck piano string and a plucked guitar string make sound |
| Notation | All four in v1: **staff** (treble and bass), **rhythm** (durations, rests, bars, time signatures), **guitar tablature**, **chord diagrams and symbols** |
| Progress | **Mastery + spaced review.** Per-concept mastery from exercise results, reviews at growing intervals, levels unlock as mastery builds, a placement check lets a more advanced learner skip ahead |
| Sound | **Recorded piano and guitar samples** (openly licensed sets) for lessons and exercises, plus a **synth engine** for the physics lessons where harmonics are added and removed one at a time |
| Learners | **One learner, profile-ready.** Progress is stored per profile id so more learners are a small later change. No profile switcher and no kids mode in v1 |
| Exercises | All four kinds in v1: **identify** what you see, **ear training**, **play it** on the virtual instrument, **build it** from a rule |
| Composition | **Sketchpad in the lab** (melody + chord progression with playback on staff, keyboard and fretboard). Composition lessons are later levels |
| v1 curriculum | **Full beginner arc**: levels 0–3 fully written, later levels outlined (see Curriculum) |
| Instrument tracks | **Layout, shapes and sound.** Where notes live, how scales and chords are shaped and fingered, how the instrument sounds. Physical technique waits until an instrument is owned |
| Devices | **Mac only**, launched from the Dock; mouse and computer keyboard; works from a full window down to a narrow one |
| Styles | Classical, folk and blues, rock and pop, jazz (jazz arrives late in the path). **Public-domain tunes, common progressions and original snippets only** — the repo is public, so no copyrighted songs |
| Stack | Match Lingo Dojo (`../lingo-dojo`): React 19 + Vite + TS strict, Vite middleware API behind the same-origin `wrap()`, Tailwind 4, oxlint, `node --test`, beads; Dock app from `macos/`; **port 38600** |
| Store | Curriculum is markdown + YAML under `content/`, tracked by git. Learner progress is JSON under `data/` (gitignored). **No database** |

## Vocabulary

- **Track** — a sequence of levels on one subject. `core` (theory), `piano`,
  `guitar`. Instrument tracks mirror the core: each core concept that can be
  shown on an instrument has a counterpart lesson in that instrument's track.
- **Level** — a stage of the path (0, 1, 2 …). Unlocks when the level before it
  reaches a mastery threshold, or through the placement check.
- **Concept** — the unit of mastery ("the octave", "major triad", "notes on the
  low E string"). Lessons teach concepts; exercises test them; reviews resurface them.
- **Lesson** — one markdown file: short prose interleaved with **widgets** and
  ending in exercises. Ten minutes or less.
- **Widget** — an interactive visual embedded in a lesson or opened in the lab:
  string simulator, harmonic mixer, waveform/spectrum scope, staff, keyboard,
  fretboard, chord diagram, tab, metronome.
- **Linked views** — the staff, keyboard and fretboard showing the same notes at
  once; selecting or playing a note in one lights it in the others. This is the
  app's central visual idea.
- **Exercise** — a declared, generated, deterministically graded task of one of
  four kinds: identify, ear, play, build.
- **Instrument** — a definition (range, layout, tuning, sample set) plus a
  renderer. Piano and guitar in v1.
- **Lab** — the free sandbox of explorers, including the Sketchpad.
- **Tutor** — the embedded agent in the side chat.

## User flow (v1)

1. Open the app (Dock icon or `npm run dev`, http://localhost:38600).
2. **Home** shows the path: levels, the next lesson, and any reviews due today.
3. A **lesson** alternates short explanations with widgets to play with, then
   runs its exercises. Results update the mastery of the concepts it covers.
4. **Review** is a short mixed session of due concepts across all tracks.
5. The **Lab** is always open: Sound lab (string, harmonics, scope), Note
   explorer (linked views), Scale and chord builder, Rhythm lab (visual
   metronome, tap along), Sketchpad.
6. The **Tutor** chat sits beside any lesson or lab page. Ask it why something
   is so, ask for another example, or ask it to write a new lesson or more
   exercises on a concept. Its content edits are git commits.
7. A learner who already knows the basics takes the **placement check** and
   starts at a later level.

## Curriculum

Fully written for v1 (core track, with piano and guitar counterparts where marked ♪):

- **Level 0 — Sound.** Vibration and pitch; frequency and loudness; the
  vibrating string and its harmonics; the overtone series; timbre (why a piano
  and a guitar playing the same note differ) ♪; octaves and why simple ratios
  sound consonant; how the piano ♪ and the guitar ♪ make and shape their sound.
- **Level 1 — Notes and layout.** The twelve notes; naturals, sharps and flats;
  half and whole steps; octave numbering; the keyboard pattern ♪; strings, frets
  and standard tuning ♪; the same note in several places on the fretboard ♪.
- **Level 2 — Rhythm and reading.** Pulse, tempo, bars; note and rest lengths;
  time signatures; counting. The staff, treble and bass clefs, ledger lines;
  reading notes onto the keyboard ♪; tablature and how it relates to the staff ♪
  (guitar is written an octave above where it sounds).
- **Level 3 — Intervals, scales, first chords.** Interval names and sounds; the
  major scale and its step pattern; key signatures; natural minor; major and
  minor pentatonic; major and minor triads; chord symbols; first chord shapes
  on piano ♪ and open chords on guitar ♪; chord diagrams.

Outlined only, for the tutor and me to fill in:

- **Level 4 — Keys and harmony.** Diatonic chords, Roman numerals, the circle of
  fifths, inversions and voice leading, cadences.
- **Level 5 — Progressions and forms.** I–IV–V, I–V–vi–IV, the 12-bar blues,
  the blues scale, barre and power chords, song sections.
- **Level 6 — Colour.** Seventh chords, ii–V–I, swing, modes, extensions.
- **Level 7 — Composition.** Writing a melody, harmonising it, bass lines,
  form, arranging for the two instruments.

## Exercises

Exercises are declared in YAML (kind, concept, parameters such as clef, range,
strings, key) and **generated and graded by the music engine, never by the
agent**. The four kinds:

- **Identify** — name the note, interval, scale or chord shown on staff,
  keyboard, fretboard or tab; translate between representations.
- **Ear** — hear a note, interval, chord or rhythm and identify it; compare two
  (higher or lower, major or minor).
- **Play** — find and play a note, scale, chord or short phrase on the virtual
  keyboard or fretboard; rhythm tasks are checked for timing against the metronome.
- **Build** — construct a scale, chord or progression from its rule; complete a
  short melody.

Each answer records concept, correctness and response time. Mastery per concept
is a score from recent results; a concept that reaches the threshold enters the
review schedule with growing intervals, and a missed review shortens its interval.

## Extensibility

- **New instrument**: add `content/instruments/<id>.yaml` (range, layout type,
  tuning, sample set), a renderer for its layout type if none exists, and a
  track of lessons. Exercises that say "on the current instrument" work unchanged.
- **New levels and lessons**: files under `content/`; the loader validates them
  (known concepts, known widgets, well-formed exercises) and refuses invalid
  files with a readable error rather than serving them.
- **New input**: every way of playing a note (click, computer keyboard, later
  MIDI or microphone pitch detection) is an input source emitting the same
  note-on/note-off events. Exercises listen to events, not devices.
- **New learner**: progress lives at `data/profiles/<id>/`; v1 has one id.

## Non-goals (v1)

- Listening to a real instrument (microphone, MIDI). The input layer leaves room.
- Physical technique lessons (posture, fingering drills, picking, pedalling).
- Tablet or phone layout, touch-first interaction.
- A profile switcher, a kids mode.
- A composition lesson track (the Sketchpad is in; the lessons are level 7).
- Copyrighted songs. Alternate guitar tunings, left-handed fretboard, other clefs.
- Multi-user, auth, deployment, a database.

## Architecture

```
content/               the product (git-tracked)
  curriculum.yaml      tracks, levels, concepts and their prerequisites
  instruments/         piano.yaml, guitar.yaml
  lessons/<track>/     one .md per lesson: frontmatter (level, concepts) + body with widget blocks
  exercises/           reusable exercise declarations
scripts/
  music/               pure ESM music engine: notes, intervals, scales, chords,
                       staff positions, fretboard and keyboard mapping (node --test)
  content.mjs          load + validate content (pure, no server deps)
  exercises.mjs        generate and grade exercises (pure, seeded, tested)
  progress.mjs         mastery and review scheduling (pure, tested)
  claude.mjs           spawn headless claude for the tutor (sibling pattern)
  tests/*.test.mjs
web/
  server/api.ts        plugins + wrap() same-origin guard (copy Lingo Dojo)
  server/content.ts    curriculum, lessons, exercise generation and grading
  server/progress.ts   read and write data/profiles/<id>/
  server/chat.ts       SSE tutor chat, auto-commit of content/ edits
  shared/wire.ts       types shared by server and client
  src/
    audio/             sample player, synth, metronome clock (Web Audio)
    input/             input sources -> note events
    widgets/           string sim, harmonic mixer, scope, staff, keyboard,
                       fretboard, tab, chord diagram, metronome
    pages/             Home, Lesson, Review, Lab, Sketchpad
data/                  learner progress, chat history, settings (gitignored)
macos/                 Dock app (Fret Not.app), copied from Lingo Dojo, port 38600
docs/                  this PRD; CONTENT.md (file-format contract) to follow
```

The tutor follows the Lingo Dojo rule: headless `claude -p` on the Claude Code
login, Read on the repo, **Write/Edit only under `content/`**, every change
auto-committed as `agent: <summary>`. It never grades exercises and never
touches `web/`, `scripts/` or `data/`.

## Open build choices (mine to settle during the build, not product decisions)

- Notation rendering: an engraving library versus hand-drawn SVG for staff and tab.
- Audio: plain Web Audio versus a scheduling library; which sample sets, with
  their licences checked and credited before they are committed.
- A theory library versus an in-house engine for `scripts/music/`.
- Visual design direction for the app and its icon.

## Suggested build order

1. **Engine and contract** — `scripts/music/`, content loader, `docs/CONTENT.md`, tests.
2. **Linked views** — staff, keyboard and fretboard widgets with sampled sound;
   the Note explorer in the Lab.
3. **Sound lab** — string simulator, harmonic mixer, scope; Level 0 lessons.
4. **Lessons and exercises** — lesson renderer, the four exercise kinds, Levels 1–3.
5. **Progress** — mastery, review sessions, unlocks, placement check, Home.
6. **Tutor** — chat, lesson context, content authoring with validation.
7. **Sketchpad, Dock app, docs.**
