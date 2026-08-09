/* eslint-disable no-unused-vars -- the base ESLint config does not mark JSX references as usage */
import {
  CheckSquare,
  FileImage,
  FilePdf,
  FileVideo,
  ListBullets,
  Paperclip,
  Square,
  TreeStructure,
} from "@phosphor-icons/react";
import { useMemo } from "react";
import { useTranslation } from "react-i18next";

const attachmentExtensions = {
  image: new Set(["png", "jpg", "jpeg", "webp", "gif", "svg", "avif"]),
  video: new Set(["mp4", "m4v", "mov", "webm"]),
  pdf: new Set(["pdf"]),
};

function stripInlineMarkdown(value = "") {
  return value
    .replace(/!\[([^\]]*)\]\([^)]+\)/g, "$1")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/[*_~`]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function attachmentType(reference, imageSyntax) {
  const path = reference.split(/[?#]/, 1)[0];
  const extension = path.split(".").at(-1)?.toLowerCase() || "";
  if (imageSyntax || attachmentExtensions.image.has(extension)) return "image";
  if (attachmentExtensions.video.has(extension)) return "video";
  if (attachmentExtensions.pdf.has(extension)) return "pdf";
  return null;
}

function attachmentName(label, reference) {
  const cleanLabel = stripInlineMarkdown(label);
  if (cleanLabel) return cleanLabel;
  const cleanReference = reference.split(/[?#]/, 1)[0];
  try {
    return decodeURIComponent(cleanReference.split("/").at(-1) || reference);
  } catch {
    return cleanReference.split("/").at(-1) || reference;
  }
}

export function parseDocumentContext(source = "") {
  const headings = [];
  const tasks = [];
  const attachments = [];
  const seenAttachments = new Set();
  let fence = null;

  source.split(/\r?\n/).forEach((line, lineIndex) => {
    const fenceMatch = line.match(/^\s*(```+|~~~+)/);
    if (fenceMatch) {
      fence = fence ? null : fenceMatch[1][0];
      return;
    }
    if (fence) return;

    const heading = line.match(/^(#{1,6})\s+(.+?)\s*#*\s*$/);
    if (heading) {
      const text = stripInlineMarkdown(heading[2]);
      if (text) headings.push({ id: `heading-${lineIndex}`, level: heading[1].length, text, line: lineIndex });
    }

    const task = line.match(/^\s*[-*+]\s+\[([ xX])\]\s+(.+)$/);
    if (task) {
      const text = stripInlineMarkdown(task[2]);
      if (text) tasks.push({ id: `task-${lineIndex}`, completed: task[1].toLowerCase() === "x", text, line: lineIndex });
    }

    const markdownLink = /(!?)\[([^\]]*)\]\(\s*<?([^)\s>]+)>?(?:\s+["'][^"']*["'])?\s*\)/g;
    for (const match of line.matchAll(markdownLink)) {
      const reference = match[3];
      const type = attachmentType(reference, match[1] === "!");
      if (!type || seenAttachments.has(reference)) continue;
      seenAttachments.add(reference);
      attachments.push({
        id: `attachment-${lineIndex}-${attachments.length}`,
        type,
        text: attachmentName(match[2], reference),
        reference,
        line: lineIndex,
      });
    }
  });

  return { headings, tasks, attachments };
}

function AttachmentIcon({ type }) {
  if (type === "image") return <FileImage />;
  if (type === "video") return <FileVideo />;
  if (type === "pdf") return <FilePdf />;
  return <Paperclip />;
}

const views = [
  { id: "files", icon: TreeStructure, labelKey: "sidebar.projectFiles" },
  { id: "outline", icon: ListBullets, labelKey: "documentSidebar.outline" },
  { id: "tasks", icon: CheckSquare, labelKey: "documentSidebar.tasks" },
  { id: "attachments", icon: Paperclip, labelKey: "documentSidebar.attachments" },
];

