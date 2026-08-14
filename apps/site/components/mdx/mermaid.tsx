// Mermaid diagram renderer — the fumadocs "Beautiful Mermaid" recipe
// (https://www.fumadocs.dev/docs/markdown/mermaid#beautiful-mermaid). A SERVER component: renders the diagram
// to an SVG at build/request time via beautiful-mermaid (zero DOM deps, no client JS, no hydration), themed
// with the fumadocs `--color-fd-*` variables so it adapts to light/dark. Authored as ```mermaid code fences,
// converted to <Mermaid chart="…"/> by remarkMdxMermaid (see source.config.ts). Falls back to a code block if
// a chart fails to parse.
import { CodeBlock, Pre } from "fumadocs-ui/components/codeblock";
import { renderMermaidSVG } from "beautiful-mermaid";

export async function Mermaid({ chart }: { chart: string }) {
  try {
    const svg = renderMermaidSVG(chart, {
      bg: "var(--color-fd-background)",
      fg: "var(--color-fd-foreground)",
      interactive: true,
      transparent: true,
    });
    return <div className="my-6 flex justify-center" dangerouslySetInnerHTML={{ __html: svg }} />;
  } catch {
    return (
      <CodeBlock title="Mermaid">
        <Pre>{chart}</Pre>
      </CodeBlock>
    );
  }
}
