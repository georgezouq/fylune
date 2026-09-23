import { HighlightStyle, syntaxHighlighting } from "@codemirror/language";
import { Prec } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { tags } from "@lezer/highlight";

const editorTheme = EditorView.theme({
  "&": {
    color: "var(--ink)",
    backgroundColor: "transparent",
    fontFamily: '"SFMono-Regular", ui-monospace, monospace',
    fontSize: "13px",
    lineHeight: "1.6",
  },
  ".cm-scroller": {
    backgroundColor: "transparent",
  },
  ".cm-content": {
    padding: "16px 0",
    caretColor: "var(--primary-strong)",
  },
  ".cm-line": {
    padding: "0 18px 0 14px",
  },
  ".cm-cursor, .cm-dropCursor": {
    borderLeftColor: "var(--primary-strong)",
  },
  "&.cm-focused .cm-selectionBackground, .cm-selectionBackground, .cm-content ::selection": {
    backgroundColor: "var(--selection)",
  },
  ".cm-activeLine, .cm-activeLineGutter": {
    backgroundColor: "transparent",
  },
  "&.cm-focused .cm-activeLine, &.cm-focused .cm-activeLineGutter": {
    backgroundColor: "var(--selection)",
  },
  ".cm-gutters": {
    border: "0",
    borderRight: "1px solid var(--border-soft)",
    backgroundColor: "var(--surface-elevated)",
    color: "var(--muted)",
  },
  ".cm-lineNumbers .cm-gutterElement": {
    minWidth: "42px",
    padding: "0 10px 0 8px",
  },
  ".cm-panels": {
    borderColor: "var(--border)",
    backgroundColor: "var(--surface-elevated)",
    color: "var(--ink)",
  },
  ".cm-searchMatch": {
    outline: "1px solid var(--primary)",
    backgroundColor: "var(--primary-soft)",
  },
  ".cm-searchMatch.cm-searchMatch-selected, .cm-selectionMatch": {
    backgroundColor: "var(--selection)",
  },
  "&.cm-focused .cm-matchingBracket": {
    outline: "1px solid var(--primary)",
    backgroundColor: "var(--primary-soft)",
  },
  "&.cm-focused .cm-nonmatchingBracket": {
    outline: "1px solid var(--danger)",
    backgroundColor: "var(--danger-soft)",
  },
  ".cm-tooltip": {
    border: "1px solid var(--border)",
    backgroundColor: "var(--surface-elevated)",
    color: "var(--ink)",
  },
  ".cm-tooltip-autocomplete > ul > li[aria-selected]": {
    backgroundColor: "var(--selection)",
    color: "var(--ink)",
  },
  ".cm-foldPlaceholder": {
    border: "1px solid var(--border)",
    backgroundColor: "var(--surface)",
    color: "var(--muted)",
  },
});

const syntaxTheme = HighlightStyle.define([
  {
    tag: [
      tags.keyword,
      tags.controlKeyword,
      tags.operatorKeyword,
      tags.modifier,
      tags.atom,
      tags.bool,
    ],
    color: "var(--primary-strong)",
  },
  {
    tag: [
      tags.function(tags.variableName),
      tags.definition(tags.name),
      tags.className,
      tags.typeName,
      tags.tagName,
    ],
    color: "var(--info)",
  },
  {
    tag: [
      tags.string,
      tags.special(tags.string),
      tags.regexp,
      tags.number,
      tags.color,
      tags.character,
    ],
    color: "var(--warning)",
  },
  {
    tag: [tags.propertyName, tags.attributeName, tags.variableName, tags.name],
    color: "var(--ink)",
  },
  {
    tag: [tags.comment, tags.meta, tags.processingInstruction],
    color: "var(--muted)",
    fontStyle: "italic",
  },
  {
    tag: [tags.link, tags.url],
    color: "var(--primary-strong)",
    textDecoration: "underline",
  },
  {
    tag: [tags.heading, tags.strong],
    color: "var(--primary-strong)",
    fontWeight: "650",
  },
  {
    tag: [tags.deleted, tags.invalid],
    color: "var(--danger)",
  },
  {
    tag: tags.inserted,
    color: "var(--success)",
  },
]);

export const fyluneCodeMirrorTheme = Prec.highest([
  editorTheme,
  syntaxHighlighting(syntaxTheme),
]);
