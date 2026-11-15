<h1 align="center">Fret Not</h1>

<p align="center"><b>A visual app for learning how music works, on piano and guitar.</b></p>
<p align="center">Sound, notes, rhythm, reading notation, intervals, scales and chords. Every idea is shown, heard and drilled on the instrument.</p>

<p align="center">
  <img src="https://img.shields.io/badge/TypeScript-3178C6?style=flat-square&logo=typescript&logoColor=white" alt="TypeScript">
  <img src="https://img.shields.io/badge/React-20232A?style=flat-square&logo=react&logoColor=61DAFB" alt="React">
  <img src="https://img.shields.io/badge/Vite-646CFF?style=flat-square&logo=vite&logoColor=white" alt="Vite">
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-MIT-green?style=flat-square" alt="MIT License"></a>
</p>

<p align="center">
  <img src="docs/hero.png" alt="Fret Not: the same notes shown on a staff, a piano keyboard and a guitar fretboard" width="800">
  <br>
  <sub><i>One note, four views: staff, keyboard, fretboard and tab, in sync.</i></sub>
</p>

## Features

- **A guided path.** 49 short lessons in three linked tracks (theory, piano, guitar) across four written levels: Sound; Notes and layout; Rhythm and reading; Intervals, scales and first chords. Four more levels are outlined.
- **Linked views.** The same note appears on the staff, the keyboard, the fretboard and in tab at once, and each pitch class keeps the same colour everywhere.
- **Interactive physics.** A vibrating-string simulator, a harmonic mixer, live waveform and spectrum, consonance by frequency ratio, and how each instrument makes its sound.
- **Exercises.** Generated and graded by a tested music engine: name what you see, ear training, play it on the virtual instrument, build it from a rule, tap a rhythm.
- **Mastery and spaced review.** Tracked per concept, with level unlocks and a placement check.
- **Lab and Sketchpad.** Open explorers, plus a place to write a melody over chords.
- **A Tutor.** An embedded Claude agent that answers questions about the lesson in front of you and can write new lessons into `content/`, each change as a git commit. It writes only while `content/` has no uncommitted changes; otherwise it answers questions and says why it can't edit.

## How it works

Single user, localhost, no accounts, no database. The curriculum is plain markdown and YAML in `content/`; learner progress is JSON under `data/` (gitignored). The music engine in `web/shared/music/` is pure TypeScript that runs in the browser, the server and the tests, and every exercise is generated and graded by it, never by the Tutor.

## Get started

```sh
npm --prefix web install
npm run dev          # http://localhost:38600
```

Prefer a Dock icon on macOS? Build the app with `macos/build-app.sh` (needs a working `clang`; see [`macos/README.md`](macos/README.md)).

The Tutor needs the [Claude Code](https://claude.com/claude-code) CLI installed and logged in. Everything else works without it.

## Development

```sh
npm test                  # engine, loader, exercises, progress, tutor
npm run check:content     # validate the curriculum
npm run typecheck && npm run lint
```

- [`docs/PRD.md`](docs/PRD.md): what it is and what was decided.
- [`docs/CONTENT.md`](docs/CONTENT.md): how lessons are written. [`docs/CONTENT-REFERENCE.md`](docs/CONTENT-REFERENCE.md): every widget and exercise kind.
- [`CLAUDE.md`](CLAUDE.md): layout and rules for agents working on the code.

## Credits

Music glyphs are set in [Bravura](https://github.com/steinbergmedia/bravura) (SIL Open Font License; see `web/public/fonts/Bravura-OFL.txt`). Instrument samples and their licences are listed in `web/public/samples/CREDITS.md`.

## License

The code and the lessons under `content/` are released under the MIT license; see [LICENSE](LICENSE). The bundled font and instrument samples keep their own licences, listed under Credits.
