// A fresh Bun process per phase models JS module state being discarded on app termination. Only the OS
// storage, native-module and network boundaries are substituted; auth / cred-store / session-storage / api
// are the production modules. Adapted from the PR #63 suite (SHRIVES93) to today's storage (RN `Settings`).
import { mock } from "bun:test";
import { readFileSync, writeFileSync } from "node:fs";

const [file, operation, rawOptions] = process.argv.slice(2);
const options = JSON.parse(rawOptions ?? "{}");
const read = () => JSON.parse(readFileSync(file!, "utf8"));
function write(store: string, key: string, value: string | null) {
  const data = read();
  if (value === null) delete data[store][key];
  else data[store][key] = value;
  writeFileSync(file!, JSON.stringify(data));
}
const get = (store: string, key: string) => read()[store][key] ?? null;

mock.module("@react-native-async-storage/async-storage", () => ({
  default: {
    getItem: async (key: string) => get("cache", key),
    setItem: async (key: string, value: string) => write("cache", key, value),
    removeItem: async (key: string) => write("cache", key, null),
  },
}));
mock.module("react-native", () => ({
  Platform: { OS: options.platform === "android" ? "android" : "ios", isTV: options.platform !== "ios" },
  // RN `Settings` = NSUserDefaults on Apple TV.
  Settings: {
    get: (key: string) => get("defaults", key),
    set: (values: Record<string, string>) => {
      for (const [k, v] of Object.entries(values)) write("defaults", k, v);
    },
  },
}));
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
const { SyncCredStore } = await import("./cred-store");

// The entry gate in app/index.tsx.
const route = () => (!auth.hasServerUrl() ? "/setup" : auth.getToken() ? "/guide" : "/login");

let error = false;
try {
  await auth.loadSession();
  if (operation === "save") {
    await auth.setServerUrl("example.test///");
    await auth.setToken("test-token");
    SyncCredStore.setItem("cg_cookie", "test-cookie");
  } else if (operation === "overlap") {
    await Promise.all([auth.invalidateToken("test-token", auth.getServerUrl()), auth.setToken("new-test-token")]);
  } else if (operation === "stale-invalidation") {
    await Promise.all([auth.setToken("new-test-token"), auth.invalidateToken("test-token", auth.getServerUrl())]);
  } else if (operation === "request") {
    globalThis.fetch = (async () => {
      if (options.networkFailure) throw new TypeError("offline");
      if (options.newToken) await auth.setToken("new-test-token");
      if (options.newServer) await auth.setServerUrl("other.test");
      return new Response(JSON.stringify({ packages: [] }), { status: options.status ?? 200 });
    }) as unknown as typeof fetch;
    const { api } = await import("./api");
    await api.packages();
  }
} catch {
  error = true;
}
console.log(
  JSON.stringify({
    error,
    redirect,
    route: route(),
    server: auth.getServerUrl(),
    hasToken: !!auth.getToken(),
    cookie: SyncCredStore.getItem("cg_cookie"),
  }),
);
