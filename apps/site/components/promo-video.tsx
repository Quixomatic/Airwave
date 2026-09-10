import { GlassFrame } from "@/components/hero-glass";

// The uploaded Airwave promo reel on YouTube (same video the hero badge opens).
const DEFAULT_YT_ID = "RpbLXGi0njk";

/**
 * A glass-framed YouTube embed — the SAME frosted `GlassFrame` the hero (V2/V3) and the hero's promo dialog
 * use, so an embed matches the site's video treatment. Static (no client JS): the reader presses play;
 * `rel=0` keeps related videos to this channel, captions off by default. Used both in the blog post header
 * (in place of the featured image) and inline in MDX via `<PromoVideo />`.
 */
export function PromoEmbed({
  id = DEFAULT_YT_ID,
  title = "Airwave video",
  className,
}: {
  id?: string;
  title?: string;
  className?: string;
}) {
  return (
    <GlassFrame className={className}>
      <div className="relative aspect-video w-full bg-black">
        <iframe
          className="absolute inset-0 h-full w-full"
          // vq=hd1080 is a best-effort quality hint (YouTube ultimately decides via bandwidth + player size).
          src={`https://www.youtube-nocookie.com/embed/${id}?rel=0&cc_load_policy=0&playsinline=1&vq=hd1080`}
          title={title}
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
          referrerPolicy="strict-origin-when-cross-origin"
          allowFullScreen
        />
      </div>
    </GlassFrame>
  );
}

/**
 * The glass-framed promo embed as an MDX figure (spacing + optional caption), usable in any MDX page as
 * `<PromoVideo caption="…" />`.
 */
export function PromoVideo({ id, caption }: { id?: string; caption?: string }) {
  return (
    <figure className="not-prose my-8">
      <PromoEmbed id={id} title="Introducing Airwave" />
      {caption ? (
        <figcaption className="mt-3 text-center text-sm text-fd-muted-foreground">{caption}</figcaption>
      ) : null}
    </figure>
  );
}
