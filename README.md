# ask

Talk to an LLM from your terminal. `ask` is a tiny, dependency-light CLI that
streams answers from any OpenAI-compatible Chat Completions API straight to
stdout — built for daily use and pipelines.

```console
$ ask "explain monads simply"
A monad is a way to wrap a value along with a recipe for chaining...
```

It reads piped input as context, so it slots naturally into shell workflows:

```console
$ git diff | ask "write a conventional commit message"
feat(parser): handle SSE frames split across network chunks
```

## Install

```sh
npm install -g ask
# or
pnpm add -g ask
```

Requires Node.js ≥ 18 (it uses the built-in global `fetch`).

## Setup

Set your API key once:

```sh
export OPENAI_API_KEY="sk-..."
```

If no key is found (and `--api-key` isn't passed), `ask` prints a clear error
to stderr and exits with code `2`.

## Usage

```text
ask [options] "your prompt"
command | ask [options] "instruction"

Options
  -m, --model <name>     Model to use (default: gpt-4o-mini)
      --system <text>    System prompt
      --base-url <url>   API base URL (default: https://api.openai.com/v1)
      --api-key <key>    API key (defaults to $OPENAI_API_KEY)
      --no-stream        Wait for the full response instead of streaming
      --json             Print the raw JSON response
  -h, --help             Show help
  -v, --version          Show version
```

### Examples

```sh
# Stream an answer
ask "explain monads simply"

# Pipe context in; the prompt is the instruction, stdin is the context
git diff | ask "write a conventional commit message"

# Pick a model and add a system prompt
ask -m gpt-4o --system "You are terse" "summarize REST in 3 bullets"

# Get the raw API response for scripting
ask --json "ping" | jq '.usage'

# Disable streaming (single request, full response at once)
ask --no-stream "what is 2+2"
```

## OpenAI-compatible endpoints

`ask` speaks the OpenAI Chat Completions wire format, so `--base-url` lets it
talk to anything that implements it:

```sh
# OpenRouter
ask --base-url https://openrouter.ai/api/v1 \
    --api-key "$OPENROUTER_API_KEY" \
    -m openai/gpt-4o-mini "hi"

# Local Ollama
ask --base-url http://localhost:11434/v1 -m llama3 "hi"
```

Streaming is parsed from server-sent events (`data:` lines, ignoring `[DONE]`),
and tokens are printed as they arrive.

## Honestly

This is a deliberately tiny alternative to bigger tools like
[`llm`](https://github.com/simonw/llm) or vendor CLIs. No plugins, no config
files, no chat history — just one command that pipes well. If you want a small,
auditable binary that does the obvious thing, that's the whole pitch.

## Development

```sh
pnpm install
pnpm run typecheck   # tsc --noEmit
pnpm run test        # vitest run (no network — fetch is mocked)
pnpm run build       # tsup -> dist/
```

The network call is isolated in `src/request.ts`; the message builder, SSE
parser, and arg parser in `src/index.ts` are pure and unit-tested.

## License

[MIT](./LICENSE) © 2026 Abdulmunim Jemal
