import type { IHttp } from "./ports";

const DEFAULT_TIMEOUT_MS = 20_000;

// Runs fetch under an internal AbortController that fires either when the
// timeout elapses or when the caller's own signal (if any) aborts.
async function timedFetch(
  url: string,
  init: RequestInit,
  timeoutMs: number,
): Promise<Response> {
  const controller = new AbortController();
  const abort = () => controller.abort();

  const timer = window.setTimeout(abort, timeoutMs);
  const { signal: callerSignal, ...rest } = init;
  if (callerSignal) {
    callerSignal.addEventListener("abort", abort, { once: true });
  }

  try {
    return await fetch(url, { ...rest, signal: controller.signal });
  } finally {
    window.clearTimeout(timer);
    callerSignal?.removeEventListener("abort", abort);
  }
}

export const fetchAdapter: IHttp = {
  get(
    url: string,
    options: RequestInit = {},
    timeoutMs = DEFAULT_TIMEOUT_MS,
  ): Promise<Response> {
    return timedFetch(url, { ...options, method: "GET" }, timeoutMs);
  },

  post(
    url: string,
    body: string,
    options: RequestInit = {},
    timeoutMs = DEFAULT_TIMEOUT_MS,
  ): Promise<Response> {
    return timedFetch(url, { ...options, method: "POST", body }, timeoutMs);
  },
};
