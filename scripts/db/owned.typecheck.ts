// Compile-time tests for owned.ts, checked by `npm run typecheck`
// (web/tsconfig.node.json includes scripts/db/*.ts) and never run. Each
// expect-error directive below promises that its line does NOT compile; if
// one ever starts compiling, tsc fails on the unused directive. The runtime
// half is scripts/tests/db.test.mjs.

import { eq } from "drizzle-orm";
import { forLearner, forUser, type Db } from "./owned.ts";
import { authSessions, chatMessages, learners, progressBackups, users } from "./schema.ts";

export async function ownedRowTypes(db: Db, learnerId: string, userId: string) {
  const mine = forLearner(db, learnerId);

  // Rows come back typed as the table's own row.
  const rows = await mine.list(chatMessages, eq(chatMessages.role, "user"));
  const text: string | undefined = rows[0]?.text;

  // Insert takes the row without its owner; the scope supplies it.
  await mine.insert(chatMessages, { role: "user", text: "why is a fifth consonant?" });
  // @ts-expect-error the owner is the scope's to set, not the caller's
  await mine.insert(chatMessages, { learnerId, role: "user", text: "x" });
  // @ts-expect-error a required column is still required
  await mine.insert(chatMessages, { role: "user" });
  // @ts-expect-error nor can an update move a row to another owner
  await mine.update(chatMessages, { learnerId: "someone-else" }, eq(chatMessages.role, "user"));
  // @ts-expect-error update and remove need a condition
  await mine.remove(chatMessages);
  await mine.insert(progressBackups, { reason: "reset", data: {} });

  // A table without learner_id cannot be queried through a learner scope…
  // @ts-expect-error users has no learner_id
  await mine.list(users);
  // @ts-expect-error learners are owned by a user, not a learner
  await mine.list(learners);
  // …and learner-owned rows not through a user scope.
  // @ts-expect-error chat messages have no user_id
  await forUser(db, userId).list(chatMessages);
  await forUser(db, userId).list(authSessions);
  // A learner's own row (its progress) is reached through its account.
  const me = await forUser(db, userId).get(learners, eq(learners.id, learnerId));
  const progress: Record<string, unknown> | undefined = me?.progress;

  // A scope cannot be made without an owner.
  // @ts-expect-error missing learnerId
  forLearner(db);

  return { text, progress };
}
