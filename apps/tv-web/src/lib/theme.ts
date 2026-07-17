/**
 * The TV guide's inline color palette. Shared (rather than module-local to aurora-grid) so the
 * sidebar and grid render the same surfaces without a circular import — `navBg` is the slightly
 * lifted surface used by both the top nav pill and the left sidebar, over the `bg` backdrop.
 *
 * Inline hex on purpose: tv-web targets Chrome 108 and styles inline (see
 * [[feedback-tv-styling-inline-then-tailwind]]); the later cleanup pass moves these to tokens.
 */
export const C = {
  bg: "#060a14",
  card: "#0b1120",
  border: "rgba(148,163,184,0.14)",
  cellBorder: "rgba(148,163,184,0.10)",
  rowBorder: "rgba(148,163,184,0.12)",
  fg: "#f1f5f9",
  mutedFg: "#94a3b8",
  ring: "#3b82f6",
  highlight: "#12233d",
  now: "#ef4444",
  star: "#f0a92a",
  fav: "#fb7185", // the favorite heart when filled
  navBg: "#0f1626",
  navActive: "#243043",
  sidebarBg: "#0b1120", // rgb(11,17,32) — lifted just off `bg` so the sidebar reads as chrome
};
