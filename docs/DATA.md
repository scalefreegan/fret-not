# Accounts, learners and the database

Fret Not keeps who is learning, and what they have learned, in a local
Postgres 17 database. The curriculum stays where it was: markdown and YAML
under `content/`, tracked by git. Ported from Lingo Dojo (`../lingo-dojo`,
its `docs/DATA.md`), without its language profiles, packs or kids mode.

## Setup

Once per machine:

```sh
brew install postgresql@17 && brew services start postgresql@17
npm install                  # drizzle-orm, pg, drizzle-kit, PGlite (tests)
npm run db:setup             # creates the database if missing, applies migrations
```

`db:setup` and `db:migrate` are idempotent: on a current database they print
the state and change nothing. A database holding migrations this checkout
does not know is refused, untouched. The dev server checks at start that every
migration is applied and says to run `npm run db:setup` if not.

`DATABASE_URL` comes from the shell, else `.env.local` (the same gitignored
file as `ELEVENLABS_API_KEY`), else `postgres://localhost/fret_not`. A linked
git worktree has no default: it must set its own `DATABASE_URL`, so a branch
under test can never migrate or write the real database.

## Schema

`scripts/db/schema.ts` (Drizzle), migrations in `scripts/db/migrations/`
(`npm run db:generate` after a schema change, then commit the SQL).

| Table | Owner | Holds |
|---|---|---|
| `users` | — | username (lower-case, unique), scrypt hash, `is_admin`, `disabled_at` |
| `auth_sessions` | user | a hashed token, expiry, and the session's active learner (`learner_id`, null: the picker) |
| `learners` | user | name, `archived_at`, `progress` (the whole `Progress` of `web/shared/progress.ts` as jsonb), `listen_mode`, `tts_voice_id`, `tts_model_id` |
| `user_settings` | user | the account's tutor model |
| `chat_messages` | learner | the learner's tutor chat (`seq` orders it; role user/assistant/commit/note) |
| `progress_backups` | learner | a progress that was damaged (`corrupt`) or reset (`reset`), kept whole |

Progress is rewritten whole on every change, inside a transaction that holds
the learner row's lock (`SELECT … FOR UPDATE`), so two tabs answering at once
cannot lose an answer. A stored progress the repair rules have to change
(numbers out of range, an unreadable entry, not progress at all) is kept in
`progress_backups` first; the reply says `recovered` and the backup's id, and
the app shows it once. To look at one:

```sh
psql fret_not -c "select id, reason, created_at from progress_backups order by created_at desc"
psql fret_not -c "select data from progress_backups where id = '<id>'"
```

### Owner-scoped helpers

Route code reads and writes personal rows only through `forUser(db, userId)`
and `forLearner(db, learnerId)` (`scripts/db/owned.ts`). Every call adds the
owner to the WHERE (or the insert), and a table without that owner column does
not type-check, so a forgotten filter is a compile error, not a leak. A
learner's own row is an account row: it is reached through `forUser` with the
learner id as the condition, so one account can never touch another's
learner. The raw handle (`rawDb()` in `web/server/db.ts`) is for the few
owner-less lookups: a login by username, a session by token hash.

## Accounts

The first account is made in the app ("Create the first account"), only while
there are none, and only from the Mac itself (see Hosting). It is an admin.
Everyone after is added from the command line; there is no sign-up.

```sh
npm run user -- add <name> [--admin]   # prompts for a password (8+ characters)
npm run user -- passwd <name>          # new password; ends that user's sessions
npm run user -- list
npm run user -- disable <name>         # no logins; sessions end; data kept
npm run user -- enable <name>
npm run user -- admin <name> [--off]
```

A new account has no learners; the app asks for one after the first login.

**Admin** means one thing: the tutor may write lessons into `content/` (the
worktree-and-fast-forward rules in CLAUDE.md), and the account may choose the
tutor's model. Anyone else's tutor runs read-only (Read, Glob, Grep), says so
in the chat, and uses the default model. The curriculum is shared by everyone.

## Learners

An account holds any number of learners, with no passwords of their own:
"Who's practising?" after login, and the header's learner menu (beside
Listen) to switch, manage or log out. Each learner has its own progress,
Listen settings and tutor chat. Archiving a learner takes it off the lists and
out of every session that had it; its rows are kept. A login with exactly one
learner goes straight to it.

## Auth

- Passwords: scrypt, per-user salt, compared in constant time
  (`scripts/auth.mjs`).
- Sessions: a random token in an httpOnly, SameSite=Lax cookie `fn_session`
  (Secure behind HTTPS); only its hash is stored. 30 days, sliding (the
  expiry moves forward at most once a minute). Logout deletes the row.
- Login throttle: 5 failed tries per username and client address in 15
  minutes means a 30-second wait (in memory; a restart clears it).
- Every route goes through `wrap()` in `web/server/api.ts` with an auth level.
  The same-origin check always runs first.

| Level | Routes |
|---|---|
| public | `POST /api/auth/login`, `GET /api/auth/me`, `POST /api/auth/first-run` |
| user | `/api/auth/logout`, `PUT /api/auth/learner`, `/api/learners…`, `/api/tts/audio/<hash>.mp3` |
| learner | `/api/content`, `/api/progress…`, `/api/settings`, `/api/chat…`, `/api/tts/voices`, `/api/tts/speak` |

A learner route needs the session's active learner, and the page must name it
in `X-Learner-Id`. The cookie is shared by every tab, so a tab still showing a
learner that another tab switched away from gets `409 {code: "stale_learner"}`
instead of writing into the wrong progress; the client (`web/src/api/client.ts`)
re-reads `/api/auth/me` and redraws. Any 401 sends it back to the login.
Cached Listen audio is at the user level only because an `<audio>` element
cannot send the header; the clips are content-addressed and hold no learner
data.

## First run

When the first account is created, its first learner starts from what the
files under `data/` held before there were logins (`web/server/seed.ts`):

| File | Becomes |
|---|---|
| `data/profiles/default/progress.json` | the learner's progress (through the same repair rules) |
| `data/settings.json` | the learner's Listen settings; `model` the account's tutor model |
| `data/chat.jsonl` | the learner's tutor chat |

The files are read once and never changed or deleted: they stay as the
backup. Anything missing or unreadable is left out, never a reason to refuse.
`data/` otherwise holds only the Listen audio cache (`data/tts-cache/`).

## Hosting

The server listens on localhost:38600. Other devices may reach it through a
proxy on the Mac (for example `tailscale serve`) and log in; first run is
refused for any request that is not made directly on the Mac (a loopback
peer, no `X-Forwarded-*` header, a localhost Host).

## Backups

Progress and chat are no longer files under `data/`, so a copy of the
database is the backup:

```sh
pg_dump -Fc fret_not > ~/fret_not-$(date +%F).dump
# restore into a database you name, check it, then point DATABASE_URL at it
createdb fret_not_restored && pg_restore --no-owner -d fret_not_restored ~/fret_not-<date>.dump
```

## Testing

Tests never reach a Postgres server. `freshDb()` (`scripts/tests/testdb.mjs`)
gives each suite an in-process PGlite with the real migrations applied;
`web/server/test-db.ts` wraps it with an account and a learner for the server
tests, and `scripts/tests/http-session.mjs` drives the real API plugin with
cookies. `FRET_DATA_DIR` and `FRET_CONTENT_DIR` point at temp directories.
