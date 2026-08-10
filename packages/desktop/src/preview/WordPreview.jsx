/* eslint-disable no-unused-vars -- JSX references are not marked as usage by the base config */
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { SpinnerGap } from "@phosphor-icons/react";

/**
 * Word writes list bullets as private-use codepoints belonging to Symbol and Wingdings.
 * Neither font ships with macOS, so every marker renders as a tofu box. Swapping in the
 * Unicode character each glyph stands for keeps a list looking like a list.
 */
const SYMBOL_BULLETS = new Map([
  ["", "•"], ["", "▪"], ["", "▪"], ["", "■"],
  ["", "◆"], ["", "◇"], ["", "➤"], ["", "→"],
  ["", "⇒"], ["", "✓"], ["", "✗"], ["", "■"],
  ["", "❑"], ["", "✱"],
]);
const SYMBOL_FONTS = /font-family:\s*['"]?(Symbol|Wingdings[^;'"]*|Webdings|Marlett)['"]?/gi;

export function substituteBulletGlyphs(css) {
  if (typeof css !== "string" || !css) return css;
  return css
    // The glyph arrives as a literal character, and may also appear CSS-escaped.
    .replace(/[-]/g, (character) => SYMBOL_BULLETS.get(character) ?? character)
    .replace(/\\(f0[0-9a-f]{2})/gi, (whole, code) => (
      SYMBOL_BULLETS.get(String.fromCodePoint(Number.parseInt(code, 16))) ?? whole
    ))
    .replace(SYMBOL_FONTS, "font-family: var(--font-ui)");
}

/**
 * Word preview.
 *
 * Rendering is delegated to docx-preview, which converts the document part into real
 * HTML pages rather than rasterising them. That keeps the text selectable and lets the
 * document keep its own typography while sitting on Fylune's preview stage.
 */
export function WordPreview({ item, loadData, zoom, onMetadata, onError, onReady }) {
  const { t } = useTranslation();
  const bodyRef = useRef(null);
  const styleRef = useRef(null);
  const [status, setStatus] = useState("loading");

  useEffect(() => {
    let disposed = false;
    setStatus("loading");

    Promise.all([import("docx-preview"), loadData?.()])
      .then(async ([docx, data]) => {
        if (disposed) return;
        if (!data) throw new Error("EMPTY_DOCUMENT");
        const body = bodyRef.current;
        const styles = styleRef.current;
        if (!body || !styles) return;
        body.replaceChildren();
        styles.replaceChildren();
        await docx.renderAsync(data, body, styles, {
          className: "fylune-docx",
          inWrapper: true,
          breakPages: true,
          ignoreLastRenderedPageBreak: false,
          renderHeaders: true,
          renderFooters: true,
          renderFootnotes: true,
          renderEndnotes: true,
          renderChanges: true,
          // Object URLs would outlive this component; base64 keeps images bound to the
          // markup so unmounting the preview cannot leave a leak behind.
          useBase64URL: true,
          trimXmlDeclaration: true,
        });
        if (disposed) return;
        for (const sheet of styles.querySelectorAll("style")) {
          const substituted = substituteBulletGlyphs(sheet.textContent);
          if (substituted !== sheet.textContent) sheet.textContent = substituted;
        }
        const pages = body.querySelectorAll(".fylune-docx-wrapper > section").length;
        onMetadata(t("asset.pageCount", { count: Math.max(1, pages) }));
        onReady?.({ pageCount: Math.max(1, pages) });
        setStatus("ready");
      })
      .catch(() => {
        if (disposed) return;
        setStatus("error");
        onError();
      });

    return () => {
      disposed = true;
    };
  }, [loadData, onError, onMetadata, onReady, t]);

  return (
    <div className="word-preview-stage" data-testid="word-preview">
      {status === "loading" ? (
        <div className="preview-loading" role="status">
          <SpinnerGap className="spin" />
          <span>{t("asset.openingDocument")}</span>
        </div>
      ) : null}
      <div ref={styleRef} className="word-preview-styles" aria-hidden="true" />
      <div
        ref={bodyRef}
        className="word-preview-pages"
        style={{ "--word-zoom": zoom }}
        aria-label={t("asset.documentPreview", { title: item.title })}
      />
    </div>
  );
}
