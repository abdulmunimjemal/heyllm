import { describe, expect, it } from "vitest";
import {
  buildMessages,
  buildRequestBody,
  chatCompletionsUrl,
  extractCompletionText,
} from "../index.js";

describe("buildMessages", () => {
  it("uses the prompt alone when there is no stdin", () => {
    expect(buildMessages({ prompt: "hello" })).toEqual([
      { role: "user", content: "hello" },
    ]);
  });

  it("uses stdin alone when there is no prompt", () => {
    expect(buildMessages({ stdin: "piped context" })).toEqual([
      { role: "user", content: "piped context" },
    ]);
  });

  it("combines prompt then stdin (instruction first, context second)", () => {
    const messages = buildMessages({
      prompt: "write a commit message",
      stdin: "diff --git a/x b/x",
    });
    expect(messages).toEqual([
      {
        role: "user",
        content: "write a commit message\n\ndiff --git a/x b/x",
      },
    ]);
  });

  it("prepends a system message when provided", () => {
    const messages = buildMessages({ prompt: "hi", system: "Be terse" });
    expect(messages[0]).toEqual({ role: "system", content: "Be terse" });
    expect(messages[1]).toEqual({ role: "user", content: "hi" });
  });

  it("ignores a blank/whitespace-only system prompt", () => {
    const messages = buildMessages({ prompt: "hi", system: "   " });
    expect(messages).toHaveLength(1);
    expect(messages[0].role).toBe("user");
  });

  it("trims surrounding whitespace from prompt and stdin", () => {
    const messages = buildMessages({ prompt: "  hi  ", stdin: "  ctx  " });
    expect(messages[0].content).toBe("hi\n\nctx");
  });
});

describe("buildRequestBody", () => {
  it("includes model, messages, and the stream flag", () => {
    const body = buildRequestBody({
      prompt: "hi",
      model: "gpt-4o-mini",
      stream: true,
    });
    expect(body).toEqual({
      model: "gpt-4o-mini",
      stream: true,
      messages: [{ role: "user", content: "hi" }],
    });
  });

  it("carries stream:false through", () => {
    const body = buildRequestBody({ prompt: "hi", model: "m", stream: false });
    expect(body.stream).toBe(false);
  });
});

describe("chatCompletionsUrl", () => {
  it("appends the completions path", () => {
    expect(chatCompletionsUrl("https://api.openai.com/v1")).toBe(
      "https://api.openai.com/v1/chat/completions",
    );
  });

  it("strips trailing slashes from the base URL", () => {
    expect(chatCompletionsUrl("http://localhost:11434/v1/")).toBe(
      "http://localhost:11434/v1/chat/completions",
    );
  });
});

describe("extractCompletionText", () => {
  it("pulls the message content from a completion response", () => {
    const text = extractCompletionText({
      choices: [{ message: { content: "the answer" } }],
    });
    expect(text).toBe("the answer");
  });

  it("returns empty string when nothing is present", () => {
    expect(extractCompletionText({})).toBe("");
    expect(extractCompletionText({ choices: [] })).toBe("");
  });
});
