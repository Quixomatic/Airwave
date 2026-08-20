import type React from "react";

import { DEFAULT_ACCENT } from "../../lib/tint";

/**
 * The glassmorphism circle icon button shared by the player chrome (Audio/Subtitles/Quality) and
 * the guide sidebar — one source of truth for the treatment (dark translucent + blur, white
 * border, accent focus ring). Circle only; when `expanded`, a text label sits beside it.
 *
 * `focused` = D-pad focus (accent tint + ring). `active` = persistent lit state (accent tint, no
 * ring) — e.g. the active guide lens. `accent` recolors both (a package passes its own tint).
 */

/** hex (#rrggbb or #rgb) + alpha (0–1) → rgba() string. */
function hexA(hex: string, a: number): string {
  const h = hex.replace("#", "");
  const full = h.length === 3 ? h.split("").map((c) => c + c).join("") : h;
  const n = parseInt(full, 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${a})`;
}

export function GlassCircleButton({
  icon,
  label,
  sublabel,
  expanded = false,
  focused = false,
  active = false,
  accent = DEFAULT_ACCENT,
  size = 54,
  blur = false,
  onClick,
  title,
}: {
  icon: React.ReactNode;
  label?: string;
  /** Muted second line under the label (e.g. a package's channel count). Expanded only. */
  sublabel?: string;
  expanded?: boolean;
  focused?: boolean;
  active?: boolean;
  accent?: string;
  size?: number;
  /** Real backdrop blur. OFF by default: over an OPAQUE surface (like the sidebar) there's nothing
   *  behind it to blur, so it's pure GPU cost — and a wall of blurred circles wrecks C2 perf. Turn
   *  it on only where the button genuinely floats over content (e.g. the player chrome, over video). */
  blur?: boolean;
  onClick?: () => void;
  title?: string;
}) {
  const lit = focused || active;
  return (
    // A div, not a <button>: on the C2's Chrome 108 a `display:flex` <button> lays its children out
    // through the UA's anonymous inner box and knocks the icon off-center (fine in newer Chrome).
    // It also keeps Enter from double-firing — a focused <button> would fire click *and* our
    // zone-machine keydown, toggling twice. Focus here is ours, not the DOM's.
    <div
      role="button"
      onClick={onClick}
      title={title ?? label}
      style={{
        display: "flex",
        alignItems: "center",
        gap: expanded ? 14 : 0,
        width: "100%",
        cursor: "pointer",
        outline: "none",
      }}
    >
      <span
        style={{
          flexShrink: 0,
          // `flex` (not inline-flex) + lineHeight:1 — matches the channel-rail icon circle, the
          // pattern already proven to center on the C2.
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          lineHeight: 1,
          width: size,
          height: size,
          borderRadius: "50%",
          border: `1px solid ${lit ? hexA(accent, 0.4) : "rgba(255,255,255,0.12)"}`,
          background: lit ? hexA(accent, 0.28) : "rgba(18,24,38,0.55)",
          ...(blur ? { backdropFilter: "blur(20px)", WebkitBackdropFilter: "blur(20px)" } : null),
          boxShadow: focused ? `0 0 0 2px ${hexA(accent, 0.7)}` : "none",
          color: "#f1f5f9",
          transition: "background .12s, border-color .12s, box-shadow .12s",
        }}
      >
        {icon}
      </span>
      {expanded && label && (
        <span style={{ display: "flex", flexDirection: "column", gap: 2, minWidth: 0 }}>
          <span
            style={{
              fontSize: 17,
              fontWeight: 600,
              whiteSpace: "nowrap",
              overflow: "hidden",
              textOverflow: "ellipsis",
              color: lit ? "#f8fafc" : "#c3c9d4",
            }}
          >
            {label}
          </span>
          {sublabel && (
            <span
              style={{
                fontSize: 13,
                fontWeight: 500,
                whiteSpace: "nowrap",
                overflow: "hidden",
                textOverflow: "ellipsis",
                color: "#64748b",
              }}
            >
              {sublabel}
            </span>
          )}
        </span>
      )}
    </div>
  );
}
