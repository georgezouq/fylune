/* eslint-disable no-unused-vars -- JSX runtime usage is not detected by the base config */
import { useEffect, useId, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  addExportVisitor$,
  addImportVisitor$,
  addLexicalNode$,
  addMdastExtension$,
  addSyntaxExtension$,
  addToMarkdownExtension$,
  realmPlugin,
  useCodeBlockEditorContext,
} from "@mdxeditor/editor";
import { Eye, FlowArrow, MathOperations, PencilSimple, Trash, TreeStructure, WarningCircle } from "@phosphor-icons/react";
import { $getNodeByKey, DecoratorNode } from "lexical";
import { mathFromMarkdown, mathToMarkdown } from "mdast-util-math";
import { math } from "micromark-extension-math";
import "katex/dist/katex.min.css";

const MERMAID_THEME_CSS = `
  .node rect, .node circle, .node ellipse, .node polygon, .node path {
    fill: var(--surface-elevated) !important;
    stroke: var(--border) !important;
  }
  .nodeLabel, .label, .label text {
    color: var(--ink) !important;
    fill: var(--ink) !important;
  }
  .edgePath .path, .flowchart-link, .relationshipLine {
    stroke: var(--muted) !important;
  }
  .marker, marker path {
    fill: var(--muted) !important;
    stroke: var(--muted) !important;
  }
  .cluster rect {
    fill: var(--surface) !important;
    stroke: var(--border-soft) !important;
  }
  .cluster-label text, .cluster-label span {
    color: var(--muted) !important;
    fill: var(--muted) !important;
  }
`;

let mermaidPromise;
let diagramRenderQueue = Promise.resolve();
let diagramSequence = 0;
let katexPromise;

async function getMermaid() {
  if (!mermaidPromise) {
    mermaidPromise = import("mermaid").then(({ default: mermaid }) => {
      mermaid.initialize({
        startOnLoad: false,
        securityLevel: "strict",
        suppressErrorRendering: true,
        theme: "base",
        themeCSS: MERMAID_THEME_CSS,
        fontFamily: '-apple-system, BlinkMacSystemFont, "SF Pro Text", Inter, sans-serif',
        flowchart: { htmlLabels: true, curve: "basis" },
      });
      return mermaid;
    }).catch((error) => {
      mermaidPromise = null;
      throw error;
    });
  }
  return mermaidPromise;
}

// Warm the explicitly pre-bundled renderer before a document first reveals a diagram.
void getMermaid().catch(() => {});

function renderMermaid(id, source) {
  diagramRenderQueue = diagramRenderQueue.catch(() => undefined).then(async () => {
    const mermaid = await getMermaid();
    return mermaid.render(id, source);
  });
  return diagramRenderQueue;
}

function diagramType(source, language = "mermaid", t = (key) => key) {
  if (language.toLowerCase() === "mindmap" || /^\s*mindmap\b/i.test(source)) {
    return { label: t("markdown.mindmap"), Icon: TreeStructure };
  }
  if (/^\s*(?:flowchart|graph)\b/i.test(source)) return { label: t("markdown.flowchart"), Icon: FlowArrow };
  return { label: t("markdown.diagram"), Icon: FlowArrow };
}

function renderableDiagramSource(source, language = "mermaid") {
  if (language.toLowerCase() === "mindmap" && !/^\s*mindmap\b/i.test(source)) return `mindmap\n${source}`;
  return source;
}

function friendlyDiagramError(error, fallback) {
  const firstLine = String(error?.message || fallback).split("\n").find((line) => line.trim());
  return firstLine?.replace(/^Error:\s*/i, "").slice(0, 180) || fallback;
}

export function DiagramPreview({ source, language = "mermaid" }) {
  const { t } = useTranslation();
  const reactId = useId().replace(/[^a-zA-Z0-9]/g, "");
  const [result, setResult] = useState({ status: "loading", svg: "", message: "" });
  const renderSource = renderableDiagramSource(source, language);

  useEffect(() => {
    let active = true;
    if (!renderSource.trim()) {
      setResult({ status: "error", svg: "", message: t("markdown.emptyDiagram") });
      return () => { active = false; };
    }
    setResult({ status: "loading", svg: "", message: "" });
    const renderId = `fylune-diagram-${reactId}-${diagramSequence += 1}`;
    void renderMermaid(renderId, renderSource).then(({ svg }) => {
      if (active) setResult({ status: "ready", svg, message: "" });
    }).catch((error) => {
      if (active) setResult({ status: "error", svg: "", message: friendlyDiagramError(error, t("markdown.syntaxError")) });
    });
    return () => { active = false; };
  }, [reactId, renderSource, t]);

  if (result.status === "loading") {
    return <div className="special-preview-loading" aria-label={t("markdown.rendering")}><span /><span /><span /></div>;
  }
  if (result.status === "error") {
    return (
      <div className="special-preview-error" role="alert">
        <WarningCircle />
        <span><strong>{t("markdown.attention")}</strong><small>{result.message}</small></span>
      </div>
    );
  }
  return <div className="diagram-preview" role="img" aria-label={t("markdown.diagramPreview", { type: diagramType(renderSource, language, t).label })} dangerouslySetInnerHTML={{ __html: result.svg }} />;
}

