// A fresh Bun process per phase models JS module state being discarded on app termination.
// Only OS storage, native module and network boundaries are substituted; the session,
// startup, routing, credential and REST modules under test are the production modules.
import { mock } from "bun:test";
import { readFileSync, writeFileSync } from "node:fs";

const [file, operation, rawOptions] = process.argv.slice(2);
const options = JSON.parse(rawOptions ?? "{}");
const read = () => JSON.parse(readFileSync(file!, "utf8"));
function write(store: string, key: string, value: string | null) {
  if (options.writeFailure) throw new Error("storage write failed");
  const data = read();
  if (value === null) delete data[store][key];
  else data[store][key] = value;
  writeFileSync(file!, JSON.stringify(data));
}
function get(store: string, key: string) {
  if (options.readFailure || options.failKey === key) throw new Error("storage read failed");
  return read()[store][key] ?? null;
}
const asyncStore = {
  getItem: async (key: string) => get("cache", key),
  setItem: async (key: string, value: string) => write("cache", key, value),
  removeItem: async (key: string) => {
    if (options.cleanupFailure) throw new Error("legacy cleanup failed");
    write("cache", key, null);
  },
};
mock.module("@react-native-async-storage/async-storage", () => ({ default: asyncStore }));
mock.module("react-native", () => ({ Platform: {
  OS: options.platform === "android" ? "android" : "ios",
  isTV: options.platform !== "ios",
}, Dimensions: { get: () => ({ width: 1920, height: 1080 }) }, PixelRatio: { get: () => 1 } }));
mock.module("@airwave/mpv-player", () => ({ mpvDisplay: { getInfo: () => null } }));
mock.module("expo", () => ({ requireNativeModule: () => {
  if (options.missingNative) throw new Error("missing native module");
  return {
    getItem: (key: string) => get("defaults", key),
    setItem: (key: string, value: string) => { write("defaults", key, value); return true; },
  };
} }));
mock.module("expo-secure-store", () => ({
  getItemAsync: async (key: string) => get("secure", key),
  setItemAsync: async (key: string, value: string) => write("secure", key, value),
  deleteItemAsync: async (key: string) => write("secure", key, null),
  getItem: (key: string) => get("secure", key),
  setItem: (key: string, value: string) => write("secure", key, value),
}));
let redirect: string | null = null;
mock.module("expo-router", () => ({ router: { replace: (route: string) => { redirect = route; } } }));
mock.module("./plex-connection", () => ({ getNetwork: () => "local" }));
process.env.EXPO_PUBLIC_SERVER_URL = "";
const auth = await import("./auth");
const { initializeApp } = await import("./startup");
const { sessionRoute } = await import("./session-route");
const { SyncCredStore } = await import("./cred-store");
const { loadDevice, deviceId, markCapsDone, capsDoneForCurrentServer } = await import("./device");
let error = false;
let ready = false;
let settled = false;
try {
  await initializeApp([loadDevice, async () => {
    await new Promise((resolve) => setTimeout(resolve, 5));
    settled = true;
  }]);
  ready = true;
  if (operation === "save") {
    await auth.setServerUrl("example.test///");
    await auth.setToken("test-token");
    SyncCredStore.setItem("cg_cookie", "test-cookie");
    SyncCredStore.setItem("cg_session_data", "test-session");
    await markCapsDone();
  } else if (operation === "write-url") {
    await auth.setServerUrl("different.test");
  } else if (operation === "write-token") {
    await auth.setToken("different-token");
  } else if (operation === "logout") {
    await auth.setToken(null);
  } else if (operation === "change") {
    await auth.setToken(null);
    await auth.clearServerUrl();
  } else if (operation === "overlap") {
    await Promise.all([auth.invalidateToken("test-token", auth.getServerUrl()), auth.setToken("new-test-token")]);
  } else if (operation === "stale-invalidation") {
    await Promise.all([auth.setToken("new-test-token"), auth.invalidateToken("test-token", auth.getServerUrl())]);
  } else if (operation === "request") {
    globalThis.fetch = (async () => {
      if (options.networkFailure) throw new TypeError("offline");
      if (options.newToken) await auth.setToken("new-test-token");
      return new Response(JSON.stringify({ packages: [] }), { status: options.status ?? 200 });
    }) as unknown as typeof fetch;
    const { api } = await import("./api");
    await api.packages();
  }
} catch { error = true; }
console.log(JSON.stringify({
  ready, error, settled, redirect,
  route: ready ? sessionRoute() : null,
  server: auth.getServerUrl(),
  hasToken: !!auth.getToken(),
  cookie: ready ? SyncCredStore.getItem("cg_cookie") : null,
  device: ready ? deviceId() : null,
  capsDone: ready ? capsDoneForCurrentServer() : false,
}));
