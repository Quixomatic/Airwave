import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { InlineTOC } from "fumadocs-ui/components/inline-toc";
import { blogSource } from "@/lib/source";
import { getMDXComponents } from "@/components/mdx";

type Params = { params: Promise<{ slug: string }> };

function formatDate(date: string) {
  return new Date(date).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });
}

export default async function BlogPost(props: Params) {
  const { slug } = await props.params;
  const page = blogSource.getPage([slug]);
  if (!page) notFound();

  const Mdx = page.data.body;

  return (
    <main className="flex-1">
      {/* Header block (fumadocs-blog style: bordered, gradient-lit) */}
      <div className="relative overflow-hidden border-b border-fd-border bg-fd-card/30">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 -top-24 -z-10 mx-auto h-72 max-w-3xl opacity-40 blur-3xl"
          style={{
            background:
              "radial-gradient(closest-side, color-mix(in oklab, var(--color-fd-primary) 35%, transparent), transparent)",
          }}
        />
        <div className="mx-auto w-full max-w-3xl px-6 py-14">
          <Link
            href="/blog"
            className="text-sm font-medium text-fd-muted-foreground transition-colors hover:text-fd-foreground"
          >
            ← Blog
          </Link>
          <h1 className="mt-5 text-balance text-4xl font-bold tracking-tight sm:text-5xl">{page.data.title}</h1>
          {page.data.description ? (
            <p className="mt-4 text-lg text-fd-muted-foreground">{page.data.description}</p>
          ) : null}
          <p className="mt-6 text-sm text-fd-muted-foreground">
            {formatDate(page.data.date)} · {page.data.author}
          </p>
        </div>
      </div>

      {/* Body in fumadocs prose, with a collapsible inline TOC */}
      <article className="mx-auto w-full max-w-3xl px-6 py-10">
        <InlineTOC items={page.data.toc} />
        <div className="prose mt-6 max-w-none">
          <Mdx components={getMDXComponents()} />
        </div>
      </article>
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
  return { title: page.data.title, description: page.data.description };
}
