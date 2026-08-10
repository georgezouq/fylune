/* eslint-disable no-unused-vars -- the base ESLint config does not mark JSX references as usage */
import { useTranslation } from "react-i18next";

const MAX_BLOCKS = 8;
const MAX_TEXT_LENGTH = 1200;

function cleanInlineMarkdown(value) {
  return value
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, (_match, alt) => alt ? `Image: ${alt}` : "Image")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/<https?:\/\/[^>]+>/g, "Link")
    .replace(/<[^>]+>/g, " ")
    .replace(/\{[^{}]*\}/g, " ")
    .replace(/[`*_~]/g, "")
    .replace(/\\([\\`*{}()#+.!_>-])/g, "$1")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, "\"")
    .replace(/\s+/g, " ")
    .trim();
}

function withoutFrontmatter(lines) {
  if (lines[0]?.trim() !== "---") return lines;
  const closingIndex = lines.findIndex((line, index) => index > 0 && line.trim() === "---");
  return closingIndex === -1 ? lines : lines.slice(closingIndex + 1);
}

export function parseDocumentPreview(source, labels = {}) {
  if (typeof source !== "string") return [];

  const lines = withoutFrontmatter(source.replace(/^\uFEFF/, "").replace(/\r\n?/g, "\n").split("\n"));
  const blocks = [];
  let paragraph = [];
  let list = null;
  let code = null;
  let totalLength = 0;

  const hasCapacity = () => blocks.length < MAX_BLOCKS && totalLength < MAX_TEXT_LENGTH;
  const pushBlock = (block) => {
    if (!block || !hasCapacity()) return;
    const textLength = "text" in block
      ? block.text.length
      : block.items?.reduce((sum, item) => sum + item.length, 0) || 0;
    if (!textLength && !new Set(["rule", "image"]).has(block.type)) return;
    blocks.push(block);
    totalLength += textLength;
  };
  const flushParagraph = () => {
    const text = cleanInlineMarkdown(paragraph.join(" "));
    if (text) pushBlock({ type: "paragraph", text });
    paragraph = [];
  };
  const flushList = () => {
    if (list?.items.length) pushBlock(list);
    list = null;
  };
  const flushCode = () => {
    const text = code?.join("\n").trim();
    if (text) pushBlock({ type: "code", text });
    code = null;
  };

  for (const rawLine of lines) {
    if (!hasCapacity()) break;
    const line = rawLine.trimEnd();
    const trimmed = line.trim();

    if (/^```|^~~~/.test(trimmed)) {
      flushParagraph();
      flushList();
      if (code) flushCode();
      else code = [];
      continue;
    }
    if (code) {
      if (code.length < 4) code.push(line.slice(0, 120));
      continue;
    }
    if (!trimmed) {
      flushParagraph();
      flushList();
      continue;
    }
    if (/^(?:import|export)\s/.test(trimmed) || /^\{\/\*/.test(trimmed) || /^\*\/\}$/.test(trimmed)) continue;
    if (/^<\/?[A-Z][^>]*>$/.test(trimmed)) continue;
    if (/^\|?\s*:?-{3,}:?\s*(?:\|\s*:?-{3,}:?\s*)+\|?$/.test(trimmed)) continue;

    const image = trimmed.match(/^!\[([^\]]*)\]\(\s*(?:<([^>]+)>|([^\s)]+))(?:\s+["'][^"']*["'])?\s*\)$/);
    if (image) {
      flushParagraph();
      flushList();
      pushBlock({ type: "image", alt: cleanInlineMarkdown(image[1]), src: image[2] || image[3] });
      continue;
    }

    const heading = trimmed.match(/^(#{1,6})\s+(.+)$/);
    if (heading) {
      flushParagraph();
      flushList();
      pushBlock({ type: "heading", level: Math.min(heading[1].length, 3), text: cleanInlineMarkdown(heading[2]) });
      continue;
    }

    const listItem = trimmed.match(/^([-+*]|\d+[.)])\s+(?:\[([ xX])\]\s+)?(.+)$/);
    if (listItem) {
      flushParagraph();
      const ordered = /^\d/.test(listItem[1]);
      if (!list || list.ordered !== ordered) {
        flushList();
        list = { type: "list", ordered, items: [] };
      }
      const itemText = cleanInlineMarkdown(listItem[3]);
      if (itemText && list.items.length < 4) list.items.push(`${listItem[2] ? `${listItem[2].toLowerCase() === "x" ? (labels.done || "Done") : (labels.todo || "Todo")}: ` : ""}${itemText}`);
      continue;
    }

    if (/^(?:-{3,}|\*{3,}|_{3,})$/.test(trimmed)) {
      flushParagraph();
      flushList();
      pushBlock({ type: "rule" });
      continue;
    }

    if (trimmed.startsWith(">")) {
      flushParagraph();
      flushList();
      pushBlock({ type: "quote", text: cleanInlineMarkdown(trimmed.replace(/^>+\s?/, "")) });
      continue;
    }

    if (trimmed.includes("|") && trimmed.split("|").length > 2) {
      flushParagraph();
      flushList();
      const cells = trimmed.split("|").map(cleanInlineMarkdown).filter(Boolean);
      if (cells.length) pushBlock({ type: "table", text: cells.join(" · ") });
      continue;
    }

    paragraph.push(trimmed);
  }

  flushParagraph();
  flushList();
  flushCode();
  return blocks.slice(0, MAX_BLOCKS);
}

export function DocumentCardPreview({ source, status = "idle", resolveImage }) {
  const { t } = useTranslation();
  if (status === "loading" || (status === "idle" && source == null)) {
    return <div className="document-card-preview-loading" aria-label={t("library.loadingPreview")}><span /><span /><span /><span /></div>;
  }

  if (status === "error") {
    return <div className="document-card-preview-state">{t("library.previewUnavailable")}</div>;
  }

  const blocks = parseDocumentPreview(source, { done: t("common.done"), todo: t("common.todo") });
  if (!blocks.length) return <div className="document-card-preview-state">{t("library.emptyDocument")}</div>;

  return (
    <div className="document-card-preview-content" aria-hidden="true">
      {blocks.map((block, index) => {
        const key = `${block.type}-${index}`;
        if (block.type === "heading") {
          const Heading = `h${block.level}`;
          return <Heading key={key}>{block.text}</Heading>;
        }
        if (block.type === "list") {
          const List = block.ordered ? "ol" : "ul";
          return <List key={key}>{block.items.map((item, itemIndex) => <li key={`${key}-${itemIndex}`}>{item}</li>)}</List>;
        }
        if (block.type === "quote") return <blockquote key={key}>{block.text}</blockquote>;
        if (block.type === "code") return <pre key={key}><code>{block.text}</code></pre>;
        if (block.type === "rule") return <hr key={key} />;
        if (block.type === "table") return <div key={key} className="document-card-preview-table">{block.text}</div>;
        if (block.type === "image") {
          return <img key={key} className="document-card-preview-image" src={resolveImage?.(block.src) || block.src} alt={block.alt} />;
        }
        return <p key={key}>{block.text}</p>;
      })}
    </div>
  );
}
