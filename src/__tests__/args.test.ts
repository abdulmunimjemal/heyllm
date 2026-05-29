import { describe, expect, it } from "vitest";
import { DEFAULT_BASE_URL, DEFAULT_MODEL, parseArgs } from "../index.js";

describe("parseArgs", () => {
  it("applies sensible defaults", () => {
    const args = parseArgs(["hello"]);
    expect(args.prompt).toBe("hello");
    expect(args.model).toBe(DEFAULT_MODEL);
    expect(args.baseUrl).toBe(DEFAULT_BASE_URL);
    expect(args.stream).toBe(true);
    expect(args.json).toBe(false);
    expect(args.help).toBe(false);
    expect(args.version).toBe(false);
  });

  it("joins multiple positionals into one prompt", () => {
    expect(parseArgs(["explain", "monads"]).prompt).toBe("explain monads");
  });

  it("leaves prompt undefined when none is given", () => {
    expect(parseArgs([]).prompt).toBeUndefined();
  });

  it("parses -m / --model", () => {
    expect(parseArgs(["-m", "gpt-4o", "hi"]).model).toBe("gpt-4o");
    expect(parseArgs(["--model", "llama3", "hi"]).model).toBe("llama3");
  });

  it("parses --system and --base-url and --api-key", () => {
    const args = parseArgs([
      "--system",
      "Be terse",
      "--base-url",
      "http://localhost:11434/v1",
      "--api-key",
      "sk-test",
      "hi",
    ]);
    expect(args.system).toBe("Be terse");
    expect(args.baseUrl).toBe("http://localhost:11434/v1");
    expect(args.apiKey).toBe("sk-test");
  });

  it("--no-stream disables streaming", () => {
    expect(parseArgs(["--no-stream", "hi"]).stream).toBe(false);
  });

  it("--json sets json", () => {
    expect(parseArgs(["--json", "hi"]).json).toBe(true);
  });

  it("parses -h/-v short flags", () => {
    expect(parseArgs(["-h"]).help).toBe(true);
    expect(parseArgs(["-v"]).version).toBe(true);
  });

  it("throws on unknown flags", () => {
    expect(() => parseArgs(["--nope"])).toThrow();
  });
});
