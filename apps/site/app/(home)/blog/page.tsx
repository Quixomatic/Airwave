import Image from "next/image";
import Link from "next/link";
import { blogSource } from "@/lib/source";
import { readingTimeMinutes } from "@/lib/reading-time";
import { Container, Eyebrow } from "@/components/marketing";

export const metadata = {
  title: "Blog",
  description: "News, notes, and the occasional dev-log from the Airwave project.",
  alternates: { types: { "application/rss+xml": "/blog/rss.xml" } },
};

function formatDate(date: string) {
  return new Date(date).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });
}

export default function BlogIndex() {
  const posts = [...blogSource.getPages()].sort(
    (a, b) => new Date(b.data.date).getTime() - new Date(a.data.date).getTime(),
  );

  return (
    <main className="flex-1">
      <Container className="py-16 sm:py-20">
        {/* Hero */}
        <div className="mx-auto max-w-2xl text-center">
          <Eyebrow>Blog</Eyebrow>
          <h1 className="mt-6 text-4xl font-semibold tracking-tight sm:text-5xl">The Airwave blog</h1>
          <p className="mt-4 text-lg text-fd-muted-foreground">
            News, notes, and the occasional dev-log from the project.
          </p>
        </div>

        {/* Feed + sidebar */}
        <div className="mt-14 flex flex-col gap-10 lg:flex-row lg:gap-8">
          {/* Post feed */}
          <div className="flex-1">
            <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-fd-muted-foreground">
              Latest posts
            </h2>
            <div className="flex flex-col divide-y divide-fd-border overflow-hidden border-y border-fd-border sm:rounded-xl sm:border sm:bg-fd-card/30">
              {posts.map((post) => {
                const mins = readingTimeMinutes(post.slugs[0]);
                return (
                  <Link
                    key={post.url}
                    href={post.url}
                    className="group relative flex items-center gap-5 p-4 transition-colors hover:bg-fd-accent/40 sm:gap-6 sm:p-6"
                  >
                    <div className="relative aspect-square w-24 shrink-0 overflow-hidden rounded-lg bg-fd-muted sm:aspect-video sm:w-auto sm:flex-1">
                      <Image
                        src={post.data.image}
                        alt={post.data.title}
                        fill
                        className="object-cover"
                        sizes="(max-width: 639px) 96px, 360px"
                      />
                    </div>
                    <div className="flex flex-[2] flex-col gap-2">
                      <h3 className="text-base font-semibold leading-tight text-fd-foreground sm:text-lg">
                        {/* Underline that wipes in on hover (selfh.st's title effect) */}
                        <span className="bg-[linear-gradient(currentColor,currentColor)] bg-[0%_100%] bg-[size:0%_2px] bg-no-repeat transition-all group-hover:bg-[size:100%_2px]">
                          {post.data.title}
                        </span>
                      </h3>
                      {post.data.description ? (
                        <p className="hidden max-w-lg text-sm text-fd-muted-foreground sm:line-clamp-2 sm:block">
                          {post.data.description}
                        </p>
                      ) : null}
                      <div className="flex flex-wrap items-center gap-2 text-sm font-medium text-fd-muted-foreground">
                        <time dateTime={post.data.date}>{formatDate(post.data.date)}</time>
                        <span className="before:mr-1 before:content-['·']">{post.data.author}</span>
                        <span className="before:mr-1 before:content-['·']">{mins} min read</span>
                      </div>
                    </div>
                  </Link>
                );
              })}
            </div>
          </div>

          {/* Sidebar — newsletter signup (James wires the real form). */}
          <aside className="lg:w-80 lg:shrink-0">
            <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-fd-muted-foreground">
              Newsletter
            </h2>
            <div className="rounded-xl border border-fd-border bg-fd-card/30 p-5 lg:sticky lg:top-6">
              <p className="text-sm leading-snug text-fd-muted-foreground">
                Updates, new features, and the occasional dev-log — straight to your inbox.
              </p>
              {/* TODO(James): newsletter signup form goes here. */}
            </div>
          </aside>
        </div>
      </Container>
    </main>
  );
}
