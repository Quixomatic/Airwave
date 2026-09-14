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
      // More breathing room than the defaults (padding 40 / nodeSpacing 24 / layerSpacing 40) so
      // diagrams read larger and less cramped. Size comes from the layout, not CSS scaling.
      padding: 36,
      nodeSpacing: 44,
      layerSpacing: 64,
    });
    // Center the diagram at its natural size, only capping width so a wide graph can't overflow the
    // column. A diagram's HEIGHT comes from its orientation (use `flowchart TD` for a tall vertical
    // flow); stretching the SVG wider can't add height, so we don't force full width.
    return (
      <div
        className="my-6 flex justify-center [&_svg]:!h-auto [&_svg]:!max-w-full"
        dangerouslySetInnerHTML={{ __html: svg }}
      />
    );
  } catch {
    return (
      <CodeBlock title="Mermaid">
        <Pre>{chart}</Pre>
      </CodeBlock>
    );
  }
}
