import { describe, expect, it, vi } from "vitest";
import {
  encodeBase64Utf8,
  putFileToGitHub,
  readTextFileFromGitHub
} from "./GitHubPublisher";

function makeJsonResponse(
  status: number,
  payload: unknown
): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "Content-Type": "application/json" }
  });
}

describe("GitHubPublisher", () => {
  it("encodes UTF-8 content to base64", () => {
    const encoded = encodeBase64Utf8("hello-fest-🎵");
    expect(encoded).toBe("aGVsbG8tZmVzdC3wn461");
  });

  it("updates an existing file when sha is present", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        makeJsonResponse(200, { sha: "abc123" })
      )
      .mockResolvedValueOnce(
        makeJsonResponse(200, {
          content: { html_url: "https://github.com/anuln/stagerush/blob/main/file.json" },
          commit: { html_url: "https://github.com/anuln/stagerush/commit/123" }
        })
      );

    const result = await putFileToGitHub(
      {
        token: "token_123",
        owner: "anuln",
        repo: "stagerush",
        branch: "main",
        path: "public/assets/maps/govball/config.json",
        message: "chore: update map",
        content: "{\"id\":\"govball\"}\n"
      },
      fetchMock as unknown as typeof fetch
    );

    expect(fetchMock).toHaveBeenCalledTimes(2);
    const putRequest = fetchMock.mock.calls[1] as [string, RequestInit];
    const payload = JSON.parse(putRequest[1]?.body as string) as Record<string, unknown>;
    expect(payload.sha).toBe("abc123");
    expect(result.fileUrl).toContain("/blob/main/file.json");
    expect(result.commitUrl).toContain("/commit/123");
  });

  it("creates a file when target path does not exist", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        makeJsonResponse(404, { message: "Not Found" })
      )
      .mockResolvedValueOnce(
        makeJsonResponse(201, {
          content: { html_url: "https://github.com/anuln/stagerush/blob/main/new.json" },
          commit: { html_url: "https://github.com/anuln/stagerush/commit/456" }
        })
      );

    const result = await putFileToGitHub(
      {
        token: "token_123",
        owner: "anuln",
        repo: "stagerush",
        branch: "main",
        path: "public/assets/admin/snapshots/govball.json",
        message: "chore: add snapshot",
        content: "{\"ok\":true}\n"
      },
      fetchMock as unknown as typeof fetch
    );

    expect(fetchMock).toHaveBeenCalledTimes(2);
    const secondCall = fetchMock.mock.calls[1] as [string, RequestInit];
    const payload = JSON.parse(secondCall[1]?.body as string) as Record<
      string,
      unknown
    >;
    expect(payload.sha).toBeUndefined();
    expect(result.commitUrl).toContain("/commit/456");
  });

  it("uses provided base64 content payload when supplied", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(makeJsonResponse(404, { message: "Not Found" }))
      .mockResolvedValueOnce(
        makeJsonResponse(201, {
          content: { html_url: "https://github.com/anuln/stagerush/blob/main/new.bin" },
          commit: { html_url: "https://github.com/anuln/stagerush/commit/789" }
        })
      );

    await putFileToGitHub(
      {
        token: "token_123",
        owner: "anuln",
        repo: "stagerush",
        branch: "main",
        path: "public/assets/maps/govball/committed/intro.png",
        message: "chore: add inline asset",
        content: "",
        contentBase64: "QUJDRA=="
      },
      fetchMock as unknown as typeof fetch
    );

    const putRequest = fetchMock.mock.calls[1] as [string, RequestInit];
    const payload = JSON.parse(putRequest[1]?.body as string) as Record<string, unknown>;
    expect(payload.content).toBe("QUJDRA==");
  });

  it("reads and decodes utf8 text file contents from GitHub", async () => {
    const encoded = encodeBase64Utf8('{"id":"govball","name":"Stage Rush 🎵"}\n');
    const fetchMock = vi.fn().mockResolvedValueOnce(
      makeJsonResponse(200, {
        sha: "abc123",
        encoding: "base64",
        content: `${encoded.slice(0, 12)}\n${encoded.slice(12)}`,
        html_url: "https://github.com/anuln/stagerush/blob/main/public/assets/maps/govball/config.json"
      })
    );

    const result = await readTextFileFromGitHub(
      {
        token: "token_123",
        owner: "anuln",
        repo: "stagerush",
        branch: "main",
        path: "public/assets/maps/govball/config.json"
      },
      fetchMock as unknown as typeof fetch
    );

    expect(result.exists).toBe(true);
    expect(result.sha).toBe("abc123");
    expect(result.content).toContain('"name":"Stage Rush 🎵"');
    expect(result.fileUrl).toContain("/blob/main/public/assets/maps/govball/config.json");
  });
});
