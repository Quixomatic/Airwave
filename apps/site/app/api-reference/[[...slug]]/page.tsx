import { DocsBody, DocsDescription, DocsPage, DocsTitle } from "fumadocs-ui/page";
import { notFound, redirect } from "next/navigation";

import { apiReference } from "@/lib/api-source";
import { APIPage } from "@/lib/openapi-page";

export default async function Page(props: { params: Promise<{ slug?: string[] }> }) {
  const { slug } = await props.params;
  const page = apiReference.getPage(slug);
  if (!page) {
    // The virtual source has no page at the bare /api-reference root — land on the first operation instead.
    if (!slug || slug.length === 0) {
      const first = apiReference.getPages()[0];
      if (first) redirect(first.url);
    }
    notFound();
  }

  // Virtual OpenAPI pages carry ready-to-spread props (the bundled spec is embedded), so there's no MDX body
  // to render — we hand the props straight to the client APIPage component.
  const apiProps = page.data.getOpenAPIPageProps();

  return (
    <DocsPage toc={page.data.toc}>
      <DocsTitle>{page.data.title}</DocsTitle>
      {page.data.description ? <DocsDescription>{page.data.description}</DocsDescription> : null}
      <DocsBody>
        <APIPage {...apiProps} />
      </DocsBody>
    </DocsPage>
  );
}

export function generateStaticParams() {
  return apiReference.generateParams();
}

export async function generateMetadata(props: { params: Promise<{ slug?: string[] }> }) {
  const { slug } = await props.params;
  const page = apiReference.getPage(slug);
  if (!page) return {};
  return { title: page.data.title, description: page.data.description };
}
