import type { TutorContext } from "../../shared/wire.ts";

/** A suggestion shown while the transcript is empty. `send` starters go out
 *  as they are; the others end mid-sentence and only fill the box, for the
 *  learner to finish. */
export interface Starter {
  label: string;
  text: string;
  send: boolean;
}

/** Two or three openers that fit what the learner is looking at. Pure, so a
 *  test can pin them. */
export function startersFor(ctx: TutorContext): Starter[] {
  const missed = ctx.recent?.filter((a) => !a.correct).at(-1);
  if (ctx.page === "lesson" && ctx.lesson) {
    const out: Starter[] = [];
    if (missed) out.push({ label: "Why was my last answer wrong?", text: `I got this one wrong: "${missed.prompt}". Why, and how should I think about it?`, send: true });
    out.push({ label: "Explain this another way", text: `Explain the main idea of this lesson ("${ctx.lesson.title}") another way, with a different example.`, send: true });
    out.push({ label: "Three more practice questions", text: "Add three more practice questions to this lesson.", send: true });
    if (!missed) out.push({ label: "Write a follow-up lesson on…", text: "Write a short follow-up lesson to this one on ", send: false });
    return out;
  }
  if (ctx.page === "review" || ctx.page === "placement") {
    return [
      ...(missed ? [{ label: "Why was my last answer wrong?", text: `I got this one wrong: "${missed.prompt}". Why, and how should I think about it?`, send: true }] : []),
      { label: "Help me with a concept…", text: "I keep getting confused about ", send: false },
      { label: "How does review work?", text: "How do reviews and mastery work in this app, and what should I do when I keep missing something?", send: true },
    ];
  }
  if (ctx.page === "lab" || ctx.page === "sketchpad") {
    return [
      { label: "What should I try here?", text: `Suggest three things to try in ${ctx.page === "sketchpad" ? "the Sketchpad" : ctx.lab ? `the ${ctx.lab} explorer` : "the Lab"} that would teach me something, and what to listen for.`, send: true },
      { label: "Why does this sound the way it does?", text: "Why does ", send: false },
      { label: "Write a lesson on…", text: "Write a short lesson on ", send: false },
    ];
  }
  return [
    { label: "What should I learn next?", text: "Looking at the curriculum, what should I focus on next, and why does it come in that order?", send: true },
    { label: "Explain a term…", text: "What does this mean: ", send: false },
    { label: "Write a lesson on…", text: "Write a short lesson on ", send: false },
  ];
}
