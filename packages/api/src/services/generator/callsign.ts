/**
 * A channel callsign — a short memorable code like `EVRTV` for "The Everything
 * Channel". Uppercase, alphanumeric, ≤ 6 chars.
 */

const FILLER = new Set(["THE", "A", "AN", "OF", "AND", "TV", "CHANNEL", "NETWORK", "SHOW", "AMP"]);

/** Normalize any string to the callsign format (uppercase, A–Z0–9, ≤6). */
export function normalizeCallsign(raw: string): string {
  return raw.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 6);
}

/** Derive a callsign from a channel name — drop filler words, then vowels, cap at 6. */
export function deriveCallsign(name: string): string {
  const words = name
    .toUpperCase()
    .replace(/&/g, " ")
    .replace(/[^A-Z0-9]+/g, " ")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  const sig = words.filter((w) => !FILLER.has(w));
  const src = (sig.length ? sig : words).join("");
  if (!src) return "CH";
  // Keep the first char; drop vowels from the rest (that "callsign" consonant feel).
  const trimmed = src[0]! + src.slice(1).replace(/[AEIOU]/g, "");
  const code = (trimmed.length >= 2 ? trimmed : src).slice(0, 6);
  return code || "CH";
}

/** Return `base`, or a de-duped variant with a numeric suffix, and record it in `used`. */
export function uniqueCallsign(base: string, used: Set<string>): string {
  if (!used.has(base)) {
    used.add(base);
    return base;
  }
  for (let i = 2; i < 1000; i++) {
    const suffix = String(i);
    const cand = base.slice(0, 6 - suffix.length) + suffix;
    if (!used.has(cand)) {
      used.add(cand);
      return cand;
    }
  }
  used.add(base);
  return base;
}
