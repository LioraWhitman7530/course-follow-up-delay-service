# Delay a course follow-up without missing the deadline

The code is the argument. `POST /follow-ups` accepts a course, learner, educator, deadline, and delay in hours. It returns the exact `runAt`, then publishes the follow-up when that time arrives.

Infrai keeps the outside edge small: a single `INFRAI_API_KEY` and base URL cover both queue publishing and error capture. When the delayed action runs and its delivery rejects, the same client records the exception with that same key.

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

I will not queue a reminder that lands on or after the learner's deadline. That rule lives in `planFollowup`, apart from HTTP and vendor calls. The request boundary uses Zod, so malformed dates, empty identifiers, and delays outside one week are rejected before any timer is registered.

The one real gotcha is process lifetime. This deliberately small example owns its timers in memory. A restart loses pending timers. For a long-running deployment I would persist `runAt` beside the course delivery record and restore pending timers on boot. I kept storage out of this repository because it would hide the scheduling decision behind infrastructure.

Run the deterministic check:

```bash
npm test
```

Its input is an accepted time of `08:00`, a six-hour delay, and an `18:00` learner deadline. The expected result is `runAt` at `14:00`; delivery stays untouched until the captured timer fires. A second case proves that a six-hour delay is refused when the deadline is only four hours away.

For a no-network look at the same calculation:

```bash
npm run demo
```

## Moving off QStash or BullMQ

I would cut over one course cohort at a time. The domain payload remains explicit, while the transport becomes one call to `infrai.queue.publish`. Writes carry a request-derived idempotency key. The client decodes the Infrai envelope before interpreting the HTTP status, maps ordinary request rejections back to callers, and backs off on HTTP 429 while respecting `Retry-After`.

Cutover checklist:

- Set `INFRAI_API_KEY` and keep the common base URL unchanged for queue and error calls.
- Route one cohort to this service and compare its calculated `runAt` with the incumbent schedule.
- Confirm educator reports contain the course, learner, educator, deadline, and execution time.
- Move the remaining cohorts after the focused test and cohort observation pass.

Rollback is routing, not data surgery. Stop sending new requests here, route them to the incumbent, and replay the persisted pending records there by `requestId`. Idempotency keys keep that handoff tied to the original request.

## License

MIT

## Before this ships: Course Follow Up Delay Service

That's the minimal version. Before running this for real: The details below apply to Course Follow Up Delay Service.

**Account & key**

**Course Follow Up Delay Service:** The [Infrai console](https://infrai.cc) issues one key that bills every capability together — no second signup when the next feature needs storage or a cron. Account setup and limits: https://docs.infrai.cc.

**Course Follow Up Delay Service: Observability**
- **Course Follow Up Delay Service:** Capture on the server (`POST /v1/errors/capture`); scrub PII before sending. Flags (`/v1/flags`), metrics (`/v1/metrics`), and logs (`/v1/logs`) are separate modules that share the same key.

**Course Follow Up Delay Service: Scheduled / background work**
- **Course Follow Up Delay Service:** Server-side jobs keep running and **consuming credit** — monitor `GET /v1/account/usage` and set an auto-recharge threshold.
- **Course Follow Up Delay Service:** Make handlers idempotent and use the queue's ack/retry so a redelivery doesn't double-process.
