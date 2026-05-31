/**
 * Pure, network-free helpers for the `heyllm` CLI.
 *
 * Everything here is deterministic and unit-tested. The only impure part of
 * the program (the HTTP/SSE call) lives in `request.ts`, and the wiring lives
 * in `cli.ts`.
 */

import { parseArgs as nodeParseArgs } from "node:util";

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface BuildMessagesInput {
  /** The positional prompt argument, if any. */
  prompt?: string;
  /** Text piped in via stdin, if any. */
  stdin?: string;
  /** Optional system prompt. */
  system?: string;
}

/**
 * Build the chat `messages` array from the prompt, piped stdin, and system
 * prompt. The prompt argument and stdin are combined into a single user
 * message: the prompt comes first (the instruction), followed by the stdin
 * (the context), so that `git diff | heyllm "write a commit message"` works.
 */
export function buildMessages(input: BuildMessagesInput): ChatMessage[] {
  const messages: ChatMessage[] = [];

  const system = input.system?.trim();
  if (system) {
    messages.push({ role: "system", content: system });
  }

  const prompt = input.prompt?.trim() ?? "";
  const stdin = input.stdin?.trim() ?? "";

  let content: string;
  if (prompt && stdin) {
    content = `${prompt}\n\n${stdin}`;
  } else {
    content = prompt || stdin;
  }

  messages.push({ role: "user", content });
  return messages;
}

export interface BuildRequestBodyInput extends BuildMessagesInput {
  model: string;
  stream: boolean;
}

export interface ChatRequestBody {
  model: string;
  messages: ChatMessage[];
  stream: boolean;
}

/** Build the JSON request body for the Chat Completions endpoint. */
export function buildRequestBody(input: BuildRequestBodyInput): ChatRequestBody {
  return {
    model: input.model,
    messages: buildMessages(input),
    stream: input.stream,
  };
}

/**
 * Incrementally parse OpenAI-style SSE chunks.
 *
 * SSE frames arrive as `data: {json}\n\n`, possibly split across network
 * chunks. This class buffers partial lines and yields the text deltas from
 * each complete `data:` line, ignoring the terminating `[DONE]` sentinel and
 * any frames without a content delta.
 */
export class SSEParser {
  private buffer = "";

  /**
   * Feed a raw text chunk and return the content deltas it completed.
   * Incomplete trailing data is buffered until the next call.
   */
  push(chunk: string): string[] {
    this.buffer += chunk;
    const deltas: string[] = [];

    let newlineIndex: number;
    while ((newlineIndex = this.buffer.indexOf("\n")) !== -1) {
      const line = this.buffer.slice(0, newlineIndex);
      this.buffer = this.buffer.slice(newlineIndex + 1);
      const delta = parseSSELine(line);
      if (delta) deltas.push(delta);
    }

    return deltas;
  }

  /** Flush any remaining buffered line (e.g. a final frame with no newline). */
  flush(): string[] {
    if (this.buffer.length === 0) return [];
    const line = this.buffer;
    this.buffer = "";
    const delta = parseSSELine(line);
    return delta ? [delta] : [];
  }
}

/**
 * Parse a single SSE line and return the text delta, or `null` if the line is
 * not a content-bearing `data:` frame.
 */
export function parseSSELine(line: string): string | null {
  const trimmed = line.trim();
  if (!trimmed.startsWith("data:")) return null;

  const payload = trimmed.slice("data:".length).trim();
  if (payload === "" || payload === "[DONE]") return null;

  try {
    const json = JSON.parse(payload) as {
      choices?: Array<{ delta?: { content?: string } }>;
    };
    const content = json.choices?.[0]?.delta?.content;
    return typeof content === "string" && content.length > 0 ? content : null;
  } catch {
    // Malformed JSON in a frame: skip it rather than crashing the stream.
    return null;
  }
}

/** Extract the assistant text from a non-streaming completion response. */
export function extractCompletionText(json: unknown): string {
  const data = json as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  return data.choices?.[0]?.message?.content ?? "";
}

export interface ParsedArgs {
  prompt?: string;
  model: string;
  system?: string;
  baseUrl: string;
  apiKey?: string;
  stream: boolean;
  json: boolean;
  help: boolean;
  version: boolean;
}

export const DEFAULT_MODEL = "gpt-4o-mini";
export const DEFAULT_BASE_URL = "https://api.openai.com/v1";

export interface ParseArgsResult {
  args: ParsedArgs;
}

/**
 * Parse argv (the part after `node script`) into a typed options object using
 * `node:util` parseArgs. Pure: no env access, no I/O. Throws on unknown flags.
 */
export function parseArgs(argv: string[]): ParsedArgs {
  const { values, positionals } = nodeParseArgs({
    args: argv,
    allowPositionals: true,
    options: {
      model: { type: "string", short: "m" },
      system: { type: "string" },
      "base-url": { type: "string" },
      "api-key": { type: "string" },
      stream: { type: "boolean", default: true },
      "no-stream": { type: "boolean" },
      json: { type: "boolean", default: false },
      help: { type: "boolean", short: "h", default: false },
      version: { type: "boolean", short: "v", default: false },
    },
  });

  const stream = values["no-stream"] ? false : (values.stream as boolean);

  return {
    prompt: positionals.length > 0 ? positionals.join(" ") : undefined,
    model: (values.model as string | undefined) ?? DEFAULT_MODEL,
    system: values.system as string | undefined,
    baseUrl: (values["base-url"] as string | undefined) ?? DEFAULT_BASE_URL,
    apiKey: values["api-key"] as string | undefined,
    stream,
    json: values.json as boolean,
    help: values.help as boolean,
    version: values.version as boolean,
  };
}

/** Build the full chat completions endpoint URL from a base URL. */
export function chatCompletionsUrl(baseUrl: string): string {
  return `${baseUrl.replace(/\/+$/, "")}/chat/completions`;
}
