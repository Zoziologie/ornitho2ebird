import { afterEach, describe, expect, it, vi } from "vitest";
import { HttpError, fetchJson } from "../../src/lib/http";
import { writeStorage } from "../../src/lib/storage";
import { getCommonNameBySpeciesCode } from "../../src/lib/taxonomy";

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), { status });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("fetchJson", () => {
  it("returns the parsed body", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => jsonResponse({ ok: 1 })),
    );
    await expect(fetchJson("https://example.org/a")).resolves.toEqual({ ok: 1 });
  });

  it("rejects non-2xx responses instead of parsing the error body", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => jsonResponse({ error: "quota" }, 429)),
    );
    const error = await fetchJson("https://example.org/a?key=secret").catch((e) => e);
    expect(error).toBeInstanceOf(HttpError);
    expect(error.status).toBe(429);
    // The message names the endpoint but not the query string (API key).
    expect(error.message).not.toContain("secret");
  });

  it("passes a timeout signal to fetch", async () => {
    const fetchMock = vi.fn(async () => jsonResponse([]));
    vi.stubGlobal("fetch", fetchMock);
    await fetchJson("https://example.org/a", { timeoutMs: 1234 });
    expect(fetchMock.mock.calls[0][1].signal).toBeInstanceOf(AbortSignal);
  });
});

describe("eBird taxonomy", () => {
  it("does not cache a failed request, so the next call retries", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ title: "Forbidden" }, 403))
      .mockResolvedValueOnce(
        jsonResponse([{ speciesCode: "retloo", comName: "Plongeon catmarin" }]),
      );
    vi.stubGlobal("fetch", fetchMock);

    await expect(getCommonNameBySpeciesCode("xx-test")).rejects.toBeInstanceOf(HttpError);
    const names = await getCommonNameBySpeciesCode("xx-test");
    expect(names.get("retloo")).toBe("Plongeon catmarin");
    expect(fetchMock).toHaveBeenCalledTimes(2);

    // Success is cached.
    await getCommonNameBySpeciesCode("xx-test");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("treats an empty taxonomy as a failure", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => jsonResponse([])),
    );
    await expect(getCommonNameBySpeciesCode("xx-empty")).rejects.toThrow(/empty/);
  });
});

describe("writeStorage", () => {
  it("does not throw when storage is full or blocked", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.stubGlobal("window", {
      localStorage: {
        setItem() {
          throw new DOMException("QuotaExceededError");
        },
      },
    });
    expect(() => writeStorage("key", { a: 1 })).not.toThrow();
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });
});
