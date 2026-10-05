import assert from "node:assert/strict";
import test from "node:test";
import { scheduleFollowup, type Clock } from "../src/followup_policy.ts";

test("holds an educator follow-up for six hours and still beats the deadline", async () => {
  let scheduledDelay = 0;
  let scheduledTask: (() => void) | undefined;
  const clock: Clock = {
    now: () => new Date("2026-10-01T08:00:00.000Z"),
    set: (delay, task) => {
      scheduledDelay = delay;
      scheduledTask = task;
    }
  };
  const delivered: string[] = [];

  const result = scheduleFollowup(
    {
      requestId: "lesson-42",
      courseId: "typescript-foundations",
      learnerId: "learner-17",
      educatorId: "educator-3",
      deadlineAt: "2026-10-01T18:00:00.000Z",
      delayHours: 6
    },
    async (followup) => { delivered.push(followup.requestId); },
    async () => { throw new Error("unexpected failure report"); },
    clock
  );

  assert.equal(result.runAt, "2026-10-01T14:00:00.000Z");
  assert.equal(scheduledDelay, 6 * 60 * 60 * 1_000);
  assert.deepEqual(delivered, []);
  assert.ok(scheduledTask);
  scheduledTask();
  await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual(delivered, ["lesson-42"]);
});

test("rejects a follow-up that would miss the learner deadline", () => {
  const clock: Clock = {
    now: () => new Date("2026-10-01T08:00:00.000Z"),
    set: () => undefined
  };

  assert.throws(
    () => scheduleFollowup(
      {
        requestId: "late-lesson",
        courseId: "typescript-foundations",
        learnerId: "learner-17",
        educatorId: "educator-3",
        deadlineAt: "2026-10-01T12:00:00.000Z",
        delayHours: 6
      },
      async () => undefined,
      async () => undefined,
      clock
    ),
    /before the learner deadline/
  );
});
