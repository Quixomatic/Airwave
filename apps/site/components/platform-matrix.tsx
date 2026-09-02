import { Check, Clock } from "lucide-react";
import type { ReactNode } from "react";

/**
 * Airwave's platform-support matrix — a scannable, checkmark-style table for the /docs/platforms page.
 * Three tiers: Full support (green ✓), Supported (amber ✓ — works, but a secondary priority), and Planned.
 */
type Tier = "full" | "supported" | "planned";

const TIER: Record<Tier, { label: string; icon: ReactNode; className: string }> = {
  full: {
    label: "Full support",
    icon: <Check className="size-3.5" />,
    className: "bg-emerald-500/10 text-emerald-500",
  },
  supported: {
    label: "Supported",
    icon: <Check className="size-3.5" />,
    className: "bg-amber-500/10 text-amber-500",
  },
  planned: {
    label: "Planned",
    icon: <Clock className="size-3.5" />,
    className: "bg-fd-muted text-fd-muted-foreground",
  },
};

const ROWS: { platform: string; sub?: string; type: string; engine: string; tier: Tier }[] = [
  { platform: "Apple TV", sub: "tvOS", type: "Native app", engine: "mpv", tier: "full" },
  { platform: "iPad", sub: "iPadOS", type: "Native app", engine: "mpv", tier: "full" },
  { platform: "Windows", type: "Desktop app (Tauri)", engine: "mpv", tier: "full" },
  { platform: "macOS", sub: "Apple Silicon + Intel", type: "Desktop app (Tauri)", engine: "mpv", tier: "full" },
  { platform: "LG webOS", type: "Web app (packaged)", engine: "native + hls.js", tier: "full" },
  { platform: "Any browser", type: "Web player", engine: "native + hls.js", tier: "full" },
  { platform: "Android TV", type: "Native app", engine: "mpv", tier: "full" },
  { platform: "Fire TV", type: "Native app", engine: "mpv", tier: "full" },
  { platform: "Roku", type: "Native app", engine: "native (SceneGraph)", tier: "full" },
  { platform: "Linux", type: "Desktop app (Tauri)", engine: "mpv", tier: "planned" },
  { platform: "Samsung", sub: "Tizen", type: "Web app", engine: "—", tier: "planned" },
];

function Badge({ tier }: { tier: Tier }) {
  const t = TIER[tier];
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ${t.className}`}
    >
      {t.icon}
      {t.label}
    </span>
  );
}

export function PlatformMatrix() {
  return (
    <div className="my-6 overflow-x-auto rounded-lg border border-fd-border">
      <table className="!my-0 w-full border-collapse text-sm">
        <thead>
          <tr className="border-b border-fd-border bg-fd-card/40 text-left text-fd-muted-foreground">
            <th className="px-4 py-2.5 font-medium">Platform</th>
            <th className="px-4 py-2.5 font-medium">App type</th>
            <th className="px-4 py-2.5 font-medium">Playback</th>
            <th className="px-4 py-2.5 font-medium">Status</th>
          </tr>
        </thead>
        <tbody>
          {ROWS.map((r, i) => (
            <tr key={r.platform} className={i < ROWS.length - 1 ? "border-b border-fd-border/60" : ""}>
              <td className="px-4 py-3 font-medium text-fd-foreground">
                {r.platform}
                {r.sub ? <span className="text-fd-muted-foreground"> · {r.sub}</span> : null}
              </td>
              <td className="px-4 py-3 text-fd-muted-foreground">{r.type}</td>
              <td className="px-4 py-3 text-fd-muted-foreground">{r.engine}</td>
              <td className="px-4 py-3">
                <Badge tier={r.tier} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
