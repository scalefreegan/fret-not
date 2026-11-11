# Fret Not

A personal, highly visual app for learning how music works: sound and
harmonics, notes, rhythm, reading notation, intervals, scales and chords, with
every idea shown, heard and drilled on the piano and the guitar.

- **A guided path** of short lessons in three linked tracks (theory, piano,
  guitar) over four written levels: Sound; Notes and layout; Rhythm and
  reading; Intervals, scales and first chords. Four more levels are outlined.
- **Linked views**: the same note on the staff, the keyboard, the fretboard and
  in tab at once, each pitch class always in the same colour.
- **Interactive physics**: a vibrating-string simulator, a harmonic mixer, live
  waveform and spectrum, consonance by frequency ratio, how each instrument
  makes its sound.
- **Exercises** generated and graded by a tested music engine: name what you
  see, ear training, play it on the virtual instrument, build it from a rule,
  tap a rhythm.
- **Mastery and spaced review** per concept, level unlocks, a placement check.
- **A Lab** of open explorers and a **Sketchpad** for writing a melody over chords.
- **A Tutor**: an embedded Claude agent that answers questions about the lesson
  in front of you and can write new lessons into `content/` (each change is a
  git commit).

Single user, localhost, no accounts, no database. The curriculum is plain
markdown and YAML in `content/`.

## Run it

```sh
npm --prefix web install
npm run dev          # http://localhost:38600
```

Or build the Dock app: `macos/build-app.sh` (see `macos/README.md`).

The Tutor needs the [Claude Code](https://claude.com/claude-code) CLI installed
and logged in; everything else works without it.

## Develop

```sh
npm test                  # engine, loader, exercises, progress, tutor
npm run check:content     # validate the curriculum
npm run typecheck && npm run lint
```

- `docs/PRD.md` — what it is and what was decided.
- `docs/CONTENT.md` — how lessons are written; `docs/CONTENT-REFERENCE.md` —
  every widget and exercise kind.
- `CLAUDE.md` — layout and rules for agents working on the code.

## Credits

Music glyphs are set in [Bravura](https://github.com/steinbergmedia/bravura)
(SIL Open Font License; see `web/public/fonts/Bravura-OFL.txt`). Instrument
samples and their licences are listed in `web/public/samples/CREDITS.md`.