function useEditorEditable(editor) {
  const [editable, setEditable] = useState(() => editor.isEditable());
  useEffect(() => editor.registerEditableListener(setEditable), [editor]);
  return editable;
}

export function VisualCodeBlock({ code, language, focusEmitter }) {
  const { t } = useTranslation();
  const { lexicalNode, parentEditor, setCode } = useCodeBlockEditorContext();
  const [editing, setEditing] = useState(false);
  const sourceRef = useRef(null);
  const editable = useEditorEditable(parentEditor);
  const type = diagramType(code, language, t);

  useEffect(() => {
    focusEmitter.subscribe(() => setEditing(true));
    return () => focusEmitter.subscribe(() => {});
  }, [focusEmitter]);

  useEffect(() => {
    if (editing) sourceRef.current?.focus();
  }, [editing]);

  function removeDiagram() {
    if (!editable) return;
    parentEditor.update(() => lexicalNode.remove());
  }

  return (
    <section className={`special-code-block ${editing ? "is-editing" : ""}`} aria-label={type.label}>
      <header className="special-block-header">
        <span className="special-block-identity"><type.Icon /><strong>{type.label}</strong><small>Mermaid</small></span>
        {editable ? (
          <span className="special-block-actions">
            <button type="button" onClick={() => setEditing((current) => !current)} aria-label={editing ? t("markdown.previewDiagram") : t("markdown.editDiagram")} title={editing ? t("markdown.previewDiagram") : t("markdown.editDiagram")}>
              {editing ? <Eye /> : <PencilSimple />}
              <span>{editing ? t("common.preview") : t("common.edit")}</span>
            </button>
            <button type="button" className="special-delete-button" onClick={removeDiagram} aria-label={t("markdown.deleteDiagram")} title={t("markdown.deleteDiagram")}><Trash /></button>
          </span>
        ) : null}
      </header>
      {editing ? (
        <textarea
          ref={sourceRef}
          className="diagram-source-editor"
          value={code}
          onChange={(event) => setCode(event.target.value)}
          onKeyDown={(event) => {
            event.stopPropagation();
            if (event.key === "Escape") {
              event.preventDefault();
              setEditing(false);
            }
            if (event.key === "Enter" && event.metaKey) {
              event.preventDefault();
              setEditing(false);
            }
          }}
          spellCheck="false"
          aria-label={t("markdown.diagramSource", { type: type.label })}
        />
      ) : <DiagramPreview source={code} language={language} />}
    </section>
  );
}

export const specialCodeBlockEditorDescriptors = [{
  priority: 100,
  match: (language) => ["mermaid", "mindmap"].includes((language || "").toLowerCase()),
  Editor: VisualCodeBlock,
}];

async function renderFormula(value, displayMode) {
  katexPromise ||= import("katex");
  const { default: katex } = await katexPromise;
  return katex.renderToString(value, {
    displayMode,
    output: "htmlAndMathml",
    throwOnError: true,
    strict: "warn",
    trust: false,
  });
}

function FormulaPreview({ value, displayMode }) {
  const { t } = useTranslation();
  const [result, setResult] = useState({ status: "loading", html: "", message: "" });
  useEffect(() => {
    let active = true;
    setResult({ status: "loading", html: "", message: "" });
    void renderFormula(value, displayMode).then((html) => {
      if (active) setResult({ status: "ready", html, message: "" });
    }).catch((error) => {
      if (active) setResult({ status: "error", html: "", message: String(error?.message || t("markdown.invalidFormula")).slice(0, 160) });
    });
    return () => { active = false; };
  }, [displayMode, t, value]);

  if (result.status === "loading") return <span className="formula-loading" aria-label={t("markdown.renderingFormula")} />;
  if (result.status === "error") {
    return <span className="formula-error" role="alert"><WarningCircle /><span>{result.message}</span></span>;
  }
  return <span className="formula-rendered" role="math" aria-label={value} dangerouslySetInnerHTML={{ __html: result.html }} />;
}

