import Link from "next/link";
import { blogSource } from "@/lib/source";
import { Container, Eyebrow } from "@/components/marketing";

export const metadata = {
  title: "Blog",
  description: "News, notes, and the occasional dev-log from the Airwave project.",
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
        <div className="mx-auto max-w-3xl">
          <Eyebrow>Blog</Eyebrow>
          <h1 className="mt-6 text-4xl font-semibold tracking-tight sm:text-5xl">The Airwave blog</h1>
          <p className="mt-4 text-lg text-fd-muted-foreground">News, notes, and the occasional dev-log.</p>

          <div className="mt-12 space-y-4">
            {posts.map((post) => (
              <Link
                key={post.url}
                href={post.url}
                className="block rounded-xl border border-fd-border bg-fd-card/40 p-6 transition-colors hover:border-fd-primary/40"
              >
                <p className="text-sm text-fd-muted-foreground">
                  {formatDate(post.data.date)} · {post.data.author}
                </p>
                <h2 className="mt-2 text-xl font-semibold">{post.data.title}</h2>
                {post.data.description ? (
                  <p className="mt-2 text-sm text-fd-muted-foreground">{post.data.description}</p>
                ) : null}
                <p className="mt-4 text-sm font-medium text-fd-primary">Read more →</p>
              </Link>
            ))}
          </div>
        </div>
      </Container>
    </main>
  );
}
