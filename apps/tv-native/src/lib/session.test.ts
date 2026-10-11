import { afterEach, describe, expect, test } from "bun:test";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const dirs: string[] = [];
afterEach(() => { for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true }); });

function fixture(cache: Record<string, string> = {}) {
  const dir = mkdtempSync(join(tmpdir(), "airwave-session-"));
  dirs.push(dir);
  const file = join(dir, "storage.json");
  writeFileSync(file, JSON.stringify({ cache, defaults: {}, secure: {} }));
  return {
    run(operation = "launch", options = {}) {
      const process = Bun.spawnSync([Bun.which("bun")!, join(import.meta.dir, "session-test-worker.ts"),
        file, operation, JSON.stringify(options)]);
      if (process.exitCode !== 0) throw new Error(process.stderr.toString());
      return JSON.parse(process.stdout.toString());
    },
    data: () => JSON.parse(readFileSync(file, "utf8")),
    purgeCache() {
      const data = JSON.parse(readFileSync(file, "utf8"));
      data.cache = {};
      writeFileSync(file, JSON.stringify(data));
    },
  };
}

describe("native session persistence across fresh application processes", () => {
  test("first launch routes to setup", () => {
    expect(fixture().run()).toMatchObject({ ready: true, error: false, route: "/setup" });
  });
  test("server and all credentials survive a restart and tvOS cache eviction", () => {
    const app = fixture();
    expect(app.run("save")).toMatchObject({ error: false, server: "https://example.test", route: "/guide" });
    app.purgeCache();
    expect(app.run()).toMatchObject({ error: false, server: "https://example.test", hasToken: true,
      cookie: "test-cookie", route: "/guide", capsDone: true });
  });
  test("migrates surviving legacy URL, bearer and Expo credentials", () => {
    const app = fixture({ "cg-tv-server-url": "https://legacy.test/", "cg-tv-token": "legacy-test-token",
      cg_cookie: "legacy-cookie", cg_session_data: "legacy-session", "unrelated-pref": "stay-in-cache" });
    expect(app.run()).toMatchObject({ route: "/guide", server: "https://legacy.test", cookie: "legacy-cookie" });
    expect(app.data().defaults["unrelated-pref"]).toBeUndefined();
    app.purgeCache();
    expect(app.run()).toMatchObject({ route: "/guide", cookie: "legacy-cookie" });
  });
  test("saved server without token routes to login", () => {
    expect(fixture({ "cg-tv-server-url": "https://example.test" }).run()).toMatchObject({ route: "/login" });
  });
  test("valid server response preserves authentication", () => {
    const app = fixture(); app.run("save");
    expect(app.run("request")).toMatchObject({ error: false, route: "/guide", redirect: null });
  });
  test("401 clears authentication but preserves the server across restarts", () => {
    const app = fixture(); app.run("save");
    expect(app.run("request", { status: 401 })).toMatchObject({ error: true, redirect: "/login",
      hasToken: false, server: "https://example.test", cookie: null });
    expect(app.run()).toMatchObject({ route: "/login", server: "https://example.test" });
  });
  test("late 401 does not invalidate a newer login", () => {
    const app = fixture(); app.run("save");
    expect(app.run("request", { status: 401, newToken: true })).toMatchObject({ hasToken: true, redirect: null });
  });
  for (const operation of ["overlap", "stale-invalidation"]) {
    test(`401 invalidation cannot erase a concurrent login: ${operation}`, () => {
      const app = fixture(); app.run("save");
      expect(app.run(operation)).toMatchObject({ error: false, hasToken: true, route: "/guide" });
      expect(app.data().defaults["cg-tv-token"]).toBe("new-test-token");
    });
  }
  test("device identity and completed capability onboarding survive cache eviction", () => {
    const app = fixture();
    const saved = app.run("save");
    app.purgeCache();
    expect(app.run()).toMatchObject({ device: saved.device, capsDone: true });
  });
  test("legacy cleanup failure does not commit a deletion or report success", () => {
    const app = fixture(); app.run("save");
    expect(app.run("logout", { cleanupFailure: true })).toMatchObject({ error: true, hasToken: true });
    expect(app.run()).toMatchObject({ route: "/guide", cookie: "test-cookie" });
    expect(app.run("logout")).toMatchObject({ error: false, route: "/login" });
  });
  for (const options of [{ networkFailure: true }, { status: 503 }, { status: 403 }]) {
    test(`temporary/permission failure preserves session: ${JSON.stringify(options)}`, () => {
      const app = fixture(); app.run("save");
      expect(app.run("request", options)).toMatchObject({ error: true, hasToken: true,
        server: "https://example.test", route: "/guide", redirect: null });
    });
  }
  for (const options of [{ readFailure: true }, { failKey: "cg-tv-token" },
    { failKey: "cg_cookie" }, { missingNative: true }]) {
    test(`startup failures prevent routing and can be retried: ${JSON.stringify(options)}`, () => {
      const app = fixture(); app.run("save");
      expect(app.run("launch", options)).toMatchObject({ ready: false, error: true, route: null, settled: true });
      expect(app.run()).toMatchObject({ error: false, route: "/guide" });
    });
  }
  test("legacy read failure does not create a migration tombstone", () => {
    const app = fixture({ "cg-tv-server-url": "https://example.test" });
    expect(app.run("launch", { readFailure: true })).toMatchObject({ ready: false });
    expect(app.data().defaults).toEqual({});
    expect(app.run()).toMatchObject({ route: "/login" });
  });
  test("migration write failure is surfaced and recoverable", () => {
    const app = fixture({ "cg-tv-server-url": "https://example.test" });
    expect(app.run("launch", { writeFailure: true })).toMatchObject({ ready: false, error: true });
    expect(app.run()).toMatchObject({ server: "https://example.test", route: "/login" });
  });
  for (const operation of ["write-url", "write-token", "logout", "change"]) {
    test(`failed ${operation} does not report success or change memory`, () => {
      const app = fixture(); app.run("save");
      expect(app.run(operation, { writeFailure: true })).toMatchObject({ error: true,
        server: "https://example.test", hasToken: true });
      expect(app.run()).toMatchObject({ route: "/guide" });
    });
  }
  test("explicit logout clears both credential interfaces and retains server", () => {
    const app = fixture(); app.run("save");
    expect(app.run("logout")).toMatchObject({ error: false, route: "/login", cookie: null });
    expect(app.run()).toMatchObject({ route: "/login", server: "https://example.test" });
  });
  test("Change Server clears credentials and URL without legacy resurrection", () => {
    const app = fixture({ "cg-tv-server-url": "https://old.test", "cg-tv-token": "old-test-token" });
    app.run("save");
    expect(app.run("change")).toMatchObject({ error: false, route: "/setup", cookie: null });
    expect(app.run()).toMatchObject({ route: "/setup", hasToken: false });
  });
  for (const platform of ["ios", "android"]) {
    test(`${platform} keeps AsyncStorage URL and SecureStore credentials`, () => {
      const app = fixture();
      expect(app.run("save", { platform, missingNative: true })).toMatchObject({ error: false, route: "/guide" });
      expect(app.data().defaults).toEqual({});
      expect(app.data().cache["cg-tv-server-url"]).toBe("https://example.test");
      expect(app.data().secure["cg-tv-token"]).toBe("test-token");
      expect(app.run("launch", { platform })).toMatchObject({ route: "/guide" });
    });
  }
});
