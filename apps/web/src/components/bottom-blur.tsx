import { cn } from "@/lib/utils";

// A progressive blur at the bottom edge of a scroll region — a stack of increasingly-blurred layers, each
// masked to its own slice of the band, so content fades softly into a frosted edge as it scrolls off. Ported
// from the getairwave.tv landing (apps/site). pointer-events-none, so it's purely decorative. By default it
// pins to the bottom of the nearest positioned ancestor (`absolute`); pass a className to override.
const LAYERS = [
  { blur: 0.078125, mask: "0%, 12.5%, 25%, 37.5%" },
  { blur: 0.15625, mask: "12.5%, 25%, 37.5%, 50%" },
  { blur: 0.3125, mask: "25%, 37.5%, 50%, 62.5%" },
  { blur: 0.625, mask: "37.5%, 50%, 62.5%, 75%" },
  { blur: 1.25, mask: "50%, 62.5%, 75%, 87.5%" },
  { blur: 2.5, mask: "62.5%, 75%, 87.5%, 100%" },
];

function maskGradient(stops: string) {
  const [a, b, c, d] = stops.split(",").map((s) => s.trim());
  return `linear-gradient(rgba(0,0,0,0) ${a}, rgb(0,0,0) ${b}, rgb(0,0,0) ${c}, rgba(0,0,0,0) ${d})`;
}

export function BottomBlur({ className }: { className?: string }) {
  return (
    <div className={cn("pointer-events-none absolute inset-x-0 bottom-0 z-30 h-24", className)} aria-hidden>
      <div className="relative h-full w-full">
        {LAYERS.map((l, i) => (
          <div
            key={i}
            className="absolute inset-0"
            style={{
              zIndex: i + 1,
              backdropFilter: `blur(${l.blur}px)`,
              WebkitBackdropFilter: `blur(${l.blur}px)`,
              maskImage: maskGradient(l.mask),
              WebkitMaskImage: maskGradient(l.mask),
            }}
          />
        ))}
        {/* The strongest, bottom-most slice. */}
        <div
          className="absolute inset-0"
          style={{
            zIndex: LAYERS.length + 1,
            backdropFilter: "blur(5px)",
            WebkitBackdropFilter: "blur(5px)",
            maskImage: "linear-gradient(rgba(0,0,0,0) 75%, rgb(0,0,0) 87.5%, rgb(0,0,0) 100%)",
            WebkitMaskImage: "linear-gradient(rgba(0,0,0,0) 75%, rgb(0,0,0) 87.5%, rgb(0,0,0) 100%)",
          }}
        />
      </div>
    </div>
  );
}
