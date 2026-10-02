export class HttpError extends Error {
  constructor(url, status) {
    super(`HTTP ${status} for ${new URL(url).origin}${new URL(url).pathname}`);
    this.name = "HttpError";
    this.status = status;
  }
}

// fetch() + JSON with the checks fetch() leaves out: a non-2xx status rejects, and so does
// a request that takes longer than timeoutMs.
export async function fetchJson(url, { timeoutMs = 15000, ...options } = {}) {
  const response = await fetch(url, { ...options, signal: AbortSignal.timeout(timeoutMs) });
  if (!response.ok) {
    throw new HttpError(url, response.status);
  }
  return response.json();
}
