import { afterEach, describe, expect, test } from "bun:test";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

// 401 / session-recovery regressions, each phase in a fresh process (see session-test-worker.ts).
// Adapted from the PR #63 suite (SHRIVES93), scoped to the 401 lifecycle.

const dirs: string[] = [];
afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true });
});

function fixture() {
  const dir = mkdtempSync(join(tmpdir(), "airwave-session-"));
  dirs.push(dir);
  const file = join(dir, "storage.json");
  writeFileSync(file, JSON.stringify({ cache: {}, defaults: {}, secure: {} }));
  return {
    run(operation = "launch", options = {}) {
      const proc = Bun.spawnSync([process.execPath, join(import.meta.dir, "session-test-worker.ts"), file, operation, JSON.stringify(options)]);
      if (proc.exitCode !== 0) throw new Error(proc.stderr.toString());
      return JSON.parse(proc.stdout.toString());
    },
    data: () => JSON.parse(readFileSync(file, "utf8")),
  };
}

function signedIn(options = {}) {
  const app = fixture();
  expect(app.run("save", options)).toMatchObject({ error: false, route: "/guide" });
  return app;
}

describe("Apple TV session recovery after the server rejects the token", () => {
  test("a valid response preserves the session", () => {
    expect(signedIn().run("request")).toMatchObject({ error: false, redirect: null, route: "/guide" });
  });

  test("401 clears the session, keeps the server, and goes to login — across a restart", () => {
    const app = signedIn();
    expect(app.run("request", { status: 401 })).toMatchObject({
      error: true,
      redirect: "/login",
      hasToken: false,
      server: "https://example.test",
      cookie: null,
    });
    expect(app.run()).toMatchObject({ route: "/login", server: "https://example.test" });
  });

  test("signing in again after a 401 restores the guide", () => {
    const app = signedIn();
    app.run("request", { status: 401 });
    expect(app.run("save")).toMatchObject({ route: "/guide" });
    expect(app.run("request")).toMatchObject({ error: false, route: "/guide" });
  });

  for (const options of [{ networkFailure: true }, { status: 503 }, { status: 403 }]) {
    test(`temporary / permission failure keeps the session: ${JSON.stringify(options)}`, () => {
      expect(signedIn().run("request", options)).toMatchObject({
        error: true,
        redirect: null,
        hasToken: true,
        server: "https://example.test",
        route: "/guide",
      });
    });
  }

  test("a late 401 does not invalidate a newer login", () => {
    expect(signedIn().run("request", { status: 401, newToken: true })).toMatchObject({ hasToken: true, redirect: null });
  });

  test("a late 401 from the previous server does not sign out of the new one", () => {
    expect(signedIn().run("request", { status: 401, newServer: true })).toMatchObject({ hasToken: true, redirect: null });
  });

  for (const operation of ["overlap", "stale-invalidation"]) {
    test(`401 invalidation cannot erase a concurrent login: ${operation}`, () => {
      const app = signedIn();
      expect(app.run(operation)).toMatchObject({ error: false, hasToken: true, route: "/guide" });
      expect(app.data().defaults["cg-tv-token"]).toBe("new-test-token");
    });
  }

  test("iOS / Android: 401 clears the SecureStore token and keeps the server", () => {
    for (const platform of ["ios", "android"]) {
      const app = signedIn({ platform });
      expect(app.run("request", { platform, status: 401 })).toMatchObject({ redirect: "/login", hasToken: false });
      expect(app.data().secure["cg-tv-token"]).toBeUndefined();
      expect(app.run("launch", { platform })).toMatchObject({ route: "/login", server: "https://example.test" });
    }
  });
});
