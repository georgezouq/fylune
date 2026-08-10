/* eslint-disable no-unused-vars -- the base ESLint config does not mark JSX references as usage */
import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { addTopAreaChild$, realmPlugin, useEditorSearch } from "@mdxeditor/editor";
import { ArrowsLeftRight, CaretDown, CaretUp, MagnifyingGlass, X } from "@phosphor-icons/react";

function escapeRegularExpression(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function searchPattern(value, { regularExpression, wholeWord }) {
  if (!value) return { pattern: "", error: "" };
  const source = regularExpression ? value : escapeRegularExpression(value);
  const pattern = wholeWord ? `\\b(?:${source})\\b` : source;
  try {
    new RegExp(pattern, "gi");
    return { pattern, error: "" };
  } catch {
    return { pattern: "", error: "invalidRegex" };
  }
}

function DocumentSearchPanel() {
  const { t } = useTranslation();
  const {
    closeSearch,
    cursor,
    isSearchOpen,
    next,
    openSearch,
    prev,
    replace,
    replaceAll,
    setSearch,
    total,
  } = useEditorSearch();
  const [query, setQuery] = useState("");
  const [replacement, setReplacement] = useState("");
  const [replaceMode, setReplaceMode] = useState(false);
  const [regularExpression, setRegularExpression] = useState(false);
  const [wholeWord, setWholeWord] = useState(false);
  const searchInput = useRef(null);
  const replaceInput = useRef(null);
  const searchActions = useRef({ openSearch, setSearch });
  searchActions.current = { openSearch, setSearch };
  const compiled = useMemo(
    () => searchPattern(query, { regularExpression, wholeWord }),
    [query, regularExpression, wholeWord],
  );

  useEffect(() => {
    searchActions.current.setSearch(compiled.pattern);
  }, [compiled.pattern]);

  useEffect(() => {
    function handleShortcut(event) {
      if (!(event.metaKey || event.ctrlKey) || event.altKey) return;
      const key = event.key.toLowerCase();
      if (key !== "f" && key !== "h") return;
      event.preventDefault();
      event.stopPropagation();
      setReplaceMode(key === "h");
      searchActions.current.openSearch();
      window.requestAnimationFrame(() => searchInput.current?.focus());
    }
    window.addEventListener("keydown", handleShortcut, true);
    return () => window.removeEventListener("keydown", handleShortcut, true);
  }, []);

  useEffect(() => {
    if (!isSearchOpen) return;
    window.requestAnimationFrame(() => searchInput.current?.focus());
  }, [isSearchOpen]);

  useEffect(() => {
    if (replaceMode && isSearchOpen) window.requestAnimationFrame(() => replaceInput.current?.focus());
  }, [isSearchOpen, replaceMode]);

  if (!isSearchOpen) return null;

  const resultLabel = compiled.error
    ? t(`search.${compiled.error}`)
    : query && total
      ? t("search.position", { current: cursor || 1, total })
      : query
        ? t("search.noMatches")
        : "";
  const replacementDisabled = !query || !total || Boolean(compiled.error);

  function close() {
    closeSearch();
    setReplaceMode(false);
  }

  function handlePanelKeyDown(event) {
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      close();
      return;
    }
    if (event.key === "Enter" && event.target === searchInput.current) {
      event.preventDefault();
      event.shiftKey ? prev() : next();
    }
  }

  return (
    <section className={`document-search-panel ${replaceMode ? "replace-mode" : ""}`} role="search" aria-label={t("search.label")} onKeyDown={handlePanelKeyDown}>
      <style>{`
        ::highlight(MdxSearch) { background: color-mix(in oklch, var(--warning), transparent 62%); }
        ::highlight(MdxFocusSearch) { background: color-mix(in oklch, var(--warning), transparent 22%); color: var(--ink); }
      `}</style>
      <div className="document-search-row">
        <span className="document-search-input">
          <MagnifyingGlass aria-hidden="true" />
          <input
            ref={searchInput}
            type="text"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            aria-label={t("search.find")}
            placeholder={t("search.find")}
            spellCheck="false"
          />
        </span>
        {resultLabel ? <output className={compiled.error ? "search-error" : ""} aria-live="polite">{resultLabel}</output> : null}
        <button type="button" className="document-search-icon" onClick={prev} disabled={!total} aria-label={t("search.previous")} title={t("search.previousHint")}><CaretUp /></button>
        <button type="button" className="document-search-icon" onClick={next} disabled={!total} aria-label={t("search.next")} title={t("search.nextHint")}><CaretDown /></button>
        <button type="button" className={`document-search-icon ${replaceMode ? "active" : ""}`} onClick={() => setReplaceMode((current) => !current)} aria-pressed={replaceMode} aria-label={t("search.toggleReplace")} title={t("search.toggleReplace")}><ArrowsLeftRight /></button>
        <button type="button" className="document-search-icon" onClick={close} aria-label={t("search.close")} title={t("search.closeHint")}><X /></button>
      </div>
      <div className="document-search-options">
        <button type="button" className={wholeWord ? "active" : ""} onClick={() => setWholeWord((current) => !current)} aria-pressed={wholeWord} title={t("search.wholeWordHint")}><span>ab</span> {t("search.wholeWord")}</button>
        <button type="button" className={regularExpression ? "active" : ""} onClick={() => setRegularExpression((current) => !current)} aria-pressed={regularExpression} title={t("search.regexHint")}><span>.*</span> {t("search.regex")}</button>
      </div>
      {replaceMode ? (
        <div className="document-replace-row">
          <span className="document-search-input replace-input">
            <ArrowsLeftRight aria-hidden="true" />
            <input
              ref={replaceInput}
              type="text"
              value={replacement}
              onChange={(event) => setReplacement(event.target.value)}
              aria-label={t("search.replaceWith")}
              placeholder={t("search.replaceWith")}
              spellCheck="false"
            />
          </span>
          <button type="button" className="document-replace-action" onClick={() => replace(replacement)} disabled={replacementDisabled}>{t("search.replace")}</button>
          <button type="button" className="document-replace-action" onClick={() => replaceAll(replacement)} disabled={replacementDisabled}>{t("search.replaceAll")}</button>
        </div>
      ) : null}
    </section>
  );
}

export const documentSearchUiPlugin = realmPlugin({
  init(realm) {
    realm.pub(addTopAreaChild$, DocumentSearchPanel);
  },
});
