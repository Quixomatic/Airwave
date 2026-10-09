import Image from "next/image";

import { cn } from "@/lib/cn";
import { AirwaveLogo } from "@/components/airwave-logo";

/**
 * Per-view toggle: `true`/`false` applies to both views, or set each view independently.
 * "list" is the blog index card, "article" is the post hero.
 */
type ViewToggle = boolean | { list?: boolean; article?: boolean };

export type FeatureConfig = {
  /** Raw background image for the CSS treatment. Falls back to the post's `image` when omitted. */
  image?: string;
  /** Overlay heading. Falls back to the post title. */
  title?: string;
  /** Optional accent line under the title (e.g. the date). */
  subtitle?: string;
  /** Where to apply the blurred, branded treatment. When off for a view, the raw image shows clean. */
  blur?: ViewToggle;
};

type View = "list" | "article";

function forView(t: ViewToggle | undefined, view: View): boolean {
  if (t == null) return false;
  if (typeof t === "boolean") return t;
  return t[view] ?? false;
}

/**
 * A blog feature image that renders the REAL screenshot, with the branded blur + logomark + title
 * overlay added by CSS only where the post's frontmatter asks for it (per view). With no `feature`
 * config it just renders `image` plainly, so a Python-baked image still works as a fallback.
 *
 * Fills its positioned parent (`fill`), so the caller supplies the aspect-ratio box.
 */
export function FeatureImage({
  image,
  alt,
  feature,
  view,
  sizes,
  priority,
  className,
}: {
  image: string;
  alt: string;
  feature?: FeatureConfig | null;
  view: View;
  sizes?: string;
  priority?: boolean;
  className?: string;
}) {
  const src = feature?.image ?? image;
  const blurred = forView(feature?.blur, view);
  const title = feature?.title ?? alt;
  const subtitle = feature?.subtitle;

  return (
    <div className={cn("@container absolute inset-0", className)}>
      <Image
        src={src}
        alt={alt}
        fill
        sizes={sizes}
        priority={priority}
        // Serve the real (unblurred) image unoptimized so it stays lossless; the blurred backdrop can be
        // optimized since it's blurred anyway.
        unoptimized={!blurred}
        className={cn("object-cover", blurred && "scale-105 blur-md")}
      />
      {blurred && (
        <>
          {/* Light navy vignette: enough to anchor the lockup and darken the edges, but kept low so the
              blurred screenshot still reads through it (a dark UI shot needs a gentle hand here). */}
          <div
            aria-hidden
            className="absolute inset-0"
            style={{
              background:
                "radial-gradient(78% 72% at 50% 50%, rgba(7,11,20,0.34) 0%, rgba(7,11,20,0.22) 55%, rgba(7,11,20,0.52) 100%)",
            }}
          />
          {/* Lockup, sized in container-query units (cqw) so it scales with the card. Two layouts by
              viewport: on a narrow screen (the square list thumbnail) the mark stacks over the title; at
              `sm:` and up (the wide card + hero) it's the horizontal mark | divider | title. A soft shadow
              keeps it readable over the light scrim. */}
          <div
            className="absolute inset-0 flex flex-col items-center justify-center gap-[4cqw] px-[6cqw] text-center sm:flex-row sm:gap-[3cqw] sm:px-[5cqw] sm:text-left"
            style={{ filter: "drop-shadow(0 1px 10px rgba(0,0,0,0.45))" }}
          >
            <AirwaveLogo
              aria-hidden
              className="h-[30cqw] w-auto shrink-0 sm:h-[16cqw] sm:max-h-[56%]"
            />
            {/* Divider only in the horizontal (sm+) layout. */}
            <div
              aria-hidden
              className="hidden bg-white/25 sm:block sm:h-[13cqw] sm:max-h-[46%] sm:w-px"
            />
            <div className="min-w-0">
              <div className="text-[9cqw] font-bold leading-[1.05] tracking-tight text-white sm:text-[6.2cqw]">
                {title}
              </div>
              {subtitle ? (
                <div className="mt-[1.5cqw] text-[5cqw] font-medium text-sky-400 sm:mt-[1.2cqw] sm:text-[3.3cqw]">
                  {subtitle}
                </div>
              ) : null}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
