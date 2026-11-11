# Fret Not — agent instructions

A visual app for learning how music works (sound, notes, rhythm, reading,
scales, chords), shown and drilled on piano and guitar. Single user, localhost,
no auth, **no database**: the curriculum is markdown and YAML under `content/`,
tracked by git; learner progress is JSON under `data/` (gitignored). Read
`docs/PRD.md` first, then `docs/CONTENT.md` (the file-format contract) and
`docs/CONTENT-REFERENCE.md` (generated) before touching content, the loader or
the registry.

## Layout
```
content/                 curriculum.yaml, instruments/, lessons/<track>/*.md   (the product)
web/shared/music/        the music engine: pure TS, no DOM/Node, runs in browser, server and tests
web/shared/registry.ts   every widget and exercise kind with its parameters — single source of truth
web/shared/exercises*    question generation and grading (pure, seeded)
web/shared/progress.ts   mastery, spaced review, unlocks, placement (pure)
web/server/              Vite serve-middleware API: loader, content, progress, chat (the tutor)
web/src/audio/           samples + synth, scheduling on the audio clock
web/src/widgets/         sound/ (physics widgets), notation/ (staff, keyboard, fretboard, tab …)
web/src/exercises/       the runner that renders Questions
web/src/pages/           Home (path), Lesson, Review + Placement, Lab, Sketchpad, Gallery
web/src/tutor/           the tutor drawer
scripts/claude.mjs       spawns headless `claude -p` for the tutor
macos/                   Dock app (Fret Not.app)
```

## Rules that keep it working
- Port **38600**, `strictPort`, polling watcher (FSEvents is unreliable on this
  machine). Siblings: jev-ants 38500, Lingo Dojo 38400, Atlas 38300, Wine Guide
  38200, Basecamp 38100.
- Every API route goes through `wrap()` in `web/server/api.ts` (same-origin
  check). No exceptions.
- **Adding or changing a widget or exercise kind starts in
  `web/shared/registry.ts`**, then the component (`web/src/widgets/registry.tsx`)
  or generator (`web/shared/exercises/`), then `node scripts/gen-reference.ts`.
  A widget parameter may not be called `type`, and an exercise parameter may
  not be called `kind`, `concept`, `count` or `title` (they collide with the
  block's own keys; a test pins this).
- Exercises are generated and graded by the engine, never by the tutor agent.
- Exercise stimuli are drawn in neutral ink: pitch-class colours would give
  the answer away. Everywhere else a pitch class has one colour (`pcColor`).
- Pitches in content and in the engine are **sounding** pitches. Guitar staff
  notation is shown an octave higher by the widgets (`GUITAR_WRITTEN_OFFSET`).
- Files under `web/shared/` are run directly by Node (type stripping): explicit
  `.ts` import extensions, erasable syntax only.
- The tutor spawns headless `claude -p` on the Claude Code login (no API key).
  It may Read the repo and Write/Edit **only under `content/`**. After each
  turn the server re-validates content, gives the agent one repair turn if it
  introduced problems, and commits `content/` as `agent: <summary>`.
- Never change a lesson `id` or a concept `id` once live: progress is keyed on them.
- Tests never touch the real `content/` or `data/`: point `FRET_CONTENT_DIR`
  and `FRET_DATA_DIR` at temp dirs.
- Colours come from the tokens in `web/src/index.css`; components never write
  a raw hex or a `dark:` variant.

## Build & test
```sh
npm --prefix web install
npm run dev                 # http://localhost:38600   (#/gallery shows every widget)
npm test                    # node --test: engine, registry, loader, exercises, progress, tutor
npm run check:content       # validate content/ as the app does (-- --gaps for coverage)
npm run typecheck && npm run lint
node scripts/gen-reference.ts   # after editing the registry
```
Verify UI in the real app (Playwright MCP or Claude-in-Chrome) before claiming
a feature works. Music content must be exactly right: check note names,
intervals and positions against the engine, not from memory.