export function DocumentContextSidebar({
  activeDocument,
  source,
  view,
  onView,
  onNavigate,
  filesPanel,
}) {
  const { t } = useTranslation();
  const context = useMemo(() => parseDocumentContext(source), [source]);
  const isMarkdownDocument = Boolean(activeDocument && /\.(?:md|markdown|mdx)$/i.test(activeDocument.path || activeDocument.name || ""));
  const activeView = isMarkdownDocument ? view : "files";

  return (
    <div className="sidebar-context">
      {isMarkdownDocument ? (
        <div className="sidebar-view-tabs" role="tablist" aria-label={t("documentSidebar.views")}>
          {views.map(({ id, icon: Icon, labelKey }) => (
            <button
              key={id}
              type="button"
              id={`sidebar-view-${id}`}
              role="tab"
              aria-selected={activeView === id}
              aria-controls={`sidebar-panel-${id}`}
              title={t(labelKey)}
              onClick={() => onView(id)}
            >
              <Icon weight={activeView === id ? "bold" : "regular"} />
              <span className="visually-hidden">{t(labelKey)}</span>
            </button>
          ))}
        </div>
      ) : null}

      {activeView === "files" ? filesPanel : (
        <section
          className="document-context-panel"
          id={`sidebar-panel-${activeView}`}
          role="tabpanel"
          aria-labelledby={`sidebar-view-${activeView}`}
        >
          <header>
            <h2>{t(`documentSidebar.${activeView}`)}</h2>
            <span>
              {activeView === "outline" ? context.headings.length : null}
              {activeView === "tasks" ? context.tasks.length : null}
              {activeView === "attachments" ? context.attachments.length : null}
            </span>
          </header>

          {activeView === "outline" ? (
            context.headings.length ? (
              <nav className="document-outline" aria-label={t("documentSidebar.outline")}>
                {context.headings.map((heading) => (
                  <button
                    key={heading.id}
                    type="button"
                    style={{ "--outline-depth": Math.max(0, heading.level - 1) }}
                    onClick={() => onNavigate({ type: "heading", ...heading })}
                  >
                    {heading.text}
                  </button>
                ))}
              </nav>
            ) : <ContextEmpty icon={<ListBullets />} title={t("documentSidebar.noOutline")} copy={t("documentSidebar.noOutlineCopy")} />
          ) : null}

          {activeView === "tasks" ? (
            context.tasks.length ? (
              <div className="document-task-list">
                {context.tasks.map((task) => (
                  <button key={task.id} type="button" onClick={() => onNavigate({ type: "task", ...task })}>
                    {task.completed ? <CheckSquare weight="fill" /> : <Square />}
                    <span className={task.completed ? "completed" : ""}>{task.text}</span>
                  </button>
                ))}
              </div>
            ) : <ContextEmpty icon={<CheckSquare />} title={t("documentSidebar.noTasks")} copy={t("documentSidebar.noTasksCopy")} />
          ) : null}

          {activeView === "attachments" ? (
            context.attachments.length ? (
              <div className="document-attachment-list">
                {context.attachments.map((attachment) => (
                  <button
                    key={attachment.id}
                    type="button"
                    onClick={() => onNavigate({ ...attachment, assetType: attachment.type, type: "attachment" })}
                  >
                    <AttachmentIcon type={attachment.type} />
                    <span><strong>{attachment.text}</strong><small>{attachment.reference}</small></span>
                  </button>
                ))}
              </div>
            ) : <ContextEmpty icon={<Paperclip />} title={t("documentSidebar.noAttachments")} copy={t("documentSidebar.noAttachmentsCopy")} />
          ) : null}
        </section>
      )}
    </div>
  );
}

function ContextEmpty({ icon, title, copy }) {
  return (
    <div className="document-context-empty">
      <span aria-hidden="true">{icon}</span>
      <strong>{title}</strong>
      <p>{copy}</p>
    </div>
  );
}
