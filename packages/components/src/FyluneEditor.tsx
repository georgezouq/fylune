"use client";

import {
  FlowArrowIcon,
  MathOperationsIcon,
  TreeStructureIcon,
} from "@phosphor-icons/react";
import type { ComponentPropsWithoutRef, KeyboardEvent } from "react";
import {
  useDeferredValue,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from "react";
import ReactMarkdown from "react-markdown";
import rehypeKatex from "rehype-katex";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import {
  DEFAULT_EDITOR_EXAMPLES,
  DEFAULT_EDITOR_MODE_LABELS,
  FYLUNE_EDITOR_MODES,
  type FyluneEditorMode,
} from "./examples";

export type FyluneEditorTheme = "inherit" | "light" | "dark";

export interface FyluneEditorLabels {
  editor: string;
  modes: string;
  source: string;
  sourceFormat: string;
  sourceHelp: string;
  sourcePlaceholder: string;
  preview: string;
  previewLoading: string;
  safety: string;
  diagramLoading: string;
  diagramErrorTitle: string;
  diagramErrorFallback: string;
  /** Template for diagram aria labels. Use {mode} where the mode name belongs. */
  diagramPreviewLabel: string;
  imageBlocked: string;
  modeLabels: Record<FyluneEditorMode, string>;
}

export interface FyluneEditorProps {
  /** Controlled Markdown value. Pair with onChange. */
  value?: string;
  /** Initial Markdown used by the uncontrolled editor. */
  defaultValue?: string;
  /** Called after every source edit. */
  onChange?: (markdown: string, mode: FyluneEditorMode) => void;
  /** Controlled active example mode. */
  mode?: FyluneEditorMode;
  /** Initial mode used when mode is uncontrolled. */
  defaultMode?: FyluneEditorMode;
  /** Called when a mode tab is activated. */
  onModeChange?: (mode: FyluneEditorMode) => void;
  /** Override one or more built-in examples. */
  examples?: Partial<Record<FyluneEditorMode, string>>;
  /** Inherit the host color scheme by default, or pin one explicitly. */
  theme?: FyluneEditorTheme;
  /** Locks source editing while keeping mode navigation and preview available. */
  readOnly?: boolean;
  /** Accessible and visible copy overrides for localization. */
  labels?: Partial<Omit<FyluneEditorLabels, "modeLabels">> & {
    modeLabels?: Partial<Record<FyluneEditorMode, string>>;
  };
  /** Optional class attached to the editor root. */
  className?: string;
  /** Optional id used as the accessible editor label target. */
  id?: string;
  /** Optional textarea name for native form submission. */
  name?: string;
  /** Minimum editor block size. CSS lengths such as 32rem are accepted. */
  minHeight?: string;
}

export interface FyluneDocumentProps {
  markdown: string;
  theme?: FyluneEditorTheme;
  labels?: Partial<
    Pick<
      FyluneEditorLabels,
      | "diagramLoading"
      | "diagramErrorTitle"
      | "diagramErrorFallback"
      | "diagramPreviewLabel"
      | "imageBlocked"
    >
  > & {
    modeLabels?: Partial<Record<FyluneEditorMode, string>>;
  };
  resolveAssetUrl?: (source: string) => string | null | undefined;
  className?: string;
  id?: string;
}

const DEFAULT_LABELS: FyluneEditorLabels = {
  editor: "Interactive Markdown editor",
  modes: "Preview examples",
  source: "Markdown source",
  sourceFormat: "MD",
  sourceHelp:
    "Edit Markdown directly. Diagrams use strict Mermaid rendering, formulas use KaTeX, and MDX or JavaScript is never executed.",
  sourcePlaceholder: "Write Markdown…",
  preview: "Safe preview",
  previewLoading: "Updating preview…",
  safety: "Safe preview",
  diagramLoading: "Rendering diagram…",
  diagramErrorTitle: "Check the diagram source.",
  diagramErrorFallback: "Diagram could not render.",
  diagramPreviewLabel: "{mode} preview",
  imageBlocked: "Image preview blocked",
  modeLabels: { ...DEFAULT_EDITOR_MODE_LABELS },
};

const MODE_ICONS = {
  flowchart: FlowArrowIcon,
  mindmap: TreeStructureIcon,
  formula: MathOperationsIcon,
} satisfies Record<FyluneEditorMode, typeof FlowArrowIcon>;

let mermaidPromise: Promise<typeof import("mermaid").default> | undefined;
let mermaidQueue: Promise<void> = Promise.resolve();

function getMermaid() {
  mermaidPromise ??= import("mermaid").then(({ default: mermaid }) => mermaid);
  return mermaidPromise;
}

function renderMermaid(
  id: string,
  source: string,
  colorScheme: "light" | "dark",
) {
  const task = mermaidQueue.then(async () => {
    const mermaid = await getMermaid();
    mermaid.initialize({
      startOnLoad: false,
      securityLevel: "strict",
      suppressErrorRendering: true,
      theme: colorScheme === "dark" ? "dark" : "neutral",
      flowchart: { htmlLabels: false, useMaxWidth: true },
      mindmap: { useMaxWidth: true },
    });
    return mermaid.render(id, source);
  });

  mermaidQueue = task.then(
    () => undefined,
    () => undefined,
  );
  return task;
}

function useResolvedColorScheme(
  rootRef: React.RefObject<HTMLDivElement | null>,
  theme: FyluneEditorTheme,
) {
  const [resolvedTheme, setResolvedTheme] = useState<"light" | "dark">(
    theme === "dark" ? "dark" : "light",
  );

  useEffect(() => {
    if (theme !== "inherit") {
      setResolvedTheme(theme);
      return;
    }

    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const resolve = () => {
      const root = rootRef.current;
      const explicitAncestor = root?.closest(
        '[data-theme="dark"], [data-theme="light"], .dark, .light',
      );
      const ancestorTheme =
        explicitAncestor?.getAttribute("data-theme") ??
        (explicitAncestor?.classList.contains("dark")
          ? "dark"
          : explicitAncestor?.classList.contains("light")
            ? "light"
            : null);
      const colorScheme = root ? getComputedStyle(root).colorScheme : "";

      if (ancestorTheme === "dark" || ancestorTheme === "light") {
        setResolvedTheme(ancestorTheme);
      } else if (colorScheme === "dark" || colorScheme === "light") {
        setResolvedTheme(colorScheme);
      } else {
        setResolvedTheme(media.matches ? "dark" : "light");
      }
    };

    resolve();
    media.addEventListener("change", resolve);
    const observer = new MutationObserver(resolve);
    let ancestor: HTMLElement | null = rootRef.current?.parentElement ?? null;
    while (ancestor) {
      observer.observe(ancestor, {
        attributes: true,
        attributeFilter: ["class", "data-theme", "style"],
      });
      ancestor = ancestor.parentElement;
    }

    return () => {
      media.removeEventListener("change", resolve);
      observer.disconnect();
    };
  }, [rootRef, theme]);

  return resolvedTheme;
}

interface MermaidPreviewProps {
  source: string;
  colorScheme: "light" | "dark";
  label: string;
  previewLabelTemplate: string;
  loadingLabel: string;
  errorTitle: string;
  errorFallback: string;
}

function MermaidPreview({
  source,
  colorScheme,
  label,
  previewLabelTemplate,
  loadingLabel,
  errorTitle,
  errorFallback,
}: MermaidPreviewProps) {
  const reactId = useId();
  const renderId = `fylune-diagram-${reactId.replaceAll(":", "")}`;
  const [result, setResult] = useState<
    | { status: "loading"; svg: ""; message: "" }
    | { status: "ready"; svg: string; message: "" }
    | { status: "error"; svg: ""; message: string }
  >({ status: "loading", svg: "", message: "" });

  useEffect(() => {
    let active = true;
    setResult({ status: "loading", svg: "", message: "" });

    void renderMermaid(renderId, source, colorScheme).then(
      ({ svg }) => {
        if (active) setResult({ status: "ready", svg, message: "" });
      },
      (error: unknown) => {
        if (!active) return;
        const message =
          error instanceof Error ? error.message : errorFallback;
        setResult({
          status: "error",
          svg: "",
          message: message.replace(/\s+/g, " ").slice(0, 180),
        });
      },
    );

    return () => {
      active = false;
    };
  }, [colorScheme, errorFallback, renderId, source]);

  if (result.status === "loading") {
    return (
      <span className="fylune-editor__diagram-status" aria-busy="true">
        <span aria-hidden="true" />
        {loadingLabel}
      </span>
    );
  }

  if (result.status === "error") {
    return (
      <span className="fylune-editor__error" role="status">
        <strong>{errorTitle}</strong>
        <span>{result.message}</span>
      </span>
    );
  }

  return (
    <span
      className="fylune-editor__diagram"
      role="img"
      aria-label={previewLabelTemplate.replace("{mode}", label)}
      // Mermaid runs in strict security mode and returns its sanitized SVG.
      dangerouslySetInnerHTML={{ __html: result.svg }}
    />
  );
}

function SafeImage({
  alt,
  fallbackLabel,
  source,
}: Pick<ComponentPropsWithoutRef<"img">, "alt"> & {
  fallbackLabel: string;
  source?: string | null;
}) {
  if (source) {
    return <img src={source} alt={alt ?? ""} loading="lazy" decoding="async" />;
  }
  return (
    <span
      className="fylune-editor__blocked-image"
      role="img"
      aria-label={alt || fallbackLabel}
    >
      <span aria-hidden="true">▧</span>
      {alt || fallbackLabel}
    </span>
  );
}

interface MarkdownPreviewProps {
  markdown: string;
  colorScheme: "light" | "dark";
  modeLabel: string;
  labels: Pick<
    FyluneEditorLabels,
    | "diagramLoading"
    | "diagramErrorTitle"
    | "diagramErrorFallback"
    | "diagramPreviewLabel"
    | "imageBlocked"
    | "modeLabels"
  >;
  resolveAssetUrl?: (source: string) => string | null | undefined;
}

function MarkdownPreview({
  markdown,
  colorScheme,
  modeLabel,
  labels,
  resolveAssetUrl,
}: MarkdownPreviewProps) {
  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm, remarkMath]}
      rehypePlugins={[[rehypeKatex, { strict: "warn", trust: false }]]}
      components={{
        a: ({ children, ...props }) => (
          <a {...props} rel="noreferrer noopener">
            {children}
          </a>
        ),
        code: ({ className, children, ...props }) => {
          const language =
            /language-([a-z0-9_-]+)/i.exec(className ?? "")?.[1]?.toLowerCase() ??
            "";
          const source = String(children).replace(/\n$/, "");

          if (language === "mermaid" || language === "mindmap") {
            const diagramModeLabel =
              language === "mindmap" || /^mindmap\b/i.test(source)
                ? labels.modeLabels.mindmap
                : labels.modeLabels.flowchart;
            return (
              <MermaidPreview
                source={source}
                colorScheme={colorScheme}
                label={diagramModeLabel || modeLabel}
                previewLabelTemplate={labels.diagramPreviewLabel}
                loadingLabel={labels.diagramLoading}
                errorTitle={labels.diagramErrorTitle}
                errorFallback={labels.diagramErrorFallback}
              />
            );
          }

          return (
            <code className={className} {...props}>
              {children}
            </code>
          );
        },
        img: ({ alt, src }) => (
          <SafeImage
            alt={alt ?? ""}
            source={typeof src === "string" ? resolveAssetUrl?.(src) : null}
            fallbackLabel={labels.imageBlocked}
          />
        ),
      }}
    >
      {markdown}
    </ReactMarkdown>
  );
}

