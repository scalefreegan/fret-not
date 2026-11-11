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
- **Level** — a stage of the path (0, 1, 2 …). Unlocks, in order, when the level before it
  reaches a mastery threshold, or through the placement check. The threshold
  is counted over the core track plus whichever instrument tracks leave the
  fewest concepts to master, so following one instrument is enough. A level
  with no concepts yet asks nothing: the level after it looks back past it.
  A level that has opened stays open (`openedLevel` in the progress file),
  even when the curriculum later gains a concept.
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
   exercises on a concept. It writes in a separate copy of the curriculum;
   an edit the app accepts arrives as one git commit, and one it cannot
   accept never arrives at all.
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
  lessons/<track>/     one .md per lesson: frontmatter (level, concepts, exercises) + body with widget blocks
web/
  shared/music/        the music engine: notes, intervals, scales, chords, staff
                       positions, fretboard and keyboard mapping, rhythm tokens
                       (pure TS; runs in the browser, the server and node --test)
  shared/registry.ts   every widget and exercise kind with its parameters
  shared/exercises*    generate and grade exercises (pure, seeded)
  shared/progress.ts   mastery and review scheduling (pure)
  server/api.ts        plugins + wrap() same-origin guard
  server/loader.ts     load + validate content
  server/progress.ts   read and write data/profiles/<id>/
  server/chat.ts       SSE tutor chat and its validation loop
  server/turn.ts       the tutor's git worktree: when it may write, commit, fast-forward
  src/audio/           sample player, synth, scheduling on the audio clock
  src/widgets/         sound/ (string sim, harmonic mixer, scope …) and notation/
                       (engraver, keyboard, fretboard, tab, chord boxes, linked views)
  src/exercises/       the runner that renders generated questions
  src/pages/           Home (path), Lesson, Review + Placement, Lab, Sketchpad
  src/tutor/           the tutor drawer
scripts/
  claude.mjs           spawn headless claude for the tutor (sibling pattern)
  check-content.ts     validate content/ from the command line
  gen-reference.ts     regenerate docs/CONTENT-REFERENCE.md from the registry
