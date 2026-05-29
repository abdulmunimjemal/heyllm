/**
 * The single impure module: it performs the HTTP request via the global
 * `fetch` and consumes the SSE stream. It depends only on the pure helpers in
 * `index.ts`, so it can be exercised with a stubbed `fetch` in tests.
 */

import {
  SSEParser,
  buildRequestBody,
  chatCompletionsUrl,
  extractCompletionText,
  type BuildMessagesInput,
} from "./index.js";

export interface RequestOptions extends BuildMessagesInput {
  model: string;
  baseUrl: string;
  apiKey: string;
  stream: boolean;
  json: boolean;
}

/** Error carrying an exit code, so the CLI can map failures to process codes. */
export class AskError extends Error {
  readonly exitCode: number;
  constructor(message: string, exitCode = 1) {
    super(message);
    this.name = "AskError";
    this.exitCode = exitCode;
  }
}

function headers(apiKey: string): Record<string, string> {
  return {
    "Content-Type": "application/json",
    Authorization: `Bearer ${apiKey}`,
  };
}

async function readErrorBody(res: Response): Promise<string> {
  try {
    const text = await res.text();
    return text ? `: ${text}` : "";
  } catch {
    return "";
  }
}

/**
 * Run a streaming chat completion, writing text deltas to `onText` as they
 * arrive. Returns once the stream is exhausted.
 */
export async function streamCompletion(
  opts: RequestOptions,
  onText: (text: string) => void,
): Promise<void> {
  const res = await fetch(chatCompletionsUrl(opts.baseUrl), {
    method: "POST",
    headers: headers(opts.apiKey),
    body: JSON.stringify(
      buildRequestBody({
        prompt: opts.prompt,
        stdin: opts.stdin,
        system: opts.system,
        model: opts.model,
        stream: true,
      }),
    ),
  });

  if (!res.ok) {
    throw new AskError(
      `Request failed (${res.status} ${res.statusText})${await readErrorBody(res)}`,
    );
  }

  if (!res.body) {
    throw new AskError("Response had no body to stream.");
  }

  const parser = new SSEParser();
  const decoder = new TextDecoder();

  // res.body is a web ReadableStream<Uint8Array> under Node's fetch.
  const reader = res.body.getReader();
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      const chunk = decoder.decode(value, { stream: true });
      for (const delta of parser.push(chunk)) onText(delta);
    }
  } finally {
    reader.releaseLock();
  }

  for (const delta of parser.flush()) onText(delta);
}

export interface NonStreamResult {
  /** Assistant text, for plain output. */
  text: string;
  /** Raw parsed JSON, for `--json`. */
  raw: unknown;
}

/** Run a single non-streaming chat completion and return text + raw JSON. */
export async function fetchCompletion(
  opts: RequestOptions,
): Promise<NonStreamResult> {
  const res = await fetch(chatCompletionsUrl(opts.baseUrl), {
    method: "POST",
    headers: headers(opts.apiKey),
    body: JSON.stringify(
      buildRequestBody({
        prompt: opts.prompt,
        stdin: opts.stdin,
        system: opts.system,
        model: opts.model,
        stream: false,
      }),
    ),
  });

  if (!res.ok) {
    throw new AskError(
      `Request failed (${res.status} ${res.statusText})${await readErrorBody(res)}`,
    );
  }

  const raw = (await res.json()) as unknown;
  return { text: extractCompletionText(raw), raw };
}
