import { describe, expect, it } from "vitest";

import { createRateLimiter, clientIpFrom } from "./rate-limit.server";

/** Controllable clock so tests never sleep. */
function fakeClock(start = 1_000_000) {
  let t = start;
  return {
    now: () => t,
    advance: (ms: number) => {
      t += ms;
    },
  };
}

describe("createRateLimiter", () => {
  it("allows requests up to the limit and blocks the next one", () => {
    const clock = fakeClock();
    const limiter = createRateLimiter({
      limit: 3,
      windowMs: 60_000,
      now: clock.now,
    });

    expect(limiter.check("k").allowed).toBe(true);
    expect(limiter.check("k").allowed).toBe(true);
    const third = limiter.check("k");
    expect(third.allowed).toBe(true);
    expect(third.remaining).toBe(0);

    const blocked = limiter.check("k");
    expect(blocked.allowed).toBe(false);
    expect(blocked.retryAfter).toBeGreaterThan(0);
  });

  it("keeps keys independent", () => {
    const clock = fakeClock();
    const limiter = createRateLimiter({
      limit: 1,
      windowMs: 60_000,
      now: clock.now,
    });

    expect(limiter.check("a").allowed).toBe(true);
    expect(limiter.check("a").allowed).toBe(false);
    // A different key still has its full quota.
    expect(limiter.check("b").allowed).toBe(true);
  });

  it("frees slots as the window slides, not on a fixed boundary", () => {
    const clock = fakeClock();
    const limiter = createRateLimiter({
      limit: 2,
      windowMs: 60_000,
      now: clock.now,
    });

    limiter.check("k"); // t=0
    clock.advance(30_000);
    limiter.check("k"); // t=30s
    expect(limiter.check("k").allowed).toBe(false);

    // At t=61s the first hit has aged out, the second (t=30s) has not.
    clock.advance(31_000);
    expect(limiter.check("k").allowed).toBe(true);
    expect(limiter.check("k").allowed).toBe(false);
  });

  it("reports a retryAfter that actually frees a slot", () => {
    const clock = fakeClock();
    const limiter = createRateLimiter({
      limit: 1,
      windowMs: 60_000,
      now: clock.now,
    });

    limiter.check("k");
    const blocked = limiter.check("k");
    expect(blocked.allowed).toBe(false);

    clock.advance(blocked.retryAfter * 1000);
    expect(limiter.check("k").allowed).toBe(true);
  });

  it("does not grow unboundedly as keys expire", () => {
    const clock = fakeClock();
    const limiter = createRateLimiter({
      limit: 1,
      windowMs: 1_000,
      now: clock.now,
    });

    // Enough distinct keys to cross the prune threshold twice over.
    for (let i = 0; i < 1_200; i++) {
      clock.advance(10);
      limiter.check(`key-${i}`);
    }

    // The invariant is "bounded", not "exactly one window". Pruning is
    // sampled every 500 checks, so between prunes the map can hold up to
    // that many expired keys on top of the ~100 live ones. What must
    // never happen is unbounded growth toward all 1200 keys.
    expect(limiter.size()).toBeLessThan(700);
  });

  it("reset() clears all state", () => {
    const limiter = createRateLimiter({ limit: 1, windowMs: 60_000 });
    limiter.check("k");
    expect(limiter.check("k").allowed).toBe(false);

    limiter.reset();
    expect(limiter.size()).toBe(0);
    expect(limiter.check("k").allowed).toBe(true);
  });
});

describe("clientIpFrom", () => {
  const req = (headers: Record<string, string>) =>
    new Request("https://example.com/proxy/apply", { headers });

  it("takes the leftmost X-Forwarded-For entry (the original client)", () => {
    expect(
      clientIpFrom(req({ "x-forwarded-for": "203.0.113.7, 70.41.3.18" })),
    ).toBe("203.0.113.7");
  });

  it("trims whitespace around the entry", () => {
    expect(clientIpFrom(req({ "x-forwarded-for": "  203.0.113.7 , x" }))).toBe(
      "203.0.113.7",
    );
  });

  it("falls back to X-Real-IP", () => {
    expect(clientIpFrom(req({ "x-real-ip": "198.51.100.4" }))).toBe(
      "198.51.100.4",
    );
  });

  it("buckets unattributable requests under a single key", () => {
    expect(clientIpFrom(req({}))).toBe("unknown");
    // An empty header must not produce an empty-string key.
    expect(clientIpFrom(req({ "x-forwarded-for": "" }))).toBe("unknown");
  });
});
