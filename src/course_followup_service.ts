import { createServer, type ServerResponse } from "node:http";
import { z } from "zod";
import { infrai, InfraiError } from "./infrai.ts";
import {
  scheduleFollowup,
  type CourseFollowup,
  type ScheduledFollowup
} from "./followup_policy.ts";

const requestSchema = z.object({
  requestId: z.string().min(1),
  courseId: z.string().min(1),
  learnerId: z.string().min(1),
  educatorId: z.string().min(1),
  deadlineAt: z.string().datetime(),
  delayHours: z.number().positive().max(168)
});

function json(response: ServerResponse, status: number, body: unknown): void {
  response.writeHead(status, { "content-type": "application/json" });
  response.end(JSON.stringify(body));
}

async function deliver(followup: ScheduledFollowup): Promise<void> {
  await infrai.queue.publish(
    {
      queue: "course-followups",
      payload: {
        type: "course.followup_due",
        courseId: followup.courseId,
        learnerId: followup.learnerId,
        educatorId: followup.educatorId,
        deadlineAt: followup.deadlineAt,
        runAt: followup.runAt
      }
    },
    `followup:${followup.requestId}`
  );
}

async function reportFailure(error: Error, followup: ScheduledFollowup): Promise<void> {
  await infrai.errors.capture(
    { message: error.message },
    `followup-failure:${followup.requestId}`
  );
}

export const server = createServer((request, response) => {
  if (request.method !== "POST" || request.url !== "/follow-ups") {
    json(response, 404, { error: "Not found" });
    return;
  }

  const chunks: Buffer[] = [];
  request.on("data", (chunk: Buffer) => chunks.push(chunk));
  request.on("end", () => {
    try {
      const parsed = requestSchema.parse(
        JSON.parse(Buffer.concat(chunks).toString("utf8"))
      ) as CourseFollowup;
      const followup = scheduleFollowup(parsed, deliver, reportFailure);
      json(response, 202, { requestId: followup.requestId, runAt: followup.runAt });
    } catch (cause) {
      if (cause instanceof z.ZodError || cause instanceof SyntaxError) {
        json(response, 400, { error: "Invalid request body" });
        return;
      }
      if (cause instanceof InfraiError) {
        json(response, cause.status >= 400 && cause.status < 500 ? cause.status : 502, {
          error: cause.code,
          message: cause.message
        });
        return;
      }
      json(response, 422, { error: cause instanceof Error ? cause.message : "Unable to schedule" });
    }
  });
});

if (process.env.NODE_ENV !== "test") {
  const port = Number(process.env.PORT ?? 3000);
  server.listen(port, () => console.log(`Course follow-up service listening on ${port}`));
}
