import { cn } from "@/lib/utils";

/**
 * A slow, cool-toned aurora glow hugging the BOTTOM periphery — a few large blurred color blobs anchored to
 * the bottom edge that drift like clouds, masked so the effect fades out well before the middle of the screen.
 * Purely decorative (aria-hidden, pointer-events-none), fills its positioned parent (`absolute inset-0`), so
 * wrap the parent in `relative overflow-hidden` and layer real content above it. Animation is GPU-friendly
 * (transform only, `will-change: transform`), knocked back in dark mode, and respects `prefers-reduced-motion`.
 */
export function AuroraBackground({ className }: { className?: string }) {
  return (
    <div
      aria-hidden="true"
      className={cn("pointer-events-none absolute inset-0 overflow-hidden dark:opacity-50", className)}
      style={{
        // Confine the glow tightly to the bottom periphery: fully visible at the bottom, gone by ~35% up.
        maskImage: "linear-gradient(to top, #000 0%, transparent 35%)",
        WebkitMaskImage: "linear-gradient(to top, #000 0%, transparent 35%)",
      }}
    >
      <style>{`
        @keyframes aurora-a { from { transform: translate3d(-8%, 4%, 0) scale(1); }    to { transform: translate3d(10%, -3%, 0) scale(1.18); } }
        @keyframes aurora-b { from { transform: translate3d(8%, 3%, 0) scale(1.1); }   to { transform: translate3d(-10%, -4%, 0) scale(0.95); } }
        @keyframes aurora-c { from { transform: translate3d(4%, 2%, 0) scale(0.92); }  to { transform: translate3d(-6%, -3%, 0) scale(1.12); } }
        .aurora-blob { position: absolute; border-radius: 9999px; filter: blur(70px); will-change: transform; }
        @media (prefers-reduced-motion: reduce) { .aurora-blob { animation: none !important; } }
      `}</style>
      <div
        className="aurora-blob"
        style={{
          width: "56vmax",
          height: "36vmax",
          bottom: "-22%",
          left: "-10%",
          opacity: 0.24,
          background: "radial-gradient(ellipse at center, oklch(0.62 0.19 250), transparent 70%)",
          animation: "aurora-a 24s ease-in-out infinite alternate",
        }}
      />
      <div
        className="aurora-blob"
        style={{
          width: "50vmax",
          height: "34vmax",
          bottom: "-26%",
          right: "-8%",
          opacity: 0.2,
          background: "radial-gradient(ellipse at center, oklch(0.68 0.14 200), transparent 70%)",
          animation: "aurora-b 29s ease-in-out infinite alternate",
        }}
      />
      <div
        className="aurora-blob"
        style={{
          width: "40vmax",
          height: "28vmax",
          bottom: "-18%",
          left: "34%",
          opacity: 0.15,
          background: "radial-gradient(ellipse at center, oklch(0.6 0.2 292), transparent 70%)",
          animation: "aurora-c 33s ease-in-out infinite alternate",
        }}
      />
    </div>
  );
}