data/                  learner progress, chat history, settings (gitignored)
macos/                 Dock app (Fret Not.app), copied from Lingo Dojo, port 38600
docs/                  this PRD; CONTENT.md (file-format contract); CONTENT-REFERENCE.md (generated)
```

The tutor is a headless `claude -p` on the Claude Code login. It never grades
exercises, and it never writes into the working tree: not `web/`, `scripts/`
or `data/`, and not `content/` either.

How a tutor turn works (`web/server/chat.ts`, `web/server/turn.ts`):

- **When it may write.** Only when `content/` is exactly the last commit:
  nothing in it modified, staged, untracked or git-ignored (an ignored
  `.DS_Store` excepted), no file there marked assume-unchanged or
  skip-worktree, no symbolic link or `.git` entry in it, `HEAD` on a branch
  that has at least one commit, and no merge, rebase, cherry-pick, revert or
  bisect in progress. Uncommitted work outside `content/` does not matter.
- **Otherwise the turn is read-only.** It runs in the repository with Read,
  Glob and Grep only (no Write or Edit tool exists for it), answers
  questions as usual, and the chat says once why it cannot write and what to
  do: commit or stash the changes in `content/`.
- **A writing turn runs in a git worktree**: a second checkout of the last
  commit, in the system temp directory, outside the repository. The agent's
  working directory is that checkout and its Write/Edit grant is that
  checkout's `content/`. `docs/CONTENT.md` and `docs/CONTENT-REFERENCE.md`
  are copied there from the live tree, so the agent writes for the loader
  that is running. Because the agent's Read is confined to that checkout, it
  sees the rest of the repository as of the last commit, not uncommitted
  work.
- **Validation.** After the turn the worktree's `content/` is loaded with the
  running loader. A problem is: anything the loader newly refuses; a lesson
  id or concept id that loaded before and is gone (progress is stored
  against those ids); a changed file that is not `curriculum.yaml`,
  `instruments/<name>.yaml` or `lessons/**.md`; one whose name or folder
  starts with a dot; one git ignores; or one that is not a regular file.
  Problems earn the agent one repair turn. (An id inside a file the loader
  already refused at the last commit is unknown and so not protected.)
- **If it is valid**, what changed under `content/` is committed in the
  worktree as `agent: <summary>`, and the branch is fast-forwarded to that
  commit with `git merge --ff-only`, but only if the repository is still on
  the same branch at the same commit and `content/` is still clean. git
  performs the fast-forward as one operation and refuses rather than
  overwrite a file in the way. Staged and unstaged work outside `content/`
  is not touched.
- **If the fast-forward is not possible** (the owner saved or committed
  something meanwhile), the commit is kept under `refs/tutor/<id>`, nothing
  in the working tree changes, and the chat gives the commands to take it
  (`git merge --ff-only <ref>` or `git cherry-pick <ref>`) or drop it.
- **If it is not valid** after the repair turn, or the run failed, timed out
  or was cancelled (including Stop pressed after the agent finished but
  before the commit), or the commit itself failed, the worktree is deleted
  and the chat says so. Nothing was written to the repository, so nothing is
  undone and no copy of the attempt is kept.
- **git hooks do not run and commits are not signed** for the tutor's git
  calls (`core.hooksPath=/dev/null`, `commit.gpgsign=false`), so a hook
  cannot refuse, stall or half-apply a turn. Each git call has a 60-second
  timeout. Nothing is pushed.
- **If the server stops mid-turn**: on a normal quit (SIGTERM, Ctrl-C) the
  agent is killed and the worktree deleted before the process exits. After a
  crash or a kill the worktree is left in the temp directory; any start or
  turn more than 45 minutes later deletes it (by its path and age) and runs
  `git worktree prune`. An agent orphaned by a killed server is not hunted
  down: it can only write in that leftover directory, and stops by itself
  at its turn limit. No process is ever looked up or killed by pid.
- One turn at a time per server process (a second request gets 409). Two
  copies of the app on one repository would each use their own worktree; the
  second to finish cannot fast-forward and its commit is kept under a ref.
- The transcript is passed to the CLI on stdin, and the part replayed is
  bounded by bytes as well as by message count. `data/chat.jsonl` is trimmed
  to its newest messages once it passes about 1 MB.

Progress rules worth knowing (`web/shared/progress.ts`):

- A review is due by local calendar day: mastering a concept at 21:00 makes
  it due from midnight, not from 21:00 the next day.
- `dueConcepts(progress, now, known)` counts only concepts that still exist
  and have an exercise (`reviewableConcepts(content)`), so the review badge
  cannot show something that can never be cleared.
- A level opens when its **gate** has 80% of its reviewable concepts
  mastered. The gate is the nearest earlier level that has any reviewable
  concept; a level with none (empty, an outline, or not yet drilled) is
  skipped. `levelStatuses` reports each level's `gate`.
- `POST /api/progress/answers` always replies with `dropped` (how many
  answers were not recorded because their concept id is not in the
  curriculum), `lessonDropped` (the lesson completion was not recorded) and
  `recovered`. Ids are only left unchecked while `curriculum.yaml` cannot be
  loaded at all; then what is sent is recorded.
- A progress file with a bad entry loses that entry, not everything: the
  original is kept beside it as `progress.corrupt-<time>.json` and the reply
  carries `recovered: true` and `recoveredTo`.

## Build choices made (2026-11-10)

- **Engine location**: `web/shared/music/` in TypeScript rather than
  `scripts/music/` in ESM. Node 26 runs TypeScript directly, so one copy
  serves the browser, the server and the tests.
- **Notation**: an in-house SVG engraver (`Score.tsx`) with Bravura glyphs,
  for full control of colour, click targets and tab alignment.
- **Audio**: plain Web Audio. Piano: Salamander Grand Piano; guitar: OLPC /
  Berklee open strings; both CC BY 3.0, credited in
  `web/public/samples/CREDITS.md`. A synth covers everything else.
- **Theory**: an in-house engine, no library.
- **Sketches** are kept in the browser's local storage, not under `data/`.

## Known gaps in v1

- Eighth and sixteenth notes are drawn with flags, not beamed.
- The "complete a short melody" build exercise is not implemented; the
  Sketchpad covers free composing.
- Guitar samples are the six open strings pitch-shifted, so high frets sound
  less natural than the piano.
- Sketchpad: one saved sketch, 4/4 only, melody in one voice.
- Tap timing has been checked by script, not tuned by a human against real
  audio latency.

## Build order (as planned; all seven steps landed in the first PR)

1. **Engine and contract** — `scripts/music/`, content loader, `docs/CONTENT.md`, tests.
2. **Linked views** — staff, keyboard and fretboard widgets with sampled sound;
   the Note explorer in the Lab.
3. **Sound lab** — string simulator, harmonic mixer, scope; Level 0 lessons.
4. **Lessons and exercises** — lesson renderer, the four exercise kinds, Levels 1–3.
5. **Progress** — mastery, review sessions, unlocks, placement check, Home.
6. **Tutor** — chat, lesson context, content authoring with validation.
7. **Sketchpad, Dock app, docs.**
