import { marked, type Token, type Tokens } from "marked";

import type { JSONContent } from "./types";

/**
 * Two-way bridge between the fuma-comment editor's content (a tiptap/ProseMirror JSON doc) and the
 * Markdown that GitHub Discussions store.
 *   - WRITE: `docToMarkdown` serializes what the user typed into GitHub-flavored Markdown.
 *   - READ:  `markdownToDoc` parses a comment's Markdown back into the JSON doc the UI renders.
 *
 * The editor's schema is small and fixed (see `.refs/fuma-comment/.../create-editor.ts`): paragraphs,
 * code blocks, images, mentions, and the marks bold / italic / strike / inline-code / link. We map that
 * subset faithfully both ways; richer Markdown authored directly on GitHub (headings, lists, quotes)
 * is degraded to paragraphs so it still renders (the renderer silently drops node types it doesn't know).
 */

// ── WRITE: JSON doc -> Markdown ───────────────────────────────────────────────────────────────────

function escapeText(text: string): string {
  // Keep it light: only neutralize the markers our own serializer uses, so round-tripping is stable.
  return text.replace(/([\\`*_~])/g, "\\$1");
}

function inlineToMarkdown(node: JSONContent): string {
  if (node.type === "text") {
    const marks = node.marks ?? [];
    const has = (t: string) => marks.some((m) => m.type === t);
    // Inline code can't carry other Markdown, so short-circuit it.
    if (has("code")) return "`" + (node.text ?? "").replace(/`/g, "") + "`";

    let text = escapeText(node.text ?? "");
    if (has("bold")) text = `**${text}**`;
    if (has("italic")) text = `_${text}_`;
    if (has("strike")) text = `~~${text}~~`;
    const link = marks.find((m) => m.type === "link");
    const href = link?.attrs?.href;
    if (typeof href === "string" && href) text = `[${text}](${href})`;
    return text;
  }
  if (node.type === "mention") {
    const a = node.attrs ?? {};
    return `@${(a.label as string) ?? (a.id as string) ?? ""}`;
  }
  if (node.type === "image") {
    const a = node.attrs ?? {};
    return `![${(a.alt as string) ?? ""}](${(a.src as string) ?? ""})`;
  }
  if (node.type === "hardBreak") return "\n";
  return (node.content ?? []).map(inlineToMarkdown).join("");
}

function blockToMarkdown(node: JSONContent): string {
  switch (node.type) {
    case "paragraph":
      return (node.content ?? []).map(inlineToMarkdown).join("");
    case "codeBlock": {
      const lang = (node.attrs?.language as string) ?? "";
      const code = (node.content ?? []).map((c) => c.text ?? "").join("");
      return "```" + lang + "\n" + code + "\n```";
    }
    case "image":
      return inlineToMarkdown(node);
    default:
      return (node.content ?? []).map(blockToMarkdown).join("\n\n");
  }
}

export function docToMarkdown(doc: JSONContent | null | undefined): string {
  if (!doc || doc.type !== "doc") return "";
  return (doc.content ?? [])
    .map(blockToMarkdown)
    .join("\n\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

// ── READ: Markdown -> JSON doc ────────────────────────────────────────────────────────────────────

function text(value: string, marks?: JSONContent["marks"]): JSONContent {
  return marks && marks.length ? { type: "text", text: value, marks } : { type: "text", text: value };
}

function withMark(nodes: JSONContent[], mark: { type: string; attrs?: Record<string, unknown> }): JSONContent[] {
  return nodes.map((n) =>
    n.type === "text" ? { ...n, marks: [...(n.marks ?? []), mark] } : n,
  );
}

function inlineFromTokens(tokens: Token[] | undefined): JSONContent[] {
  const out: JSONContent[] = [];
  for (const tok of tokens ?? []) {
    switch (tok.type) {
      case "text": {
        const t = tok as Tokens.Text;
        if (t.tokens && t.tokens.length) out.push(...inlineFromTokens(t.tokens));
        else out.push(text(t.text));
        break;
      }
      case "escape":
        out.push(text((tok as Tokens.Escape).text));
        break;
      case "strong":
        out.push(...withMark(inlineFromTokens((tok as Tokens.Strong).tokens), { type: "bold" }));
        break;
      case "em":
        out.push(...withMark(inlineFromTokens((tok as Tokens.Em).tokens), { type: "italic" }));
        break;
      case "del":
        out.push(...withMark(inlineFromTokens((tok as Tokens.Del).tokens), { type: "strike" }));
        break;
      case "codespan":
        out.push(text((tok as Tokens.Codespan).text, [{ type: "code" }]));
        break;
      case "link": {
        const l = tok as Tokens.Link;
        out.push(...withMark(inlineFromTokens(l.tokens), { type: "link", attrs: { href: l.href } }));
        break;
      }
      case "image": {
        const im = tok as Tokens.Image;
        out.push({ type: "image", attrs: { src: im.href, alt: im.text ?? "" } });
        break;
      }
      case "br":
        out.push({ type: "hardBreak" });
        break;
      case "html":
        // Strip inline tags; keep any text content so nothing vanishes.
        out.push(text((tok as Tokens.HTML).text.replace(/<[^>]*>/g, "")));
        break;
      default: {
        const raw = (tok as { raw?: string }).raw;
        if (raw) out.push(text(raw));
      }
    }
  }
  return out;
}

function paragraph(content: JSONContent[]): JSONContent {
  return { type: "paragraph", content: content.length ? content : [] };
}

function blocksFromTokens(tokens: Token[]): JSONContent[] {
  const out: JSONContent[] = [];
  for (const tok of tokens) {
    switch (tok.type) {
      case "paragraph":
        out.push(paragraph(inlineFromTokens((tok as Tokens.Paragraph).tokens)));
        break;
      case "text": {
        const t = tok as Tokens.Text;
        out.push(paragraph(t.tokens ? inlineFromTokens(t.tokens) : [text(t.text)]));
        break;
      }
      case "code": {
        const c = tok as Tokens.Code;
        out.push({
          type: "codeBlock",
          attrs: { language: c.lang || null },
          content: c.text ? [text(c.text)] : [],
        });
        break;
      }
      case "heading":
        // Degrade to a bold paragraph (the renderer has no heading node).
        out.push(paragraph(withMark(inlineFromTokens((tok as Tokens.Heading).tokens), { type: "bold" })));
        break;
      case "blockquote":
        for (const inner of blocksFromTokens((tok as Tokens.Blockquote).tokens)) out.push(inner);
        break;
      case "list": {
        const list = tok as Tokens.List;
        let n = list.start === "" ? 1 : Number(list.start) || 1;
        for (const item of list.items) {
          const marker = list.ordered ? `${n++}. ` : "• ";
          const inline = inlineFromTokens(item.tokens);
          out.push(paragraph([text(marker), ...inline]));
        }
        break;
      }
      case "hr":
      case "space":
        break;
      case "html":
        out.push(paragraph([text((tok as Tokens.HTML).text.replace(/<[^>]*>/g, "").trim())]));
        break;
      default: {
        const raw = (tok as { raw?: string }).raw?.trim();
        if (raw) out.push(paragraph([text(raw)]));
      }
    }
  }
  return out.filter((b) => b.type !== "paragraph" || (b.content?.length ?? 0) > 0);
}

export function markdownToDoc(md: string | null | undefined): JSONContent {
  const tokens = marked.lexer(md ?? "");
  const content = blocksFromTokens(tokens);
  return { type: "doc", content: content.length ? content : [paragraph([])] };
}

// ── Validation (incoming content, before we serialize + send to GitHub) ─────────────────────────────

const MAX_CHARS = 2000;

/** Extract plain text from a doc (for length/empty checks), mirroring fuma-comment's own rule. */
export function docToPlainText(doc: JSONContent | null | undefined): string {
  if (!doc) return "";
  if (doc.type === "text") return doc.text ?? "";
  const child = (doc.content ?? []).map(docToPlainText).join("");
  return doc.type === "paragraph" ? `${child}\n` : child;
}

/** Returns an error message if the content is unusable, else null. */
export function validateContent(content: unknown): string | null {
  if (!content || typeof content !== "object") return "Invalid content";
  const doc = content as JSONContent;
  if (doc.type !== "doc") return "Invalid content";
  const plain = docToPlainText(doc).trim();
  if (plain.length === 0) return "Comment can't be empty";
  if (plain.length > MAX_CHARS) return `Comment can't be longer than ${MAX_CHARS} characters`;
  return null;
}
