import { afterEach, describe, expect, it, vi } from "vitest";
import {
  AskError,
  fetchCompletion,
  streamCompletion,
  type RequestOptions,
} from "../request.js";

const baseOpts: RequestOptions = {
  prompt: "hi",
  stdin: "",
  model: "gpt-4o-mini",
  baseUrl: "https://api.openai.com/v1",
  apiKey: "sk-test",
  stream: true,
  json: false,
};

function sseStream(frames: string[]): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  return new ReadableStream({
    start(controller) {
      for (const f of frames) controller.enqueue(encoder.encode(f));
      controller.close();
    },
  });
}

function dataFrame(content: string): string {
  return `data: ${JSON.stringify({ choices: [{ delta: { content } }] })}\n\n`;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("streamCompletion", () => {
  it("sends a well-formed streaming request and yields deltas", async () => {
    const fetchMock = vi.fn(async () => {
      return new Response(
        sseStream([dataFrame("Hello"), dataFrame(" there"), "data: [DONE]\n\n"]),
        { status: 200 },
      );
    });
    vi.stubGlobal("fetch", fetchMock);

    const out: string[] = [];
    await streamCompletion(baseOpts, (t) => out.push(t));
    expect(out.join("")).toBe("Hello there");

    // Assert the request shape.
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as unknown as [
      string,
      RequestInit,
    ];
    expect(url).toBe("https://api.openai.com/v1/chat/completions");
    expect(init.method).toBe("POST");
    const headers = init.headers as Record<string, string>;
    expect(headers.Authorization).toBe("Bearer sk-test");
    expect(headers["Content-Type"]).toBe("application/json");
    const body = JSON.parse(init.body as string);
    expect(body).toEqual({
      model: "gpt-4o-mini",
      stream: true,
      messages: [{ role: "user", content: "hi" }],
    });
  });

  it("combines prompt and stdin into the request body", async () => {
    const fetchMock = vi.fn(async () =>
      new Response(sseStream([dataFrame("ok")]), { status: 200 }),
    );
    vi.stubGlobal("fetch", fetchMock);

    await streamCompletion(
      { ...baseOpts, prompt: "summarize", stdin: "diff text", system: "Be terse" },
      () => {},
    );
    const body = JSON.parse(
      ((fetchMock.mock.calls[0] as unknown as [string, RequestInit])[1]).body as string,
    );
    expect(body.messages).toEqual([
      { role: "system", content: "Be terse" },
      { role: "user", content: "summarize\n\ndiff text" },
    ]);
  });

  it("throws AskError with exit code 1 on a non-ok response", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response("nope", { status: 401, statusText: "Unauthorized" }),
      ),
    );
    await expect(streamCompletion(baseOpts, () => {})).rejects.toMatchObject({
      name: "AskError",
      exitCode: 1,
    });
  });
});

describe("fetchCompletion", () => {
  it("sends stream:false and returns text + raw json", async () => {
    const payload = {
      id: "x",
      choices: [{ message: { content: "the answer" } }],
    };
    const fetchMock = vi.fn(async () =>
      new Response(JSON.stringify(payload), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const result = await fetchCompletion({ ...baseOpts, stream: false });
    expect(result.text).toBe("the answer");
    expect(result.raw).toEqual(payload);

    const body = JSON.parse(
      ((fetchMock.mock.calls[0] as unknown as [string, RequestInit])[1]).body as string,
    );
    expect(body.stream).toBe(false);
  });

  it("throws AskError on HTTP error", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response("boom", { status: 500, statusText: "Server Error" }),
      ),
    );
    await expect(
      fetchCompletion({ ...baseOpts, stream: false }),
    ).rejects.toBeInstanceOf(AskError);
  });
});
