// The whole database schema (docs/DATA.md §Schema), shared by the dev server
// (web/server/db.ts), the CLIs and the tests. drizzle-kit diffs this file
// against the last snapshot to write the SQL under ./migrations, which is
// what actually reaches a database; this file is never executed against one.
// Ported from Lingo Dojo, keeping only what Fret Not needs.
//
// Erasable TypeScript only (no enums, namespaces or parameter properties):
// Node runs it by stripping types, so `node --test` imports it directly.
//
// Ownership. Every personal row carries its owner: `user_id` for account rows
// (learners, sessions, settings), `learner_id` for what a learner makes
// (chat messages, progress backups). The owned-row helpers (owned.ts) are
// the one way route code reaches them.
//
// A learner's progress is one jsonb column on its row: the `Progress` object
// of web/shared/progress.ts, exactly as the JSON file held it. The rules
// that read and write it stay pure TypeScript; the database only keeps it.

import { sql } from "drizzle-orm";
import { bigserial, boolean, check, index, jsonb, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

/* --------------------------------- helpers -------------------------------- */

const id = () => uuid("id").primaryKey().defaultRandom();
const tz = (name: string) => timestamp(name, { withTimezone: true });
const createdAt = () => tz("created_at").notNull().defaultNow();

/* -------------------------------- accounts -------------------------------- */

export const users = pgTable(
  "users",
  {
    id: id(),
    /** Stored lowercased; the check keeps a mixed-case insert from slipping
     *  past the unique constraint as a second account. */
    username: text("username").notNull().unique(),
    /** `scrypt$N$r$p$salt$hash` (DATA.md §Auth). */
    passwordHash: text("password_hash").notNull(),
    /** An admin's tutor may write lessons into content/; nobody else's can. */
    isAdmin: boolean("is_admin").notNull().default(false),
    createdAt: createdAt(),
    disabledAt: tz("disabled_at"),
  },
  (t) => [check("users_username_lowercase", sql`${t.username} = lower(${t.username})`)],
);

/** A person who practises under an account. No password of its own: the
 *  account's login picks it ("Who's learning?"). */
export const learners = pgTable(
  "learners",
  {
    id: id(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    /** The learner's whole Progress (web/shared/progress.ts): mastery,
     *  reviews, lessons done, placement, openedLevel. Rewritten whole on
     *  every change, under the row's lock. */
    progress: jsonb("progress").$type<Record<string, unknown>>().notNull(),
    /** Listen mode (read-aloud) on or off. */
    listenMode: boolean("listen_mode").notNull().default(false),
    /** The chosen ElevenLabs voice; null until one is picked. */
    ttsVoiceId: text("tts_voice_id"),
    /** The ElevenLabs model; null (or one no longer offered) is the default. */
    ttsModelId: text("tts_model_id"),
    createdAt: createdAt(),
    /** Archived: out of the picker, kept with everything it earned. */
    archivedAt: tz("archived_at"),
  },
  (t) => [index("learners_user_idx").on(t.userId)],
);

export const authSessions = pgTable(
  "auth_sessions",
  {
    /** SHA-256 (hex) of the cookie token; the token itself is never stored. */
    id: text("id").primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    /** The active learner. Always one of this user's: the server only ever
     *  sets it from a learner looked up through the user's own scope, and
     *  re-checks it the same way on every request. Deleting the learner
     *  sends the session back to the picker. */
    learnerId: uuid("learner_id").references(() => learners.id, { onDelete: "set null" }),
    createdAt: createdAt(),
    expiresAt: tz("expires_at").notNull(),
    lastSeenAt: tz("last_seen_at").notNull().defaultNow(),
  },
  (t) => [index("auth_sessions_user_idx").on(t.userId), index("auth_sessions_expires_idx").on(t.expiresAt)],
);

/** Per-account settings: the tutor's model, which only an admin's tutor
 *  uses (it is the one that writes lessons). */
export const userSettings = pgTable("user_settings", {
  userId: uuid("user_id")
    .primaryKey()
    .references(() => users.id, { onDelete: "cascade" }),
  /** The tutor's model; null means the default. */
  model: text("model"),
});

/* ------------------------------- per learner ------------------------------ */

/** The tutor chat, one transcript per learner (data/chat.jsonl before). */
export const chatMessages = pgTable(
  "chat_messages",
  {
    id: id(),
    learnerId: uuid("learner_id")
      .notNull()
      .references(() => learners.id, { onDelete: "cascade" }),
    /** Insertion order. `ts` can tie (or come from an imported file); order
     *  by this. */
    seq: bigserial("seq", { mode: "number" }).notNull(),
    role: text("role").$type<"user" | "assistant" | "commit" | "note">().notNull(),
    text: text("text").notNull(),
    ts: tz("ts").notNull().defaultNow(),
  },
  (t) => [
    check("chat_messages_role", sql`${t.role} in ('user', 'assistant', 'commit', 'note')`),
    index("chat_messages_learner_seq_idx").on(t.learnerId, t.seq),
  ],
);

/** A learner's progress as it was before the server replaced it: a stored
 *  value that failed the checks and was repaired ("corrupt"), or the whole
 *  progress before a reset ("reset"). What `.corrupt-<time>.json` and
 *  `.reset-<time>.json` files were before the database. Never read by the
 *  app; kept so nothing a learner earned is destroyed by a bad write. */
export const progressBackups = pgTable(
  "progress_backups",
  {
    id: id(),
    learnerId: uuid("learner_id")
      .notNull()
      .references(() => learners.id, { onDelete: "cascade" }),
    reason: text("reason").$type<"corrupt" | "reset">().notNull(),
    data: jsonb("data").$type<unknown>().notNull(),
    createdAt: createdAt(),
  },
  (t) => [check("progress_backups_reason", sql`${t.reason} in ('corrupt', 'reset')`), index("progress_backups_learner_idx").on(t.learnerId)],
);
