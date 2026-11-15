// Accounts in the database (docs/DATA.md §Accounts, §Auth): users, login
// sessions, learners, and the per-account tutor model. The one data layer
// for them, shared by the dev server (web/server/auth.ts, store.ts) and the
// user CLI (scripts/user.mjs), and tested on PGlite. Ported from Lingo Dojo,
// minus language profiles and kids mode.
//
// Everything a user owns goes through forUser() (owned.ts), so it cannot be
// read or changed without the owner id. The raw handle appears only where
// there is no owner yet: a user by username, a session by token hash, the
// zero-users check and the CLI's user admin.
//
// Erasable TypeScript only, like schema.ts: the CLI and the tests import it
// as is.

import { randomUUID } from "node:crypto";
import { and, asc, eq, gt, isNull, sql } from "drizzle-orm";
import { emptyProgress, type Progress } from "../../web/shared/progress.ts";
import { forLearner, forUser, type Db } from "./owned.ts";
import { authSessions, chatMessages, learners, userSettings, users } from "./schema.ts";

export type User = typeof users.$inferSelect;
export type Learner = typeof learners.$inferSelect;
export type Session = typeof authSessions.$inferSelect;
export type ChatRole = "user" | "assistant" | "commit" | "note";
export interface StoredMessage { role: ChatRole; text: string; ts: string }

/* ---------------------------------- users --------------------------------- */

/** Owner-less: the login lookup. `username` is the normalized form. */
export async function findUserByUsername(db: Db, username: string): Promise<User | undefined> {
  const [row] = await db.select().from(users).where(eq(users.username, username)).limit(1);
  return row;
}

/** Owner-less: is this the first run? */
export async function hasUsers(db: Db): Promise<boolean> {
  const rows = await db.select({ id: users.id }).from(users).limit(1);
  return rows.length > 0;
}

/** The CLI's `add`. A taken username is the unique violation (23505). */
export async function createUser(db: Db, values: { username: string; passwordHash: string; isAdmin?: boolean }): Promise<User> {
  const [row] = await db.insert(users).values({ username: values.username, passwordHash: values.passwordHash, isAdmin: !!values.isAdmin }).returning();
  return row;
}

export async function listUsers(db: Db): Promise<(User & { learners: number })[]> {
  const rows = await db.select().from(users).orderBy(asc(users.createdAt), asc(users.username));
  const counts = await db
    .select({ userId: learners.userId, n: sql<number>`count(*)::int` })
    .from(learners)
    .where(isNull(learners.archivedAt))
    .groupBy(learners.userId);
  const by = new Map(counts.map((c) => [c.userId, c.n]));
  return rows.map((u) => ({ ...u, learners: by.get(u.id) ?? 0 }));
}

/** New password; every session of that user ends (a changed password should
 *  sign out a stolen cookie). False when there is no such user. */
export async function setPassword(db: Db, username: string, passwordHash: string): Promise<boolean> {
  return db.transaction(async (tx) => {
    const [row] = await tx.update(users).set({ passwordHash }).where(eq(users.username, username)).returning();
    if (!row) return false;
    await forUser(tx, row.id).removeAllOwned(authSessions);
    return true;
  });
}

/** Disable (not delete: their learners and progress stay) and sign out. */
export async function disableUser(db: Db, username: string): Promise<boolean> {
  return db.transaction(async (tx) => {
    const [row] = await tx.update(users).set({ disabledAt: sql`now()` }).where(eq(users.username, username)).returning();
    if (!row) return false;
    await forUser(tx, row.id).removeAllOwned(authSessions);
    return true;
  });
}

/** Undo disableUser: logins work again (with the password they had). */
export async function enableUser(db: Db, username: string): Promise<boolean> {
  const [row] = await db.update(users).set({ disabledAt: null }).where(eq(users.username, username)).returning();
  return !!row;
}

/** Make an account an admin (its tutor may write lessons) or not. */
export async function setAdmin(db: Db, username: string, isAdmin: boolean): Promise<boolean> {
  const [row] = await db.update(users).set({ isAdmin }).where(eq(users.username, username)).returning();
  return !!row;
}

/* --------------------------------- first run ------------------------------ */

/** What the first admin's first learner starts with, read from the files
 *  that predate logins (web/server/seed.ts). Anything missing is a default. */
export interface FirstRunSeed {
  /** The first learner's name. */
  name: string;
  /** Its progress (already checked by the server's repair rules), or null
   *  for an empty one. */
  progress: Progress | null;
  listenMode: boolean;
  ttsVoiceId: string | null;
  ttsModelId: string | null;
  /** The account's tutor model, or null for the default. */
  model: string | null;
  messages: StoredMessage[];
}

/**
 * Create the first account, an admin, with its first learner seeded, only
 * while there are no users at all. Race-safe: the users table is locked
 * (SHARE ROW EXCLUSIVE, which conflicts with itself and with any insert) for
 * the check and the insert, so of two concurrent first runs one creates the
 * admin and the other sees a user and gets null. All or nothing: a seed that
 * fails to write leaves no half-made admin behind.
 */
export async function createFirstAdmin(db: Db, account: { username: string; passwordHash: string }, seed: FirstRunSeed): Promise<User | null> {
  return db.transaction(async (tx) => {
    await tx.execute(sql`lock table ${users} in share row exclusive mode`);
    if (await hasUsers(tx)) return null;
    const [user] = await tx.insert(users).values({ username: account.username, passwordHash: account.passwordHash, isAdmin: true }).returning();
    const learner = await insertLearner(tx, user.id, seed.name, seed.progress, {
      listenMode: seed.listenMode,
      ttsVoiceId: seed.ttsVoiceId,
      ttsModelId: seed.ttsModelId,
    });
    if (seed.model) await forUser(tx, user.id).insert(userSettings, { model: seed.model });
    if (seed.messages.length) {
      await forLearner(tx, learner.id).insert(chatMessages, seed.messages.map((m) => ({ role: m.role, text: m.text, ...(validDate(m.ts) ? { ts: new Date(m.ts) } : {}) })));
    }
    return user;
  });
}

