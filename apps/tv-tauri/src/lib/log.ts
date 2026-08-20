import { info as pInfo, warn as pWarn, error as pError } from "@tauri-apps/plugin-log";

/**
 * Tiny logging shim. Mirrors messages to BOTH the webview console (devtools) and — via
 * tauri-plugin-log — the Rust logger, which prints to the terminal running `tauri dev`. So a
 * `log.info(...)` shows up next to the Rust logs in the same console. The plugin invoke rejects
 * under a plain browser `vite dev` (no Tauri); we swallow that and keep the console line.
 */
export const log = {
  info(msg: string) {
    console.info(msg);
    void pInfo(msg).catch(() => {});
  },
  warn(msg: string) {
    console.warn(msg);
    void pWarn(msg).catch(() => {});
  },
  error(msg: string) {
    console.error(msg);
    void pError(msg).catch(() => {});
  },
};
