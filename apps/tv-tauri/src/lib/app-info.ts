import pkg from "../../package.json";

/** App identity (the brand name used by the Logo wordmark + About). */
export const APP_NAME = "Airwave";

/** App version — tracks apps/tv-tauri/package.json (bumped in lockstep with releases). */
export const APP_VERSION = (pkg as { version: string }).version;