export function FyluneDocument({
  markdown,
  theme = "inherit",
  labels,
  resolveAssetUrl,
  className,
  id,
}: FyluneDocumentProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const resolvedTheme = useResolvedColorScheme(rootRef, theme);
  const copy = useMemo(() => mergeLabels(labels), [labels]);

  return (
    <div
      ref={rootRef}
      id={id}
      className={["fylune-document", className].filter(Boolean).join(" ")}
      data-fylune-theme={theme === "inherit" ? undefined : theme}
    >
      <article className="fylune-document__content">
        <MarkdownPreview
          markdown={markdown}
          colorScheme={resolvedTheme}
          modeLabel={copy.modeLabels.flowchart}
          labels={copy}
          resolveAssetUrl={resolveAssetUrl}
        />
      </article>
    </div>
  );
}

function mergeLabels(
  labels: FyluneEditorProps["labels"],
): FyluneEditorLabels {
  return {
    ...DEFAULT_LABELS,
    ...labels,
    modeLabels: {
      ...DEFAULT_LABELS.modeLabels,
      ...labels?.modeLabels,
    },
  };
}

export function FyluneEditor({
  value,
  defaultValue,
  onChange,
  mode,
  defaultMode = "flowchart",
  onModeChange,
  examples,
  theme = "inherit",
  readOnly = false,
  labels,
  className,
  id,
  name,
  minHeight = "32rem",
}: FyluneEditorProps) {
  const generatedId = useId();
  const editorId = id ?? `fylune-editor-${generatedId.replaceAll(":", "")}`;
  const sourceId = `${editorId}-source`;
  const sourceHelpId = `${editorId}-source-help`;
  const previewId = `${editorId}-preview`;
  const rootRef = useRef<HTMLDivElement>(null);
  const tabRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const isValueControlled = value !== undefined;
  const isModeControlled = mode !== undefined;
  const initialExamples = useMemo(
    () => ({ ...DEFAULT_EDITOR_EXAMPLES, ...examples }),
    [examples],
  );
  const [internalMode, setInternalMode] =
    useState<FyluneEditorMode>(defaultMode);
  const activeMode = mode ?? internalMode;
  const [drafts, setDrafts] = useState<Record<FyluneEditorMode, string>>(() => ({
    ...initialExamples,
    [mode ?? defaultMode]:
      defaultValue ?? initialExamples[mode ?? defaultMode],
  }));
  const markdown = value ?? drafts[activeMode];
  const deferredMarkdown = useDeferredValue(markdown);
  const resolvedTheme = useResolvedColorScheme(rootRef, theme);
  const copy = useMemo(() => mergeLabels(labels), [labels]);

  useEffect(() => {
    if (examples && !isValueControlled) {
      setDrafts((current) => {
        const next = { ...current };
        for (const itemMode of FYLUNE_EDITOR_MODES) {
          if (examples[itemMode] !== undefined) {
            next[itemMode] = examples[itemMode];
          }
        }
        return next;
      });
    }
  }, [examples, isValueControlled]);

  const setMode = (nextMode: FyluneEditorMode) => {
    if (!isModeControlled) setInternalMode(nextMode);
    onModeChange?.(nextMode);
  };

  const handleSourceChange = (nextValue: string) => {
    if (!isValueControlled) {
      setDrafts((current) => ({ ...current, [activeMode]: nextValue }));
    }
    onChange?.(nextValue, activeMode);
  };

  const handleTabKeyDown = (
    event: KeyboardEvent<HTMLButtonElement>,
    index: number,
  ) => {
    let nextIndex: number | null = null;
    if (event.key === "ArrowRight" || event.key === "ArrowDown") {
      nextIndex = (index + 1) % FYLUNE_EDITOR_MODES.length;
    } else if (event.key === "ArrowLeft" || event.key === "ArrowUp") {
      nextIndex =
        (index - 1 + FYLUNE_EDITOR_MODES.length) %
        FYLUNE_EDITOR_MODES.length;
    } else if (event.key === "Home") {
      nextIndex = 0;
    } else if (event.key === "End") {
      nextIndex = FYLUNE_EDITOR_MODES.length - 1;
    }

    if (nextIndex === null) return;
    event.preventDefault();
    setMode(FYLUNE_EDITOR_MODES[nextIndex]);
    tabRefs.current[nextIndex]?.focus();
  };

  return (
    <div
      ref={rootRef}
      id={editorId}
      className={["fylune-editor", className].filter(Boolean).join(" ")}
      data-fylune-theme={theme === "inherit" ? undefined : theme}
      role="group"
      aria-label={copy.editor}
      style={{ "--fylune-editor-min-height": minHeight } as React.CSSProperties}
    >
      <header className="fylune-editor__toolbar">
        <div
          className="fylune-editor__tabs"
          role="tablist"
          aria-label={copy.modes}
        >
          {FYLUNE_EDITOR_MODES.map((itemMode, index) => {
            const Icon = MODE_ICONS[itemMode];
            const isActive = itemMode === activeMode;
            return (
              <button
                key={itemMode}
                ref={(element) => {
                  tabRefs.current[index] = element;
                }}
                type="button"
                role="tab"
                id={`${editorId}-tab-${itemMode}`}
                aria-selected={isActive}
                aria-controls={previewId}
                tabIndex={isActive ? 0 : -1}
                onClick={() => setMode(itemMode)}
                onKeyDown={(event) => handleTabKeyDown(event, index)}
              >
                <Icon aria-hidden="true" weight={isActive ? "bold" : "regular"} />
                <span>{copy.modeLabels[itemMode]}</span>
              </button>
            );
          })}
        </div>
        <span className="fylune-editor__safety">
          <span aria-hidden="true" />
          {copy.safety}
        </span>
      </header>

      <div className="fylune-editor__workspace">
        <section className="fylune-editor__source-panel">
          <div className="fylune-editor__panel-heading">
            <label htmlFor={sourceId}>{copy.source}</label>
            <span>{copy.sourceFormat}</span>
          </div>
          <textarea
            id={sourceId}
            name={name}
            value={markdown}
            readOnly={readOnly}
            spellCheck
            aria-describedby={sourceHelpId}
            placeholder={copy.sourcePlaceholder}
            onChange={(event) => handleSourceChange(event.currentTarget.value)}
          />
          <p id={sourceHelpId} className="fylune-editor__source-help">
            {copy.sourceHelp}
          </p>
        </section>

        <section
          id={previewId}
          className="fylune-editor__preview-panel"
          role="tabpanel"
          aria-labelledby={`${editorId}-tab-${activeMode}`}
          aria-busy={deferredMarkdown !== markdown}
        >
          <div className="fylune-editor__panel-heading">
            <span>{copy.preview}</span>
            {deferredMarkdown !== markdown ? (
              <span className="fylune-editor__updating">
                {copy.previewLoading}
              </span>
            ) : (
              <span>{copy.modeLabels[activeMode]}</span>
            )}
          </div>
          <article className="fylune-editor__document">
            <MarkdownPreview
              markdown={deferredMarkdown}
              colorScheme={resolvedTheme}
              modeLabel={copy.modeLabels[activeMode]}
              labels={copy}
            />
          </article>
        </section>
      </div>
    </div>
  );
}
