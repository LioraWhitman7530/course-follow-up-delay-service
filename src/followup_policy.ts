export type CourseFollowup = {
  requestId: string;
  courseId: string;
  learnerId: string;
  educatorId: string;
  deadlineAt: string;
  delayHours: number;
};

export type ScheduledFollowup = CourseFollowup & { runAt: string };

export function planFollowup(input: CourseFollowup, acceptedAt: Date): ScheduledFollowup {
  const deadline = Date.parse(input.deadlineAt);
  const runAt = acceptedAt.getTime() + input.delayHours * 60 * 60 * 1_000;
  if (runAt >= deadline) {
    throw new Error("The follow-up must run before the learner deadline");
  }
  return { ...input, runAt: new Date(runAt).toISOString() };
}

export interface Clock {
  now(): Date;
  set(delayMilliseconds: number, task: () => void): void;
}

export const systemClock: Clock = {
  now: () => new Date(),
  set: (delayMilliseconds, task) => {
    const timer = setTimeout(task, delayMilliseconds);
    timer.unref();
  }
};

export function scheduleFollowup(
  input: CourseFollowup,
  deliver: (followup: ScheduledFollowup) => Promise<void>,
  reportFailure: (error: Error, followup: ScheduledFollowup) => Promise<void>,
  clock: Clock = systemClock
): ScheduledFollowup {
  const planned = planFollowup(input, clock.now());
  const delay = Date.parse(planned.runAt) - clock.now().getTime();
  clock.set(delay, () => {
    void deliver(planned).catch(async (cause: unknown) => {
      const error = cause instanceof Error ? cause : new Error(String(cause));
      await reportFailure(error, planned);
    });
  });
  return planned;
}
