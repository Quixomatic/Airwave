import { describe, expect, test } from "bun:test";

import { retry } from "./retry";

// Tiny delays so the backoff math runs for real without slowing the suite.
const fast = { baseMs: 1, maxMs: 4 } as const;

describe("retry", () => {
  test("returns the result on the first try without retrying", async () => {
    let calls = 0;
    const out = await retry(async () => {
      calls++;
      return "ok";
    }, fast);
    expect(out).toBe("ok");
    expect(calls).toBe(1);
  });

  test("retries a failing op until it succeeds", async () => {
    let calls = 0;
    const out = await retry(async () => {
      calls++;
      if (calls < 3) throw new Error("transient");
      return calls;
    }, { ...fast, attempts: 5 });
    expect(out).toBe(3);
    expect(calls).toBe(3);
  });

  test("rethrows the last error once attempts are exhausted", async () => {
    let calls = 0;
    await expect(
      retry(async () => {
        calls++;
        throw new Error(`fail ${calls}`);
      }, { ...fast, attempts: 4 }),
    ).rejects.toThrow("fail 4");
    expect(calls).toBe(4);
  });

  test("does not retry a non-retryable error (fails fast)", async () => {
    let calls = 0;
    class Fatal extends Error {}
    await expect(
      retry(
        async () => {
          calls++;
          throw new Fatal("nope");
        },
        { ...fast, attempts: 5, retryable: (e) => !(e instanceof Fatal) },
      ),
    ).rejects.toThrow("nope");
    expect(calls).toBe(1);
  });

  test("throws immediately on an already-aborted signal, without calling fn", async () => {
    const ctrl = new AbortController();
    ctrl.abort();
    let calls = 0;
    await expect(
      retry(async () => {
        calls++;
        throw new Error("transient");
      }, { ...fast, signal: ctrl.signal }),
    ).rejects.toThrow();
    expect(calls).toBe(0);
  });

  test("bails during backoff when the signal fires", async () => {
    const ctrl = new AbortController();
    let calls = 0;
    const p = retry(
      async () => {
        calls++;
        throw new Error("transient");
      },
      { baseMs: 50, maxMs: 50, attempts: 10, signal: ctrl.signal },
    );
    // Let the first attempt fail and enter the backoff wait, then abort.
    await new Promise((r) => setTimeout(r, 10));
    ctrl.abort();
    await expect(p).rejects.toThrow();
    expect(calls).toBe(1); // aborted mid-backoff, never retried
  });
});
