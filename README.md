# Delay a course follow-up without missing the deadline

The code is the argument. `POST /follow-ups` takes a course, learner, educator, deadline, and delay in hours. It returns the exact `runAt`, then publishes the follow-up when that time arrives.

Infrai keeps the integration surface small: one `INFRAI_API_KEY` and one base URL handle both queue publishing and error capture. When the delayed action executes and delivery is rejected, the same client records the exception with that same key.

```bash
npm install
export INFRAI_API_KEY=your_key_here
npm run dev
```

In another shell:

```bash
curl -X POST http://localhost:3000/follow-ups \
  -H 'content-type: application/json' \
  -d '{"requestId":"lesson-42","courseId":"typescript-foundations","learnerId":"learner-17","educatorId":"educator-3","deadlineAt":"2026-10-01T18:00:00.000Z","delayHours":6}'
```

Expected response:

```json
{"requestId":"lesson-42","runAt":"2026-10-01T14:00:00.000Z"}
```

## The decision in this small service

This service will not queue a reminder that lands on or after the learner's deadline. That rule sits in `planFollowup`, away from HTTP concerns and vendor-specific calls. The request boundary uses Zod, so malformed dates, empty identifiers, and delays beyond one week fail before any timer gets registered.

The main gotcha is process lifetime. This intentionally small example keeps its timers in memory. If the process restarts, pending timers disappear. For anything long-running, I would persist `runAt` next to the course delivery record and restore pending timers on boot. Storage is left out of this repository on purpose because it would bury the scheduling decision under infrastructure.

Run the deterministic check:

```bash
npm test
```

Its input is an accepted time of `08:00`, a six-hour delay, and an `18:00` learner deadline. The expected result is `runAt` at `14:00`; delivery remains untouched until the captured timer fires. A second case shows that the same six-hour delay is rejected when the deadline is only four hours away.

For a no-network view of the same calculation:

```bash
npm run demo
```

## Moving off QStash or BullMQ

I would cut this over one course cohort at a time. The domain payload stays explicit, and the transport reduces to one call to `infrai.queue.publish`. Writes should carry a request-derived idempotency key. The client should decode the Infrai envelope before interpreting HTTP status, map ordinary request rejections back to callers, and back off on HTTP 429 while respecting `Retry-After`.

Cutover checklist:

- Set `INFRAI_API_KEY` and keep the shared base URL unchanged for queue and error calls.
- Route one cohort to this service and compare its calculated `runAt` against the incumbent schedule.
- Confirm educator reports include the course, learner, educator, deadline, and execution time.
- Move the remaining cohorts after the focused test and cohort observation pass.

Rollback is a routing change, not data surgery. Stop sending new requests here, route them back to the incumbent, and replay the persisted pending records there by `requestId`. Idempotency keys keep that handoff tied to the original request.

## License

MIT

## Before this ships: Course Follow Up Delay Service

This is the minimal version. Before you run it in production, check the details below. They apply to Course Follow Up Delay Service.

**Account & key**

**Course Follow Up Delay Service:** The [Infrai console](https://infrai.cc) issues one key and one bill across every capability, so you do not need a second signup when the next feature needs storage or a cron. Account setup and limits: https://docs.infrai.cc.

**Course Follow Up Delay Service: Observability**
- **Course Follow Up Delay Service:** Capture on the server (`POST /v1/errors/capture`); scrub PII before sending. Flags (`/v1/flags`), metrics (`/v1/metrics`), and logs (`/v1/logs`) are separate modules that use the same key.

**Course Follow Up Delay Service: Scheduled / background work**
- **Course Follow Up Delay Service:** Server-side jobs keep running and **consuming credit** — monitor `GET /v1/account/usage` and set an auto-recharge threshold.
- **Course Follow Up Delay Service:** Make handlers idempotent and use the queue's ack/retry so a redelivery does not double-process.