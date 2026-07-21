import pkg from "../../package.json";

/**
 * App identity for the About page. Version is read from this app's own package.json, which the
 * /version-bump flow keeps in lockstep with every release — so the About page is never stale.
 */
export const APP_NAME = "Airwave";
export const APP_VERSION = (pkg as { version: string }).version;
