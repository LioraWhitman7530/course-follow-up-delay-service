import { planFollowup } from "./followup_policy.ts";

const planned = planFollowup(
  {
    requestId: "demo-lesson-42",
    courseId: "typescript-foundations",
    learnerId: "learner-17",
    educatorId: "educator-3",
    deadlineAt: "2026-10-01T18:00:00.000Z",
    delayHours: 6
  },
  new Date("2026-10-01T08:00:00.000Z")
);

console.log(JSON.stringify(planned, null, 2));
