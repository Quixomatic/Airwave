import { ChevronDown, Play, User } from "lucide-react";
import { SiApple, SiDocker, SiLinux } from "react-icons/si";
import { FaWindows } from "react-icons/fa";
import { cn } from "@/lib/cn";

/**
 * Bento card mockups — the small, self-contained visuals that fill each bento tile (the plezy pattern:
 * every card carries a bespoke mock, not just an icon). They're static and server-renderable (no client
 * JS), styled with Tailwind for layout and inline styles only for the per-row tint math (the
 * inline-for-dynamic, Tailwind-for-static convention). Each one is sized to bleed to the card edges and
 * mask soft where it runs past, so the tile shapes its own height around the mock.
 */

const ACCENTS = ["#4a9fe0", "#2f9e8f", "#8b5cf6", "#3fa66a", "#d08b2f", "#d0587e"];
const tint = (hex: string, a: number) => {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
};

// Per-row program-block widths as fractions of the lane. Each row sums to >1 so the last block runs past
// the right edge (clipped by the lane's overflow) — like a program still airing beyond the visible window.
// `live` marks which block is "on now" (brighter tint + a left accent bar).
const GUIDE_ROWS: { blocks: number[]; live: number }[] = [
  { blocks: [0.28, 0.34, 0.5], live: 1 },
  { blocks: [0.46, 0.3, 0.42], live: 0 },
  { blocks: [0.22, 0.44, 0.5], live: 1 },
  { blocks: [0.38, 0.3, 0.48], live: 0 },
  { blocks: [0.26, 0.38, 0.3, 0.34], live: 1 },
  { blocks: [0.5, 0.32, 0.4], live: 0 },
];

// Half-hour ticks for the guide's time axis — more than fit, so they run to the edge and clip.
const GUIDE_TIMES = ["8:00", "8:30", "9:00", "9:30", "10:00", "10:30", "11:00", "11:30", "12:00"];

const SOFT_MASK = "linear-gradient(to bottom, #000 68%, transparent)";

/**
 * A tinted channel-guide skeleton — a mini version of the 10-foot guide (a faint time axis, then channel
 * rows of a tinted rail circle + a name skeleton + program blocks). It bleeds to the card edges and past
 * the bottom, masking soft, so it reads as "the guide, continuing below." Purely decorative.
 */
