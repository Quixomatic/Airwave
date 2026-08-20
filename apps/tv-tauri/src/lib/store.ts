import { load, type Store } from "@tauri-apps/plugin-store";

/**
 * File-backed persistence (app-data dir) via tauri-plugin-store. It's async, so we
 * hydrate a synchronous in-memory cache ONCE at startup (`initStore`, awaited in
 * main.tsx before React renders) — the rest of the app reads/writes synchronously
 * and writes flush to disk in the background (autoSave). Falls back to localStorage
 * when not running under Tauri (e.g. a plain `vite dev` in a browser).
 */

let store: Store | null = null;
let fallback = false;
const cache = new Map<string, string>();

export async function initStore(): Promise<void> {
  try {
    store = await load("airwave.json", { autoSave: true });
    const entries = await store.entries();
    for (const [k, v] of entries) {
      if (typeof v === "string") cache.set(k, v);
    }
  } catch {
    // Not under Tauri (no plugin) — use localStorage so browser dev still works.
    fallback = true;
  }
}

export function getVal(key: string): string {
  if (fallback) {
    try {
      return localStorage.getItem(key) ?? "";
    } catch {
      return "";
    }
  }
  return cache.get(key) ?? "";
}

export function setVal(key: string, value: string): void {
  if (fallback) {
    try {
      localStorage.setItem(key, value);
    } catch {
      /* ignore */
    }
    return;
  }
  cache.set(key, value);
  void store?.set(key, value);
}

export function delVal(key: string): void {
  if (fallback) {
    try {
      localStorage.removeItem(key);
    } catch {
      /* ignore */
    }
    return;
  }
  cache.delete(key);
  void store?.delete(key);
}
