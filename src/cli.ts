#!/usr/bin/env node
/**
 * The `heyllm` CLI entrypoint. Keeps logic thin: parse args, read stdin, dispatch
 * to the (testable) request module, and map errors to exit codes.
 *
 *   0  success
 *   1  API / HTTP / network error
 *   2  usage / configuration error (bad flags, missing API key)
 */

import pc from "picocolors";
import { parseArgs } from "./index.js";
import {
  AskError,
  fetchCompletion,
  streamCompletion,
  type RequestOptions,
} from "./request.js";

const VERSION = "0.1.0";

const HELP = `${pc.bold("heyllm")} — talk to an LLM from your terminal

${pc.bold("Usage")}
  heyllm [options] "your prompt"
  command | heyllm [options] "instruction"

${pc.bold("Options")}
  -m, --model <name>     Model to use (default: gpt-4o-mini)
      --system <text>    System prompt
      --base-url <url>   API base URL (default: https://api.openai.com/v1)
      --api-key <key>    API key (defaults to $OPENAI_API_KEY)
      --no-stream        Wait for the full response instead of streaming
      --json             Print the raw JSON response
  -h, --help             Show this help
  -v, --version          Show the version

${pc.bold("Environment")}
  OPENAI_API_KEY         API key used when --api-key is not given

${pc.bold("Examples")}
  heyllm "explain monads simply"
  git diff | heyllm "write a conventional commit message"
  heyllm -m gpt-4o --system "You are terse" "summarize REST"
  heyllm --base-url http://localhost:11434/v1 -m llama3 "hello"
`;

/** Read all of stdin if it is piped (not a TTY). Returns "" otherwise. */
async function readStdin(): Promise<string> {
  if (process.stdin.isTTY) return "";

  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) {
    chunks.push(chunk as Buffer);
  }
  return Buffer.concat(chunks).toString("utf8");
}

function fail(message: string, exitCode: number): never {
  process.stderr.write(`${pc.red("error")}: ${message}\n`);
  process.exit(exitCode);
}

async function main(): Promise<void> {
  let parsed;
  try {
    parsed = parseArgs(process.argv.slice(2));
  } catch (err) {
    fail((err as Error).message, 2);
  }

  if (parsed.help) {
    process.stdout.write(HELP);
    return;
  }
  if (parsed.version) {
    process.stdout.write(`${VERSION}\n`);
    return;
  }

  const apiKey = parsed.apiKey ?? process.env.OPENAI_API_KEY;
  if (!apiKey) {
    fail(
      "no API key found. Set OPENAI_API_KEY or pass --api-key <key>.",
      2,
    );
  }

  const stdin = await readStdin();
  if (!parsed.prompt && !stdin.trim()) {
    fail('no prompt given. Try: heyllm "your question"  (or pipe input).', 2);
  }

  const opts: RequestOptions = {
    prompt: parsed.prompt,
    stdin,
    system: parsed.system,
    model: parsed.model,
    baseUrl: parsed.baseUrl,
    apiKey,
    stream: parsed.stream,
    json: parsed.json,
  };

  try {
    if (parsed.json || !parsed.stream) {
      const { text, raw } = await fetchCompletion(opts);
      if (parsed.json) {
        process.stdout.write(`${JSON.stringify(raw, null, 2)}\n`);
      } else {
        process.stdout.write(text.endsWith("\n") ? text : `${text}\n`);
      }
      return;
    }

    let wroteAnything = false;
    await streamCompletion(opts, (text) => {
      wroteAnything = wroteAnything || text.length > 0;
      process.stdout.write(text);
    });
    if (wroteAnything) process.stdout.write("\n");
  } catch (err) {
    if (err instanceof AskError) fail(err.message, err.exitCode);
    fail((err as Error).message, 1);
  }
}

main().catch((err: unknown) => {
  fail((err as Error).message ?? String(err), 1);
});
