/**
 * The Airwave brand mark (cloud + wave) + wordmark, rebuilt from the admin app's `Logo`
 * (`apps/web/src/components/logo.tsx`) for the docs nav. Static (no entrance animation — a nav wordmark
 * shouldn't re-animate on every route), and theme-aware: the wordmark uses `currentColor` so it inherits
 * the fumadocs header foreground in both light and dark. Reads `/logo.png` from `public/`.
 */
export function Logo({ markWidth = 24 }: { markWidth?: number }) {
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: Math.round(markWidth * 0.36) }}>
      {/* eslint-disable-next-line @next/next/no-img-element -- a tiny local brand mark; next/image is overkill */}
      <img
        src="/logo.png"
        alt=""
        style={{ width: markWidth, height: "auto", objectFit: "contain", display: "block" }}
      />
      <span
        style={{
          fontWeight: 700,
          letterSpacing: "-0.01em",
          color: "currentColor",
          fontSize: Math.round(markWidth * 0.7),
          lineHeight: 1,
        }}
      >
        Airwave
      </span>
    </span>
  );
}