function FormulaEditor({ value, displayMode, nodeKey, editor }) {
  const { t } = useTranslation();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const editable = useEditorEditable(editor);
  const inputRef = useRef(null);

  useEffect(() => setDraft(value), [value]);
  useEffect(() => {
    if (editing) inputRef.current?.focus();
  }, [editing]);

  function commit() {
    if (!editable) return;
    const nextValue = draft.trim() || value;
    editor.update(() => {
      const node = $getNodeByKey(nodeKey);
      if ($isFormulaNode(node)) node.setValue(nextValue);
    });
    setEditing(false);
  }

  function cancel() {
    setDraft(value);
    setEditing(false);
  }

  function removeFormula() {
    if (!editable) return;
    editor.update(() => {
      const node = $getNodeByKey(nodeKey);
      if ($isFormulaNode(node)) node.remove();
    });
  }

  function handleKeyDown(event) {
    event.stopPropagation();
    if (event.key === "Escape") {
      event.preventDefault();
      cancel();
    } else if ((!displayMode && event.key === "Enter") || (displayMode && event.key === "Enter" && event.metaKey)) {
      event.preventDefault();
      commit();
    }
  }

  if (displayMode) {
    return (
      <div className={`formula-block ${editing ? "is-editing" : ""}`}>
        <div className="formula-block-toolbar">
          <span><MathOperations /><strong>{t("markdown.formula")}</strong></span>
          {editable ? (
            <span className="special-block-actions">
              <button type="button" onClick={() => editing ? commit() : setEditing(true)} aria-label={editing ? t("markdown.previewFormula") : t("markdown.editFormula")} title={editing ? t("markdown.previewFormula") : t("markdown.editFormula")}>
                {editing ? <Eye /> : <PencilSimple />}<span>{editing ? t("common.preview") : t("common.edit")}</span>
              </button>
              <button type="button" className="special-delete-button" onClick={removeFormula} aria-label={t("markdown.deleteFormula")} title={t("markdown.deleteFormula")}><Trash /></button>
            </span>
          ) : null}
        </div>
        {editing ? (
          <textarea
            ref={inputRef}
            className="formula-source-editor"
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            onBlur={commit}
            onKeyDown={handleKeyDown}
            spellCheck="false"
            aria-label={t("markdown.formulaSource")}
          />
        ) : (
          <button type="button" className="formula-preview-button" onClick={() => editable && setEditing(true)} disabled={!editable} aria-label={editable ? t("markdown.editFormula") : value}>
            <FormulaPreview value={value} displayMode />
          </button>
        )}
      </div>
    );
  }

  if (editing) {
    return (
      <input
        ref={inputRef}
        className="formula-inline-editor"
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={commit}
        onKeyDown={handleKeyDown}
        spellCheck="false"
        aria-label={t("markdown.inlineFormulaSource")}
      />
    );
  }
  return (
    <span
      className={`formula-inline ${editable ? "is-editable" : ""}`}
      onClick={() => editable && setEditing(true)}
      onKeyDown={(event) => {
        if (editable && (event.key === "Enter" || event.key === " ")) {
          event.preventDefault();
          setEditing(true);
        }
      }}
      role={editable ? "button" : undefined}
      tabIndex={editable ? 0 : undefined}
      aria-label={editable ? t("markdown.editInlineFormula") : value}
    >
      <FormulaPreview value={value} displayMode={false} />
    </span>
  );
}

export class FormulaNode extends DecoratorNode {
  __value;
  __displayMode;

  static getType() {
    return "fylune-formula";
  }

  static clone(node) {
    return new FormulaNode(node.__value, node.__displayMode, node.__key);
  }

  static importJSON(serializedNode) {
    return new FormulaNode(serializedNode.value, serializedNode.displayMode);
  }

  constructor(value, displayMode, key) {
    super(key);
    this.__value = value;
    this.__displayMode = displayMode;
  }

  exportJSON() {
    return { ...super.exportJSON(), type: "fylune-formula", version: 1, value: this.__value, displayMode: this.__displayMode };
  }

  createDOM() {
    return document.createElement(this.__displayMode ? "div" : "span");
  }

  updateDOM() {
    return false;
  }

  getValue() {
    return this.__value;
  }

  setValue(value) {
    this.getWritable().__value = value;
  }

  getDisplayMode() {
    return this.__displayMode;
  }

  getTextContent() {
    return this.__value;
  }

  isInline() {
    return !this.__displayMode;
  }

  decorate(editor) {
    return <FormulaEditor value={this.__value} displayMode={this.__displayMode} nodeKey={this.getKey()} editor={editor} />;
  }
}

export function $createFormulaNode({ value, displayMode }) {
  return new FormulaNode(value, displayMode);
}

export function $isFormulaNode(node) {
  return node instanceof FormulaNode;
}

const MdastMathVisitor = {
  testNode: (node) => node.type === "math" || node.type === "inlineMath",
  visitNode({ mdastNode, actions }) {
    actions.addAndStepInto($createFormulaNode({ value: mdastNode.value, displayMode: mdastNode.type === "math" }));
  },
};

const LexicalMathVisitor = {
  testLexicalNode: $isFormulaNode,
  visitLexicalNode({ lexicalNode, actions }) {
    actions.addAndStepInto(
      lexicalNode.getDisplayMode() ? "math" : "inlineMath",
      { value: lexicalNode.getValue() },
      false,
    );
  },
};

export const specialMarkdownPlugin = realmPlugin({
  init(realm) {
    realm.pubIn({
      [addSyntaxExtension$]: math(),
      [addMdastExtension$]: mathFromMarkdown(),
      [addImportVisitor$]: MdastMathVisitor,
      [addLexicalNode$]: FormulaNode,
      [addExportVisitor$]: LexicalMathVisitor,
      [addToMarkdownExtension$]: mathToMarkdown({ singleDollarTextMath: true }),
    });
  },
});
