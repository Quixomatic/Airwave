import appinfo from "../../public/appinfo.json";

/** App identity for the About page. Version tracks appinfo.json (bumped in lockstep with releases). */
export const APP_NAME = "Airwave";
export const APP_VERSION = (appinfo as { version: string }).version;
