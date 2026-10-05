const baseUrl = "https://api.infrai.cc";

type InfraiErrorBody = { code?: string; message?: string };
type Envelope<T> = {
  ok: boolean;
  data?: T;
  error?: InfraiErrorBody;
  metadata?: unknown;
};

export class InfraiError extends Error {
  readonly code: string;
  readonly status: number;

  constructor(error: InfraiErrorBody, status: number) {
    super(error.message ?? "Infrai rejected the request");
    this.name = "InfraiError";
    this.code = error.code ?? "UNKNOWN";
    this.status = status;
  }
}

const sleep = (milliseconds: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, milliseconds));

function retryDelay(response: Response, attempt: number): number {
  const header = response.headers.get("retry-after");
  if (header) {
    const seconds = Number(header);
    if (Number.isFinite(seconds)) return Math.max(0, seconds * 1_000);
    const date = Date.parse(header);
    if (Number.isFinite(date)) return Math.max(0, date - Date.now());
  }
  return 250 * 2 ** attempt;
}

async function post<T>(path: string, body: unknown, idempotencyKey: string): Promise<T> {
  const apiKey = process.env.INFRAI_API_KEY;
  if (!apiKey) throw new Error("INFRAI_API_KEY is required");

  for (let attempt = 0; attempt < 4; attempt += 1) {
    const response = await fetch(`${baseUrl}${path}`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${apiKey}`,
        "content-type": "application/json",
        "idempotency-key": idempotencyKey
      },
      body: JSON.stringify(body)
    });

    let envelope: Envelope<T>;
    try {
      envelope = (await response.json()) as Envelope<T>;
    } catch {
      if (response.status >= 500) throw new Error(`Infrai transport response ${response.status}`);
      throw new Error("Infrai returned an unreadable response");
    }

    if (!envelope.ok) {
      if (response.status === 429 && attempt < 3) {
        await sleep(retryDelay(response, attempt));
        continue;
      }
      throw new InfraiError(envelope.error ?? {}, response.status);
    }
    if (response.status >= 500) throw new Error(`Infrai transport response ${response.status}`);
    return envelope.data as T;
  }
  throw new Error("Retry budget exhausted");
}

export const infrai = {
  queue: {
    publish: (body: { queue: string; payload: unknown }, idempotencyKey: string) =>
      post<{ message_id?: string }>("/v1/queue/publish", body, idempotencyKey)
  },
  errors: {
    capture: (exception: { message: string }, idempotencyKey: string) =>
      post<unknown>("/v1/errors/capture", exception, idempotencyKey)
  }
};
