import pkg from "../../package.json";

/** App identity for the About page. Version tracks apps/tv-web/package.json (bumped in lockstep with
 *  releases via /version-bump), so the About page auto-updates — no separate file to keep in sync. */
export const APP_NAME = "Airwave";
export const APP_VERSION = (pkg as { version: string }).version;
