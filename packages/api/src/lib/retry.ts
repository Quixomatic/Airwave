/**
 * Retry an async operation with exponential backoff.
 *
 * Generic + dependency-free so it can back any flaky/contended operation (the schedule lock's acquire,
 * a Plex 503 during transcode warmup, a connection probe, …). It runs `fn`, and while `fn` throws an
 * error that `retryable` accepts, it waits (exponential backoff, optional jitter) and tries again, up to
 * `attempts` total tries. It rethrows the last error once attempts are exhausted, throws immediately on a
 * non-retryable error, and bails (throwing the abort reason) if `signal` fires — including mid-backoff.
 */
export type RetryOpts = {
  /** Max total tries, including the first (default 8). */
  attempts?: number;
  /** Delay before the first retry, in ms (default 100). Doubles each retry up to `maxMs`. */
  baseMs?: number;
  /** Cap on any single backoff delay, in ms (default 2000). */
  maxMs?: number;
  /** Exponential growth factor (default 2). */
  factor?: number;
  /** Randomize each delay to 50–100% of its computed value, to avoid thundering herds (default true). */
  jitter?: boolean;
  /** Abort between attempts (and during a backoff wait). Jobs pass their run signal here. */
  signal?: AbortSignal;
  /** Which errors trigger a retry. Default: retry on any error. */
  retryable?: (err: unknown) => boolean;
};

function abortError(signal: AbortSignal): unknown {
  return signal.reason ?? new DOMException("The operation was aborted.", "AbortError");
}

/** Resolve after `ms`, or reject with the abort reason if `signal` fires first. */
function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(abortError(signal));
      return;
    }
    const timer = setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    const onAbort = () => {
      clearTimeout(timer);
      reject(abortError(signal!));
    };
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}

export async function retry<T>(fn: () => Promise<T>, opts: RetryOpts = {}): Promise<T> {
  const attempts = Math.max(1, opts.attempts ?? 8);
  const baseMs = opts.baseMs ?? 100;
  const maxMs = opts.maxMs ?? 2000;
  const factor = opts.factor ?? 2;
  const jitter = opts.jitter ?? true;
  const isRetryable = opts.retryable ?? (() => true);

  for (let attempt = 1; ; attempt++) {
    if (opts.signal?.aborted) throw abortError(opts.signal);
    try {
      return await fn();
    } catch (err) {
      // Give up immediately on a non-retryable error or once we're out of tries.
      if (attempt >= attempts || !isRetryable(err)) throw err;
      const exp = Math.min(maxMs, baseMs * Math.pow(factor, attempt - 1));
      const delay = jitter ? exp * (0.5 + Math.random() * 0.5) : exp;
      await sleep(delay, opts.signal);
    }
  }
}
