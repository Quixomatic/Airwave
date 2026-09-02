// App-store product links — a single source of truth shared by the hero download buttons and the
// /docs/downloads table. Safe to import from both server and client components (plain constants only).

/**
 * Apple App Store numeric App ID (the "Apple ID" in App Store Connect → App Information → General).
 * Airwave's iOS + tvOS builds share one bundle id (`com.airwave.tv`), so it's a SINGLE universal
 * listing — one App ID covers **both Apple TV and iPad**. Assigned when the app record is created, so
 * it exists even while the app is in review. Paste the number here to light up the store links.
 * Empty string = not linked yet (buttons fall back to the downloads docs page).
 */
export const APPLE_APP_ID = "6801608850";

/** The public App Store URL (locale-redirecting), or "" when the App ID isn't set yet. */
export const APP_STORE_APPLE = APPLE_APP_ID ? `https://apps.apple.com/app/id${APPLE_APP_ID}` : "";

/** Google Play listing (Android TV / Google TV share the same package). */
export const PLAY_STORE = "https://play.google.com/store/apps/details?id=com.airwave.tv";

/** Amazon Appstore listing (Fire TV — its own store, separate from Google Play). */
export const AMAZON_APPSTORE = "https://www.amazon.com/dp/B0HGBHTJWF";

/** Roku Channel Store listing. */
export const ROKU_CHANNEL_STORE =
  "https://channelstore.roku.com/details/713ffa078c7a5f05bd441a8560cc6d7e:fa378e9461337dd32c76013f8faa4154/airwave-tv";