export const validDate = (s: string) => !!s && !Number.isNaN(Date.parse(s));

/* --------------------------------- sessions ------------------------------- */

/** A new login session; `id` is the token's hash (auth.mjs tokenHash). */
export async function createSession(db: Db, userId: string, id: string, expiresAt: Date, learnerId: string | null = null): Promise<Session> {
  const mine = forUser(db, userId);
  // Expired sessions of this user go on each login, so the table does not
  // collect every cookie ever issued.
  await mine.remove(authSessions, sql`${authSessions.expiresAt} <= now()`);
  const [row] = await mine.insert(authSessions, { id, expiresAt, learnerId });
  return row;
}

/** Owner-less: the session for a cookie, with its user, when it is live (not
 *  expired, user not disabled). */
export async function findSession(db: Db, id: string): Promise<{ session: Session; user: User } | null> {
  const [row] = await db
    .select({ session: authSessions, user: users })
    .from(authSessions)
    .innerJoin(users, eq(users.id, authSessions.userId))
    .where(and(eq(authSessions.id, id), gt(authSessions.expiresAt, sql`now()`), isNull(users.disabledAt)))
    .limit(1);
  return row ?? null;
}

/** Push the expiry out (the 30-day window slides with use). */
export async function slideSession(db: Db, userId: string, id: string, expiresAt: Date): Promise<void> {
  await forUser(db, userId).update(authSessions, { expiresAt, lastSeenAt: sql`now()` }, eq(authSessions.id, id));
}

export async function deleteSession(db: Db, userId: string, id: string): Promise<void> {
  await forUser(db, userId).remove(authSessions, eq(authSessions.id, id));
}

/** Point the session at one of the user's live learners, or at none (the
 *  picker). Undefined when `learnerId` is not one of them. */
export async function setSessionLearner(db: Db, userId: string, id: string, learnerId: string | null): Promise<{ learner: Learner | null } | undefined> {
  return db.transaction(async (tx) => {
    const learner = learnerId === null ? null : await getLearner(tx, userId, learnerId);
    if (learner === undefined) return undefined;
    await forUser(tx, userId).update(authSessions, { learnerId: learner?.id ?? null }, eq(authSessions.id, id));
    return { learner };
  });
}

/* --------------------------------- learners ------------------------------- */

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/** An id from a request that could be a learner's. Anything else is a 404
 *  before it reaches Postgres (which would answer a bad uuid with an error). */
export const isUuid = (v: unknown): v is string => typeof v === "string" && UUID_RE.test(v);

/** This user's live learners, oldest first. */
export async function listLearners(db: Db, userId: string): Promise<Learner[]> {
  return forUser(db, userId).list(learners, isNull(learners.archivedAt), { orderBy: [asc(learners.createdAt), asc(learners.name)] });
}

/** One of this user's live learners, or undefined (someone else's id, an
 *  archived one, or not an id at all). */
export async function getLearner(db: Db, userId: string, id: unknown): Promise<Learner | undefined> {
  if (!isUuid(id)) return undefined;
  return forUser(db, userId).get(learners, and(eq(learners.id, id), isNull(learners.archivedAt))!);
}

type ListenColumns = Partial<Pick<Learner, "listenMode" | "ttsVoiceId" | "ttsModelId">>;

/** A learner row, its id chosen here so its empty progress can name it. */
async function insertLearner(db: Db, userId: string, name: string, progress: Progress | null = null, listen: ListenColumns = {}): Promise<Learner> {
  const id = randomUUID();
  const start = progress ? { ...progress, profile: id } : emptyProgress(id, new Date());
  const [row] = await forUser(db, userId).insert(learners, { id, name, progress: start as unknown as Record<string, unknown>, ...listen });
  return row;
}

/** A new learner, starting from nothing. */
export async function createLearner(db: Db, userId: string, name: string): Promise<Learner> {
  return insertLearner(db, userId, name);
}

export async function renameLearner(db: Db, userId: string, id: string, name: string): Promise<Learner | undefined> {
  if (!isUuid(id)) return undefined;
  const [row] = await forUser(db, userId).update(learners, { name }, and(eq(learners.id, id), isNull(learners.archivedAt))!);
  return row;
}

/** Archive (kept with its progress, out of the picker). Sessions that had it
 *  active go back to the picker. */
export async function archiveLearner(db: Db, userId: string, id: string): Promise<Learner | undefined> {
  if (!isUuid(id)) return undefined;
  return db.transaction(async (tx) => {
    const mine = forUser(tx, userId);
    const [row] = await mine.update(learners, { archivedAt: sql`now()` }, and(eq(learners.id, id), isNull(learners.archivedAt))!);
    if (row) await mine.update(authSessions, { learnerId: null }, eq(authSessions.learnerId, id));
    return row;
  });
}

/* --------------------------------- settings ------------------------------- */

/** The account's stored tutor model, or null. */
export async function getStoredModel(db: Db, userId: string): Promise<string | null> {
  const [row] = await forUser(db, userId).list(userSettings, undefined, { limit: 1 });
  return row?.model ?? null;
}

export async function saveModel(db: Db, userId: string, model: string): Promise<void> {
  await forUser(db, userId).upsert(userSettings, { model }, { target: [], set: { model } });
}
