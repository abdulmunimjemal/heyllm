import { describe, expect, it } from "vitest";
import { SSEParser, parseSSELine } from "../index.js";

function frame(content: string): string {
  return `data: ${JSON.stringify({ choices: [{ delta: { content } }] })}\n\n`;
}

describe("parseSSELine", () => {
  it("extracts the content delta from a data frame", () => {
    expect(
      parseSSELine(
        'data: {"choices":[{"delta":{"content":"Hello"}}]}',
      ),
    ).toBe("Hello");
  });

  it("ignores the [DONE] sentinel", () => {
    expect(parseSSELine("data: [DONE]")).toBeNull();
  });

  it("ignores empty data lines", () => {
    expect(parseSSELine("data:")).toBeNull();
    expect(parseSSELine("data: ")).toBeNull();
  });

  it("ignores non-data lines (comments, blanks)", () => {
    expect(parseSSELine(": keep-alive")).toBeNull();
    expect(parseSSELine("")).toBeNull();
    expect(parseSSELine("event: message")).toBeNull();
  });

  it("ignores frames with no content delta (e.g. role-only first frame)", () => {
    expect(
      parseSSELine('data: {"choices":[{"delta":{"role":"assistant"}}]}'),
    ).toBeNull();
  });

  it("skips malformed JSON without throwing", () => {
    expect(parseSSELine("data: {not json")).toBeNull();
  });
});

describe("SSEParser", () => {
  it("yields deltas from complete frames", () => {
    const parser = new SSEParser();
    const out = parser.push(frame("Hello") + frame(" world"));
    expect(out).toEqual(["Hello", " world"]);
  });

  it("buffers a frame split across chunks", () => {
    const parser = new SSEParser();
    const full = frame("Hello");
    const cut = Math.floor(full.length / 2);

    const first = parser.push(full.slice(0, cut));
    const second = parser.push(full.slice(cut));

    expect([...first, ...second]).toEqual(["Hello"]);
  });

  it("handles a delta split mid-JSON across many chunks", () => {
    const parser = new SSEParser();
    const full = frame("streamed");
    const out: string[] = [];
    for (const ch of full) out.push(...parser.push(ch));
    out.push(...parser.flush());
    expect(out).toEqual(["streamed"]);
  });

  it("ignores [DONE] in the stream and assembles full text", () => {
    const parser = new SSEParser();
    const stream =
      frame("a") + frame("b") + frame("c") + "data: [DONE]\n\n";
    const out = parser.push(stream);
    expect(out.join("")).toBe("abc");
  });

  it("flush emits a trailing frame that lacks a newline", () => {
    const parser = new SSEParser();
    const pushed = parser.push('data: {"choices":[{"delta":{"content":"x"}}]}');
    expect(pushed).toEqual([]);
    expect(parser.flush()).toEqual(["x"]);
  });
});
