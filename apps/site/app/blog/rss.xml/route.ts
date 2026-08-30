import { blogSource } from "@/lib/source";

const SITE_URL = "https://getairwave.tv";

// Static at build — the feed only changes when posts do (rebuild redeploys it).
export const dynamic = "force-static";

function escapeXml(s: string): string {
  return s.replace(
    /[<>&'"]/g,
    (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", "'": "&apos;", '"': "&quot;" })[c] ?? c,
  );
}

export function GET() {
  const posts = [...blogSource.getPages()].sort(
    (a, b) => new Date(b.data.date).getTime() - new Date(a.data.date).getTime(),
  );

  const items = posts
    .map((p) => {
      const link = `${SITE_URL}${p.url}`;
      return `    <item>
      <title>${escapeXml(p.data.title)}</title>
      <link>${link}</link>
      <guid isPermaLink="true">${link}</guid>
      <pubDate>${new Date(p.data.date).toUTCString()}</pubDate>
      <dc:creator>${escapeXml(p.data.author)}</dc:creator>${
        p.data.description ? `\n      <description>${escapeXml(p.data.description)}</description>` : ""
      }
    </item>`;
    })
    .join("\n");

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom" xmlns:dc="http://purl.org/dc/elements/1.1/">
  <channel>
    <title>The Airwave blog</title>
    <link>${SITE_URL}/blog</link>
    <description>News, notes, and the occasional dev-log from the Airwave project.</description>
    <language>en</language>
    <atom:link href="${SITE_URL}/blog/rss.xml" rel="self" type="application/rss+xml" />
${items}
  </channel>
</rss>`;

  return new Response(xml, {
    headers: { "Content-Type": "application/rss+xml; charset=utf-8" },
  });
}
