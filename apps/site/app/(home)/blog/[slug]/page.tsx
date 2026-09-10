import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { InlineTOC } from "fumadocs-ui/components/inline-toc";
import { blogSource } from "@/lib/source";
import { readingTimeMinutes } from "@/lib/reading-time";
import { getMDXComponents } from "@/components/mdx";
import { PromoEmbed } from "@/components/promo-video";

type Params = { params: Promise<{ slug: string }> };

const SITE = "https://getairwave.tv";

function formatDate(date: string) {
  return new Date(date).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });
}

export default async function BlogPost(props: Params) {
  const { slug } = await props.params;
  const page = blogSource.getPage([slug]);
  if (!page) notFound();

  const Mdx = page.data.body;
  const mins = readingTimeMinutes(slug);

  // Prev/next neighbours from the date-sorted feed (newest-first): `newer` = published after this one,
  // `older` = before. fumadocs auto-wires this for docs (page tree) but not the flat blog collection.
  const all = [...blogSource.getPages()].sort(
    (a, b) => new Date(b.data.date).getTime() - new Date(a.data.date).getTime(),
  );
  const idx = all.findIndex((p) => p.slugs[0] === slug);
  const newer = idx > 0 ? all[idx - 1] : null;
  const older = idx >= 0 && idx < all.length - 1 ? all[idx + 1] : null;

  // Structured data (JSON-LD): an Article for every post, plus a VideoObject when the post embeds a video
  // (makes the post eligible for a video rich result — thumbnail/date in search).
  const url = `${SITE}/blog/${slug}`;
  const imageUrl = `${SITE}${page.data.image}`;
  const jsonLd: Record<string, unknown>[] = [
    {
      "@context": "https://schema.org",
      "@type": "Article",
      headline: page.data.title,
      description: page.data.description,
      image: imageUrl,
      datePublished: page.data.date,
      dateModified: page.data.date,
      author: { "@type": "Person", name: page.data.author },
      publisher: {
        "@type": "Organization",
        name: "Airwave",
        logo: { "@type": "ImageObject", url: `${SITE}/logo.png` },
      },
      mainEntityOfPage: url,
    },
  ];
  if (page.data.video) {
    jsonLd.push({
      "@context": "https://schema.org",
      "@type": "VideoObject",
      name: page.data.title,
      description: page.data.description,
      thumbnailUrl: [imageUrl],
      uploadDate: page.data.date,
      embedUrl: `https://www.youtube-nocookie.com/embed/${page.data.video}`,
      contentUrl: `https://www.youtube.com/watch?v=${page.data.video}`,
    });
  }

  return (
    <main className="flex-1">
      <script
        type="application/ld+json"
        // eslint-disable-next-line react/no-danger -- JSON.stringify output is safe structured data
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      {/* Centered header — meta, title, subtitle, with a soft radial glow that fades into the page
          background (selfh.st style: no back button, no border line) */}
      <div className="relative">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 -top-16 -z-10 mx-auto h-64 max-w-3xl opacity-40 blur-3xl"
          style={{
            background:
              "radial-gradient(closest-side, color-mix(in oklab, var(--color-fd-primary) 35%, transparent), transparent)",
          }}
        />
        <div className="mx-auto w-full max-w-3xl px-6 pt-14 text-center">
          <div className="flex flex-wrap items-center justify-center gap-2 text-sm font-medium text-fd-muted-foreground">
            <time dateTime={page.data.date}>{formatDate(page.data.date)}</time>
            <span className="before:mr-2 before:content-['·']">{page.data.author}</span>
            <span className="before:mr-2 before:content-['·']">{mins} min read</span>
          </div>
          <h1 className="mt-4 text-balance text-4xl font-bold tracking-tight sm:text-5xl">{page.data.title}</h1>
          {page.data.description ? (
            <p className="mx-auto mt-4 max-w-2xl text-balance text-lg text-fd-muted-foreground">
              {page.data.description}
            </p>
          ) : null}
        </div>
      </div>

      {/* Featured media — deliberately wider than the prose column (selfh.st's content-wide vs content). A
          post with a `video` plays the glass-framed embed here; otherwise the featured image. */}
      <div className="mx-auto w-full max-w-5xl px-6 pt-10">
        {page.data.video ? (
          <PromoEmbed id={page.data.video} title={page.data.title} />
        ) : (
          <div className="relative aspect-video overflow-hidden rounded-xl border border-fd-border bg-fd-muted">
            <Image
              src={page.data.image}
              alt={page.data.title}
              fill
              className="object-cover"
              sizes="(max-width: 1024px) 100vw, 1024px"
              priority
            />
          </div>
        )}
      </div>

      {/* Body in fumadocs prose, with a collapsible inline TOC */}
      <article className="mx-auto w-full max-w-3xl px-6 py-10">
        <InlineTOC items={page.data.toc} />
        <div className="prose mt-6 max-w-none">
          <Mdx components={getMDXComponents()} />
        </div>
      </article>

      {/* Prev/next post tiles — older on the left, newer on the right (like the docs pages). */}
      {(older || newer) && (
        <nav className="mx-auto grid w-full max-w-3xl grid-cols-1 gap-4 px-6 pb-16 sm:grid-cols-2">
          {older ? (
            <Link
              href={older.url}
              className="group flex flex-col gap-1 rounded-xl border border-fd-border bg-fd-card/30 p-5 transition-colors hover:border-fd-primary/40 hover:bg-fd-accent/40"
            >
              <span className="text-xs font-medium uppercase tracking-wide text-fd-muted-foreground">
                ← Older post
              </span>
              <span className="font-semibold text-fd-foreground">{older.data.title}</span>
            </Link>
          ) : (
            <div className="hidden sm:block" />
          )}
          {newer ? (
            <Link
              href={newer.url}
              className="group flex flex-col items-end gap-1 rounded-xl border border-fd-border bg-fd-card/30 p-5 text-right transition-colors hover:border-fd-primary/40 hover:bg-fd-accent/40"
            >
              <span className="text-xs font-medium uppercase tracking-wide text-fd-muted-foreground">
                Newer post →
              </span>
              <span className="font-semibold text-fd-foreground">{newer.data.title}</span>
            </Link>
          ) : null}
        </nav>
      )}
    </main>
  );
}

export function generateStaticParams() {
  return blogSource.getPages().map((page) => ({ slug: page.slugs[0] }));
}

export async function generateMetadata(props: Params): Promise<Metadata> {
  const { slug } = await props.params;
  const page = blogSource.getPage([slug]);
  if (!page) return {};
  return {
    title: page.data.title,
    description: page.data.description,
    openGraph: {
      type: "article",
      title: page.data.title,
      description: page.data.description,
      publishedTime: page.data.date,
      authors: [page.data.author],
      url: `${SITE}/blog/${slug}`,
      images: [page.data.image],
    },
    twitter: {
      card: "summary_large_image",
      title: page.data.title,
      description: page.data.description,
      images: [page.data.image],
    },
  };
}