export function GuideMock() {
  return (
    <div
      aria-hidden
      className="relative -mx-6 -mb-6 h-full min-h-[15rem] overflow-hidden"
      style={{ maskImage: SOFT_MASK, WebkitMaskImage: SOFT_MASK }}
    >
      <div className="flex h-full flex-col gap-2 px-6 pt-1">
        {/* Faint time axis — evenly-spaced half-hour ticks that march to (and past) the edge, clipped. */}
        <div className="flex flex-nowrap pl-[4.75rem] text-[0.625rem] font-medium text-fd-muted-foreground/60">
          {GUIDE_TIMES.map((t) => (
            <span key={t} className="w-[3.75rem] shrink-0">
              {t}
            </span>
          ))}
        </div>
        {/* Channel rows. */}
        {GUIDE_ROWS.map((row, r) => {
          const accent = ACCENTS[r % ACCENTS.length]!;
          return (
            <div key={r} className="flex items-stretch gap-2">
              {/* Rail: tinted circle + name skeleton. */}
              <div className="flex w-[4rem] shrink-0 items-center gap-1.5">
                <span
                  className="size-6 shrink-0 rounded-full"
                  style={{ background: tint(accent, 0.22), border: `1px solid ${tint(accent, 0.4)}` }}
                />
                <span className="h-2 flex-1 rounded-full bg-fd-muted-foreground/15" />
              </div>
              {/* Lane: program blocks that overflow the right edge (clipped). */}
              <div className="relative flex h-9 flex-1 items-stretch gap-1.5 overflow-hidden">
                {row.blocks.map((frac, b) => {
                  const isLive = b === row.live;
                  return (
                    <span
                      key={b}
                      className="relative shrink-0 rounded-md"
                      style={{
                        flexBasis: `${frac * 100}%`,
                        background: isLive ? tint(accent, 0.28) : "rgba(148,163,184,0.08)",
                        border: `1px solid ${isLive ? tint(accent, 0.35) : "rgba(148,163,184,0.12)"}`,
                      }}
                    >
                      {isLive ? (
                        <span
                          className="absolute top-1.5 bottom-1.5 left-1 w-0.5 rounded-full"
                          style={{ background: accent }}
                        />
                      ) : null}
                    </span>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/** A scatter of the codecs/containers Airwave direct-plays — the "no transcode" proof, plezy-codec style. */
const FORMATS = [
  { label: "HEVC", strong: true },
  { label: "AV1", strong: true },
  { label: "H.264" },
  { label: "VP9" },
  { label: "TrueHD", strong: true },
  { label: "DTS-HD" },
  { label: "E-AC3" },
  { label: "FLAC" },
  { label: "MKV" },
  { label: "Atmos" },
];
export function FormatScatter() {
  return (
    <div aria-hidden className="flex flex-wrap content-end gap-1.5">
      {FORMATS.map((f) => (
        <span
          key={f.label}
          className={cn(
            "rounded-md border px-2 py-1 font-mono text-[0.6875rem] leading-none",
            f.strong
              ? "border-brand/30 bg-brand/10 text-brand"
              : "border-fd-border bg-fd-muted/50 text-fd-muted-foreground",
          )}
        >
          {f.label}
        </span>
      ))}
    </div>
  );
}

/**
 * The bumper interstitial, mini-feed style: the draining countdown donut beside an "Up next" blurb, the
 * exact compact layout the real player shows when a bumper hits while docked in the guide.
 */
export function BumperMock() {
  const size = 60;
  const stroke = 5;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const fraction = 0.62; // ~8s of ~13s left — a static snapshot of the drain.
  return (
    <div aria-hidden className="flex h-full items-center gap-3.5">
      <div className="relative shrink-0" style={{ width: size, height: size }}>
        <svg width={size} height={size} className="-rotate-90 text-brand">
          <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="rgba(148,163,184,0.18)" strokeWidth={stroke} />
          <circle
            cx={size / 2}
            cy={size / 2}
            r={r}
            fill="none"
            stroke="currentColor"
            strokeWidth={stroke}
            strokeLinecap="round"
            strokeDasharray={c}
            strokeDashoffset={c * (1 - fraction)}
          />
        </svg>
        <span className="absolute inset-0 flex items-center justify-center text-base font-extrabold tabular-nums text-fd-foreground">
          8
        </span>
      </div>
      <div className="min-w-0">
        <p className="text-[0.6875rem] font-bold tracking-[0.15em] text-brand uppercase">Up next</p>
        <p className="truncate text-sm font-semibold text-fd-foreground">The Twilight Zone</p>
        <p className="truncate text-xs text-fd-muted-foreground">S2 · E14 · The Midnight Sun</p>
      </div>
    </div>
  );
}

/**
 * Per-user access: a stack of tinted viewer avatars over granularity chips (whole packages, specific
 * channel counts, or full access) — the exact levels an admin can set per user.
 */
const AVATAR_TINTS = ["#4a9fe0", "#2f9e8f", "#d0587e", "#8b5cf6"];
export function PerUserMock() {
  return (
    <div aria-hidden className="flex h-full flex-col justify-end gap-3">
      <div className="flex -space-x-2">
        {AVATAR_TINTS.map((a, i) => (
          <span
            key={i}
            className="flex size-8 items-center justify-center rounded-full border-2 border-fd-card"
            style={{ background: tint(a, 0.85) }}
          >
            <User className="size-4 text-white" strokeWidth={2.25} />
          </span>
        ))}
      </div>
      <div className="flex flex-wrap gap-1.5">
        {["3 packages", "19 channels"].map((label) => (
          <span
            key={label}
            className="rounded-md border border-fd-border bg-fd-muted/50 px-2 py-1 text-[0.6875rem] leading-none text-fd-muted-foreground"
          >
            {label}
          </span>
        ))}
        <span className="rounded-md border border-brand/30 bg-brand/10 px-2 py-1 text-[0.6875rem] leading-none text-brand">
          Full access
        </span>
      </div>
    </div>
  );
}

/** The Better Auth mark (single monochrome path → `currentColor`, so it themes with the text color). */
function BetterAuthMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 400 300" className={className} fill="currentColor" fillRule="evenodd" aria-hidden>
      <path d="M0 150v150h100V200h100v100h200V0H200v100H100V0H0zm300 0v50H200V100h100z" />
    </svg>
  );
}

/** A small host-target icon tile (Docker / an OS), monochrome to sit cohesively in the card. */
function HostTile({ children }: { children: React.ReactNode }) {
  return (
    <span className="flex size-9 items-center justify-center rounded-lg border border-fd-border bg-fd-muted/40 text-fd-muted-foreground [&_svg]:size-4">
      {children}
    </span>
  );
}

/**
 * Self-hosted & private: the ways to run your own Airwave server (Docker or the desktop app on Windows,
 * macOS, Linux) plus a "secured by Better Auth" chip — your hardware, your accounts, nothing phones home.
 */
export function SelfHostMock() {
  return (
    <div aria-hidden className="flex h-full flex-col justify-end gap-3">
      <div className="flex flex-col gap-1.5">
        <span className="text-[0.6875rem] font-medium tracking-[0.04em] text-fd-muted-foreground uppercase">
          Installs on
        </span>
        <div className="flex flex-wrap gap-1.5">
          <HostTile>
            <SiDocker />
          </HostTile>
        <HostTile>
          <FaWindows />
        </HostTile>
        <HostTile>
          <SiApple />
        </HostTile>
          <HostTile>
            <SiLinux />
          </HostTile>
        </div>
      </div>
      <span className="inline-flex w-fit items-center gap-2 rounded-md border border-fd-border bg-fd-muted/40 px-2.5 py-1.5">
        <BetterAuthMark className="size-3.5 text-fd-foreground" />
        <span className="text-[0.6875rem] font-medium text-fd-muted-foreground">Auth by Better Auth</span>
      </span>
    </div>
  );
}

/** A disabled-looking select box — the read-only filter builder's control (label + chevron). */
function FilterSelect({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <span
      className={cn(
        "flex items-center justify-between gap-1 rounded-md border border-fd-border bg-fd-muted/40 px-2 py-1 text-[0.6875rem] leading-none text-fd-muted-foreground",
        className,
      )}
    >
      <span className="truncate">{children}</span>
      <ChevronDown className="size-3 shrink-0 opacity-50" />
    </span>
  );
}

// Condition rows for the filter mock — field · operator · value, like the admin builder's read-only view.
const FILTER_ROWS = [
  ["Genre", "is", "Sci-Fi"],
  ["Decade", "is", "1980s"],
  ["Rating", "≥", "7.5"],
  ["Studio", "is", "A24"],
];

/**
 * The admin channel filter in its read-only view (the mode apps/web recently gained): a "Match all (AND)
 * of:" group with disabled field/operator/value rows. It fades off the bottom (masked) so it reads as a
 * longer filter continuing below.
 */
export function FilterMock() {
  return (
    <div
      aria-hidden
      className="relative -mb-6 h-full min-h-[8rem] overflow-hidden"
      style={{ maskImage: SOFT_MASK, WebkitMaskImage: SOFT_MASK }}
    >
      <div className="space-y-2 rounded-md border border-fd-border p-2.5">
        <div className="flex items-center gap-1.5 text-[0.6875rem] text-fd-muted-foreground">
          Match
          <FilterSelect className="w-24">all (AND)</FilterSelect>
          of:
        </div>
        <div className="space-y-1.5 pl-2.5">
          {FILTER_ROWS.map(([field, op, val]) => (
            <div key={field} className="flex items-center gap-1.5">
              <FilterSelect className="w-24">{field}</FilterSelect>
              <FilterSelect className="w-14">{op}</FilterSelect>
              <FilterSelect className="flex-1">{val}</FilterSelect>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

const PREV_FADE = "linear-gradient(to right, transparent, #000 45%)";

/**
 * The live-offset DVR scrubber: the previous program as its own fully-filled (accent) segment fading off
 * the left edge, a small gap, then the current program segment with its elapsed fill and the playhead,
 * capped by the live edge you can't scrub past.
 */
export function DvrScrubber() {
  // Its own tint (not the brand blue the bumper beside it uses); LIVE is the app's real red.
  const accent = "#3fa66a";
  const live = "#ef4444";
  return (
    <div aria-hidden className="flex h-full flex-col justify-end">
      {/* A slightly-taller-than-16:9 "screen" anchored to the bottom of the card. */}
      <div className="relative flex aspect-[16/11] w-full flex-col rounded-xl bg-fd-muted p-3.5">
        {/* Channel badge — skeleton only (tinted dot + a short bar). */}
        <span className="absolute top-3.5 right-3.5 inline-flex items-center gap-1.5 rounded-full border border-fd-border bg-fd-card/70 px-1.5 py-1 backdrop-blur-sm">
          <span
            className="size-3.5 rounded-full"
            style={{ background: tint(accent, 0.5), border: `1px solid ${tint(accent, 0.55)}` }}
          />
          <span className="h-1.5 w-6 rounded-full bg-fd-muted-foreground/25" />
        </span>
        {/* Faint play glyph where the video would be — centered in the screen area above the scrubber. */}
        <div className="pointer-events-none flex flex-1 items-center justify-center">
          <Play className="size-8 translate-y-3 text-fd-muted-foreground/15" fill="currentColor" />
        </div>
        {/* Scrubber cluster at the bottom of the screen. */}
        <div className="flex flex-col gap-3">
          <div className="flex items-center justify-between text-[0.6875rem] font-medium">
            <span className="text-fd-muted-foreground">30 min buffer</span>
            <span className="inline-flex items-center gap-1.5" style={{ color: live }}>
              <span className="size-1.5 rounded-full" style={{ background: live }} />
              LIVE
            </span>
          </div>
          <div className="relative h-1.5">
            {/* Previous program — a full accent segment fading off the left edge. */}
            <div
              className="absolute inset-y-0 left-0 w-[26%] rounded-full"
              style={{ background: accent, maskImage: PREV_FADE, WebkitMaskImage: PREV_FADE }}
            />
            {/* Current program segment (after a small gap): elapsed fill up to the playhead, then the buffer. */}
            <div className="absolute inset-y-0 right-0 left-[29%] overflow-hidden rounded-full bg-fd-muted-foreground/15">
              <div className="absolute inset-y-0 left-0 w-[62%]" style={{ background: accent }} />
            </div>
            <div
              className="absolute top-1/2 left-[73%] size-3 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 bg-fd-card"
              style={{ borderColor: accent }}
            />
          </div>
          <div className="flex justify-between text-[0.625rem] text-fd-muted-foreground/70">
            <span>Restart</span>
            <span>Now</span>
          </div>
        </div>
      </div>
    </div>
  );
}
