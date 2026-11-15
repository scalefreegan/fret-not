// For the server's own tests (*.test.ts beside this file), never imported by
// the app: a fresh, migrated in-process PGlite (scripts/tests/testdb.mjs)
// served to every route through setDb, and an account with a learner whose
// context a handler can be called with, as wrap() would after a login.
// Nothing here can reach a Postgres server or the real fret_not database.

import type { IncomingMessage, ServerResponse } from "node:http";
import { freshDb } from "../../scripts/tests/testdb.mjs";
import { createLearner, createUser } from "../../scripts/db/accounts.ts";
import type { LearnerCtx } from "./auth.ts";
import { setDb, type Db } from "./db.ts";
import { HttpError, sendJson } from "./sse.ts";

export interface TestLearner {
  db: Db;
  ctx: LearnerCtx;
  /** Another learner of another account, for owner-scoping checks. */
  other: () => Promise<LearnerCtx>;
  close: () => Promise<void>;
}

let made = 0;

/** A fresh database with one account and one learner on it; the routes are
 *  served from it until `close()`. */
export async function testLearner({ admin = true, name = "Sam" }: { admin?: boolean; name?: string } = {}): Promise<TestLearner> {
  const t = await freshDb();
  setDb(t.db);
  const account = async (isAdmin: boolean, learnerName: string): Promise<LearnerCtx> => {
    const user = await createUser(t.db, { username: `user${++made}`, passwordHash: "x", isAdmin });
    const learner = await createLearner(t.db, user.id, learnerName);
    return { user: { id: user.id, username: user.username, isAdmin }, learner, sessionId: `session${made}` };
  };
  const ctx = await account(admin, name);
  return {
    db: t.db,
    ctx,
    other: () => account(false, "Other"),
    close: async () => {
      setDb(null);
      await t.close();
    },
  };
}

/** What connect + wrap() do in the app, for a handler mounted at `prefix`:
 *  strip the prefix, call it with the learner's context, and turn a thrown
 *  HttpError into its status. `ctx` is read per request, so a test can
 *  switch who is calling. */
export function asLearner(
  prefix: string,
  handler: (req: IncomingMessage, res: ServerResponse, ctx: LearnerCtx) => void | Promise<void>,
  ctx: () => LearnerCtx,
): (req: IncomingMessage, res: ServerResponse) => void {
  return (req, res) => {
    req.url = (req.url ?? "/").slice(prefix.length) || "/";
    if (!req.url.startsWith("/")) req.url = `/${req.url}`;
    Promise.resolve()
      .then(() => handler(req, res, ctx()))
      .catch((e) => {
        if (res.headersSent) return void res.destroy();
        sendJson(res, e instanceof HttpError ? e.status : 500, { error: String((e as Error)?.message || e) });
      });
  };
}
