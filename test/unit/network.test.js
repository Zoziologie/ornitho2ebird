import { afterEach, describe, expect, it, vi } from "vitest";
import { HttpError, fetchJson } from "../../src/lib/http";
import { writeStorage } from "../../src/lib/storage";
import { cachedEbirdTaxa, getEbirdTaxa } from "../../src/lib/taxonomy";

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
  const retloo = { speciesCode: "retloo", comName: "Plongeon catmarin", sciName: "Gavia stellata" };

  it("requests only the needed codes and caches them", async () => {
    const fetchMock = vi.fn(async () => jsonResponse([{ ...retloo, category: "species" }]));
    vi.stubGlobal("fetch", fetchMock);

    expect(cachedEbirdTaxa("xx-codes", ["retloo"])).toBeNull();
    const taxa = await getEbirdTaxa("xx-codes", ["retloo", "retloo", "oldcode"]);
    const url = new URL(fetchMock.mock.calls[0][0]);
    expect(url.searchParams.get("species")).toBe("retloo,oldcode");
    expect(url.searchParams.get("locale")).toBe("xx-codes");
    expect(taxa.get("retloo")).toEqual({
      comName: "Plongeon catmarin",
      sciName: "Gavia stellata",
      category: "species",
    });
    // A code eBird does not return is left out, and not requested again.
    expect(taxa.has("oldcode")).toBe(false);
    await getEbirdTaxa("xx-codes", ["retloo", "oldcode"]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(cachedEbirdTaxa("xx-codes", ["retloo", "oldcode"]).size).toBe(1);
  });

  it("splits long code lists over several requests", async () => {
    const fetchMock = vi.fn(async () => jsonResponse([]));
    vi.stubGlobal("fetch", fetchMock);
    const codes = Array.from({ length: 400 }, (_, index) => `code${index}`);
    await getEbirdTaxa("xx-chunks", codes);
    expect(fetchMock).toHaveBeenCalledTimes(3);
    const requested = fetchMock.mock.calls.flatMap(([url]) =>
      new URL(url).searchParams.get("species").split(","),
    );
    expect(requested.sort()).toEqual([...codes].sort());
  });

  it("does not cache a failed request, so the next call retries", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ title: "Forbidden" }, 403))
      .mockResolvedValueOnce(jsonResponse([retloo]));
    vi.stubGlobal("fetch", fetchMock);

    await expect(getEbirdTaxa("xx-retry", ["retloo"])).rejects.toBeInstanceOf(HttpError);
    expect(cachedEbirdTaxa("xx-retry", ["retloo"])).toBeNull();
    const taxa = await getEbirdTaxa("xx-retry", ["retloo"]);
    expect(taxa.get("retloo").comName).toBe("Plongeon catmarin");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("makes no request when there are no codes", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    await expect(getEbirdTaxa("xx-none", [])).resolves.toEqual(new Map());
    expect(fetchMock).not.toHaveBeenCalled();
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
