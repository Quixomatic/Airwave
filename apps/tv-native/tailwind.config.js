/** @type {import('tailwindcss').Config} */
// NativeWind v4 requires Tailwind v3 (NOT the v4 the web apps use) — it's isolated to this app, so
// there's no conflict. The color tokens are ported verbatim from tv-web's `lib/theme.ts` (the `C`
// palette) so tv-native renders the exact same surfaces. tv-web styles inline with hex, so there's
// no oklch to convert (that convention is packages/ui / the admin only).
module.exports = {
  content: ["./app/**/*.{ts,tsx}", "./src/**/*.{ts,tsx}"],
  presets: [require("nativewind/preset")],
  theme: {
    extend: {
      colors: {
        bg: "#060a14",
        card: "#0b1120",
        fg: "#f1f5f9",
        muted: "#94a3b8",
        subtle: "#64748b",
        ring: "#3b82f6",
        accent: "#4a9fe0",
        highlight: "#12233d",
        now: "#ef4444",
        star: "#f0a92a",
        fav: "#fb7185",
        "nav-bg": "#0f1626",
        "nav-active": "#243043",
        "sidebar-bg": "#0b1120",
      },
    },
  },
  plugins: [],
};
