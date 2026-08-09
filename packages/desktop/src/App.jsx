/* eslint-disable no-unused-vars -- the base ESLint config does not mark JSX references as usage */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import {
  mergeDocumentVersions,
  resolveDocumentMerge,
  waitForDocumentQuiet,
} from "@fylune/document-collaboration";
import { FyluneDocument } from "@fylune/components";
import {
  BlockTypeSelect,
  BoldItalicUnderlineToggles,
  codeBlockPlugin,
  codeMirrorPlugin,
  CodeToggle,
  CreateLink,
  headingsPlugin,
  imagePlugin,
  jsxPlugin,
  linkDialogPlugin,
  linkPlugin,
  ListsToggle,
  listsPlugin,
  markdownShortcutPlugin,
  MDXEditor,
  quotePlugin,
  searchPlugin,
  tablePlugin,
  thematicBreakPlugin,
  toolbarPlugin,
  UndoRedo,
} from "@mdxeditor/editor";
import "@mdxeditor/editor/style.css";
import {
  ArrowCounterClockwise,
  ArrowLeft,
  ArrowLineLeft,
  ArrowLineRight,
  ArrowRight,
  ArrowsClockwise,
  CaretDown,
  CaretRight,
  Check,
  CheckCircle,
  ClockCounterClockwise,
  Copy,
  CornersIn,
  DotsThree,
  Eye,
  File,
  FileDoc,
  FileImage,
  FilePdf,
  FilePpt,
  FileText,
  FileXls,
  Folder,
  FolderOpen,
  FlowArrow,
  GearSix,
  GridFour,
  House,
  Image as ImageIcon,
  MagnifyingGlass,
  MagnifyingGlassMinus,
  MagnifyingGlassPlus,
  MathOperations,
  Minus,
  Moon,
  PencilSimple,
  Plus,
  PresentationChart,
  Pulse,
  Rows,
  SidebarSimple,
  SignIn,
  Smiley,
  Star,
  StackMinus,
  Sun,
  TerminalWindow,
  Trash,
  TreeStructure,
  Video,
  WarningCircle,
  X,
} from "@phosphor-icons/react";
import {
  demoDocuments,
  demoMarkdown,
  demoProject,
  demoSnapshots,
  externalChanges,
} from "./demoData.js";
import {
  hasWorkspaceResourceDrag,
  readWorkspaceResourceDrag,
  writeWorkspaceResourceDrag,
} from "./agentComposer.js";
import { AssetPreview } from "./AssetPreview.jsx";
import { fyluneCodeMirrorTheme } from "./codeMirrorTheme.js";
import { ContentSurface } from "./ContentSurface.jsx";
import { IconButton } from "./design-system/index.js";
import { DocumentCardPreview, parseDocumentPreview } from "./DocumentCardPreview.jsx";
import { DocumentContextSidebar } from "./DocumentContextSidebar.jsx";
import { DocumentImageToolbar } from "./DocumentImageToolbar.jsx";
import { RowOrderedMasonry } from "./RowOrderedMasonry.jsx";
import { documentSearchUiPlugin } from "./DocumentSearch.jsx";
import { countDocumentWords } from "./documentWordCount.js";
import { workspaceResourceMarkdown } from "./documentResourceDrop.js";
import { editorCollaborationPlugin } from "./editorCollaboration.js";
import {
  appendChangeActivity,
  readChangeActivity,
  updateChangeActivity,
} from "./changeActivity.js";
import {
  removeIntegratedPreview,
  resumeIntegratedPreviews,
  stripIntegratedPreviews,
  suspendIntegratedPreviews,
  updateIntegratedPreviewUnderlying,
  upsertIntegratedPreview,
} from "./integratedPreviewState.js";
import { shouldStageExternalReview } from "./externalChangePolicy.js";
import { formatJsonDocument, validateJsonDocument } from "./jsonDocument.js";
import { JsonCodeEditor } from "./JsonEditor.jsx";
import { FirstRunOnboarding } from "./FirstRunOnboarding.jsx";
import { flattenWorkspaceItems, getFyluneBridge } from "./fyluneBridge.js";
import { SidebarUpdateButton, SoftwareUpdateSection } from "./SoftwareUpdateSection.jsx";
import { useProgressiveItems } from "./progressiveItems.js";
import { specialCodeBlockEditorDescriptors, specialMarkdownPlugin } from "./SpecialMarkdown.jsx";
import { useDismissibleLayer } from "./useDismissibleLayer.js";
import { WelcomeLoginModal } from "./WelcomeLoginModal.jsx";
import { documentIconFromFrontmatter, serializeDocumentFrontmatter, splitDocumentFrontmatter } from "../electron/lib/document-metadata.mjs";
import { changeAppLocale, supportedLocales } from "./i18n/index.js";
import fyluneIcon from "../build/icon.png";

const bridge = getFyluneBridge();
const documentLibraryStateKey = "fylune-document-library-state";
const workspaceNavigationStateKey = "fylune-workspace-navigation-state";
const workspaceRootStateKey = "fylune-workspace-root-state";
const welcomeAuthCompletedKey = "fylune-welcome-auth-completed";
const minimumPresentationZoom = 80;
const maximumPresentationZoom = 200;
const launchParameters = typeof window === "undefined" ? new URLSearchParams() : new URLSearchParams(window.location.search);
const isOnboardingWindow = !bridge.isDemo && launchParameters.has("onboardingWindow");
const isPostOnboardingWindow = !bridge.isDemo && launchParameters.has("postOnboarding");
const previewFirstRun = Boolean(
  bridge.isDemo
  && launchParameters.has("onboarding"),
);

function clampPresentationZoom(zoom) {
  return Math.min(maximumPresentationZoom, Math.max(minimumPresentationZoom, zoom));
}

function readDocumentLibraryState() {
  try {
    const stored = window.localStorage?.getItem(documentLibraryStateKey);
    const parsed = stored ? JSON.parse(stored) : {};
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

function readWorkspaceNavigationState() {
  try {
    const stored = window.localStorage?.getItem(workspaceNavigationStateKey);
    const parsed = stored ? JSON.parse(stored) : {};
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

function readWorkspaceRootState() {
  try {
    const stored = window.localStorage?.getItem(workspaceRootStateKey);
    const parsed = stored ? JSON.parse(stored) : {};
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

function projectLibraryKey(project) {
  return project?.path || project?.id || "current-project";
}

function collectWorkspaceFolderIds(items, { expandedOnly = false } = {}, parentPath = "", output = []) {
  for (const item of items || []) {
    if (item.type !== "folder") continue;
    const itemPath = workspaceTreePath(item, parentPath);
    const itemId = item.id || itemPath;
    if (!expandedOnly || item.expanded) output.push(itemId);
    if (item.children) collectWorkspaceFolderIds(item.children, { expandedOnly }, itemPath, output);
  }
  return output;
}

function expandedFolderIdsForProject(project, navigationState) {
  const knownFolderIds = new Set(collectWorkspaceFolderIds(project?.tree));
  const cachedFolderIds = navigationState?.[projectLibraryKey(project)];
  if (Array.isArray(cachedFolderIds)) {
    return new Set(cachedFolderIds.filter((id) => knownFolderIds.has(id)));
  }
  return new Set(collectWorkspaceFolderIds(project?.tree, { expandedOnly: true }));
}

function documentLibraryKey(document) {
  return (document?.path || document?.id || "").replaceAll(" / ", "/");
}

function EmbeddedStructuredBlock({ mdastNode }) {
  const { t } = useTranslation();
  const attributes = Object.fromEntries((mdastNode.attributes || []).filter((attribute) => attribute.type === "mdxJsxAttribute").map((attribute) => [attribute.name, attribute.value]));
  return (
    <div className="embedded-structured-block">
      <strong>{mdastNode.name}</strong>
      <span>{Object.entries(attributes).map(([key, value]) => `${key}: ${value}`).join(" · ")}</span>
      <small>{t("blocks.structuredMdx")}</small>
    </div>
  );
}

const structuredDescriptors = ["Decision", "Experiment", "Brief"].map((name) => ({
  name,
  kind: "flow",
  props: ["status", "owner", "date", "measure", "target", "audience", "platform", "window"].map((property) => ({ name: property, type: "string" })),
  hasChildren: true,
  Editor: EmbeddedStructuredBlock,
}));

const baseEditorPlugins = [
  headingsPlugin(),
  listsPlugin(),
  quotePlugin(),
  thematicBreakPlugin(),
  linkPlugin(),
  linkDialogPlugin(),
  tablePlugin(),
  codeBlockPlugin({ defaultCodeBlockLanguage: "text", codeBlockEditorDescriptors: specialCodeBlockEditorDescriptors }),
  codeMirrorPlugin({
    codeBlockLanguages: { text: "Plain text", js: "JavaScript", ts: "TypeScript", json: "JSON", mdx: "MDX" },
    codeMirrorExtensions: [fyluneCodeMirrorTheme],
  }),
  jsxPlugin({ jsxComponentDescriptors: structuredDescriptors, allowFragment: true }),
  specialMarkdownPlugin(),
  searchPlugin(),
  documentSearchUiPlugin(),
  markdownShortcutPlugin(),
];

const slashCommands = [
  { id: "text", mark: "T", label: "Text", detail: "Continue with a paragraph", markdown: "Text" },
  { id: "heading", mark: "H2", label: "Heading", detail: "Start a new section", markdown: "## Heading" },
  { id: "todo", mark: "✓", label: "To-do", detail: "Track something to finish", markdown: "- [ ] To-do" },
  { id: "bullet", mark: "•", label: "Bullet list", detail: "Create a simple list", markdown: "- List item" },
  { id: "quote", mark: "\u201c", label: "Quote", detail: "Emphasize a passage", markdown: "> Quote" },
  { id: "divider", mark: "\u2014", label: "Divider", detail: "Separate two ideas", markdown: "---" },
  { id: "flowchart", mark: "→", label: "Flowchart", detail: "Map a process with Mermaid", markdown: "```mermaid\nflowchart LR\n  A[Start] --> B[Finish]\n```" },
  { id: "mindmap", mark: "◎", label: "Mind map", detail: "Organize connected ideas", markdown: "```mermaid\nmindmap\n  root((Main idea))\n    Topic A\n    Topic B\n```" },
  { id: "formula", mark: "ƒ", label: "Formula", detail: "Write a KaTeX equation", markdown: "$$\nE = mc^2\n$$" },
];

const documentIconOptions = [
  ["😀", "Grinning face"], ["😊", "Smiling face"], ["🥳", "Celebration"], ["🤩", "Inspired"],
  ["🧠", "Brain"], ["💡", "Idea"], ["🎯", "Target"], ["🚀", "Rocket"],
  ["✨", "Sparkles"], ["⭐", "Star"], ["🔥", "Fire"], ["🌱", "Seedling"],
  ["🌿", "Leaf"], ["🌙", "Moon"], ["☀️", "Sun"], ["🌈", "Rainbow"],
  ["📝", "Memo"], ["📌", "Pin"], ["📚", "Books"], ["🗂️", "Files"],
  ["📅", "Calendar"], ["📊", "Chart"], ["🔍", "Research"], ["🧪", "Experiment"],
  ["🧭", "Compass"], ["🗺️", "Map"], ["🏗️", "Building"], ["🛠️", "Tools"],
  ["⚙️", "Settings"], ["🔒", "Private"], ["✅", "Complete"], ["⚡", "Fast"],
  ["❤️", "Heart"], ["💬", "Conversation"], ["👥", "People"], ["🤝", "Partnership"],
  ["🎨", "Design"], ["🎬", "Video"], ["🎵", "Music"], ["📷", "Camera"],
  ["💻", "Computer"], ["📱", "Mobile"], ["☁️", "Cloud"], ["🌐", "Web"],
].map(([value, label]) => ({ value, label }));

function splitDocumentSource(source, fallbackTitle) {
  const normalized = typeof source === "string"
    ? source
    : demoMarkdown.replace("# Product brief", `# ${fallbackTitle || "Untitled document"}`);
  const { frontmatter, content } = splitDocumentFrontmatter(normalized);
  const lines = content.split("\n");
  const headingIndex = lines.findIndex((line) => /^#\s+/.test(line));
  if (headingIndex === -1) return {
    title: fallbackTitle || "Untitled document",
    body: content,
    icon: documentIconFromFrontmatter(frontmatter),
    frontmatter,
  };
  const title = lines[headingIndex].replace(/^#\s+/, "").trim() || fallbackTitle || "Untitled document";
  lines.splice(headingIndex, 1);
  return {
    title,
    body: lines.join("\n").replace(/^\s+/, ""),
    icon: documentIconFromFrontmatter(frontmatter),
    frontmatter,
  };
}

function insertMarkdownBlock(markdown, insertion, blockIndex) {
  const blocks = [];
  let current = [];
  let fence = null;
  for (const line of (markdown || "").replace(/\r\n/g, "\n").trim().split("\n")) {
    const fenceMatch = line.match(/^\s*(`{3,}|~{3,})/);
    if (fenceMatch) {
      const marker = fenceMatch[1][0];
      if (!fence) fence = marker;
      else if (fence === marker) fence = null;
    }
    if (!fence && !line.trim()) {
      if (current.length) {
        blocks.push(current.join("\n").trimEnd());
        current = [];
      }
      continue;
    }
    current.push(line);
  }
  if (current.length) blocks.push(current.join("\n").trimEnd());
  const index = Math.max(0, Math.min(Number.isInteger(blockIndex) ? blockIndex : blocks.length, blocks.length));
  blocks.splice(index, 0, insertion.trim());
  return `${blocks.filter(Boolean).join("\n\n")}\n`;
}

function withImportedAssets(tree, imported) {
  if (!imported?.length) return tree;
  const nextTree = tree.map((item) => ({ ...item, children: item.children ? [...item.children] : item.children }));
  let assetsFolder = nextTree.find((item) => item.type === "folder" && (item.path || item.name).toLowerCase() === "assets");
  if (!assetsFolder) {
    assetsFolder = { id: "assets", name: "assets", path: "assets", type: "folder", children: [] };
    nextTree.push(assetsFolder);
  }
  assetsFolder.children ||= [];
  const knownPaths = new Set(assetsFolder.children.map((item) => item.path));
  for (const asset of imported) {
    if (knownPaths.has(asset.path)) continue;
    assetsFolder.children.push({ ...asset, id: asset.path, type: asset.kind, title: asset.name });
    knownPaths.add(asset.path);
  }
  return nextTree;
}

function workspaceTreePath(item, parentPath = "") {
  return item.path || (parentPath ? `${parentPath}/${item.name}` : item.name);
}

function workspaceParentPath(itemPath = "") {
  const normalized = itemPath.replaceAll(" / ", "/");
  const separatorIndex = normalized.lastIndexOf("/");
  return separatorIndex >= 0 ? normalized.slice(0, separatorIndex) : "";
}

function workspaceFileName(itemPath = "") {
  return itemPath
    .replaceAll(" / ", "/")
    .replaceAll("\\", "/")
    .split("/")
    .at(-1) || itemPath;
}

function workspaceFileType(item, itemPath) {
  if (item.type && item.type !== "file") return item.type;
  const extension = itemPath.split(".").at(-1)?.toLowerCase();
  if (new Set(["md", "mdx"]).has(extension)) return "document";
  if (new Set(["png", "jpg", "jpeg", "webp", "gif"]).has(extension)) return "image";
  if (new Set(["mp4", "m4v", "mov", "webm"]).has(extension)) return "video";
  if (extension === "pdf") return "pdf";
  if (new Set(["docx", "doc"]).has(extension)) return "word";
  if (new Set(["xlsx", "xls"]).has(extension)) return "excel";
  if (new Set(["pptx", "ppt"]).has(extension)) return "powerpoint";
  return "file";
}

function workspacePeekMeta(item, t) {
  if (workspaceFileType(item, item.name) === "folder") {
    return t("library.itemCount", { count: item.children?.length || 0 });
  }
  const extensionIndex = item.name.lastIndexOf(".");
  if (extensionIndex > 0 && extensionIndex < item.name.length - 1) {
    return item.name.slice(extensionIndex + 1).toUpperCase();
  }
  return t("library.file");
}

function findWorkspaceTreeItem(items, targetPath, parentPath = "") {
  if (!targetPath) return null;
  for (const item of items) {
    const itemPath = workspaceTreePath(item, parentPath);
    if (itemPath === targetPath) return { ...item, path: itemPath };
    if (item.children) {
      const match = findWorkspaceTreeItem(item.children, targetPath, itemPath);
      if (match) return match;
    }
  }
  return null;
}

function workspaceFolderContents(items, targetPath, documents, parentPath = "") {
  const mapChildren = (children, directoryPath) => (children || []).map((child) => {
    const childPath = workspaceTreePath(child, directoryPath);
    if (child.type === "folder") {
      return {
        ...child,
        id: child.id || childPath,
        path: childPath,
        type: "folder",
        itemCount: Number.isFinite(child.itemCount)
          ? child.itemCount
          : child.loaded === false && !Array.isArray(child.children)
            ? null
            : child.children?.length || 0,
      };
    }
    const type = workspaceFileType(child, childPath);
    const document = type === "document"
      ? documents.find((candidate) => (
        candidate.id === child.id
        || candidate.path.replaceAll(" / ", "/") === childPath
      ))
      : null;
    return {
      ...child,
      ...document,
      id: child.id || document?.id || childPath,
      name: child.name || childPath.split("/").at(-1),
      title: document?.title || child.title || child.name || childPath.split("/").at(-1),
      path: childPath,
      type,
    };
  });
  if (!targetPath) return mapChildren(items, "");
  for (const item of items) {
    const itemPath = workspaceTreePath(item, parentPath);
    if (item.type === "folder" && itemPath === targetPath) {
      return mapChildren(item.children, itemPath);
    }
    if (item.type === "folder" && item.children) {
      const match = workspaceFolderContents(item.children, targetPath, documents, itemPath);
      if (match.length || targetPath === itemPath) return match;
    }
  }
  return [];
}

function documentsFromWorkspaceTree(tree) {
  return flattenWorkspaceItems(tree)
    .filter((item) => item.type === "document")
    .map((item) => ({
      ...item,
      id: item.id || item.path,
      title: item.title || workspaceTitleFromName(item.name || workspaceFileName(item.path)),
      path: item.path,
      modified: item.modified || "Recently",
      starred: false,
      kind: item.kind || "brief",
      words: item.words || 0,
    }));
}

function mergeWorkspaceChildren(currentItems = [], scannedItems = [], parentPath = "") {
  const currentByPath = new Map(currentItems.map((item) => [workspaceTreePath(item, parentPath), item]));
  return scannedItems.map((item) => {
    const itemPath = workspaceTreePath(item, parentPath);
    const current = currentByPath.get(itemPath);
    if (item.type !== "folder" || !current || current.type !== "folder") return item;
    const currentLoaded = current.loaded === true || Array.isArray(current.children);
    const scannedLoaded = item.loaded === true || Array.isArray(item.children);
    if (currentLoaded && !scannedLoaded) {
      return { ...item, loaded: true, children: current.children || [] };
    }
    if (currentLoaded && scannedLoaded) {
      return {
        ...item,
        loaded: true,
        children: mergeWorkspaceChildren(current.children, item.children, itemPath),
      };
    }
    return item;
  });
}

function mergeWorkspaceFolder(items, targetPath, scannedFolder, parentPath = "") {
  if (!targetPath) return mergeWorkspaceChildren(items, scannedFolder?.children || [], "");
  return items.map((item) => {
    const itemPath = workspaceTreePath(item, parentPath);
    if (item.type === "folder" && itemPath === targetPath) {
      return {
        ...item,
        ...scannedFolder,
        id: item.id || scannedFolder?.id || itemPath,
        path: itemPath,
        type: "folder",
        loaded: true,
        children: mergeWorkspaceChildren(item.children, scannedFolder?.children || [], itemPath),
      };
    }
    return item.children
      ? { ...item, children: mergeWorkspaceFolder(item.children, targetPath, scannedFolder, itemPath) }
      : item;
  });
}

function collectWorkspaceTreePaths(items, parentPath = "", paths = new Set()) {
  for (const item of items) {
    const itemPath = workspaceTreePath(item, parentPath);
    paths.add(itemPath.toLowerCase());
    if (item.children) collectWorkspaceTreePaths(item.children, itemPath, paths);
  }
  return paths;
}

function nextUntitledDocumentPath(items, directoryPath = "") {
  const existingPaths = collectWorkspaceTreePaths(items);
  let index = 1;
  while (true) {
    const name = index === 1 ? "Untitled document.mdx" : `Untitled document ${index}.mdx`;
    const candidate = directoryPath ? `${directoryPath}/${name}` : name;
    if (!existingPaths.has(candidate.toLowerCase())) return candidate;
    index += 1;
  }
}

function insertWorkspaceTreeDocument(items, document, directoryPath = "", parentPath = "") {
  const fileItem = {
    id: document.id,
    name: document.path.split("/").at(-1),
    path: document.path,
    type: "document",
    mtimeMs: document.mtimeMs,
    icon: document.icon || null,
  };
  if (!directoryPath) return [...items, fileItem];
  return items.map((item) => {
    const itemPath = workspaceTreePath(item, parentPath);
    if (item.type === "folder" && itemPath === directoryPath) {
      return { ...item, children: [...(item.children || []), fileItem] };
    }
    return item.children
      ? { ...item, children: insertWorkspaceTreeDocument(item.children, document, directoryPath, itemPath) }
      : item;
  });
}

function workspaceFolderLineage(items, directoryPath, parentPath = "") {
  if (!directoryPath) return [];
  for (const item of items) {
    if (item.type !== "folder") continue;
    const itemPath = workspaceTreePath(item, parentPath);
    if (itemPath === directoryPath) return [item.id];
    if (directoryPath.startsWith(`${itemPath}/`) && item.children) {
      const descendants = workspaceFolderLineage(item.children, directoryPath, itemPath);
      if (descendants.length) return [item.id, ...descendants];
    }
  }
  return [];
}

function workspaceFolderBreadcrumbs(items, directoryPath, parentPath = "", ancestors = []) {
  if (!directoryPath) return [];
  for (const item of items) {
    if (item.type !== "folder") continue;
    const itemPath = workspaceTreePath(item, parentPath);
    const breadcrumbs = [
      ...ancestors,
      { ...item, id: item.id || itemPath, path: itemPath },
    ];
    if (itemPath === directoryPath) return breadcrumbs;
    if (directoryPath.startsWith(`${itemPath}/`) && item.children) {
      const descendants = workspaceFolderBreadcrumbs(item.children, directoryPath, itemPath, breadcrumbs);
      if (descendants.length) return descendants;
    }
  }
  return [];
}

function renameWorkspaceTreeItem(items, target, parentPath = "") {
  return items.map((item) => {
    const itemPath = workspaceTreePath(item, parentPath);
    if (item.id === target.id || itemPath === target.path) {
      const remapBranch = (branch, branchPath) => {
        const nextPath = branchPath === target.path
          ? target.nextPath
          : `${target.nextPath}${branchPath.slice(target.path.length)}`;
        return {
          ...branch,
          id: nextPath,
          path: nextPath,
          ...(branchPath === target.path ? { name: target.name, mtimeMs: target.mtimeMs } : {}),
          children: branch.children?.map((child) => (
            remapBranch(child, workspaceTreePath(child, branchPath))
          )),
        };
      };
      return remapBranch(item, itemPath);
    }
    return item.children
      ? { ...item, children: renameWorkspaceTreeItem(item.children, target, itemPath) }
      : item;
  });
}

function remapWorkspacePath(candidate, previousPath, nextPath) {
  if (candidate === previousPath) return nextPath;
  return candidate?.startsWith(`${previousPath}/`)
    ? `${nextPath}${candidate.slice(previousPath.length)}`
    : candidate;
}

function remapRecordPathKeys(record, previousPath, nextPath) {
  return Object.fromEntries(Object.entries(record).map(([key, value]) => [
    remapWorkspacePath(key, previousPath, nextPath),
    value,
  ]));
}

function duplicateWorkspaceTreeItem(items, target, parentPath = "") {
  return items.flatMap((item) => {
    const itemPath = workspaceTreePath(item, parentPath);
    const nextItem = item.children
      ? { ...item, children: duplicateWorkspaceTreeItem(item.children, target, itemPath) }
      : item;
    if (item.id !== target.id && itemPath !== target.path) return [nextItem];
    const duplicateBranch = (branch, branchPath) => {
      const nextPath = branchPath === target.path
        ? target.nextPath
        : `${target.nextPath}${branchPath.slice(target.path.length)}`;
      return {
        ...branch,
        id: nextPath,
        path: nextPath,
        ...(branchPath === target.path ? { name: target.name, mtimeMs: target.mtimeMs } : {}),
        children: branch.children?.map((child) => (
          duplicateBranch(child, workspaceTreePath(child, branchPath))
        )),
      };
    };
    return [
      nextItem,
      duplicateBranch(item, itemPath),
    ];
  });
}

function deleteWorkspaceTreeItem(items, target, parentPath = "") {
  return items.flatMap((item) => {
    const itemPath = workspaceTreePath(item, parentPath);
    if (item.id === target.id || itemPath === target.path) return [];
    return [item.children
      ? { ...item, children: deleteWorkspaceTreeItem(item.children, target, itemPath) }
      : item];
  });
}

function updateWorkspaceTreeItemIcon(items, target, icon, parentPath = "") {
  return items.map((item) => {
    const itemPath = workspaceTreePath(item, parentPath);
    if (item.id === target.id || itemPath === target.path) return { ...item, icon: icon || null };
    return item.children
      ? { ...item, children: updateWorkspaceTreeItemIcon(item.children, target, icon, itemPath) }
      : item;
  });
}

function workspaceTitleFromName(name) {
  return name.replace(/\.(?:md|markdown|mdx|json|jsonl)$/i, "");
}

function remapRecordKey(record, previousKey, nextKey) {
  if (!Object.prototype.hasOwnProperty.call(record, previousKey)) return record;
  const { [previousKey]: value, ...remaining } = record;
  return { ...remaining, [nextKey]: value };
}

function removeRecordKey(record, key) {
  if (!Object.prototype.hasOwnProperty.call(record, key)) return record;
  const next = { ...record };
  delete next[key];
  return next;
}

function removeRecordKeys(record, keys) {
  let next = record;
  for (const key of keys) next = removeRecordKey(next, key);
  return next;
}

function workspacePathContains(parentPath, candidatePath) {
  const parent = parentPath?.replaceAll(" / ", "/");
  const candidate = candidatePath?.replaceAll(" / ", "/");
  return Boolean(parent && candidate && (candidate === parent || candidate.startsWith(`${parent}/`)));
}

function structuredBlockSource(type) {
  const sources = {
    Decision: '<Decision status="Accepted" owner="Product" date="2026-07-22">\nKeep local files as the source of truth.\n</Decision>',
    Experiment: '<Experiment status="Running" measure="Review completion" target="Under 90 seconds">\nObserve whether external changes are easy to resolve.\n</Experiment>',
    Brief: '<Brief audience="Product teams" platform="macOS" window="6-8 weeks">\nShip the smallest trustworthy local editing loop.\n</Brief>',
  };
  return sources[type];
}

function WorkspaceFileIcon({ type, icon }) {
  if (icon && !new Set(["image", "video", "pdf", "word", "excel", "powerpoint"]).has(type)) {
    return <span className="workspace-document-icon" data-testid="document-icon" aria-hidden="true">{icon}</span>;
  }
  if (type === "folder") return <Folder />;
  if (type === "image") return <FileImage />;
  if (type === "video") return <Video />;
  if (type === "pdf") return <FilePdf />;
  if (type === "word") return <FileDoc />;
  if (type === "excel") return <FileXls />;
  if (type === "powerpoint") return <FilePpt />;
  return <FileText />;
}

function DocumentIconPicker({ value, onSelect }) {
  const { t } = useTranslation();
  const [query, setQuery] = useState("");
  const normalizedQuery = query.trim().toLowerCase();
  const visibleIcons = documentIconOptions.filter((option) => (
    !normalizedQuery
    || option.value.includes(normalizedQuery)
    || option.label.toLowerCase().includes(normalizedQuery)
  ));
  return (
    <div className="document-icon-picker" role="dialog" aria-label={value ? t("editor.changeIcon") : t("editor.chooseIcon")}>
      <header>
        <strong>{t("editor.emoji")}</strong>
        {value ? <button type="button" onClick={() => onSelect(null)}>{t("common.remove")}</button> : null}
      </header>
      <label className="document-icon-search">
        <MagnifyingGlass />
        <input value={query} onChange={(event) => setQuery(event.target.value)} aria-label={t("editor.filterIcons")} placeholder={t("editor.filterIconsPlaceholder")} autoFocus />
      </label>
      <div className="document-icon-grid" role="listbox" aria-label={t("editor.documentIcons")}>
        {visibleIcons.map((option) => (
          <button
            type="button"
            key={option.value}
            role="option"
            aria-label={t("editor.iconOption", { emoji: option.value })}
            aria-selected={value === option.value}
            title={t("editor.iconOption", { emoji: option.value })}
            onClick={() => onSelect(option.value)}
          >
            {option.value}
          </button>
        ))}
      </div>
      {!visibleIcons.length ? <p>{t("editor.noMatchingIcons")}</p> : null}
    </div>
  );
}

function DocumentTabs({
  items,
  openTabs,
  activeId,
  onActivate,
  onClose,
  onCloseScope,
  onShowAll,
  onNewDocument,
  sidebarCollapsed,
  onToggleSidebar,
}) {
  const { t } = useTranslation();
  const [contextMenu, setContextMenu] = useState(null);
  const contextMenuRef = useRef(null);
  const tabItems = openTabs.map((id) => items.find((item) => item.id === id)).filter(Boolean);
  useDismissibleLayer({
    open: Boolean(contextMenu),
    onDismiss: () => setContextMenu(null),
    insideRefs: [contextMenuRef],
  });

  useEffect(() => {
    if (!contextMenu) return undefined;
    const focusFirstAction = () => contextMenuRef.current?.querySelector("button:not(:disabled)")?.focus();
    if (window.requestAnimationFrame) window.requestAnimationFrame(focusFirstAction);
    else window.setTimeout(focusFirstAction, 0);
    return undefined;
  }, [contextMenu]);

  useEffect(() => {
    if (contextMenu && !openTabs.includes(contextMenu.id)) setContextMenu(null);
  }, [contextMenu, openTabs]);

  function moveTabFocus(event) {
    if (!new Set(["ArrowLeft", "ArrowRight", "Home", "End"]).has(event.key)) return;
    const tabs = [...event.currentTarget.closest("[role='tablist']").querySelectorAll("[role='tab']")];
    const current = tabs.indexOf(event.currentTarget);
    const next = event.key === "Home"
      ? 0
      : event.key === "End"
        ? tabs.length - 1
        : (current + (event.key === "ArrowRight" ? 1 : -1) + tabs.length) % tabs.length;
    event.preventDefault();
    tabs[next]?.focus();
    tabs[next]?.click();
  }

  function moveMenuFocus(event) {
    if (!new Set(["ArrowUp", "ArrowDown", "Home", "End"]).has(event.key)) return;
    const menuItems = [...event.currentTarget.closest("[role='menu']").querySelectorAll("button:not(:disabled)")];
    const current = menuItems.indexOf(event.currentTarget);
    const next = event.key === "Home"
      ? 0
      : event.key === "End"
        ? menuItems.length - 1
        : (current + (event.key === "ArrowDown" ? 1 : -1) + menuItems.length) % menuItems.length;
    event.preventDefault();
    menuItems[next]?.focus();
  }

  function openContextMenu(event, item) {
    event.preventDefault();
    event.stopPropagation();
    onActivate(item.id);
    const width = 226;
    const height = 178;
    setContextMenu({
      id: item.id,
      title: item.title,
      left: Math.max(8, Math.min(event.clientX, window.innerWidth - width - 8)),
      top: Math.max(8, Math.min(event.clientY, window.innerHeight - height - 8)),
    });
  }

  function openContextMenuFromButton(event, item) {
    event.stopPropagation();
    onActivate(item.id);
    const width = 226;
    const height = 178;
    const rect = event.currentTarget.getBoundingClientRect();
    setContextMenu({
      id: item.id,
      title: item.title,
      left: Math.max(8, Math.min(rect.right - width, window.innerWidth - width - 8)),
      top: Math.max(8, Math.min(rect.bottom + 6, window.innerHeight - height - 8)),
    });
  }

  function runCloseAction(scope) {
    if (!contextMenu) return;
    onCloseScope(contextMenu.id, scope);
    setContextMenu(null);
  }

  const contextIndex = contextMenu ? openTabs.indexOf(contextMenu.id) : -1;

  return (
    <nav className="tab-strip" role="tablist" aria-label={t("tabs.openDocuments")}>
      {sidebarCollapsed ? (
        <IconButton
          className="header-sidebar-toggle"
          label={t("sidebar.show")}
          onClick={onToggleSidebar}
        >
          <SidebarSimple />
        </IconButton>
      ) : null}
      <div className="tab-scroll">
        <button
          className={`library-tab ${activeId ? "" : "active"}`}
          role="tab"
          aria-selected={!activeId}
          tabIndex={activeId ? -1 : 0}
          onClick={onShowAll}
          onKeyDown={moveTabFocus}
        >
          <House /><span>{t("common.all")}</span>
        </button>
        {tabItems.map((item) => (
          <div className={`document-tab ${activeId === item.id ? "active" : ""}`} key={item.id} onContextMenu={(event) => openContextMenu(event, item)}>
            <button
              className="tab-main"
              role="tab"
              aria-selected={activeId === item.id}
              tabIndex={activeId === item.id ? 0 : -1}
              onClick={() => onActivate(item.id)}
              onAuxClick={(event) => { if (event.button === 1) onClose(item.id); }}
              onKeyDown={moveTabFocus}
            >
              <WorkspaceFileIcon type={item.type} icon={item.icon} /><span>{item.title}</span>
            </button>
            <IconButton
              className="tab-more"
              label={t("tabs.actions", { title: item.title })}
              aria-haspopup="menu"
              aria-expanded={contextMenu?.id === item.id}
              onClick={(event) => openContextMenuFromButton(event, item)}
            >
              <DotsThree />
            </IconButton>
            <IconButton className="tab-close" label={t("tabs.closeDocument", { title: item.title })} onClick={() => onClose(item.id)}><X /></IconButton>
          </div>
        ))}
        <IconButton className="new-tab-button" label={t("tabs.create")} onClick={onNewDocument}><Plus /></IconButton>
      </div>
      {contextMenu ? createPortal(
        <div
          ref={contextMenuRef}
          className="tab-context-menu"
          style={{ left: contextMenu.left, top: contextMenu.top }}
          role="menu"
          aria-label={t("tabs.actions", { title: contextMenu.title })}
          onPointerDown={(event) => event.stopPropagation()}
          onContextMenu={(event) => event.preventDefault()}
        >
          <button role="menuitem" onKeyDown={moveMenuFocus} onClick={() => { onClose(contextMenu.id); setContextMenu(null); }}><X aria-hidden="true" /><span>{t("common.close")}</span></button>
          <div className="menu-separator" role="separator" />
          <button role="menuitem" disabled={contextIndex === openTabs.length - 1} onKeyDown={moveMenuFocus} onClick={() => runCloseAction("right")}><ArrowLineRight aria-hidden="true" /><span>{t("tabs.closeRight")}</span></button>
          <button role="menuitem" disabled={contextIndex <= 0} onKeyDown={moveMenuFocus} onClick={() => runCloseAction("left")}><ArrowLineLeft aria-hidden="true" /><span>{t("tabs.closeLeft")}</span></button>
          <div className="menu-separator" role="separator" />
          <button role="menuitem" onKeyDown={moveMenuFocus} onClick={() => runCloseAction("all")}><StackMinus aria-hidden="true" /><span>{t("tabs.closeAll")}</span></button>
        </div>,
        window.document.body,
      ) : null}
    </nav>
  );
}

function TreeRenameInput({ item, onCommit, onCancel }) {
  const { t } = useTranslation();
  const [value, setValue] = useState(item.name);
  const inputRef = useRef(null);

  useEffect(() => {
    const input = inputRef.current;
    if (!input) return;
    input.focus();
    const extensionIndex = item.type === "folder" ? item.name.length : item.name.lastIndexOf(".");
    input.setSelectionRange(0, extensionIndex > 0 ? extensionIndex : item.name.length);
  }, [item.name]);

  function commit() {
    const nextName = value.trim();
    if (!nextName || nextName === item.name) onCancel();
    else void onCommit(item, nextName);
  }

  return (
    <input
      ref={inputRef}
      className="tree-rename-input"
      aria-label={t("files.rename", { name: item.name })}
      value={value}
      onChange={(event) => setValue(event.target.value)}
      onBlur={onCancel}
      onClick={(event) => event.stopPropagation()}
      onKeyDown={(event) => {
        if (event.key === "Enter") {
          event.preventDefault();
          commit();
        }
        if (event.key === "Escape") {
          event.preventDefault();
          onCancel();
        }
      }}
    />
  );
}

function DocumentPathRename({ document, onRename }) {
  const { t } = useTranslation();
  const displayPath = document?.path || "Product / Untitled.mdx";
  const separatorIndex = displayPath.lastIndexOf("/");
  const directory = separatorIndex >= 0 ? displayPath.slice(0, separatorIndex + 1).trim() : "";
  const fileName = (separatorIndex >= 0 ? displayPath.slice(separatorIndex + 1) : displayPath).trim();
  const [renaming, setRenaming] = useState(false);
  const [value, setValue] = useState(fileName);
  const inputRef = useRef(null);
  const finishing = useRef(false);

  useEffect(() => {
    finishing.current = false;
    setRenaming(false);
    setValue(fileName);
  }, [document?.id, fileName]);

  useEffect(() => {
    if (!renaming || !inputRef.current) return;
    const input = inputRef.current;
    input.focus();
    const extensionIndex = fileName.lastIndexOf(".");
    input.setSelectionRange(0, extensionIndex > 0 ? extensionIndex : fileName.length);
  }, [fileName, renaming]);

  function startRename() {
    finishing.current = false;
    setValue(fileName);
    setRenaming(true);
  }

  function finishRename(save) {
    if (finishing.current) return;
    finishing.current = true;
    const nextName = value.trim();
    setRenaming(false);
    if (save && nextName && nextName !== fileName) {
      void Promise.resolve(onRename?.(document, nextName)).finally(() => {
        finishing.current = false;
      });
      return;
    }
    finishing.current = false;
  }

  return (
    <div className={`document-path ${renaming ? "renaming" : ""}`}>
      {directory ? <span className="document-directory" title={directory}>{directory}</span> : null}
      {renaming ? (
        <input
          ref={inputRef}
          className="document-name-input"
          aria-label={t("files.rename", { name: fileName })}
          value={value}
          maxLength={255}
          spellCheck={false}
          onChange={(event) => setValue(event.target.value)}
          onBlur={() => finishRename(true)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              finishRename(true);
            } else if (event.key === "Escape") {
              event.preventDefault();
              finishRename(false);
            }
          }}
        />
      ) : (
        <button className="document-name-button" type="button" aria-label={t("files.rename", { name: fileName })} title={t("files.rename", { name: fileName })} onClick={startRename}>
          <span>{fileName}</span>
          <PencilSimple className="document-name-edit-icon" aria-hidden="true" />
        </button>
      )}
    </div>
  );
}

function FolderTreeItems({
  items,
  expanded,
  activeId,
  selectedPath,
  onToggle,
  onOpen,
  onSelect,
  onContextMenu,
  onMore,
  openMenuPath,
  renaming,
  onRenameCommit,
  onRenameCancel,
  depth = 0,
  parentPath = "",
}) {
  const { t } = useTranslation();
  return (
    <>
      {items.map((item) => {
        const isFolder = item.type === "folder";
        const isExpanded = expanded.has(item.id);
        const itemPath = workspaceTreePath(item, parentPath);
        const treeItem = { ...item, path: itemPath };
        const isSelected = selectedPath ? selectedPath === itemPath : activeId === item.id;
        const isRenaming = renaming?.id === item.id || renaming?.path === itemPath;
        return (
          <div key={item.id} className="tree-group">
            {isRenaming ? (
              <div
                className="tree-row renaming"
                role="treeitem"
                aria-label={t("files.renaming", { name: item.name })}
                aria-selected={isSelected}
                style={{ paddingInlineStart: `${9 + depth * 17}px` }}
              >
                <span className="tree-caret" aria-hidden="true" />
                {isFolder ? <FolderOpen /> : <WorkspaceFileIcon type={item.type} icon={item.icon} />}
                <TreeRenameInput item={treeItem} onCommit={onRenameCommit} onCancel={onRenameCancel} />
              </div>
            ) : (
              <div className="tree-row-shell">
                <button
                  className="tree-row"
                  role="treeitem"
                  draggable={!isFolder}
                  aria-expanded={isFolder ? isExpanded : undefined}
                  aria-selected={isSelected}
                  onClick={() => {
                    onSelect(treeItem);
                    if (!isFolder) onOpen(item.id);
                  }}
                  onContextMenu={(event) => onContextMenu(event, treeItem)}
                  onDragStart={(event) => {
                    if (isFolder) {
                      event.preventDefault();
                      return;
                    }
                    writeWorkspaceResourceDrag(event.dataTransfer, treeItem);
                  }}
                  style={{ paddingInlineStart: `${9 + depth * 17}px` }}
                >
                  <span className="tree-caret" aria-hidden="true">
                    {isFolder ? isExpanded ? <CaretDown /> : <CaretRight /> : null}
                  </span>
                  {isFolder ? isExpanded ? <FolderOpen /> : <Folder /> : <WorkspaceFileIcon type={item.type} icon={item.icon} />}
                  <span className="tree-name" title={item.name}>{item.name}</span>
                </button>
                {isFolder ? (
                  <IconButton
                    className="tree-row-more"
                    label={t("files.actions", { name: item.name })}
                    aria-haspopup="menu"
                    aria-expanded={openMenuPath === itemPath}
                    onClick={(event) => {
                      event.stopPropagation();
                      onSelect(treeItem);
                      onMore(event, treeItem);
                    }}
                  >
                    <DotsThree weight="bold" />
                  </IconButton>
                ) : null}
              </div>
            )}
            {isFolder && isExpanded && item.children?.length ? (
              <div className="tree-children" role="group">
                <FolderTreeItems
                  items={item.children}
                  expanded={expanded}
                  activeId={activeId}
                  selectedPath={selectedPath}
                  onToggle={onToggle}
                  onOpen={onOpen}
                  onSelect={onSelect}
                  onContextMenu={onContextMenu}
                  onMore={onMore}
                  openMenuPath={openMenuPath}
                  renaming={renaming}
                  onRenameCommit={onRenameCommit}
                  onRenameCancel={onRenameCancel}
                  depth={depth + 1}
                  parentPath={itemPath}
                />
              </div>
            ) : null}
          </div>
        );
      })}
    </>
  );
}

function FolderTree({
  tree,
  expanded,
  activeId,
  selectedPath,
  onToggle,
  onOpen,
  onSelect,
  onRename,
  onDuplicate,
  onDelete,
  onReveal,
  onOpenTerminal,
}) {
  const { t } = useTranslation();
  const [contextMenu, setContextMenu] = useState(null);
  const [renaming, setRenaming] = useState(null);
  const contextMenuRef = useRef(null);
  useDismissibleLayer({
    open: Boolean(contextMenu),
    onDismiss: () => setContextMenu(null),
    insideRefs: [contextMenuRef],
  });

  function openContextMenu(event, item) {
    event.preventDefault();
    const width = 190;
    const height = 200;
    setContextMenu({
      item,
      left: Math.max(8, Math.min(event.clientX, window.innerWidth - width - 8)),
      top: Math.max(8, Math.min(event.clientY, window.innerHeight - height - 8)),
    });
  }

  function openContextMenuFromButton(event, item) {
    const width = 190;
    const height = 200;
    const rect = event.currentTarget.getBoundingClientRect();
    setContextMenu({
      item,
      left: Math.max(8, Math.min(rect.right - width, window.innerWidth - width - 8)),
      top: Math.max(8, Math.min(rect.bottom + 5, window.innerHeight - height - 8)),
    });
  }

  function startRename() {
    setRenaming(contextMenu.item);
    setContextMenu(null);
  }

  function runAction(action) {
    const item = contextMenu.item;
    setContextMenu(null);
    void action(item);
  }

  return (
    <>
      <div className="folder-tree" role="tree" aria-label={t("files.tree")}>
        <FolderTreeItems
          items={tree}
          expanded={expanded}
          activeId={activeId}
          selectedPath={selectedPath}
          onToggle={onToggle}
          onOpen={onOpen}
          onSelect={onSelect}
          onContextMenu={openContextMenu}
          onMore={openContextMenuFromButton}
          openMenuPath={contextMenu?.item.path || null}
          renaming={renaming}
          onRenameCommit={async (item, name) => {
            setRenaming(null);
            await onRename(item, name);
          }}
          onRenameCancel={() => setRenaming(null)}
        />
      </div>
      {contextMenu ? createPortal(
        <div
          ref={contextMenuRef}
          className="tree-context-menu"
          style={{ left: contextMenu.left, top: contextMenu.top }}
          role="menu"
          aria-label={t("files.actions", { name: contextMenu.item.name })}
        >
          <button type="button" role="menuitem" onClick={startRename}><PencilSimple /> {t("common.rename")}</button>
          <button type="button" role="menuitem" onClick={() => runAction(onReveal)}><FolderOpen /> {t("editor.showFinder")}</button>
          <button type="button" role="menuitem" onClick={() => runAction(onOpenTerminal)}><TerminalWindow /> {t("editor.openTerminal")}</button>
          <button type="button" role="menuitem" onClick={() => runAction(onDuplicate)}><Copy /> {t("common.copy")}</button>
          <div className="menu-separator" role="separator" />
          <button type="button" className="danger" role="menuitem" onClick={() => runAction(onDelete)}><Trash /> {t("common.delete")}</button>
        </div>,
        window.document.body,
      ) : null}
    </>
  );
}

function Sidebar({
  project,
  documents,
  fileCount,
  activeId,
  activeDocument,
  activeDocumentSource,
  selectedTreePath,
  workspaceRootSelected,
  workspaceRootExpanded,
  librarySection,
  sidebarView,
  expanded,
  onToggleFolder,
  onOpenDocument,
  onSelectTreeItem,
  onSelectWorkspaceRoot,
  onToggleWorkspaceRoot,
  onRefreshWorkspace,
  onRenameWorkspaceItem,
  onDuplicateWorkspaceItem,
  onDeleteWorkspaceItem,
  onRevealWorkspaceItem,
  onOpenWorkspaceItemInTerminal,
  onShowAll,
  onShowDocuments,
  onShowFavorites,
  onNewDocument,
  onOpenProject,
  recentProjects,
  onOpenRecentProject,
  onOpenSettings,
  accountDetails,
  collapsed,
  onToggleSidebar,
  onSidebarView,
  onNavigateDocument,
}) {
  const { t } = useTranslation();
  const [projectMenu, setProjectMenu] = useState(false);
  const [refreshingWorkspace, setRefreshingWorkspace] = useState(false);
  const projectMenuRef = useRef(null);
  const projectChoices = [project, ...recentProjects].filter((candidate, index, projects) => (
    projects.findIndex((item) => item.id === candidate.id || item.path === candidate.path) === index
  ));
  useDismissibleLayer({
    open: projectMenu,
    onDismiss: () => setProjectMenu(false),
    insideRefs: [projectMenuRef],
    restoreFocusRef: projectMenuRef,
  });

  if (collapsed) return null;

  return (
    <aside className="sidebar" aria-label={t("sidebar.navigation")}>
      <div className="sidebar-toolbar">
        <div className="project-menu-wrap" ref={projectMenuRef}>
          <button className="project-button" onClick={() => setProjectMenu((open) => !open)} aria-expanded={projectMenu}>
            <img className="project-mark" src={fyluneIcon} alt="" />
            <span className="project-name">{project.name}</span>
            <CaretDown />
          </button>
          {projectMenu ? (
            <div className="popover project-popover">
              <div className="project-list" aria-label={t("sidebar.projects")}>
                {projectChoices.map((choice) => {
                  const selected = choice.id === project.id || choice.path === project.path;
                  return (
                    <button
                      key={choice.id || choice.path}
                      className={`project-list-button ${selected ? "selected" : ""}`}
                      aria-current={selected ? "true" : undefined}
                      aria-label={selected ? t("sidebar.currentProject", { name: choice.name }) : t("sidebar.openProject", { name: choice.name })}
                      onClick={() => {
                        setProjectMenu(false);
                        if (!selected) onOpenRecentProject(choice.id);
                      }}
                    >
                      {selected ? <Check weight="bold" /> : <Folder />}
                      <span className="project-list-copy"><strong>{choice.name}</strong><span>{choice.path}</span></span>
                    </button>
                  );
                })}
              </div>
              <div className="project-popover-separator" />
              <button onClick={() => { setProjectMenu(false); onOpenProject(); }}><FolderOpen /> {t("sidebar.openAnother")}</button>
            </div>
          ) : null}
        </div>
        <IconButton label={t("sidebar.hide")} onClick={onToggleSidebar}><SidebarSimple /></IconButton>
      </div>

      <nav className="primary-nav" aria-label={t("sidebar.workspace")}>
        <button className={!activeId && librarySection === "all" ? "active" : ""} aria-current={!activeId && librarySection === "all" ? "page" : undefined} onClick={onShowAll}><GridFour /> {t("sidebar.allFiles")} <span>{fileCount}</span></button>
        <button className={!activeId && librarySection === "documents" ? "active" : ""} aria-current={!activeId && librarySection === "documents" ? "page" : undefined} onClick={onShowDocuments}><FileText /> {t("sidebar.allDocuments")} <span>{documents.length}</span></button>
        <button className={!activeId && librarySection === "favorites" ? "active" : ""} aria-current={!activeId && librarySection === "favorites" ? "page" : undefined} onClick={onShowFavorites}><Star /> {t("sidebar.favorites")} <span>{documents.filter((document) => document.starred).length}</span></button>
        <button onClick={onNewDocument}><Plus /> {t("sidebar.newDocument")}</button>
      </nav>

      <DocumentContextSidebar
        activeDocument={activeDocument}
        source={activeDocumentSource}
        view={sidebarView}
        onView={onSidebarView}
        onNavigate={onNavigateDocument}
        filesPanel={(
          <div className="sidebar-files-panel" id="sidebar-panel-files" role={activeDocument ? "tabpanel" : undefined} aria-labelledby={activeDocument ? "sidebar-view-files" : undefined}>
            <div className="tree-heading">
              <span>{t("sidebar.projectFiles")}</span>
              <IconButton label={t("sidebar.newDocument")} onClick={onNewDocument}><Plus /></IconButton>
            </div>
            <div className={`workspace-root-row-shell ${workspaceRootSelected ? "active" : ""}`}>
              <button
                type="button"
                className="workspace-root-caret"
                aria-label={workspaceRootExpanded ? t("sidebar.collapseWorkspace") : t("sidebar.expandWorkspace")}
                aria-expanded={workspaceRootExpanded}
                onClick={onToggleWorkspaceRoot}
              >
                {workspaceRootExpanded ? <CaretDown /> : <CaretRight />}
              </button>
              <button
                type="button"
                className="workspace-root-row"
                aria-current={workspaceRootSelected ? "page" : undefined}
                onClick={onSelectWorkspaceRoot}
              >
                {workspaceRootExpanded ? <FolderOpen /> : <Folder />}
                <span className="tree-name" title={project.name}>{project.name}</span>
              </button>
              <IconButton
                className="workspace-root-refresh"
                label={t("sidebar.refreshWorkspace")}
                disabled={refreshingWorkspace}
                onClick={async (event) => {
                  event.stopPropagation();
                  if (refreshingWorkspace) return;
                  setRefreshingWorkspace(true);
                  try {
                    await onRefreshWorkspace();
                  } finally {
                    setRefreshingWorkspace(false);
                  }
                }}
              >
                <ArrowsClockwise className={refreshingWorkspace ? "spin" : ""} />
              </IconButton>
            </div>
            {workspaceRootExpanded ? (
              <FolderTree
                tree={project.tree}
                expanded={expanded}
                activeId={activeId}
                selectedPath={selectedTreePath}
                onToggle={onToggleFolder}
                onOpen={onOpenDocument}
                onSelect={onSelectTreeItem}
                onRename={onRenameWorkspaceItem}
                onDuplicate={onDuplicateWorkspaceItem}
                onDelete={onDeleteWorkspaceItem}
                onReveal={onRevealWorkspaceItem}
                onOpenTerminal={onOpenWorkspaceItemInTerminal}
              />
            ) : <div className="folder-tree is-collapsed" aria-hidden="true" />}
          </div>
        )}
      />

      <div className="sidebar-footer">
        <button className="sidebar-account" onClick={onOpenSettings} aria-label={t("account.openProfile")}>
          <span className="sidebar-account-avatar" aria-hidden="true">
            {accountDetails?.user?.avatarUrl
              ? <img src={accountDetails.user.avatarUrl} alt="" />
              : <span>{(accountDetails?.user?.name || accountDetails?.user?.email || t("account.guest")).trim().slice(0, 1).toUpperCase()}</span>}
          </span>
          <span className="sidebar-account-copy">
            <strong>{accountDetails?.user?.name || accountDetails?.user?.email || t("account.guest")}</strong>
            <small>{accountDetails?.user?.email ? t("settings.signedIn", { email: accountDetails.user.email }) : t("account.guest")}</small>
          </span>
        </button>
        <SidebarUpdateButton updateBridge={bridge} />
        <IconButton label={t("sidebar.settings")} onClick={onOpenSettings}><GearSix /></IconButton>
      </div>
    </aside>
  );
}

function DocumentPreview({ document, previewSource, previewStatus, view, onOpen, onStar, onRequestPreview }) {
  const { t } = useTranslation();
  const previewRef = useRef(null);
  const fileName = workspaceFileName(document.path) || document.title;
  const previewSummary = useMemo(() => {
    const blocks = parseDocumentPreview(previewSource);
    const firstBlock = blocks.find((block) => ["paragraph", "quote", "table"].includes(block.type))
      || blocks.find((block) => block.items?.length)
      || blocks.find((block) => block.text);
    return firstBlock?.text || firstBlock?.items?.join(" · ") || "";
  }, [previewSource]);

  useEffect(() => {
    if (previewSource != null || previewStatus === "loading" || previewStatus === "error") return undefined;
    const target = previewRef.current;
    if (!target) return undefined;
    if (typeof window.IntersectionObserver !== "function") {
      onRequestPreview(document);
      return undefined;
    }
    const observer = new window.IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) {
        onRequestPreview(document);
        observer.disconnect();
      }
    }, { rootMargin: "360px" });
    observer.observe(target);
    return () => observer.disconnect();
  }, [document, onRequestPreview, previewSource, previewStatus]);

  if (view === "list") {
    return (
      <article className="document-row" ref={previewRef}>
        <button className="row-open" onClick={() => onOpen(document.id)}>
          <span className={`doc-kind-icon ${document.kind}`}><FileText /></span>
          <span className="row-copy"><strong>{document.title}</strong><span>{document.path}</span></span>
          <span className="row-description">{previewSummary || (previewStatus === "error" ? t("library.previewUnavailable") : "")}</span>
          <span className="row-meta">{document.modified}</span>
        </button>
        <IconButton label={document.starred ? t("library.unstar", { title: document.title }) : t("library.star", { title: document.title })} className={document.starred ? "starred" : ""} onClick={() => onStar(document.id)}>
          <Star weight={document.starred ? "fill" : "regular"} />
        </IconButton>
      </article>
    );
  }

  return (
    <article className="document-card" ref={previewRef}>
      <button className="document-preview" onClick={() => onOpen(document.id)} aria-label={t("library.open", { title: document.title })}>
        <div className="preview-page">
          <DocumentCardPreview
            source={previewSource}
            status={previewStatus}
            resolveImage={(source) => bridge.previewDocumentAsset?.(source, document.path) || source}
          />
        </div>
      </button>
      <div className="document-card-meta">
        <button className="card-title" title={fileName} onClick={() => onOpen(document.id)}>{fileName}</button>
        <IconButton label={document.starred ? t("library.unstar", { title: document.title }) : t("library.star", { title: document.title })} className={document.starred ? "starred" : ""} onClick={() => onStar(document.id)}>
          <Star weight={document.starred ? "fill" : "regular"} />
        </IconButton>
      </div>
    </article>
  );
}

function ProportionalImagePreview({ src, title, className, style, fallback = null }) {
  const [ratio, setRatio] = useState(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    setRatio(null);
    setFailed(false);
  }, [src]);

  if (!src || failed) return fallback;

  return (
    <span
      className={className}
      style={{
        ...style,
        ...(ratio ? { "--image-aspect-ratio": ratio } : {}),
      }}
      aria-hidden="true"
    >
      <img
        src={src}
        alt=""
        title={title}
        loading="lazy"
        decoding="async"
        draggable="false"
        onLoad={(event) => {
          const { naturalWidth, naturalHeight } = event.currentTarget;
          if (naturalWidth > 0 && naturalHeight > 0) setRatio(naturalWidth / naturalHeight);
        }}
        onError={() => setFailed(true)}
      />
    </span>
  );
}

function ProportionalVideoPreview({ src, title, className, style, fallback = null }) {
  const [ratio, setRatio] = useState(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    setRatio(null);
    setFailed(false);
  }, [src]);

  if (!src || failed) return fallback;

  return (
    <span
      className={className}
      style={{
        ...style,
        ...(ratio ? { "--video-aspect-ratio": ratio } : {}),
      }}
      aria-hidden="true"
    >
      <video
        src={src}
        title={title}
        muted
        playsInline
        preload="metadata"
        draggable="false"
        onLoadedMetadata={(event) => {
          const { videoWidth, videoHeight } = event.currentTarget;
          if (videoWidth > 0 && videoHeight > 0) setRatio(videoWidth / videoHeight);
        }}
        onError={() => setFailed(true)}
      />
    </span>
  );
}

function FolderPocketBack() {
  return (
    <span className="folder-pocket-back">
      <svg viewBox="0 0 212 136" preserveAspectRatio="none" aria-hidden="true">
        <path d="M16 0H126C136 0 142 4 147 11L151 17C154 21 159 23 165 23H196C205 23 212 30 212 39V120C212 129 205 136 196 136H16C7 136 0 129 0 120V16C0 7 7 0 16 0Z" />
      </svg>
    </span>
  );
}

function FolderPeekFallback({ item, itemType, style }) {
  const { t } = useTranslation();
  if (itemType === "folder") {
    return (
      <span className="folder-peek is-folder" style={style} aria-hidden="true">
        <span className="folder-peek-folder-shell">
          <FolderPocketBack />
          <strong className="folder-peek-folder-name" title={item.name}>{item.name}</strong>
          <FolderOpen className="folder-peek-folder-icon" weight="fill" />
        </span>
      </span>
    );
  }
  return (
    <span className="folder-peek is-generic" style={style}>
      <span className="folder-peek-icon">
        <WorkspaceFileIcon type={itemType} icon={item.icon} />
      </span>
      <span className="folder-peek-copy">
        <strong>{item.name}</strong>
        <small>{workspacePeekMeta(item, t)}</small>
      </span>
    </span>
  );
}

function FolderPeekPreview({ item, index, count, previewSource, previewStatus }) {
  const centerIndex = (count - 1) / 2;
  const distanceFromCenter = index - centerIndex;
  const compactFan = count > 3;
  const distanceRatio = Math.abs(distanceFromCenter) / Math.max(centerIndex, 1);
  const itemType = workspaceFileType(item, item.path || item.name);
  const isFolder = itemType === "folder";
  const peekStyle = {
    "--peek-delay": `${index * (compactFan ? 18 : 24)}ms`,
    "--peek-offset": isFolder ? "0%" : `${index * (compactFan ? 1 : 1.5)}%`,
    "--peek-rest-x": `${distanceFromCenter * (isFolder ? (compactFan ? 26 : 30) : (compactFan ? 13 : 16))}px`,
    "--peek-rotate": isFolder ? "0deg" : `${distanceFromCenter * (compactFan ? 1.6 : 2.2)}deg`,
    "--peek-reveal-x": `${distanceFromCenter * (isFolder ? (compactFan ? 44 : 60) : (compactFan ? 32 : 50))}px`,
    "--peek-reveal-y": `${(isFolder ? -38 : -40) + (distanceRatio * (isFolder ? 6 : 10))}px`,
    "--peek-reveal-rotate": `${distanceFromCenter * (compactFan ? 2.2 : 3.2)}deg`,
    "--peek-z": index + 2,
  };

  if (itemType === "image") {
    return (
      <ProportionalImagePreview
        src={bridge.previewAsset(item) || (item.id === "asset-cover" ? fyluneIcon : null)}
        title={item.name}
        className="folder-peek is-image"
        style={peekStyle}
        fallback={<FolderPeekFallback item={item} itemType={itemType} style={peekStyle} />}
      />
    );
  }

  if (itemType === "video") {
    return (
      <ProportionalVideoPreview
        src={bridge.previewAsset(item)}
        title={item.name}
        className="folder-peek is-video"
        style={peekStyle}
        fallback={<FolderPeekFallback item={item} itemType={itemType} style={peekStyle} />}
      />
    );
  }

  if (itemType === "document") {
    return (
      <span className="folder-peek is-document" style={peekStyle} aria-hidden="true">
        <span className="folder-peek-document-page">
          <DocumentCardPreview
            source={previewSource}
            status={previewStatus}
            resolveImage={(source) => bridge.previewDocumentAsset?.(source, item.path) || source}
          />
        </span>
      </span>
    );
  }

  return <FolderPeekFallback item={item} itemType={itemType} style={peekStyle} />;
}

export function FolderCard({
  folder,
  documentSources,
  documentPreviews,
  onRequestPreview,
  onOpen,
}) {
  const { t } = useTranslation();
  const previewRef = useRef(null);
  const peekItems = useMemo(() => {
    const candidates = (folder.previewChildren || folder.children || []).map((item) => {
      const itemPath = workspaceTreePath(item, folder.path);
      return {
        ...item,
        id: item.id || itemPath,
        path: itemPath,
        type: workspaceFileType(item, itemPath),
      };
    });
    const visualTypes = new Set(["document", "image", "video"]);
    const visualItems = candidates.filter((item) => visualTypes.has(item.type));
    const fallbackItems = candidates.filter((item) => !visualTypes.has(item.type));
    return [...visualItems, ...fallbackItems].slice(0, 4);
  }, [folder]);

  useEffect(() => {
    const documents = peekItems.filter((item) => item.type === "document");
    if (!documents.length || !onRequestPreview) return undefined;
    const requestPreviews = () => documents.forEach((item) => onRequestPreview(item));
    const target = previewRef.current;
    if (!target || typeof window.IntersectionObserver !== "function") {
      requestPreviews();
      return undefined;
    }
    const observer = new window.IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) {
        requestPreviews();
        observer.disconnect();
      }
    }, { rootMargin: "240px" });
    observer.observe(target);
    return () => observer.disconnect();
  }, [onRequestPreview, peekItems]);

  return (
    <button
      ref={previewRef}
      className="folder-card"
      type="button"
      aria-label={t("library.openFolder", { name: folder.name })}
      onClick={() => onOpen(folder)}
    >
      <span className="folder-pocket" aria-hidden="true">
        <FolderPocketBack />
        {peekItems.map((item, index) => {
          const previewSource = documentSources?.[item.id] ?? documentPreviews?.[item.id]?.content;
          const previewStatus = documentSources?.[item.id] != null
            ? "ready"
            : documentPreviews?.[item.id]?.status || "idle";
          return (
            <FolderPeekPreview
              item={item}
              index={index}
              count={peekItems.length}
              key={item.id || item.name}
              previewSource={previewSource}
              previewStatus={previewStatus}
            />
          );
        })}
        <span className="folder-pocket-front"><FolderOpen weight="fill" /></span>
      </span>
      <span className="folder-card-copy">
        <strong title={folder.name}>{folder.name}</strong>
        {Number.isFinite(folder.itemCount) ? <small>{t("library.itemCount", { count: folder.itemCount })}</small> : null}
      </span>
    </button>
  );
}

function WorkspaceAssetPreview({ item, typeLabel }) {
  const fallback = (
    <span className={`workspace-file-preview ${item.type}`}>
      <WorkspaceFileIcon type={item.type} icon={item.icon} />
      <small>{typeLabel}</small>
    </span>
  );

  if (item.type === "image") {
    return (
      <ProportionalImagePreview
        src={bridge.previewAsset(item) || (item.id === "asset-cover" ? fyluneIcon : null)}
        title={item.title}
        className="workspace-file-preview image has-visual"
        fallback={fallback}
      />
    );
  }

  if (item.type === "video") {
    return (
      <ProportionalVideoPreview
        src={bridge.previewAsset(item)}
        title={item.title}
        className="workspace-file-preview video has-visual"
        fallback={fallback}
      />
    );
  }

  return fallback;
}

export function WorkspaceAssetCard({ item, view, onOpen }) {
  const { t } = useTranslation();
  const typeLabel = t(`asset.${item.type}`, { defaultValue: t("library.file") });
  if (view === "list") {
    return (
      <article className="document-row workspace-file-row">
        <button className="row-open" onClick={() => onOpen(item.id)}>
          <span className={`doc-kind-icon ${item.type}`}><WorkspaceFileIcon type={item.type} icon={item.icon} /></span>
          <span className="row-copy"><strong>{item.title}</strong><span>{item.path}</span></span>
          <span className="row-description">{typeLabel}</span>
          <span className="row-meta">{item.modified || ""}</span>
        </button>
      </article>
    );
  }
  return (
    <article className="workspace-file-card">
      <button type="button" onClick={() => onOpen(item.id)} aria-label={t("library.open", { title: item.title })}>
        <WorkspaceAssetPreview item={item} typeLabel={typeLabel} />
        <span className="workspace-file-copy">
          <strong title={item.title}>{item.title}</strong>
          {item.type === "image" || item.type === "video" ? null : <small title={item.path}>{item.path}</small>}
        </span>
      </button>
    </article>
  );
}

function LibraryItems({
  items,
  documentSources,
  documentPreviews,
  view,
  onOpen,
  onStar,
  onRequestPreview,
  masonryClassName = "",
}) {
  const cards = items.map((item) => item.type === "document" ? (
    <DocumentPreview
      key={item.id}
      document={item}
      previewSource={documentSources[item.id] ?? documentPreviews[item.id]?.content}
      previewStatus={documentSources[item.id] != null ? "ready" : documentPreviews[item.id]?.status}
      view={view}
      onOpen={onOpen}
      onStar={onStar}
      onRequestPreview={onRequestPreview}
    />
  ) : (
    <WorkspaceAssetCard item={item} key={item.id} view={view} onOpen={onOpen} />
  ));

  if (view === "grid") {
    return (
      <RowOrderedMasonry className={["document-grid", masonryClassName].filter(Boolean).join(" ")}>
        {cards}
      </RowOrderedMasonry>
    );
  }
  return <div className="document-list">{cards}</div>;
}

function ProgressiveLoadTrigger({ hasMore, loadMore, triggerRef }) {
  const { t } = useTranslation();
  if (!hasMore) return null;
  return (
    <button
      type="button"
      className="library-load-more"
      onClick={loadMore}
      ref={triggerRef}
    >
      <CaretDown aria-hidden="true" />
      {t("library.loadMore")}
    </button>
  );
}

function FolderLibrary({
  folder,
  breadcrumbs,
  items,
  documentSources,
  documentPreviews,
  view,
  onView,
  onOpen,
  onStar,
  onRequestPreview,
  onOpenFolder,
  onShowAll,
  onNewDocument,
  loading = false,
}) {
  const { t } = useTranslation();
  const [search, setSearch] = useState("");
  const normalizedSearch = search.trim().toLowerCase();
  const filtered = items.filter((item) => (
    `${item.name || item.title} ${item.path}`.toLowerCase().includes(normalizedSearch)
  ));
  const {
    hasMore,
    loadMore,
    triggerRef,
    visibleItems,
  } = useProgressiveItems(filtered, `${folder.path}:${normalizedSearch}:${view}`);
  const folders = visibleItems.filter((item) => item.type === "folder");
  const files = visibleItems.filter((item) => item.type !== "folder");

  return (
    <section className="library-screen folder-library" aria-labelledby="folder-library-title">
      <header className="content-toolbar">
        <div className="toolbar-title folder-toolbar-title">
          <IconButton label={t("library.backAll")} onClick={onShowAll}><ArrowLeft /></IconButton>
          <nav className="folder-breadcrumb" aria-label={t("library.openFolder", { name: folder.path })} dir="ltr">
            <FolderOpen aria-hidden="true" />
            <span className="folder-breadcrumb-list">
              {breadcrumbs.map((breadcrumb, index) => (
                <span className="folder-breadcrumb-segment" key={breadcrumb.path}>
                  {index ? <span className="folder-breadcrumb-separator" aria-hidden="true">/</span> : null}
                  <button
                    type="button"
                    className="folder-breadcrumb-button"
                    aria-current={index === breadcrumbs.length - 1 ? "page" : undefined}
                    aria-label={t("library.openFolder", { name: breadcrumb.name })}
                    title={breadcrumb.path}
                    onClick={() => onOpenFolder(breadcrumb)}
                  >
                    {breadcrumb.name}
                  </button>
                </span>
              ))}
            </span>
          </nav>
        </div>
        <div className="toolbar-actions">
          <label className="search-field"><MagnifyingGlass /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder={t("library.searchFolder")} aria-label={t("library.searchFolder")} /></label>
          <div className="segmented" aria-label={t("library.documentView")}>
            <button className={view === "grid" ? "active" : ""} aria-label={t("library.gridView")} onClick={() => onView("grid")}><GridFour /></button>
            <button className={view === "list" ? "active" : ""} aria-label={t("library.listView")} onClick={() => onView("list")}><Rows /></button>
          </div>
        </div>
      </header>

      <div className="library-content">
        <div className="library-heading-row">
          <div>
            <h1 id="folder-library-title">{folder.name}</h1>
            <p>{t("library.folderSummary", { count: items.length, path: folder.path })}</p>
          </div>
          <button className="primary-button" onClick={onNewDocument}><Plus /> {t("sidebar.newDocument")}</button>
        </div>

        {loading ? <SkeletonLibrary /> : null}

        {!loading && folders.length ? (
          <section className="folder-section" aria-labelledby="folder-section-title">
            <h2 id="folder-section-title">{t("library.folders")}</h2>
            <div className="folder-grid">
              {folders.map((item) => (
                <FolderCard
                  folder={item}
                  documentSources={documentSources}
                  documentPreviews={documentPreviews}
                  key={item.path}
                  onRequestPreview={onRequestPreview}
                  onOpen={onOpenFolder}
                />
              ))}
            </div>
          </section>
        ) : null}

        {!loading && files.length ? (
          <section className="folder-section folder-files-section" aria-labelledby="folder-files-title">
            <h2 id="folder-files-title">{t("library.files")}</h2>
            <LibraryItems
              items={files}
              documentSources={documentSources}
              documentPreviews={documentPreviews}
              view={view}
              onOpen={onOpen}
              onStar={onStar}
              onRequestPreview={onRequestPreview}
              masonryClassName="folder-document-grid"
            />
          </section>
        ) : null}

        {!loading ? (
          <ProgressiveLoadTrigger
            hasMore={hasMore}
            loadMore={loadMore}
            triggerRef={triggerRef}
          />
        ) : null}

        {!loading && !filtered.length ? (
          <div className="state-view compact">
            <FolderOpen />
            <h2>{normalizedSearch ? t("library.noFolderMatches", { search }) : t("library.emptyFolder")}</h2>
            <p>{normalizedSearch ? t("library.searchHint") : t("library.emptyFolderHint")}</p>
            {normalizedSearch ? <button className="secondary-button" onClick={() => setSearch("")}>{t("library.clearSearch")}</button> : <button className="primary-button" onClick={onNewDocument}><Plus /> {t("library.create")}</button>}
          </div>
        ) : null}
      </div>
    </section>
  );
}

function SkeletonLibrary() {
  const { t } = useTranslation();
  return (
    <div className="skeleton-grid" aria-label={t("library.loading")} aria-live="polite">
      {[0, 1, 2, 3].map((item) => <div key={item} className="skeleton-card"><span /><span /><span /></div>)}
    </div>
  );
}

function Library({ items, documentSources, documentPreviews, section, view, onView, onOpen, onOpenFolder, onStar, onRequestPreview, onShowAll, onNewDocument, onOpenProject, state, onState }) {
  const { t } = useTranslation();
  const [search, setSearch] = useState("");
  const [stateMenu, setStateMenu] = useState(false);
  const stateMenuRef = useRef(null);
  const normalizedSearch = search.trim().toLowerCase();
  const filtered = items.filter((item) => `${item.title || item.name} ${item.path}`.toLowerCase().includes(normalizedSearch));
  const {
    hasMore,
    loadMore,
    triggerRef,
    visibleItems,
  } = useProgressiveItems(filtered, `${section}:${normalizedSearch}:${view}`);
  const folders = visibleItems.filter((item) => item.type === "folder");
  const files = visibleItems.filter((item) => item.type !== "folder");
  const showingFavorites = section === "favorites";
  const showingDocuments = section === "documents";
  const title = showingFavorites
    ? t("sidebar.favorites")
    : showingDocuments
      ? t("sidebar.allDocuments")
      : t("sidebar.allFiles");
  useDismissibleLayer({
    open: stateMenu,
    onDismiss: () => setStateMenu(false),
    insideRefs: [stateMenuRef],
    restoreFocusRef: stateMenuRef,
  });

  return (
    <section className="library-screen" aria-labelledby="library-title">
      <header className="content-toolbar">
        <div className="toolbar-title">{showingFavorites ? <Star weight="fill" /> : showingDocuments ? <FileText /> : <GridFour />}<span>{title}</span></div>
        <div className="toolbar-actions">
          <label className="search-field"><MagnifyingGlass /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder={t("library.search")} aria-label={t("library.search")} /></label>
          <div className="segmented" aria-label={t("library.documentView")}>
            <button className={view === "grid" ? "active" : ""} aria-label={t("library.gridView")} onClick={() => onView("grid")}><GridFour /></button>
            <button className={view === "list" ? "active" : ""} aria-label={t("library.listView")} onClick={() => onView("list")}><Rows /></button>
          </div>
          <div className="menu-wrap" ref={stateMenuRef}>
            <IconButton label={t("library.more")} onClick={() => setStateMenu((open) => !open)} aria-expanded={stateMenu}><DotsThree /></IconButton>
            {stateMenu ? (
              <div className="popover state-popover">
                <p className="popover-label">{t("library.previewState")}</p>
                {[
                  ["ready", t("library.showDocuments")],
                  ["loading", t("library.showLoading")],
                  ["empty", t("library.showEmpty")],
                  ["error", t("library.showError")],
                ].map(([value, label]) => (
                  <button key={value} onClick={() => { onState(value); setStateMenu(false); }}>{state === value ? <Check /> : <span />} {label}</button>
                ))}
              </div>
            ) : null}
          </div>
        </div>
      </header>

      <div className="library-content">
        <div className="library-heading-row">
          <h1 id="library-title">{title}</h1>
          <button className="primary-button" onClick={onNewDocument}><Plus /> {t("sidebar.newDocument")}</button>
        </div>

        {state === "loading" ? <SkeletonLibrary /> : null}
        {state === "error" ? (
          <div className="state-view" role="alert"><WarningCircle /><h2>{t("library.loadFailed")}</h2><p>{t("library.filesSafe")}</p><button className="secondary-button" onClick={() => onState("ready")}><ArrowsClockwise /> {t("library.reload")}</button></div>
        ) : null}
        {state === "empty" ? (
          <div className="state-view"><FileText /><h2>{t("library.firstTitle")}</h2><p>{t("library.firstCopy")}</p><div><button className="primary-button" onClick={onNewDocument}><Plus /> {t("library.create")}</button><button className="secondary-button" onClick={onOpenProject}><FolderOpen /> {t("library.openProject")}</button></div></div>
        ) : null}
        {state === "ready" && showingFavorites && !search && filtered.length === 0 ? (
          <div className="state-view compact"><Star /><h2>{t("library.noFavorites")}</h2><p>{t("library.favoriteHint")}</p><button className="secondary-button" onClick={onShowAll}><GridFour /> {t("library.viewAll")}</button></div>
        ) : null}
        {state === "ready" && (!showingFavorites || search) && filtered.length === 0 ? (
          <div className="state-view compact"><MagnifyingGlass /><h2>{t("library.noMatches", { search })}</h2><p>{t("library.searchHint")}</p><button className="secondary-button" onClick={() => setSearch("")}>{t("library.clearSearch")}</button></div>
        ) : null}
        {state === "ready" && folders.length > 0 ? (
          <section className="folder-section" aria-labelledby="library-folders-title">
            <h2 id="library-folders-title">{t("library.folders")}</h2>
            <div className="folder-grid">
              {folders.map((item) => (
                <FolderCard
                  folder={item}
                  documentSources={documentSources}
                  documentPreviews={documentPreviews}
                  key={item.path}
                  onRequestPreview={onRequestPreview}
                  onOpen={onOpenFolder}
                />
              ))}
            </div>
          </section>
        ) : null}
        {state === "ready" && files.length > 0 ? (
          <section className={`folder-section ${folders.length ? "folder-files-section" : ""}`} aria-labelledby="library-files-title">
            {folders.length ? <h2 id="library-files-title">{t("library.files")}</h2> : null}
            <LibraryItems
              items={files}
              documentSources={documentSources}
              documentPreviews={documentPreviews}
              view={view}
              onOpen={onOpen}
              onStar={onStar}
              onRequestPreview={onRequestPreview}
            />
          </section>
        ) : null}
        {state === "ready" ? (
          <ProgressiveLoadTrigger
            hasMore={hasMore}
            loadMore={loadMore}
            triggerRef={triggerRef}
          />
        ) : null}
      </div>
    </section>
  );
}

function StructuredBlock({ type, onRemove, readOnly = false }) {
  const specs = {
    Decision: { label: "Decision", title: "Keep local files as the source of truth", fields: [["Status", "Accepted"], ["Owner", "Product"], ["Date", "July 22, 2026"]], body: "Cloud services can add convenience, but local writing and recovery cannot depend on an account or network." },
    Experiment: { label: "Experiment", title: "External-change review", fields: [["Status", "Running"], ["Measure", "Review completion"], ["Target", "Under 90 seconds"]], body: "Observe whether non-developers can understand and resolve three agent-made edits without Git terminology." },
    Brief: { label: "Brief", title: "Closed alpha", fields: [["Audience", "Product teams"], ["Platform", "macOS"], ["Window", "6–8 weeks"]], body: "Ship the smallest trustworthy loop for opening a project, editing its documents, and reviewing external changes." },
  };
  const spec = specs[type];
  return (
    <section className={`structured-block structured-${type.toLowerCase()}`} aria-label={`${type} block`}>
      <div className="structured-heading"><span>{spec.label}</span>{readOnly ? null : <IconButton label={`Remove ${type} block`} onClick={onRemove}><X /></IconButton>}</div>
      <input className="structured-title" aria-label={`${type} title`} defaultValue={spec.title} readOnly={readOnly} />
      <div className="structured-fields">
        {spec.fields.map(([label, value]) => <label key={label}><span>{label}</span><input defaultValue={value} readOnly={readOnly} /></label>)}
      </div>
      <textarea aria-label={`${type} description`} defaultValue={spec.body} rows={2} readOnly={readOnly} />
    </section>
  );
}

function SaveStatus({ status }) {
  const { t } = useTranslation();
  const statuses = {
    saved: [<CheckCircle key="icon" />, t("save.saved")],
    pending: [<PencilSimple key="icon" />, t("save.pending")],
    saving: [<ArrowsClockwise key="icon" className="spin" />, t("save.saving")],
    error: [<WarningCircle key="icon" />, t("save.error")],
    readonly: [<File key="icon" />, t("save.readonly")],
    conflict: [<WarningCircle key="icon" />, t("save.conflict")],
  };
  return <span className={`save-status ${status}`} role="status">{statuses[status]}</span>;
}

function JsonEditor({ document, source, saveStatus, saveRequest, onSaveStatus, onBack, onSourceChange, onRenameDocument }) {
  const { t } = useTranslation();
  const [value, setValue] = useState(source || "");
  const [validationError, setValidationError] = useState(null);
  const lastSaved = useRef(source || "");
  const saveTimer = useRef(null);
  const handledSaveRequest = useRef(saveRequest);
  const saveRef = useRef(null);
  const documentPath = document.path.replaceAll(" / ", "/");
  const jsonLines = /\.jsonl$/i.test(documentPath);

  const save = useCallback(async () => {
    window.clearTimeout(saveTimer.current);
    if (value === lastSaved.current || saveStatus === "readonly") return;
    const error = validateJsonDocument(value, jsonLines);
    setValidationError(error);
    if (error) {
      onSaveStatus("pending");
      return;
    }
    onSaveStatus("saving");
    try {
      await bridge.saveDocument({ id: document.id, path: documentPath, content: value });
      lastSaved.current = value;
      onSaveStatus("saved");
    } catch (error_) {
      onSaveStatus(error_?.code === "CONTENT_CONFLICT" ? "conflict" : "error");
    }
  }, [document.id, documentPath, jsonLines, onSaveStatus, saveStatus, value]);
  saveRef.current = save;

  useEffect(() => () => window.clearTimeout(saveTimer.current), []);
  useEffect(() => {
    if (handledSaveRequest.current === saveRequest) return;
    handledSaveRequest.current = saveRequest;
    void saveRef.current?.();
  }, [saveRequest]);

  function changeValue(next) {
    setValue(next);
    onSourceChange(document.id, next);
    const error = validateJsonDocument(next, jsonLines);
    setValidationError(error);
    onSaveStatus("pending");
    window.clearTimeout(saveTimer.current);
    if (!error) saveTimer.current = window.setTimeout(() => void saveRef.current?.(), 650);
  }

  function format() {
    const error = validateJsonDocument(value, jsonLines);
    setValidationError(error);
    if (!error) changeValue(formatJsonDocument(value, jsonLines));
  }

  return (
    <ContentSurface.Root className="editor-screen json-editor-screen" label={t("json.editing", { title: document.title })}>
      <ContentSurface.Header className="editor-toolbar">
        <div className="toolbar-title">
          <IconButton label={t("editor.backAll")} onClick={onBack}><ArrowLeft /></IconButton>
          <DocumentPathRename document={document} onRename={onRenameDocument} />
        </div>
        <div className="toolbar-actions">
          <SaveStatus status={saveStatus} />
          <button type="button" className="preview-text-button" onClick={format}><Check /> {t("json.format")}</button>
          <IconButton label={t("editor.showFinder")} onClick={() => void bridge.revealWorkspaceItem({ path: documentPath })}><FolderOpen /></IconButton>
          <IconButton label={t("editor.openTerminal")} onClick={() => void bridge.openWorkspaceItemInTerminal({ path: documentPath })}><TerminalWindow /></IconButton>
        </div>
      </ContentSurface.Header>
      <ContentSurface.Panel className="json-editor-panel">
        <JsonCodeEditor
          value={value}
          readOnly={saveStatus === "readonly"}
          jsonLines={jsonLines}
          ariaLabel={jsonLines ? t("json.jsonlEditor") : t("json.jsonEditor")}
          onChange={changeValue}
          onBlur={() => void saveRef.current?.()}
          onSave={() => void saveRef.current?.()}
        />
        <footer className={validationError ? "is-error" : ""} role="status">
          {validationError || t(jsonLines ? "json.validJsonl" : "json.validJson")}
        </footer>
      </ContentSurface.Panel>
    </ContentSurface.Root>
  );
}

function ReviewPanel({ current, total, change, resolution, onResolve, onPrevious, onNext, onFinish, onClose }) {
  const { t } = useTranslation();
  return (
    <aside className="review-panel" aria-label={t("review.label")}>
      <header><div><span>{t("review.external")}</span><strong>{t("review.position", { current: current + 1, total })}</strong></div><IconButton label={t("review.close")} onClick={onClose}><X /></IconButton></header>
      <div className="review-progress"><span style={{ width: `${((current + 1) / total) * 100}%` }} /></div>
      <div className="review-panel-body" key={current}>
        <div className="review-copy"><h2>{change.section}</h2><p>{t("review.choose")}</p></div>
        <div className="diff-block current"><span>{t("review.current")}</span><p>{change.current}</p></div>
        <div className="diff-block external"><span>{t("review.external")}</span><p>{change.external}</p></div>
        <div className="review-decisions">
          <button className={resolution === "external" ? "selected" : ""} onClick={() => onResolve("external")}><Check /> {t("review.useExternal")}</button>
          <button className={resolution === "current" ? "selected" : ""} onClick={() => onResolve("current")}><ArrowCounterClockwise /> {t("review.keepCurrent")}</button>
        </div>
      </div>
      <footer>
        <div><IconButton label={t("review.previous")} disabled={current === 0} onClick={onPrevious}><ArrowLeft /></IconButton><IconButton label={t("review.next")} disabled={current === total - 1} onClick={onNext}><ArrowRight /></IconButton></div>
        <button className="primary-button" disabled={!resolution} onClick={onFinish}>{current === total - 1 ? t("review.finish") : t("review.next")}</button>
      </footer>
    </aside>
  );
}

function historySourceLabel(t, source) {
  const keys = {
    "before-fylune-save": "history.sourceBeforeSave",
    "before-external-update": "history.sourceBeforeExternal",
    "before-agent-merge": "history.sourceBeforeAi",
    "before-snapshot-restore": "history.sourceBeforeRestore",
  };
  return t(keys[source] || "history.sourceAutomatic");
}

function HistoryPanel({ snapshots, loading, onPreview, onRestore, onClose }) {
  const { t, i18n } = useTranslation();
  const dateFormatter = useMemo(() => new Intl.DateTimeFormat(i18n.resolvedLanguage, {
    dateStyle: "medium",
    timeStyle: "short",
  }), [i18n.resolvedLanguage]);
  return (
    <aside className="task-panel history-panel" aria-label={t("history.label")}>
      <header><div><ClockCounterClockwise /><div><strong>{t("history.label")}</strong><span>{t("history.local")}</span></div></div><IconButton label={t("history.close")} onClick={onClose}><X /></IconButton></header>
      {loading ? <div className="history-loading"><span /><span /><span /></div> : (
        <div className="snapshot-list">
          {!snapshots.length ? <p className="history-empty">{t("history.empty")}</p> : snapshots.map((snapshot, index) => (
            <article key={snapshot.id} className={index === 0 ? "latest" : ""}>
              <div><strong>{historySourceLabel(t, snapshot.source)}</strong>{index === 0 ? <span className="status-badge">{t("history.latestSnapshot")}</span> : null}</div>
              <p>{dateFormatter.format(new Date(snapshot.createdAt))}</p>
              <span>
                {snapshot.changes?.added || snapshot.changes?.removed
                  ? [
                    snapshot.changes.added ? t("history.addedCount", { count: snapshot.changes.added }) : null,
                    snapshot.changes.removed ? t("history.removedCount", { count: snapshot.changes.removed }) : null,
                  ].filter(Boolean).join(" · ")
                  : t("history.noChanges")}
              </span>
              <div className="snapshot-actions">
                <button className="text-button" onClick={() => onPreview(snapshot)}><Eye /> {t("history.preview")}</button>
                <button className="text-button" onClick={() => onRestore(snapshot)}><ArrowCounterClockwise /> {t("history.restore")}</button>
              </div>
            </article>
          ))}
        </div>
      )}
    </aside>
  );
}

function HistoryPreview({ snapshot, loading, mode, onModeChange, onRestore, onClose }) {
  const { t, i18n } = useTranslation();
  const date = snapshot?.createdAt
    ? new Intl.DateTimeFormat(i18n.resolvedLanguage, { dateStyle: "medium", timeStyle: "short" }).format(new Date(snapshot.createdAt))
    : "";
  return (
    <section className="history-preview" aria-label={t("history.previewTitle")}>
      <header>
        <div>
          <span className="history-preview-kicker">{t("history.previewTitle")}</span>
          <strong>{snapshot ? historySourceLabel(t, snapshot.source) : t("history.loading")}</strong>
          {date ? <small>{date} · {t("history.comparedWithCurrent")}</small> : null}
        </div>
        <div className="history-preview-controls">
          <div className="segmented-control" role="group" aria-label={t("history.previewMode")}>
            <button className={mode === "changes" ? "active" : ""} onClick={() => onModeChange("changes")}>{t("history.changes")}</button>
            <button className={mode === "version" ? "active" : ""} onClick={() => onModeChange("version")}>{t("history.version")}</button>
          </div>
          <button className="secondary-button" disabled={!snapshot || loading} onClick={() => onRestore(snapshot)}><ArrowCounterClockwise /> {t("history.restore")}</button>
          <IconButton label={t("common.close")} onClick={onClose}><X /></IconButton>
        </div>
      </header>
      <div className="history-preview-scroll">
        {loading ? <div className="history-loading"><span /><span /><span /></div> : mode === "version" ? (
          <FyluneDocument markdown={snapshot?.content || ""} className="history-version-document" />
        ) : (
          <div className="history-diff" aria-live="polite">
            {snapshot?.changes?.segments?.length ? snapshot.changes.segments.map((segment, index) => (
              <section className={`history-diff-segment ${segment.type}`} key={`${segment.type}-${index}`}>
                {segment.type !== "unchanged" ? (
                  <span className="history-diff-label">
                    {segment.type === "added" ? <Plus /> : <Minus />}
                    {segment.type === "added" ? t("history.added") : t("history.removed")}
                  </span>
                ) : null}
                <FyluneDocument markdown={segment.content} />
              </section>
            )) : <p className="history-empty">{t("history.noChanges")}</p>}
          </div>
        )}
      </div>
    </section>
  );
}

function Editor({ document, source, saveStatus, saveRequest, onSaveStatus, onBack, onSourceChange, onContextSourceChange, onAssetImported, onRenameDocument, onDocumentIconChange, reviewAgentChanges = false }) {
  const { t } = useTranslation();
  const localizedSlashCommands = useMemo(() => slashCommands.map((command) => ({
    ...command,
    label: t(`blocks.${command.id}`),
    detail: t(`blocks.${command.id}Copy`),
  })), [t]);
  const initialSource = splitDocumentSource(source, document?.title);
  const hasInitialContent = typeof source !== "string" || Boolean(source.trim());
  const [title, setTitle] = useState(initialSource.title);
  const [bodySource, setBodySource] = useState(initialSource.body);
  const [wordCount, setWordCount] = useState(() => countDocumentWords(initialSource.body));
  const [documentIcon, setDocumentIcon] = useState(initialSource.icon || document?.icon || null);
  const [iconPickerOpen, setIconPickerOpen] = useState(false);
  const [blocks, setBlocks] = useState(bridge.isDemo && hasInitialContent ? ["Decision"] : []);
  const [insertMenu, setInsertMenu] = useState(false);
  const [reviewOpen, setReviewOpen] = useState(false);
  const [reviewIndex, setReviewIndex] = useState(0);
  const [resolutions, setResolutions] = useState({});
  const [reviewChanges, setReviewChanges] = useState(bridge.isDemo && hasInitialContent ? externalChanges : []);
  const [pendingMerge, setPendingMerge] = useState(null);
  const [externalHash, setExternalHash] = useState(null);
  const [externalPending, setExternalPending] = useState(bridge.isDemo && hasInitialContent);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [activityOpen, setActivityOpen] = useState(false);
  const [changeActivity, setChangeActivity] = useState(() => (
    readChangeActivity(window.localStorage, document?.id)
  ));
  const [snapshots, setSnapshots] = useState(demoSnapshots);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyPreview, setHistoryPreview] = useState(null);
  const [historyPreviewLoading, setHistoryPreviewLoading] = useState(false);
  const [historyPreviewMode, setHistoryPreviewMode] = useState("changes");
  const [dropTarget, setDropTarget] = useState(null);
  const [assetImporting, setAssetImporting] = useState(false);
  const [editorMenu, setEditorMenu] = useState(false);
  const [presentation, setPresentation] = useState(false);
  const [presentationZoom, setPresentationZoom] = useState(100);
  const [formattingVisible, setFormattingVisible] = useState(false);
  const [slashMenu, setSlashMenu] = useState(null);
  const [slashIndex, setSlashIndex] = useState(0);
  const fileInput = useRef(null);
  const imageReplacementInput = useRef(null);
  const pendingImageChoice = useRef(null);
  const mdxEditorRef = useRef(null);
  const collaborationEditorRef = useRef(null);
  const editorShell = useRef(null);
  const editorScroll = useRef(null);
  const editorMenuRef = useRef(null);
  const activityRef = useRef(null);
  const iconPickerRef = useRef(null);
  const insertMenuRef = useRef(null);
  const slashMenuRef = useRef(null);
  const dragDepth = useRef(0);
  const latestSource = useRef(source || "");
  const baseSource = useRef(source || "");
  const latestTitle = useRef(initialSource.title);
  const latestIcon = useRef(initialSource.icon || document?.icon || null);
  const frontmatterRef = useRef(initialSource.frontmatter);
  const bodySourceRef = useRef(initialSource.body);
  const latestSaveStatus = useRef(saveStatus);
  const saveTimer = useRef(null);
  const saveInFlight = useRef(null);
  const saveQueuedAfterFlight = useRef(false);
  const saveRef = useRef(null);
  const handledSaveRequest = useRef(saveRequest);
  const contextSourceTimer = useRef(null);
  const pendingContextSource = useRef(null);
  const wordCountTimer = useRef(null);
  const dirty = useRef(false);
  const changedSinceMount = useRef(false);
  const editorReady = useRef(false);
  const compositionActive = useRef(false);
  const pendingExternalChange = useRef(null);
  const integratedPreviewState = useRef(null);
  const enteredFullscreen = useRef(false);
  const documentPath = document?.path?.replace(" / ", "/");
  const completeImageChoice = useCallback((file) => {
    const resolve = pendingImageChoice.current;
    pendingImageChoice.current = null;
    resolve?.(file);
  }, []);
  const promptForDocumentImage = useCallback(() => new Promise((resolve) => {
    pendingImageChoice.current?.(null);
    pendingImageChoice.current = resolve;
    if (imageReplacementInput.current) {
      imageReplacementInput.current.value = "";
      imageReplacementInput.current.click();
    } else {
      completeImageChoice(null);
    }
  }), [completeImageChoice]);
  const chooseDocumentImage = useCallback(async () => {
    const file = await promptForDocumentImage();
    if (!file) return null;
    setAssetImporting(true);
    onSaveStatus("saving");
    try {
      const result = await bridge.importAsset(file, documentPath);
      if (!result || result.kind !== "image") throw new Error(t("editor.chooseSupportedImage"));
      await onAssetImported?.([result]);
      window.dispatchEvent(new CustomEvent("fylune-toast", { detail: { message: t("editor.assetLinked", { name: result.name }) } }));
      return result;
    } catch (error) {
      onSaveStatus("error");
      throw error;
    } finally {
      setAssetImporting(false);
    }
  }, [documentPath, onAssetImported, onSaveStatus, promptForDocumentImage]);
  const ImageToolbar = useMemo(() => function FyluneDocumentImageToolbar(props) {
    return <DocumentImageToolbar {...props} onChooseImage={chooseDocumentImage} />;
  }, [chooseDocumentImage]);

  const editorPlugins = useMemo(() => [
    ...baseEditorPlugins,
    editorCollaborationPlugin({ controllerRef: collaborationEditorRef }),
    imagePlugin({
      imagePreviewHandler: async (imageSource) => bridge.previewDocumentAsset?.(imageSource, documentPath) || imageSource,
      EditImageToolbar: ImageToolbar,
    }),
    toolbarPlugin({
      toolbarClassName: "fylune-formatting-toolbar",
      toolbarContents: () => (
        <>
          <BlockTypeSelect />
          <span className="formatting-divider" aria-hidden="true" />
          <BoldItalicUnderlineToggles />
          <CodeToggle />
          <CreateLink />
          <span className="formatting-divider" aria-hidden="true" />
          <ListsToggle options={["bullet", "number", "check"]} />
          <UndoRedo />
        </>
      ),
    }),
  ], [documentPath, ImageToolbar]);

  useDismissibleLayer({
    open: iconPickerOpen,
    onDismiss: () => setIconPickerOpen(false),
    insideRefs: [iconPickerRef],
    restoreFocusRef: iconPickerRef,
  });
  useDismissibleLayer({
    open: activityOpen,
    onDismiss: () => setActivityOpen(false),
    insideRefs: [activityRef],
    restoreFocusRef: activityRef,
  });
  useDismissibleLayer({
    open: editorMenu,
    onDismiss: () => setEditorMenu(false),
    insideRefs: [editorMenuRef],
    restoreFocusRef: editorMenuRef,
  });
  useDismissibleLayer({
    open: insertMenu,
    onDismiss: () => setInsertMenu(false),
    insideRefs: [insertMenuRef],
    restoreFocusRef: insertMenuRef,
  });
  useDismissibleLayer({
    open: Boolean(slashMenu),
    onDismiss: () => setSlashMenu(null),
    insideRefs: [slashMenuRef],
  });

  useEffect(() => {
    const next = splitDocumentSource(source, document?.title);
    const nextIcon = next.icon || document?.icon || null;
    setTitle(next.title);
    setBodySource(next.body);
    setWordCount(countDocumentWords(next.body));
    setDocumentIcon(nextIcon);
    setIconPickerOpen(false);
    latestTitle.current = next.title;
    latestIcon.current = nextIcon;
    frontmatterRef.current = next.frontmatter;
    bodySourceRef.current = next.body;
    latestSource.current = source || "";
    baseSource.current = source || "";
    if (saveTimer.current) window.clearTimeout(saveTimer.current);
    dirty.current = false;
    changedSinceMount.current = false;
    editorReady.current = false;
    integratedPreviewState.current = null;
    setFormattingVisible(false);
    setSlashMenu(null);
    setActivityOpen(false);
    setChangeActivity(readChangeActivity(window.localStorage, document?.id));
  }, [document?.id, document?.title, source]);

  useEffect(() => {
    latestTitle.current = title;
  }, [title]);

  useEffect(() => {
    latestSaveStatus.current = saveStatus;
  }, [saveStatus]);

  useEffect(() => setBlocks(bridge.isDemo && hasInitialContent ? ["Decision"] : []), [document?.id, hasInitialContent]);

  useEffect(() => {
    function handleSelectionChange() {
      const shell = editorShell.current;
      const content = shell?.querySelector(".fylune-mdx-content");
      const selection = window.getSelection?.();
      const isTextSelection = Boolean(
        content
        && selection
        && !selection.isCollapsed
        && selection.rangeCount
        && selection.anchorNode
        && selection.focusNode
        && content.contains(selection.anchorNode)
        && content.contains(selection.focusNode),
      );
      setFormattingVisible(isTextSelection);
      if (!isTextSelection || !selection.getRangeAt(0).getBoundingClientRect) return;
      const selectionRect = selection.getRangeAt(0).getBoundingClientRect();
      const shellRect = shell.getBoundingClientRect();
      const center = selectionRect.left - shellRect.left + selectionRect.width / 2;
      shell.style.setProperty("--formatting-left", `${Math.max(160, Math.min(shellRect.width - 160, center))}px`);
      shell.style.setProperty("--formatting-top", `${Math.max(4, selectionRect.top - shellRect.top - 8)}px`);
    }

    window.document.addEventListener("selectionchange", handleSelectionChange);
    return () => window.document.removeEventListener("selectionchange", handleSelectionChange);
  }, [document?.id]);

  useEffect(() => {
    if (!presentation) return undefined;
    function handleKeyDown(event) {
      if (event.key === "Escape") {
        event.preventDefault();
        stopPresentation();
      } else if (event.key === "+" || event.key === "=") {
        event.preventDefault();
        setPresentationZoom((zoom) => clampPresentationZoom(zoom + 10));
      } else if (event.key === "-" || event.key === "_") {
        event.preventDefault();
        setPresentationZoom((zoom) => clampPresentationZoom(zoom - 10));
      } else if (event.key === "0") {
        event.preventDefault();
        setPresentationZoom(100);
      }
    }
    function handleFullscreenChange() {
      if (!window.document.fullscreenElement && enteredFullscreen.current) {
        enteredFullscreen.current = false;
        setPresentation(false);
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    window.document.addEventListener("fullscreenchange", handleFullscreenChange);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.document.removeEventListener("fullscreenchange", handleFullscreenChange);
    };
  }, [presentation]);

  const fullSource = useCallback((nextBody = bodySourceRef.current, nextTitle = latestTitle.current, nextIcon = latestIcon.current) => {
    const structured = blocks.map(structuredBlockSource).filter(Boolean).join("\n\n");
    const metadata = serializeDocumentFrontmatter(frontmatterRef.current, nextIcon);
    return `${metadata}# ${nextTitle.trim() || t("editor.untitled")}\n\n${nextBody.trim()}${structured ? `\n\n${structured}` : ""}\n`;
  }, [blocks]);

  const publishContextSource = useCallback((nextSource) => {
    onContextSourceChange?.(document?.id, nextSource);
  }, [document?.id, onContextSourceChange]);

  const scheduleContextSource = useCallback((nextSource) => {
    pendingContextSource.current = nextSource;
    if (contextSourceTimer.current) window.clearTimeout(contextSourceTimer.current);
    contextSourceTimer.current = window.setTimeout(() => {
      contextSourceTimer.current = null;
      const pendingSource = pendingContextSource.current;
      pendingContextSource.current = null;
      if (typeof pendingSource === "string") publishContextSource(pendingSource);
    }, 240);
  }, [publishContextSource]);

  const scheduleWordCount = useCallback((nextSource) => {
    if (wordCountTimer.current) window.clearTimeout(wordCountTimer.current);
    wordCountTimer.current = window.setTimeout(() => {
      wordCountTimer.current = null;
      setWordCount(countDocumentWords(nextSource));
    }, 160);
  }, []);

  const trackUserSource = useCallback((nextSource) => {
    latestSource.current = nextSource;
    if (integratedPreviewState.current) {
      const nextPreviewState = updateIntegratedPreviewUnderlying({
        state: integratedPreviewState.current,
        nextDisplayedSource: nextSource,
      });
      if (nextPreviewState) integratedPreviewState.current = nextPreviewState;
    }
    scheduleContextSource(nextSource);
  }, [scheduleContextSource]);

  const applyDocumentSource = useCallback((nextSource, { highlight = false, publish = true } = {}) => {
    const next = splitDocumentSource(nextSource, document?.title);
    const nextIcon = next.icon || document?.icon || null;
    setTitle(next.title);
    setBodySource(next.body);
    setWordCount(countDocumentWords(next.body));
    setDocumentIcon(nextIcon);
    latestTitle.current = next.title;
    latestIcon.current = nextIcon;
    frontmatterRef.current = next.frontmatter;
    bodySourceRef.current = next.body;
    latestSource.current = nextSource;
    const applied = collaborationEditorRef.current?.apply?.(next.body, { highlight });
    if (!applied) mdxEditorRef.current?.setMarkdown?.(next.body);
    if (publish) onSourceChange?.(document?.id, nextSource);
    publishContextSource(nextSource);
  }, [document?.icon, document?.id, document?.title, onSourceChange, publishContextSource]);

  const offerMergeUndo = useCallback((previousSource, mergedSource, message) => {
    window.dispatchEvent(new CustomEvent("fylune-toast", {
      detail: {
        message,
        action: t("editor.undo"),
        onAction: async () => {
          if (latestSource.current !== mergedSource) {
            window.dispatchEvent(new CustomEvent("fylune-toast", {
              detail: { message: t("editor.externalUndoUnavailable") },
            }));
            return;
          }
          try {
            const current = await bridge.readDocumentFresh(documentPath);
            await bridge.saveDocument({
              id: document?.id,
              path: documentPath,
              title: latestTitle.current,
              content: previousSource,
              expectedHash: current.hash,
            });
            applyDocumentSource(previousSource);
            baseSource.current = previousSource;
            dirty.current = false;
            await bridge.clearDraft?.({ path: documentPath });
            onSaveStatus("saved");
            window.dispatchEvent(new CustomEvent("fylune-toast", {
              detail: { message: t("editor.externalMergeUndone") },
            }));
          } catch (error) {
            await bridge.saveDraft?.({ path: documentPath, content: latestSource.current }).catch(() => {});
            onSaveStatus(error?.code === "CONTENT_CONFLICT" ? "conflict" : "error");
            window.dispatchEvent(new CustomEvent("fylune-toast", {
              detail: { message: error?.message || t("editor.externalMergeFailed") },
            }));
          }
        },
      },
    }));
  }, [applyDocumentSource, document?.id, documentPath, onSaveStatus, t]);

  const stageMergeReview = useCallback((result, hash) => {
    setPendingMerge(result);
    setExternalHash(hash);
    setReviewChanges(result.conflicts.map((conflict) => ({
      id: conflict.id,
      section: conflict.section || t("editor.wholeDocument"),
      current: conflict.local,
      external: conflict.disk,
      base: conflict.base,
    })));
    setReviewIndex(0);
    setResolutions({});
    setExternalPending(true);
    onSaveStatus("conflict");
  }, [onSaveStatus, t]);

  const recordChangeActivity = useCallback((status, result, source = null) => {
    const entry = {
      id: `change-${window.crypto?.randomUUID?.() || `${Date.now()}-${Math.random()}`}`,
      documentId: document?.id,
      sourceKind: source?.sourceKind,
      displayName: source?.displayName,
      status,
      blockCount: result?.conflicts?.length || result?.parts?.filter((part) => part.type === "text" && part.value)?.length || 1,
      snapshotId: source?.snapshotId || null,
    };
    const next = appendChangeActivity(window.localStorage, entry);
    setChangeActivity(next);
    return entry;
  }, [document?.id]);

  const reconcileExternalDocument = useCallback(async (firstExternal, source = null) => {
    let external = firstExternal;
    let waitedForQuiet = false;
    for (let attempt = 0; attempt < 4; attempt += 1) {
      const local = latestSource.current;
      const result = mergeDocumentVersions({
        base: baseSource.current,
        local,
        disk: external.content,
      });
      if (shouldStageExternalReview({
        reviewAgentChanges,
        sourceKind: source?.sourceKind,
        mergeStatus: result.status,
      })) {
        recordChangeActivity("review_required", result, source);
        stageMergeReview({
          status: "review",
          content: null,
          conflicts: [{
            id: "safe-agent-change",
            section: t("editor.wholeDocument"),
            base: baseSource.current,
            local,
            disk: result.content,
          }],
          parts: [{ type: "conflict", id: "safe-agent-change" }],
        }, external.hash);
        return result;
      }
      if (result.status === "fast_forward" || result.status === "unchanged") {
        await bridge.acceptExternalVersion?.(external.hash);
        applyDocumentSource(result.content, { highlight: true });
        baseSource.current = result.content;
        dirty.current = false;
        setPendingMerge(null);
        setExternalPending(false);
        onSaveStatus("saved");
        offerMergeUndo(
          local,
          result.content,
          source?.sourceKind === "integrated_agent" && source.displayName
            ? t("editor.externalAutoMergedBy", { agent: source.displayName })
            : t("editor.externalAutoMerged"),
        );
        if (result.status === "fast_forward") recordChangeActivity("auto_merged", result, source);
        return result;
      }
      if (result.status === "local_only") {
        await bridge.acceptExternalVersion?.(external.hash);
        return result;
      }
      if (result.status === "review" || result.status === "protected") {
        recordChangeActivity(result.status === "protected" ? "protected" : "review_required", result, source);
        stageMergeReview(result, external.hash);
        return result;
      }
      try {
        const saved = await bridge.saveDocument({
          id: document?.id,
          path: documentPath,
          title: latestTitle.current,
          content: result.content,
          expectedHash: external.hash,
        });
        applyDocumentSource(result.content, { highlight: true });
        baseSource.current = result.content;
        dirty.current = false;
        setPendingMerge(null);
        setExternalPending(false);
        await bridge.clearDraft?.({ path: documentPath });
        onSaveStatus("saved");
        offerMergeUndo(
          local,
          result.content,
          source?.sourceKind === "integrated_agent" && source.displayName
            ? t("editor.externalAutoMergedBy", { agent: source.displayName })
            : t("editor.externalAutoMerged"),
        );
        recordChangeActivity("auto_merged", result, source);
        return { ...result, saved };
      } catch (error) {
        if (error?.code !== "CONTENT_CONFLICT") throw error;
        if (attempt === 2 && !waitedForQuiet) {
          await bridge.saveDraft?.({ path: documentPath, content: latestSource.current }).catch(() => {});
          onSaveStatus("external");
          const quiet = await waitForDocumentQuiet(() => bridge.readDocumentFresh(documentPath));
          if (!quiet.quiet) {
            const quietError = new Error(t("editor.externalStillChanging"));
            quietError.code = "WAITING_FOR_QUIET";
            throw quietError;
          }
          external = quiet.latest;
          waitedForQuiet = true;
          continue;
        }
        if (attempt === 3) throw error;
        external = await bridge.readDocumentFresh(documentPath);
      }
    }
    return null;
  }, [applyDocumentSource, document?.id, documentPath, offerMergeUndo, onSaveStatus, recordChangeActivity, reviewAgentChanges, stageMergeReview, t]);

  const applyIntegratedPreview = useCallback((change) => {
    const next = upsertIntegratedPreview({
      state: integratedPreviewState.current,
      currentSource: latestSource.current,
      baseSource: baseSource.current,
      change,
      previousStatus: latestSaveStatus.current,
    });
    if (!next) return false;
    integratedPreviewState.current = next.state;
    applyDocumentSource(next.source, { highlight: true, publish: false });
    onSaveStatus("external");
    return true;
  }, [applyDocumentSource, onSaveStatus]);

  const rollbackIntegratedPreview = useCallback((change) => {
    const previous = integratedPreviewState.current;
    const next = removeIntegratedPreview({
      state: previous,
      currentSource: latestSource.current,
      transactionId: change?.transactionId,
    });
    if (!next) return false;
    integratedPreviewState.current = next.state;
    applyDocumentSource(next.source, { highlight: true, publish: false });
    onSaveStatus(next.state ? "external" : dirty.current ? "saving" : previous?.previousStatus || "saved");
    return true;
  }, [applyDocumentSource, onSaveStatus]);

  const processExternalChange = useCallback(async (change) => {
    if (change?.kind === "preview") {
      if (!applyIntegratedPreview(change)) {
        throw new Error(t("editor.externalMergeFailed"));
      }
      return;
    }
    if (change?.kind === "preview-cancel") {
      if (!rollbackIntegratedPreview(change)) {
        throw new Error(t("editor.externalMergeFailed"));
      }
      return;
    }
    const suspended = suspendIntegratedPreviews({
      state: integratedPreviewState.current,
      currentSource: latestSource.current,
    });
    if (!suspended) throw new Error(t("editor.externalMergeFailed"));
    const remainingPreviews = new Map(suspended.items);
    if (change?.transactionId) remainingPreviews.delete(change.transactionId);
    if (integratedPreviewState.current) {
      integratedPreviewState.current = null;
      applyDocumentSource(suspended.source, { highlight: true, publish: false });
    }
    const external = change?.kind === "delete"
      ? { path: documentPath, content: "", hash: null, missing: true }
      : await bridge.readDocumentFresh(documentPath);
    let reconcileError = null;
    try {
      await reconcileExternalDocument(external, change);
    } catch (error) {
      reconcileError = error;
    }
    const resumed = resumeIntegratedPreviews({
      underlying: latestSource.current,
      items: remainingPreviews,
      previousStatus: suspended.previousStatus,
    });
    if (!resumed) {
      integratedPreviewState.current = null;
      throw new Error(t("editor.externalMergeFailed"));
    }
    integratedPreviewState.current = resumed.state;
    if (resumed.state) {
      applyDocumentSource(resumed.source, { highlight: true, publish: false });
      onSaveStatus("external");
    }
    if (reconcileError) throw reconcileError;
  }, [applyDocumentSource, applyIntegratedPreview, documentPath, onSaveStatus, reconcileExternalDocument, rollbackIntegratedPreview, t]);

  const undoChangeActivity = useCallback(async (entry) => {
    if (!entry?.snapshotId) {
      await showHistory();
      setActivityOpen(false);
      return;
    }
    try {
      await bridge.restoreSnapshot(entry.snapshotId);
      const restored = await bridge.readDocumentFresh(documentPath);
      await bridge.acceptExternalVersion?.(restored.hash);
      applyDocumentSource(restored.content, { highlight: true });
      baseSource.current = restored.content;
      dirty.current = false;
      onSaveStatus("saved");
      setChangeActivity(updateChangeActivity(
        window.localStorage,
        document?.id,
        entry.id,
        "reverted",
      ));
    } catch (error) {
      window.dispatchEvent(new CustomEvent("fylune-toast", {
        detail: { message: error?.message || t("editor.externalUndoUnavailable") },
      }));
    }
  }, [applyDocumentSource, document?.id, documentPath, onSaveStatus, showHistory, t]);

  useEffect(() => {
    if (!bridge.onExternalChange) return undefined;
    return bridge.onExternalChange(async (change) => {
      if (!documentPath || change?.path !== documentPath) return;
      if (compositionActive.current || collaborationEditorRef.current?.isComposing?.()) {
        pendingExternalChange.current = change;
        return;
      }
      try {
        await processExternalChange(change);
      } catch (error) {
        await bridge.saveDraft?.({
          path: documentPath,
          content: latestSource.current,
        }).catch(() => {});
        onSaveStatus("conflict");
        window.dispatchEvent(new CustomEvent("fylune-toast", {
          detail: { message: error?.message || t("editor.externalMergeFailed") },
        }));
      }
    });
  }, [documentPath, onSaveStatus, processExternalChange, t]);

  const finishComposition = useCallback(() => {
    compositionActive.current = false;
    const change = pendingExternalChange.current;
    pendingExternalChange.current = null;
    if (!change || !documentPath) return;
    window.setTimeout(async () => {
      try {
        await processExternalChange(change);
      } catch (error) {
        await bridge.saveDraft?.({ path: documentPath, content: latestSource.current }).catch(() => {});
        onSaveStatus("conflict");
        window.dispatchEvent(new CustomEvent("fylune-toast", {
          detail: { message: error?.message || t("editor.externalMergeFailed") },
        }));
      }
    }, 0);
  }, [documentPath, onSaveStatus, processExternalChange, t]);

  useEffect(() => {
    trackUserSource(fullSource());
  }, [fullSource, trackUserSource]);

  useEffect(() => () => {
    if (saveTimer.current) window.clearTimeout(saveTimer.current);
    if (contextSourceTimer.current) window.clearTimeout(contextSourceTimer.current);
    if (wordCountTimer.current) window.clearTimeout(wordCountTimer.current);
    const displayedSource = latestSource.current;
    const pendingSource = integratedPreviewState.current
      ? stripIntegratedPreviews(integratedPreviewState.current, displayedSource)
      : displayedSource;
    if (integratedPreviewState.current) {
      void bridge.saveDraft?.({
        path: document?.path?.replace(" / ", "/"),
        content: pendingSource ?? displayedSource,
      }).catch(() => {});
      return;
    }
    if (changedSinceMount.current) onSourceChange?.(document?.id, pendingSource);
    if (!dirty.current || latestSaveStatus.current === "readonly") return;
    dirty.current = false;
    void bridge.saveDocument({
      id: document?.id,
      path: document?.path?.replace(" / ", "/"),
      title: latestTitle.current,
      content: pendingSource,
    }).then(() => {
      baseSource.current = pendingSource;
    }).catch(() => bridge.saveDraft?.({
      path: document?.path?.replace(" / ", "/"),
      content: pendingSource,
    }));
  }, [document?.id, document?.path, onSourceChange]);

  const save = useCallback(async () => {
    if (latestSaveStatus.current === "readonly") return;
    if (saveInFlight.current) {
      saveQueuedAfterFlight.current = true;
      return saveInFlight.current;
    }
    if (saveTimer.current) {
      window.clearTimeout(saveTimer.current);
      saveTimer.current = null;
    }
    const runSave = async () => {
      if (integratedPreviewState.current) {
        const underlying = stripIntegratedPreviews(
          integratedPreviewState.current,
          latestSource.current,
        );
        if (underlying == null) {
          await bridge.saveDraft?.({
            path: documentPath,
            content: latestSource.current,
          }).catch(() => {});
          latestSaveStatus.current = "conflict";
          onSaveStatus("conflict");
          return;
        }
        await bridge.saveDraft?.({
          path: documentPath,
          content: underlying,
        }).catch(() => {});
        latestSaveStatus.current = "external";
        onSaveStatus("external");
        return;
      }
      latestSaveStatus.current = "saving";
      onSaveStatus("saving");
      const pendingSource = latestSource.current || fullSource();
      const pendingTitle = latestTitle.current;
      try {
        await bridge.saveDocument({ id: document?.id, path: document?.path?.replace(" / ", "/"), title: pendingTitle, content: pendingSource });
        baseSource.current = pendingSource;
        if (latestSource.current === pendingSource) {
          dirty.current = false;
          latestSaveStatus.current = "saved";
          onSaveStatus("saved");
        } else {
          latestSaveStatus.current = "pending";
          onSaveStatus("pending");
        }
      } catch (error) {
        await bridge.saveDraft?.({
          path: document?.path?.replace(" / ", "/"),
          content: pendingSource,
        }).catch(() => {});
        latestSaveStatus.current = error?.code === "CONTENT_CONFLICT" ? "conflict" : "error";
        onSaveStatus(latestSaveStatus.current);
      }
    };
    const inFlight = runSave();
    saveInFlight.current = inFlight;
    try {
      await inFlight;
    } finally {
      if (saveInFlight.current === inFlight) saveInFlight.current = null;
      if (saveQueuedAfterFlight.current) {
        saveQueuedAfterFlight.current = false;
        window.setTimeout(() => void saveRef.current?.(), 0);
      }
    }
  }, [document?.id, document?.path, documentPath, fullSource, onSaveStatus]);

  useEffect(() => {
    saveRef.current = save;
  }, [save]);

  useEffect(() => {
    if (saveRequest === handledSaveRequest.current) return;
    handledSaveRequest.current = saveRequest;
    void save();
  }, [save, saveRequest]);

  const queueSave = useCallback(() => {
    if (latestSaveStatus.current === "readonly") return;
    dirty.current = true;
    changedSinceMount.current = true;
    if (latestSaveStatus.current !== "saving" && latestSaveStatus.current !== "pending") {
      latestSaveStatus.current = "pending";
      onSaveStatus("pending");
    }
    if (saveTimer.current) window.clearTimeout(saveTimer.current);
    saveTimer.current = window.setTimeout(() => {
      saveTimer.current = null;
      void save();
    }, 420);
  }, [onSaveStatus, save]);

  function selectDocumentIcon(icon) {
    latestIcon.current = icon;
    setDocumentIcon(icon);
    setIconPickerOpen(false);
    trackUserSource(fullSource(bodySourceRef.current, latestTitle.current, icon));
    onDocumentIconChange?.(document, icon);
    queueSave();
  }

  function moveFromTitleToBody(event) {
    if (event.key !== "Enter" || presentation || saveStatus === "readonly") return;
    event.preventDefault();
    setIconPickerOpen(false);
    mdxEditorRef.current?.focus(undefined, { defaultSelection: "rootStart" });
    const editable = editorShell.current?.querySelector(".fylune-mdx-content");
    if (!editable) return;
    editable.focus({ preventScroll: true });
    const firstText = window.document.createTreeWalker(editable, window.NodeFilter.SHOW_TEXT).nextNode();
    if (!firstText) return;
    const selection = window.getSelection?.();
    const range = window.document.createRange();
    range.setStart(firstText, 0);
    range.collapse(true);
    selection?.removeAllRanges();
    selection?.addRange(range);
  }

  function slashMenuPosition() {
    const selection = window.getSelection?.();
    const shell = editorShell.current;
    if (!selection?.rangeCount || !shell) return { left: 24, top: 44 };
    const range = selection.getRangeAt(0);
    const caret = range.getBoundingClientRect?.();
    const shellRect = shell.getBoundingClientRect();
    if (!caret) return { left: 24, top: 44 };
    return {
      left: Math.max(12, Math.min(shellRect.width - 280, caret.left - shellRect.left)),
      top: Math.max(12, caret.bottom - shellRect.top + 8),
    };
  }

  function insertSlashCommand(command) {
    setSlashMenu(null);
    const editor = mdxEditorRef.current;
    if (!editor) return;
    if (command.id === "text") {
      editor.focus();
      return;
    }
    editor.focus(() => editor.insertMarkdown(command.markdown));
    bodySourceRef.current = editor.getMarkdown();
    trackUserSource(fullSource(bodySourceRef.current));
    queueSave();
  }

  function insertSpecialBlock(commandId) {
    const command = localizedSlashCommands.find((candidate) => candidate.id === commandId);
    if (!command) return;
    setInsertMenu(false);
    insertSlashCommand(command);
  }

  function handleEditorKeyDown(event) {
    if (slashMenu) {
      if (event.key === "ArrowDown" || event.key === "ArrowUp") {
        event.preventDefault();
        const direction = event.key === "ArrowDown" ? 1 : -1;
        setSlashIndex((index) => (index + direction + localizedSlashCommands.length) % localizedSlashCommands.length);
      } else if (event.key === "Enter") {
        event.preventDefault();
        insertSlashCommand(localizedSlashCommands[slashIndex]);
      } else if (event.key === "Escape") {
        event.preventDefault();
        setSlashMenu(null);
        mdxEditorRef.current?.insertMarkdown("/");
      }
      return;
    }
    if (event.key !== "/" || event.metaKey || event.ctrlKey || event.altKey || presentation || saveStatus === "readonly") return;
    const selection = window.getSelection?.();
    const content = editorShell.current?.querySelector(".fylune-mdx-content");
    if (!selection?.isCollapsed || !selection.anchorNode || !content?.contains(selection.anchorNode)) return;
    const text = selection.anchorNode.nodeType === window.Node.TEXT_NODE ? selection.anchorNode.textContent || "" : "";
    if (text.slice(0, selection.anchorOffset).trim()) return;
    event.preventDefault();
    setSlashIndex(0);
    setSlashMenu(slashMenuPosition());
  }

  function insertAssetMarkdown(markdown, blockIndex = null) {
    const editor = mdxEditorRef.current;
    if (!editor || !markdown) return;
    const before = editor.getMarkdown();
    if (Number.isInteger(blockIndex)) {
      const next = insertMarkdownBlock(before, markdown, blockIndex);
      editor.setMarkdown(next);
      bodySourceRef.current = next;
      trackUserSource(fullSource(next));
      queueSave();
      return;
    }
    const insertion = `\n\n${markdown}\n\n`;
    editor.focus(() => editor.insertMarkdown(insertion), { defaultSelection: "rootEnd" });
    window.setTimeout(() => {
      if (!editor.getMarkdown().includes(markdown)) editor.setMarkdown(`${before.trimEnd()}${insertion}`);
    }, 60);
  }

  async function importAssets(files, blockIndex = null) {
    const supported = files.filter((file) => /\.(?:png|jpe?g|webp|gif|mp4|m4v|mov|webm|pdf)$/i.test(file.name));
    if (!supported.length) {
      window.dispatchEvent(new CustomEvent("fylune-toast", { detail: { message: t("editor.addMediaFile") } }));
      return;
    }
    setAssetImporting(true);
    onSaveStatus("saving");
    try {
      const imported = [];
      for (const file of supported) {
        const result = await bridge.importAsset(file, documentPath);
        if (result) imported.push(result);
      }
      const markdown = imported.map((asset) => asset.markdown || (asset.kind === "image" ? `![${asset.name}](${asset.markdownUrl})` : `[${asset.name}](${asset.markdownUrl})`)).join("\n\n");
      if (markdown) {
        insertAssetMarkdown(markdown, blockIndex);
        dirty.current = true;
        onSaveStatus("saving");
        await onAssetImported?.(imported);
        window.dispatchEvent(new CustomEvent("fylune-toast", { detail: { message: t("editor.filesCopied", { count: imported.length }) } }));
      }
    } catch (error) {
      onSaveStatus("error");
      window.dispatchEvent(new CustomEvent("fylune-toast", { detail: { message: error?.message || t("editor.fileAddFailed") } }));
    } finally {
      setAssetImporting(false);
      setInsertMenu(false);
    }
  }

  async function importFile(event) {
    const files = [...(event.target.files || [])];
    event.target.value = "";
    await importAssets(files);
  }

  async function importNativeAsset() {
    setAssetImporting(true);
    onSaveStatus("saving");
    try {
      const result = await bridge.importAsset(null, documentPath);
      if (result) {
        insertAssetMarkdown(result.markdown);
        dirty.current = true;
        onSaveStatus("saving");
        await onAssetImported?.([result]);
        window.dispatchEvent(new CustomEvent("fylune-toast", { detail: { message: t("editor.assetCopied", { name: result.name }) } }));
      } else onSaveStatus("saved");
    } catch (error) {
      onSaveStatus("error");
      window.dispatchEvent(new CustomEvent("fylune-toast", { detail: { message: error?.message || t("editor.fileAddFailed") } }));
    }
    setAssetImporting(false);
    setInsertMenu(false);
  }

  function dragContainsInsertableResource(event) {
    return [...(event.dataTransfer?.types || [])].includes("Files")
      || hasWorkspaceResourceDrag(event.dataTransfer);
  }

  function getDropTarget(event) {
    const scroll = editorScroll.current;
    const content = editorShell.current?.querySelector(".fylune-mdx-content");
    if (!scroll || !content) return null;
    const blocks = [...content.children].filter((element) => element.getBoundingClientRect().height > 0);
    const contentRect = content.getBoundingClientRect();
    const scrollRect = scroll.getBoundingClientRect();
    const pointerY = Number.isFinite(event.clientY) && event.clientY > 0 ? event.clientY : contentRect.top;
    let blockIndex = blocks.findIndex((element) => {
      const rect = element.getBoundingClientRect();
      return pointerY < rect.top + rect.height / 2;
    });
    if (blockIndex === -1) blockIndex = blocks.length;
    let lineY = contentRect.top + 8;
    if (blocks.length && blockIndex === 0) lineY = blocks[0].getBoundingClientRect().top - 13;
    else if (blocks.length && blockIndex === blocks.length) lineY = blocks.at(-1).getBoundingClientRect().bottom + 13;
    else if (blocks.length) {
      const before = blocks[blockIndex - 1].getBoundingClientRect();
      const after = blocks[blockIndex].getBoundingClientRect();
      lineY = before.bottom + (after.top - before.bottom) / 2;
    }
    return {
      blockIndex,
      top: Math.max(8, lineY - scrollRect.top + scroll.scrollTop),
      left: Math.max(20, contentRect.left - scrollRect.left + scroll.scrollLeft),
      width: Math.max(80, Math.min(contentRect.width, scrollRect.width - 40)),
    };
  }

  function updateDropTarget(event) {
    const next = getDropTarget(event);
    if (!next) return;
    setDropTarget((current) => current
      && current.blockIndex === next.blockIndex
      && Math.abs(current.top - next.top) < 1
      ? current
      : next);
  }

  function handleDragEnter(event) {
    if (!dragContainsInsertableResource(event)) return;
    event.preventDefault();
    dragDepth.current += 1;
    updateDropTarget(event);
  }

  function handleDragOver(event) {
    if (!dragContainsInsertableResource(event)) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = "copy";
    updateDropTarget(event);
  }

  function handleDragLeave(event) {
    if (!dragContainsInsertableResource(event)) return;
    event.preventDefault();
    dragDepth.current = Math.max(0, dragDepth.current - 1);
    if (dragDepth.current === 0) setDropTarget(null);
  }

  async function handleDrop(event) {
    if (!dragContainsInsertableResource(event)) return;
    event.preventDefault();
    const target = dropTarget || getDropTarget(event);
    dragDepth.current = 0;
    setDropTarget(null);
    const workspaceResource = readWorkspaceResourceDrag(event.dataTransfer);
    if (workspaceResource) {
      const markdown = workspaceResourceMarkdown(workspaceResource, documentPath);
      if (!markdown) return;
      insertAssetMarkdown(markdown, target?.blockIndex ?? 0);
      window.dispatchEvent(new CustomEvent("fylune-toast", {
        detail: { message: t("editor.workspaceResourceLinked", { name: workspaceResource.label }) },
      }));
      return;
    }
    await importAssets([...(event.dataTransfer?.files || [])], target?.blockIndex ?? null);
  }

  async function showHistory() {
    setHistoryOpen(true);
    setHistoryPreview(null);
    setHistoryLoading(true);
    try {
      if (dirty.current || saveTimer.current) await save();
      setSnapshots(await bridge.listSnapshots());
    } catch (error) {
      window.dispatchEvent(new CustomEvent("fylune-toast", {
        detail: { message: error?.message || t("history.loadError") },
      }));
    } finally {
      setHistoryLoading(false);
    }
  }

  async function previewSnapshot(snapshot) {
    setHistoryPreview(snapshot);
    setHistoryPreviewMode("changes");
    setHistoryPreviewLoading(true);
    try {
      setHistoryPreview(await bridge.previewSnapshot(snapshot.id));
    } catch (error) {
      setHistoryPreview(null);
      window.dispatchEvent(new CustomEvent("fylune-toast", {
        detail: { message: error?.message || t("history.previewError") },
      }));
    } finally {
      setHistoryPreviewLoading(false);
    }
  }

  async function restoreSnapshot(snapshot) {
    try {
      await bridge.restoreSnapshot(snapshot.id);
      const restored = await bridge.readDocumentFresh(documentPath);
      await bridge.acceptExternalVersion?.(restored.hash);
      applyDocumentSource(restored.content, { highlight: true });
      baseSource.current = restored.content;
      dirty.current = false;
      latestSaveStatus.current = "saved";
      onSaveStatus("saved");
      setHistoryPreview(null);
      setHistoryOpen(false);
      window.dispatchEvent(new CustomEvent("fylune-toast", {
        detail: { message: t("editor.restoredSnapshot", { label: historySourceLabel(t, snapshot.source) }) },
      }));
    } catch (error) {
      window.dispatchEvent(new CustomEvent("fylune-toast", {
        detail: { message: error?.message || t("history.restoreError") },
      }));
    }
  }

  function resolveChange(value) {
    setResolutions((current) => ({ ...current, [reviewIndex]: value }));
  }

  function addStructuredBlock(type) {
    dirty.current = true;
    setBlocks((current) => [...current, type]);
    onSaveStatus("saving");
    setInsertMenu(false);
  }

  function removeStructuredBlock(blockIndex) {
    dirty.current = true;
    setBlocks((current) => current.filter((_, currentIndex) => currentIndex !== blockIndex));
    onSaveStatus("saving");
  }

  async function startPresentation() {
    setEditorMenu(false);
    setInsertMenu(false);
    setReviewOpen(false);
    setHistoryOpen(false);
    setPresentationZoom(100);
    setPresentation(true);
    try {
      await window.document.documentElement.requestFullscreen?.({ navigationUI: "hide" });
      enteredFullscreen.current = Boolean(window.document.fullscreenElement);
    } catch {
      enteredFullscreen.current = false;
    }
  }

  function stopPresentation() {
    setPresentation(false);
    enteredFullscreen.current = false;
    if (window.document.fullscreenElement) void window.document.exitFullscreen?.().catch(() => {});
  }

  function handlePresentationWheel(event) {
    if (!presentation || (!event.ctrlKey && !event.metaKey) || event.deltaY === 0) return;
    event.preventDefault();
    setPresentationZoom((zoom) => clampPresentationZoom(zoom + (event.deltaY < 0 ? 5 : -5)));
  }

  async function advanceReview() {
    if (reviewIndex < reviewChanges.length - 1) {
      setReviewIndex((index) => index + 1);
      return;
    }
    if (!bridge.isDemo && pendingMerge) {
      const unresolvedIndex = pendingMerge.conflicts.findIndex((_, index) => !resolutions[index]);
      if (unresolvedIndex >= 0) {
        setReviewIndex(unresolvedIndex);
        return;
      }
      const choices = Object.fromEntries(pendingMerge.conflicts.map((conflict, index) => [
        conflict.id,
        resolutions[index] === "external" ? "disk" : "local",
      ]));
      const resolvedSource = resolveDocumentMerge(pendingMerge, choices);
      try {
        if (resolvedSource === pendingMerge.conflicts[0]?.disk && pendingMerge.conflicts.length === 1 && pendingMerge.parts.length === 1) {
          await bridge.acceptExternalVersion?.(externalHash);
        } else {
          await bridge.saveDocument({
            id: document?.id,
            path: documentPath,
            title: latestTitle.current,
            content: resolvedSource,
            expectedHash: externalHash,
          });
        }
        applyDocumentSource(resolvedSource, { highlight: true });
        baseSource.current = resolvedSource;
        dirty.current = false;
        await bridge.clearDraft?.({ path: documentPath });
      } catch (error) {
        if (error?.code === "CONTENT_CONFLICT") {
          await reconcileExternalDocument(await bridge.readDocumentFresh(documentPath));
          return;
        }
        await bridge.saveDraft?.({ path: documentPath, content: resolvedSource }).catch(() => {});
        onSaveStatus("conflict");
        window.dispatchEvent(new CustomEvent("fylune-toast", {
          detail: { message: error?.message || t("editor.externalMergeFailed") },
        }));
        return;
      }
    } else if (!bridge.isDemo && externalHash !== null) {
      const resolution = resolutions[reviewIndex];
      await bridge.acceptExternalVersion?.(externalHash);
      if (resolution === "external") applyDocumentSource(reviewChanges[reviewIndex].external, { highlight: true });
      else if (resolution === "current") await save();
    }
    setReviewOpen(false);
    setExternalPending(false);
    setPendingMerge(null);
    onSaveStatus("saved");
    window.dispatchEvent(new CustomEvent("fylune-toast", { detail: { message: t("editor.externalReviewed"), action: t("editor.undo") } }));
  }

  async function runDocumentLocationAction(action, failureMessage) {
    setEditorMenu(false);
    try {
      await action({ path: documentPath });
    } catch (error) {
      window.dispatchEvent(new CustomEvent("fylune-toast", { detail: { message: error?.message || failureMessage } }));
    }
  }

  return (
    <ContentSurface.Root className={`editor-screen ${reviewOpen || historyOpen ? "with-task-panel" : ""} ${presentation ? "presentation-mode" : ""}`} label={presentation ? t("editor.presenting", { title }) : t("editor.editing", { title })}>
      {presentation ? (
        <div className="presentation-controls" role="toolbar" aria-label={t("editor.presentationControls")}>
          <button className="presentation-exit" onClick={stopPresentation}><CornersIn /> {t("common.close")}</button>
          <span className="presentation-divider" />
          <IconButton label={t("asset.zoomOut")} disabled={presentationZoom <= minimumPresentationZoom} onClick={() => setPresentationZoom((zoom) => clampPresentationZoom(zoom - 10))}><MagnifyingGlassMinus /></IconButton>
          <output aria-label={t("editor.presentationZoom")}>{presentationZoom}%</output>
          <IconButton label={t("asset.zoomIn")} disabled={presentationZoom >= maximumPresentationZoom} onClick={() => setPresentationZoom((zoom) => clampPresentationZoom(zoom + 10))}><MagnifyingGlassPlus /></IconButton>
          <button className="presentation-reset" onClick={() => setPresentationZoom(100)}>{t("common.reset")}</button>
          <span className="presentation-hint">Esc</span>
        </div>
      ) : <ContentSurface.Header className="editor-toolbar">
        <div className="toolbar-title">
          <IconButton label={t("editor.backAll")} onClick={onBack}><ArrowLeft /></IconButton>
          <DocumentPathRename document={document} onRename={onRenameDocument} />
        </div>
        <div className="toolbar-actions">
          <SaveStatus status={saveStatus} />
          <IconButton label={t("editor.present")} onClick={startPresentation}><PresentationChart /></IconButton>
          <div ref={activityRef} className="menu-wrap">
            <IconButton label={t("editor.activity")} aria-expanded={activityOpen} onClick={() => setActivityOpen((open) => !open)}><Pulse /></IconButton>
            {activityOpen ? (
              <div className="popover change-activity-popover" role="dialog" aria-label={t("editor.activity")}>
                <header><strong>{t("editor.activity")}</strong><small>{t("editor.activityLocal")}</small></header>
                {changeActivity.length ? changeActivity.map((entry) => (
                  <article key={entry.id}>
                    <span className={`change-activity-dot is-${entry.status}`} aria-hidden="true" />
                    <div>
                      <strong>{entry.displayName || t("editor.externalTool")}</strong>
                      <small>{t(`editor.activityStatus.${entry.status}`, { count: entry.blockCount })}</small>
                    </div>
                    {entry.status === "auto_merged" ? (
                      <button type="button" onClick={() => void undoChangeActivity(entry)}>{t("editor.undo")}</button>
                    ) : null}
                  </article>
                )) : <p>{t("editor.activityEmpty")}</p>}
              </div>
            ) : null}
          </div>
          <IconButton label={t("editor.history")} onClick={showHistory}><ClockCounterClockwise /></IconButton>
          <div ref={editorMenuRef} className="menu-wrap">
            <IconButton label={t("editor.more")} aria-expanded={editorMenu} onClick={() => setEditorMenu((open) => !open)}><DotsThree /></IconButton>
            {editorMenu ? (
              <div className="popover editor-popover">
                <button onClick={() => { setEditorMenu(false); save(); }}><CheckCircle /> {t("editor.save")}</button>
                <button onClick={() => void runDocumentLocationAction(bridge.revealWorkspaceItem, t("editor.showFinderFailed"))}><FolderOpen /> {t("editor.showFinder")}</button>
                <button onClick={() => void runDocumentLocationAction(bridge.openWorkspaceItemInTerminal, t("editor.openTerminalFailed"))}><TerminalWindow /> {t("editor.openTerminal")}</button>
                <button onClick={() => { setEditorMenu(false); onSaveStatus("readonly"); }}><File /> {t("editor.readOnlyPreview")}</button>
                <button onClick={() => { setEditorMenu(false); onSaveStatus("error"); }}><WarningCircle /> {t("editor.saveFailurePreview")}</button>
                <button onClick={() => { setEditorMenu(false); onSaveStatus("conflict"); setReviewOpen(true); }}><ArrowsClockwise /> {t("editor.conflictPreview")}</button>
              </div>
            ) : null}
          </div>
        </div>
      </ContentSurface.Header>}

      {!presentation && externalPending ? (
        <div className={`external-banner ${saveStatus === "conflict" ? "conflict" : ""}`} role="status">
          <div>{saveStatus === "conflict" ? <WarningCircle /> : <ArrowsClockwise />}<span><strong>{saveStatus === "conflict" ? t("editor.protected") : t("editor.externalReady")}</strong><small>{saveStatus === "conflict" ? t("editor.protectedCopy") : t("editor.externalCopy", { count: reviewChanges.length })}</small></span></div>
          <button onClick={() => setReviewOpen(true)}>{t("editor.reviewChanges")}</button>
        </div>
      ) : null}

      <ContentSurface.Panel panelRef={editorScroll} className="editor-scroll" onWheel={handlePresentationWheel} onDragEnter={handleDragEnter} onDragOver={handleDragOver} onDragLeave={handleDragLeave} onDrop={handleDrop}>
        {dropTarget ? (
          <div
            className="asset-drop-indicator"
            data-testid="asset-drop-indicator"
            role="status"
            aria-label={`Insert files at document block ${dropTarget.blockIndex + 1}`}
            style={{ top: dropTarget.top, left: dropTarget.left, width: dropTarget.width }}
          />
        ) : null}
        <article
          className="document-canvas"
          style={presentation ? {
            "--presentation-scale": presentationZoom / 100,
            "--presentation-width": `${Math.round(84000 / presentationZoom)}px`,
          } : undefined}
        >
          <div className="document-kicker">{t("editor.localWorkspace")}</div>
          <div className={`document-heading ${documentIcon ? "with-icon" : ""}`}>
            <div className="document-icon-slot" ref={iconPickerRef}>
              {documentIcon ? (
                <button
                  type="button"
                  className="document-icon-button"
                  aria-label={t("editor.changeIcon")}
                  title={t("editor.changeIconTitle")}
                  disabled={presentation || saveStatus === "readonly"}
                  onClick={() => setIconPickerOpen((open) => !open)}
                >
                  <span aria-hidden="true">{documentIcon}</span>
                </button>
              ) : !presentation && saveStatus !== "readonly" ? (
                <button
                  type="button"
                  className="document-add-icon-button"
                  aria-label={t("editor.addIcon")}
                  aria-expanded={iconPickerOpen}
                  onClick={() => setIconPickerOpen((open) => !open)}
                >
                  <Smiley /> {t("editor.addIcon")}
                </button>
              ) : null}
              {iconPickerOpen ? <DocumentIconPicker value={documentIcon} onSelect={selectDocumentIcon} /> : null}
            </div>
            <input
              className="document-title-input"
              value={title}
              readOnly={presentation}
              onKeyDown={moveFromTitleToBody}
              onChange={(event) => {
                const nextTitle = event.target.value;
                latestTitle.current = nextTitle;
                setTitle(nextTitle);
                trackUserSource(fullSource(bodySourceRef.current, nextTitle));
                queueSave();
              }}
              aria-label={t("editor.title")}
            />
          </div>
          <p className="document-meta">{t("editor.justNow")} · {t("editor.wordCount", { count: wordCount })}</p>

          <div
            ref={editorShell}
            className={`mdx-editor-shell ${formattingVisible ? "selection-active" : ""}`}
            onKeyDown={handleEditorKeyDown}
            onCompositionStart={() => { compositionActive.current = true; }}
            onCompositionEnd={finishComposition}
          >
            <MDXEditor
              ref={mdxEditorRef}
              key={document?.id}
              className="fylune-mdx-editor"
              contentEditableClassName="fylune-mdx-content"
              markdown={bodySource}
              placeholder={t("editor.startWriting")}
              onChange={(nextSource) => {
                bodySourceRef.current = nextSource;
                const nextDocumentSource = fullSource(nextSource);
                if (nextDocumentSource === latestSource.current) {
                  editorReady.current = true;
                  return;
                }
                scheduleWordCount(nextSource);
                trackUserSource(nextDocumentSource);
                if (editorReady.current) queueSave();
                else editorReady.current = true;
              }}
              readOnly={presentation || saveStatus === "readonly"}
              plugins={editorPlugins}
            />
            <input
              ref={imageReplacementInput}
              className="visually-hidden"
              type="file"
              accept="image/png,image/jpeg,image/webp,image/gif"
              aria-label={t("image.choose")}
              onCancel={() => completeImageChoice(null)}
              onChange={(event) => {
                const file = event.target.files?.[0] || null;
                event.target.value = "";
                completeImageChoice(file);
              }}
            />
            {slashMenu ? (
              <div
                ref={slashMenuRef}
                className="slash-command-menu"
                style={{ left: slashMenu.left, top: slashMenu.top }}
                role="listbox"
                aria-label={t("editor.insertBlock")}
                onMouseDown={(event) => event.preventDefault()}
              >
                <span className="slash-command-title">{t("editor.insertBlock")}</span>
                {localizedSlashCommands.map((command, index) => (
                  <button
                    key={command.id}
                    className={index === slashIndex ? "active" : ""}
                    role="option"
                    aria-selected={index === slashIndex}
                    onMouseEnter={() => setSlashIndex(index)}
                    onClick={() => insertSlashCommand(command)}
                  >
                    <span className="slash-command-mark">{command.mark}</span>
                    <span><strong>{command.label}</strong><small>{command.detail}</small></span>
                  </button>
                ))}
              </div>
            ) : null}
          </div>

          {reviewOpen ? (
            <section className="inline-diff" aria-label={t("review.changeLabel")}>
              <span>{t("review.reviewing", { section: reviewChanges[reviewIndex].section })}</span>
              <p className="removed"><span>{t("review.current")}</span>{reviewChanges[reviewIndex].current}</p>
              <p className="added"><span>{t("review.external")}</span>{reviewChanges[reviewIndex].external}</p>
            </section>
          ) : null}

          {blocks.map((block, index) => <StructuredBlock key={`${block}-${index}`} type={block} readOnly={presentation} onRemove={() => removeStructuredBlock(index)} />)}

          {!presentation ? <div className="insert-row" ref={insertMenuRef}>
            <button className="insert-button" disabled={assetImporting} onClick={() => setInsertMenu((open) => !open)} aria-expanded={insertMenu}>{assetImporting ? <ArrowsClockwise className="spin" /> : <Plus />} {assetImporting ? t("editor.inserting") : t("editor.insert")}</button>
            {insertMenu ? (
              <div className="insert-menu">
                <button onClick={() => addStructuredBlock("Decision")}><span><CheckCircle /></span><div><strong>{t("blocks.decision")}</strong><small>{t("blocks.decisionCopy")}</small></div></button>
                <button onClick={() => addStructuredBlock("Experiment")}><span><ArrowsClockwise /></span><div><strong>{t("blocks.experiment")}</strong><small>{t("blocks.experimentCopy")}</small></div></button>
                <button onClick={() => addStructuredBlock("Brief")}><span><FileText /></span><div><strong>{t("blocks.brief")}</strong><small>{t("blocks.briefCopy")}</small></div></button>
                <button onClick={() => insertSpecialBlock("flowchart")}><span><FlowArrow /></span><div><strong>{t("blocks.flowchart")}</strong><small>{t("blocks.flowchartCopy")}</small></div></button>
                <button onClick={() => insertSpecialBlock("mindmap")}><span><TreeStructure /></span><div><strong>{t("blocks.mindmap")}</strong><small>{t("blocks.mindmapCopy")}</small></div></button>
                <button onClick={() => insertSpecialBlock("formula")}><span><MathOperations /></span><div><strong>{t("blocks.formula")}</strong><small>{t("blocks.formulaCopy")}</small></div></button>
                <button onClick={() => bridge.isDemo ? fileInput.current?.click() : importNativeAsset()}><span><ImageIcon /></span><div><strong>{t("blocks.file")}</strong><small>{t("blocks.fileCopy")}</small></div></button>
              </div>
            ) : null}
            <input ref={fileInput} className="visually-hidden" type="file" accept="image/png,image/jpeg,image/webp,image/gif,video/mp4,video/quicktime,video/webm,application/pdf" multiple onChange={importFile} aria-label={t("editor.chooseFiles")} />
          </div> : null}
        </article>
      </ContentSurface.Panel>

      {reviewOpen ? (
        <ReviewPanel
          current={reviewIndex}
          total={reviewChanges.length}
          change={reviewChanges[reviewIndex]}
          resolution={resolutions[reviewIndex]}
          onResolve={resolveChange}
          onPrevious={() => setReviewIndex((index) => Math.max(0, index - 1))}
          onNext={() => setReviewIndex((index) => Math.min(reviewChanges.length - 1, index + 1))}
          onFinish={advanceReview}
          onClose={() => setReviewOpen(false)}
        />
      ) : null}
      {historyPreview ? (
        <HistoryPreview
          snapshot={historyPreview}
          loading={historyPreviewLoading}
          mode={historyPreviewMode}
          onModeChange={setHistoryPreviewMode}
          onRestore={restoreSnapshot}
          onClose={() => setHistoryPreview(null)}
        />
      ) : null}
      {historyOpen ? (
        <HistoryPanel
          snapshots={snapshots}
          loading={historyLoading}
          onPreview={previewSnapshot}
          onRestore={restoreSnapshot}
          onClose={() => {
            setHistoryPreview(null);
            setHistoryOpen(false);
          }}
        />
      ) : null}
    </ContentSurface.Root>
  );
}

function ThemeChoice({ value, active, icon, label, onClick }) {
  return <button className={`theme-choice ${active ? "active" : ""}`} onClick={() => onClick(value)} aria-pressed={active}>{icon}<span>{label}</span>{active ? <Check /> : null}</button>;
}

function SettingsPanel({
  preferences,
  onPreferences,
  accountDetails,
  onAccountChange,
  onRequestSignIn,
  onClose,
}) {
  const { t } = useTranslation();
  const [accountLoading, setAccountLoading] = useState(false);
  const account = accountDetails?.user || null;
  const isSignedIn = Boolean(account?.email);

  function update(next) {
    onPreferences({ ...preferences, ...next });
  }

  async function signOut() {
    setAccountLoading(true);
    try {
      const session = await bridge.signOut?.();
      onAccountChange({ user: session?.user });
    } finally {
      setAccountLoading(false);
    }
  }

  return (
    <div className="settings-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <section className="settings-panel" role="dialog" aria-modal="true" aria-labelledby="settings-title">
        <header>
          <div><h1 id="settings-title">{t("settings.title")}</h1><p>{t("settings.subtitle")}</p></div>
          <IconButton className="settings-close-button" label={t("settings.close")} onClick={onClose}><X /></IconButton>
        </header>
        <div className="settings-content">
          <section className="settings-section"><h2>{t("settings.appearance")}</h2><p>{t("settings.appearanceCopy")}</p><div className="theme-options">
            <ThemeChoice value="system" active={preferences.theme === "system"} icon={<SidebarSimple />} label={t("settings.system")} onClick={(theme) => update({ theme })} />
            <ThemeChoice value="light" active={preferences.theme === "light"} icon={<Sun />} label={t("settings.light")} onClick={(theme) => update({ theme })} />
            <ThemeChoice value="dark" active={preferences.theme === "dark"} icon={<Moon />} label={t("settings.dark")} onClick={(theme) => update({ theme })} />
          </div></section>

          <section className="settings-section language-section">
            <div className="setting-row">
              <div><h2>{t("language.title")}</h2><p>{t("language.description")}</p></div>
              <select
                className="language-select"
                aria-label={t("language.title")}
                value={preferences.language || "system"}
                onChange={(event) => update({ language: event.target.value })}
              >
                <option value="system">{t("language.system")}</option>
                {supportedLocales.map((locale) => (
                  <option key={locale} value={locale}>{t(`language.${locale}`)}</option>
                ))}
              </select>
            </div>
          </section>

          <section className="settings-section">
            <div className="setting-row">
              <div><h2>{t("settings.agentChanges")}</h2><p>{t("settings.agentChangesCopy")}</p></div>
              <button
                className={`switch ${preferences.reviewAgentChanges ? "on" : ""}`}
                role="switch"
                aria-checked={Boolean(preferences.reviewAgentChanges)}
                onClick={() => update({ reviewAgentChanges: !preferences.reviewAgentChanges })}
              ><span /></button>
            </div>
            <div className="privacy-note"><CheckCircle /> {preferences.reviewAgentChanges ? t("settings.agentChangesReview") : t("settings.agentChangesAuto")}</div>
          </section>

          <section className="settings-section account-section">
            <div className="settings-account-profile">
              <span className="settings-account-avatar">
                {account?.avatarUrl
                  ? <img src={account.avatarUrl} alt="" />
                  : (account?.name || account?.email || t("account.guest")).trim().slice(0, 1).toUpperCase()}
              </span>
              <div className="settings-account-identity">
                <h2>{account?.name || account?.email || t("account.guest")}</h2>
                <div className="settings-account-meta">
                  <p>
                    {isSignedIn
                      ? t("settings.signedIn", { email: account.email })
                      : t("settings.guestAccountCopy")}
                  </p>
                </div>
              </div>
              {isSignedIn
                ? <button className="secondary-button" disabled={accountLoading} onClick={signOut}>{t("settings.signOut")}</button>
                : <button className="primary-button" disabled={accountLoading} onClick={onRequestSignIn}><SignIn /> {t("settings.signIn")}</button>}
            </div>
            <div className="privacy-note"><CheckCircle /> Your documents remain on this device whether you sign in or not.</div>
          </section>

          <SoftwareUpdateSection updateBridge={bridge} />

          <section className="settings-section about-section"><img className="app-icon" src={fyluneIcon} alt="Fylune" /><div><h2>Fylune 0.1.0</h2><p>{t("settings.about")}</p></div><span className="status-badge">{t("settings.alpha")}</span></section>
        </div>
      </section>
    </div>
  );
}

function Toast({ toast, onClose }) {
  const { t } = useTranslation();
  if (!toast) return null;
  return <div className="toast" role="status"><CheckCircle /><span>{toast.message}</span>{toast.action ? <button onClick={() => { onClose(); void toast.onAction?.(); }}>{toast.action}</button> : null}<IconButton label={t("settings.dismiss")} onClick={onClose}><X /></IconButton></div>;
}

export function App() {
  const { t } = useTranslation();
  const [project, setProject] = useState(demoProject);
  const [documents, setDocuments] = useState(demoDocuments);
  const [activeId, setActiveId] = useState(null);
  const [treeSelection, setTreeSelection] = useState(null);
  const [librarySection, setLibrarySection] = useState("all");
  const librarySectionRef = useRef(librarySection);
  librarySectionRef.current = librarySection;
  const [openTabs, setOpenTabs] = useState([]);
  const [view, setView] = useState("grid");
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [sidebarView, setSidebarView] = useState("files");
  const sidebarViewRef = useRef(sidebarView);
  sidebarViewRef.current = sidebarView;
  const [libraryState, setLibraryState] = useState("ready");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [accountDetails, setAccountDetails] = useState(null);
  const [saveStatuses, setSaveStatuses] = useState({});
  const [saveRequest, setSaveRequest] = useState(0);
  const [toast, setToast] = useState(null);
  const [preferences, setPreferences] = useState({
    theme: "system",
    language: "system",
    reviewAgentChanges: false,
  });
  const [documentSources, setDocumentSources] = useState({});
  const [documentContextSources, setDocumentContextSources] = useState({});
  const documentContextSourcesRef = useRef({});
  const [documentPreviews, setDocumentPreviews] = useState({});
  const previewRequestsRef = useRef(new Set());
  const previewGenerationRef = useRef(0);
  const creatingDocumentRef = useRef(false);
  const projectGenerationRef = useRef(0);
  const allDocumentsLoadedRef = useRef(bridge.isDemo);
  const folderLoadRequestsRef = useRef(new Map());
  const [folderLoadingPaths, setFolderLoadingPaths] = useState(() => new Set());
  const [recentProjects, setRecentProjects] = useState([]);
  const [windowFullscreen, setWindowFullscreen] = useState(false);
  const [startupMode, setStartupMode] = useState(
    previewFirstRun || isOnboardingWindow ? "onboarding" : bridge.isDemo ? "workspace" : "checking",
  );
  const [startupError, setStartupError] = useState("");
  const [welcomeLoginOpen, setWelcomeLoginOpen] = useState(false);
  const [documentLibraryState, setDocumentLibraryState] = useState(readDocumentLibraryState);
  const [workspaceNavigationState, setWorkspaceNavigationState] = useState(readWorkspaceNavigationState);
  const [workspaceRootState, setWorkspaceRootState] = useState(readWorkspaceRootState);
  const activeProjectLibraryKey = projectLibraryKey(project);
  const activeProjectNavigationKey = projectLibraryKey(project);
  const workspaceRootExpanded = workspaceRootState[activeProjectNavigationKey] !== false;
  const expanded = useMemo(
    () => expandedFolderIdsForProject(project, workspaceNavigationState),
    [project, workspaceNavigationState],
  );
  const updateExpandedFolders = useCallback((update) => {
    setWorkspaceNavigationState((currentState) => {
      const currentExpanded = expandedFolderIdsForProject(project, currentState);
      const nextExpanded = typeof update === "function" ? update(currentExpanded) : update;
      return {
        ...currentState,
        [activeProjectNavigationKey]: [...new Set(nextExpanded || [])],
      };
    });
  }, [activeProjectNavigationKey, project]);
  const libraryDocuments = useMemo(() => {
    const projectState = documentLibraryState[activeProjectLibraryKey] || {};
    return documents.map((document) => {
      const metadata = projectState[documentLibraryKey(document)] || {};
      return {
        ...document,
        type: "document",
        starred: metadata.favorite ?? Boolean(document.starred),
        lastOpenedAt: Number(metadata.lastOpenedAt) || 0,
      };
    }).sort((left, right) => right.lastOpenedAt - left.lastOpenedAt);
  }, [activeProjectLibraryKey, documentLibraryState, documents]);
  const favoriteDocuments = useMemo(() => libraryDocuments.filter((document) => document.starred), [libraryDocuments]);
  const selectedFolder = useMemo(() => (
    treeSelection?.type === "root"
      ? { id: project.id, name: project.name, path: "", type: "folder", children: project.tree }
      : treeSelection?.type === "folder"
      ? findWorkspaceTreeItem(project.tree, treeSelection.path)
      : null
  ), [project, treeSelection]);
  const selectedFolderItems = useMemo(() => (
    selectedFolder
      ? workspaceFolderContents(project.tree, selectedFolder.path, libraryDocuments)
      : []
  ), [libraryDocuments, project.tree, selectedFolder]);
  const selectedFolderBreadcrumbs = useMemo(() => (
    selectedFolder && treeSelection?.type !== "root"
      ? workspaceFolderBreadcrumbs(project.tree, selectedFolder.path)
      : []
  ), [project.tree, selectedFolder, treeSelection]);

  const workspaceItems = useMemo(() => {
    const treeItems = flattenWorkspaceItems(project.tree);
    const enriched = treeItems.map((item) => {
      if (item.type !== "document") return item;
      const document = documents.find((candidate) => candidate.id === item.id || candidate.path.replaceAll(" / ", "/") === item.path);
      return document ? { ...item, ...document, path: item.path, type: "document" } : item;
    });
    const knownIds = new Set(enriched.map((item) => item.id));
    return [
      ...enriched,
      ...documents.filter((document) => !knownIds.has(document.id)).map((document) => ({ ...document, name: `${document.title}.mdx`, type: "document" })),
    ];
  }, [documents, project.tree]);
  const workspaceFiles = useMemo(
    () => workspaceFolderContents(project.tree, "", libraryDocuments),
    [libraryDocuments, project.tree],
  );
  const activeItem = useMemo(() => workspaceItems.find((item) => item.id === activeId), [activeId, workspaceItems]);
  const activeDocument = activeItem?.type === "document" ? documents.find((document) => document.id === activeId) || activeItem : null;
  const activeAsset = activeItem && activeItem.type !== "document" ? activeItem : null;
  const updateDocumentLibraryEntry = useCallback((document, update) => {
    const documentKey = documentLibraryKey(document);
    if (!documentKey) return;
    setDocumentLibraryState((current) => {
      const projectState = current[activeProjectLibraryKey] || {};
      const previous = projectState[documentKey] || {};
      const next = typeof update === "function" ? update(previous) : { ...previous, ...update };
      return { ...current, [activeProjectLibraryKey]: { ...projectState, [documentKey]: next } };
    });
  }, [activeProjectLibraryKey]);
  const markDocumentOpened = useCallback((document) => {
    updateDocumentLibraryEntry(document, (previous) => ({ ...previous, lastOpenedAt: Date.now() }));
  }, [updateDocumentLibraryEntry]);
  const rememberSource = useCallback((id, content) => {
    if (!id || typeof content !== "string") return;
    setDocumentSources((current) => current[id] === content ? current : { ...current, [id]: content });
    documentContextSourcesRef.current[id] = content;
    if (sidebarViewRef.current !== "files") {
      setDocumentContextSources((current) => current[id] === content ? current : { ...current, [id]: content });
    }
  }, []);
  const rememberContextSource = useCallback((id, content) => {
    if (id && typeof content === "string") {
      documentContextSourcesRef.current[id] = content;
      if (sidebarViewRef.current !== "files") {
        setDocumentContextSources((current) => current[id] === content ? current : { ...current, [id]: content });
      }
    }
  }, []);
  const changeSidebarView = useCallback((nextView) => {
    if (nextView !== "files" && activeId) {
      const currentSource = documentContextSourcesRef.current[activeId] ?? documentSources[activeId];
      if (typeof currentSource === "string") {
        setDocumentContextSources((current) => current[activeId] === currentSource
          ? current
          : { ...current, [activeId]: currentSource });
      }
    }
    setSidebarView(nextView);
  }, [activeId, documentSources]);
  const requestDocumentPreview = useCallback(async (document) => {
    const id = document?.id;
    const documentPath = document?.path?.replaceAll(" / ", "/");
    if (!id || !documentPath || previewRequestsRef.current.has(id)) return;
    const generation = previewGenerationRef.current;
    previewRequestsRef.current.add(id);
    setDocumentPreviews((current) => current[id]?.content != null
      ? current
      : { ...current, [id]: { status: "loading" } });
    try {
      const result = await bridge.readDocumentPreview(documentPath);
      if (generation !== previewGenerationRef.current) return;
      setDocumentPreviews((current) => ({
        ...current,
        [id]: { status: "ready", content: typeof result?.content === "string" ? result.content : "" },
      }));
    } catch {
      if (generation !== previewGenerationRef.current) return;
      setDocumentPreviews((current) => ({ ...current, [id]: { status: "error" } }));
    } finally {
      previewRequestsRef.current.delete(id);
    }
  }, []);
  const updateDocumentStatus = useCallback((id, status) => {
    if (id) setSaveStatuses((current) => current[id] === status ? current : { ...current, [id]: status });
  }, []);
  const updateActiveDocumentStatus = useCallback((status) => {
    if (activeId) updateDocumentStatus(activeId, status);
  }, [activeId, updateDocumentStatus]);
  const refreshRecentProjects = useCallback(async () => {
    try {
      const recent = await bridge.listRecentProjects?.();
      if (Array.isArray(recent)) setRecentProjects(recent);
    } catch {
      // Project history must never block local editing.
    }
  }, []);
  const refreshAccount = useCallback(async () => {
    try {
      const details = await bridge.getAccount?.();
      if (details?.user) setAccountDetails(details);
      return details;
    } catch {
      try {
        const session = await bridge.getSession?.();
        if (session?.user) {
          const fallback = {
            user: session.user,
            offline: true,
          };
          setAccountDetails(fallback);
          return fallback;
        }
      } catch {
        // Account services are optional for the local editing loop.
      }
      return null;
    }
  }, []);

  useEffect(() => {
    bridge.getPreferences().then((stored) => {
      if (stored && Object.keys(stored).length) setPreferences((current) => ({ ...current, ...stored }));
    }).catch(() => {});
  }, []);

  useEffect(() => {
    void refreshAccount();
  }, [refreshAccount]);

  useEffect(() => {
    try {
      window.localStorage?.setItem(documentLibraryStateKey, JSON.stringify(documentLibraryState));
    } catch {
      // Library metadata must never block local editing.
    }
  }, [documentLibraryState]);

  useEffect(() => {
    try {
      window.localStorage?.setItem(workspaceNavigationStateKey, JSON.stringify(workspaceNavigationState));
    } catch {
      // Workspace navigation preferences must never block local editing.
    }
  }, [workspaceNavigationState]);

  useEffect(() => {
    try {
      window.localStorage?.setItem(workspaceRootStateKey, JSON.stringify(workspaceRootState));
    } catch {
      // Workspace root expansion must never block local editing.
    }
  }, [workspaceRootState]);

  useEffect(() => {
    if (isOnboardingWindow) return undefined;
    if (bridge.isDemo) {
      void refreshRecentProjects();
      return undefined;
    }

    let active = true;
    void (async () => {
      const generation = projectGenerationRef.current + 1;
      projectGenerationRef.current = generation;
      let recent = [];
      try {
        recent = await bridge.listRecentProjects?.() || [];
        if (!active || generation !== projectGenerationRef.current) return;
        setRecentProjects(recent);
      } catch {
        if (active && generation === projectGenerationRef.current) setStartupMode("onboarding");
        return;
      }

      if (!recent.length) {
        setStartupMode("onboarding");
        return;
      }

      for (const candidate of recent) {
        try {
          const nextProject = await bridge.openRecentProject(candidate.id);
          if (!active || generation !== projectGenerationRef.current) return;
          if (!nextProject) continue;
          const nextDocuments = documentsFromWorkspaceTree(nextProject.tree);
          setProject(nextProject);
          setDocuments(nextDocuments);
          allDocumentsLoadedRef.current = bridge.isDemo;
          setLibraryState(nextProject.tree?.length ? "ready" : "empty");
          setStartupMode("workspace");
          return;
        } catch {
          if (!active || generation !== projectGenerationRef.current) return;
          // Try the next remembered folder. Missing recent folders are removed by the main process.
        }
      }

      if (active && generation === projectGenerationRef.current) setStartupMode("onboarding");
    })();

    return () => {
      active = false;
    };
  }, [refreshRecentProjects]);

  useEffect(() => bridge.onExternalFileOpen?.(async (nextProject) => {
    const generation = projectGenerationRef.current + 1;
    projectGenerationRef.current = generation;
    const nextDocuments = documentsFromWorkspaceTree(nextProject.tree);
    const target = nextDocuments.find((document) => document.path.replaceAll(" / ", "/") === nextProject.targetPath);
    setProject(nextProject);
    setDocuments(nextDocuments);
    allDocumentsLoadedRef.current = bridge.isDemo;
    folderLoadRequestsRef.current.clear();
    setFolderLoadingPaths(new Set());
    previewGenerationRef.current += 1;
    previewRequestsRef.current.clear();
    setDocumentPreviews({});
    setDocumentSources({});
    documentContextSourcesRef.current = {};
    setDocumentContextSources({});
    setSaveStatuses({});
    setLibrarySection("all");
    setSidebarView("files");
    setLibraryState(nextProject.tree?.length ? "ready" : "empty");
    setStartupMode("workspace");
    if (!target) {
      setOpenTabs([]);
      setActiveId(null);
      setTreeSelection(null);
      return;
    }
    try {
      const result = await bridge.readDocument(target.path.replaceAll(" / ", "/"));
      if (generation !== projectGenerationRef.current) return;
      setDocumentSources({ [target.id]: result?.content || "" });
      documentContextSourcesRef.current = { [target.id]: result?.content || "" };
      setDocumentContextSources({ [target.id]: result?.content || "" });
      setSaveStatuses({ [target.id]: result?.readOnly ? "readonly" : "saved" });
      setOpenTabs([target.id]);
      setActiveId(target.id);
      setTreeSelection({ id: target.id, path: target.path, type: "document" });
      void refreshRecentProjects();
    } catch (error) {
      if (generation === projectGenerationRef.current) setToast({ message: error?.message || t("editor.openFailed") });
    }
  }), [refreshRecentProjects, t]);

  useEffect(() => {
    if (startupMode !== "workspace" || !isPostOnboardingWindow) return undefined;
    let active = true;
    const timer = window.setTimeout(() => {
      if (!active || window.localStorage?.getItem(welcomeAuthCompletedKey) === "true") return;
      void bridge.getSession?.().then((session) => {
        if (!active) return;
        if (session?.user && (new Set(["REGISTERED", "FORMAL"]).has(session.user.accountType) || session.user.email)) {
          window.localStorage?.setItem(welcomeAuthCompletedKey, "true");
          return;
        }
        setWelcomeLoginOpen(true);
      }).catch(() => {
        if (active) setWelcomeLoginOpen(true);
      });
    }, 180);
    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [startupMode]);

  useEffect(() => {
    if (!activeDocument) setSidebarView("files");
  }, [activeDocument]);

  useEffect(() => {
    let active = true;
    void bridge.getWindowState?.().then((state) => {
      if (active) setWindowFullscreen(Boolean(state?.isFullscreen));
    }).catch(() => {});
    const dispose = bridge.onWindowFullscreenChange?.((state) => {
      if (active) setWindowFullscreen(Boolean(state?.isFullscreen));
    });
    return () => {
      active = false;
      dispose?.();
    };
  }, []);

  useEffect(() => {
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const apply = () => {
      const resolved = preferences.theme === "system" ? (media.matches ? "dark" : "light") : preferences.theme;
      document.documentElement.dataset.theme = resolved;
      document.documentElement.dataset.themePreference = preferences.theme;
    };
    apply();
    void changeAppLocale(preferences.language || "system");
    media.addEventListener?.("change", apply);
    bridge.setPreferences(preferences).catch(() => {});
    return () => media.removeEventListener?.("change", apply);
  }, [preferences]);

  useEffect(() => {
    const showToast = (event) => setToast(event.detail);
    window.addEventListener("fylune-toast", showToast);
    return () => window.removeEventListener("fylune-toast", showToast);
  }, []);

  useEffect(() => {
    const keydown = (event) => {
      if (event.metaKey && event.key.toLowerCase() === "o") { event.preventDefault(); openProject(); }
      if (event.metaKey && event.key.toLowerCase() === "n") { event.preventDefault(); newDocument(); }
      if (event.metaKey && event.key.toLowerCase() === "s" && activeId) { event.preventDefault(); setSaveRequest((request) => request + 1); }
      if (event.metaKey && event.key.toLowerCase() === "w" && activeId) { event.preventDefault(); closeDocumentTab(activeId); }
      if (event.metaKey && /^[1-9]$/.test(event.key)) {
        const destinations = [null, ...openTabs];
        const destination = destinations[Number(event.key) - 1];
        if (destination !== undefined) {
          event.preventDefault();
          if (destination === null) showAllFiles();
          else activateDocumentTab(destination);
        }
      }
      if (event.key === "Escape") {
        setSettingsOpen(false);
      }
    };
    window.addEventListener("keydown", keydown);
    return () => window.removeEventListener("keydown", keydown);
  });

  async function openDocument(id) {
    const item = workspaceItems.find((candidate) => candidate.id === id);
    if (!item) return;
    setTreeSelection({ id: item.id, path: item.path, type: item.type });
    if (item.type !== "document") {
      setOpenTabs((current) => current.includes(id) ? current : [...current, id]);
      setActiveId(id);
      return;
    }
    const match = documents.find((document) => document.id === id) || item;
    if (!match) return;
    if (openTabs.includes(id)) {
      markDocumentOpened(match);
      setActiveId(id);
      return;
    }
    updateDocumentStatus(id, "saved");
    try {
      const result = await bridge.readDocument(match.path.replace(" / ", "/"));
      if (typeof result?.content === "string") rememberSource(id, result.content);
      if (result?.readOnly) updateDocumentStatus(id, "readonly");
      setOpenTabs((current) => current.includes(id) ? current : [...current, id]);
      markDocumentOpened(match);
      setActiveId(id);
    } catch {
      updateDocumentStatus(id, "error");
    }
  }

  async function newDocument() {
    if (creatingDocumentRef.current) return;
    creatingDocumentRef.current = true;
    const initialSource = "";
    try {
      const sourceTree = project.tree;
      const selectedItem = findWorkspaceTreeItem(sourceTree, treeSelection?.path);
      const directoryPath = selectedItem?.type === "folder"
        ? selectedItem.path
        : workspaceParentPath(selectedItem?.path);
      const requestedPath = nextUntitledDocumentPath(sourceTree, directoryPath);
      const result = await bridge.saveDocument({
        path: requestedPath,
        title: t("editor.untitled"),
        content: initialSource,
        expectedHash: null,
      });
      const savedPath = result?.path || requestedPath;
      const savedDirectory = workspaceParentPath(savedPath);
      const id = savedPath;
      const next = {
        id,
        title: workspaceTitleFromName(savedPath.split("/").at(-1)),
        path: savedPath,
        modified: t("editor.justNow"),
        mtimeMs: result?.mtimeMs,
        starred: false,
        kind: "brief",
        description: t("editor.newDocumentDescription"),
        section: "",
        words: 0,
      };
      setProject((current) => ({
        ...current,
        tree: insertWorkspaceTreeDocument(current.tree, next, savedDirectory),
      }));
      setDocuments((current) => [
        next,
        ...current.filter((document) => document.path.replaceAll(" / ", "/") !== savedPath),
      ]);
      setDocumentSources((current) => ({ ...current, [id]: initialSource }));
      documentContextSourcesRef.current[id] = initialSource;
      setDocumentContextSources((current) => ({ ...current, [id]: initialSource }));
      setSaveStatuses((current) => ({ ...current, [id]: "saved" }));
      setOpenTabs((current) => current.includes(id) ? current : [...current, id]);
      updateExpandedFolders((current) => {
        const nextExpanded = new Set(current);
        workspaceFolderLineage(project.tree, savedDirectory).forEach((folderId) => nextExpanded.add(folderId));
        return nextExpanded;
      });
      setTreeSelection({ id, path: savedPath, type: "document" });
      setLibraryState("ready");
      markDocumentOpened(next);
      setActiveId(id);
      if (!bridge.isDemo) void refreshProjectTree();
    } catch (error) {
      setToast({ message: error?.message || t("editor.createFailed") });
    } finally {
      creatingDocumentRef.current = false;
    }
  }

  function showAllFiles() {
    setLibrarySection("all");
    setLibraryState(project.tree?.length ? "ready" : "empty");
    setActiveId(null);
    setTreeSelection(null);
  }

  async function ensureAllDocuments({ force = false } = {}) {
    if (!force && allDocumentsLoadedRef.current) return libraryDocuments;
    const generation = projectGenerationRef.current;
    try {
      const nextDocuments = await bridge.listDocuments({ force });
      if (generation !== projectGenerationRef.current || !Array.isArray(nextDocuments)) return null;
      setDocuments(nextDocuments);
      allDocumentsLoadedRef.current = true;
      previewGenerationRef.current += 1;
      previewRequestsRef.current.clear();
      setDocumentPreviews({});
      return nextDocuments;
    } catch (error) {
      if (
        generation === projectGenerationRef.current
        && new Set(["documents", "favorites"]).has(librarySectionRef.current)
      ) {
        setLibraryState("error");
        setToast({ message: error?.message || t("library.loadFailed") });
      }
      return null;
    }
  }

  async function showDocuments() {
    setLibrarySection("documents");
    setActiveId(null);
    setTreeSelection(null);
    if (!allDocumentsLoadedRef.current) setLibraryState("loading");
    const nextDocuments = await ensureAllDocuments();
    if (nextDocuments && librarySectionRef.current === "documents") {
      setLibraryState(nextDocuments.length ? "ready" : "empty");
    }
  }

  async function showFavorites() {
    setLibrarySection("favorites");
    setActiveId(null);
    setTreeSelection(null);
    if (!allDocumentsLoadedRef.current) setLibraryState("loading");
    const nextDocuments = await ensureAllDocuments();
    if (nextDocuments && librarySectionRef.current === "favorites") setLibraryState("ready");
  }

  function showFolder(folder, { toggle = false } = {}) {
    setTreeSelection({ id: folder.id, path: folder.path, type: "folder" });
    setLibrarySection("folder");
    setActiveId(null);
    updateExpandedFolders((current) => {
      const next = new Set(current);
      const lineage = workspaceFolderLineage(project.tree, folder.path);
      if (toggle && next.has(folder.id)) {
        next.delete(folder.id);
      } else {
        lineage.forEach((id) => next.add(id));
      }
      return next;
    });
    const currentFolder = findWorkspaceTreeItem(project.tree, folder.path) || folder;
    const isLoaded = currentFolder.loaded === true || Array.isArray(currentFolder.children);
    if (isLoaded || folderLoadRequestsRef.current.has(folder.path)) return;
    const generation = projectGenerationRef.current;
    setFolderLoadingPaths((current) => new Set(current).add(folder.path));
    const request = bridge.loadFolder(folder.path)
      .then((scannedFolder) => {
        if (generation !== projectGenerationRef.current || !scannedFolder) return;
        setProject((current) => ({
          ...current,
          tree: mergeWorkspaceFolder(current.tree, folder.path, scannedFolder),
        }));
        setDocuments((current) => {
          const loadedDocuments = documentsFromWorkspaceTree(scannedFolder.children || []);
          const knownPaths = new Set(loadedDocuments.map((document) => document.path));
          return [...current.filter((document) => !knownPaths.has(document.path)), ...loadedDocuments];
        });
      })
      .catch((error) => {
        if (generation === projectGenerationRef.current) {
          setToast({ message: error?.message || t("library.loadFailed") });
        }
      })
      .finally(() => {
        folderLoadRequestsRef.current.delete(folder.path);
        setFolderLoadingPaths((current) => {
          const next = new Set(current);
          next.delete(folder.path);
          return next;
        });
      });
    folderLoadRequestsRef.current.set(folder.path, request);
  }

  function openFolderItem(id) {
    const item = selectedFolderItems.find((candidate) => candidate.id === id);
    if (item?.type === "file") {
      void revealWorkspaceItem(item);
      return;
    }
    void openDocument(id);
  }

  function activateDocumentTab(id) {
    const item = workspaceItems.find((candidate) => candidate.id === id);
    if (item?.type === "document") markDocumentOpened(item);
    if (item) setTreeSelection({ id: item.id, path: item.path, type: item.type });
    setActiveId(id);
  }

  function closeDocumentTabs(id, scope = "single") {
    setOpenTabs((current) => {
      const closingIndex = current.indexOf(id);
      if (closingIndex === -1) return current;
      const next = scope === "all"
        ? []
        : scope === "left"
          ? current.slice(closingIndex)
          : scope === "right"
            ? current.slice(0, closingIndex + 1)
            : current.filter((tabId) => tabId !== id);
      setActiveId((active) => {
        if (active === null || next.includes(active)) return active;
        if (scope === "left" || scope === "right") return next.includes(id) ? id : null;
        return next[Math.min(closingIndex, next.length - 1)] ?? null;
      });
      return next;
    });
  }

  function closeDocumentTab(id) {
    closeDocumentTabs(id, "single");
  }

  async function openProject(projectId = null, { create = false, firstRun = false } = {}) {
    const recentProjectId = typeof projectId === "string" ? projectId : null;
    const generation = projectGenerationRef.current + 1;
    projectGenerationRef.current = generation;
    setLibraryState("loading");
    try {
      const nextProject = recentProjectId
        ? await bridge.openRecentProject(recentProjectId)
        : create
          ? await bridge.createProject()
          : await bridge.openProject();
      if (generation !== projectGenerationRef.current) return false;
      if (!nextProject) {
        setLibraryState(documents.length ? "ready" : "empty");
        return false;
      }
      setProject(nextProject);
      const nextDocuments = documentsFromWorkspaceTree(nextProject.tree);
      setDocuments(nextDocuments);
      allDocumentsLoadedRef.current = bridge.isDemo;
      folderLoadRequestsRef.current.clear();
      setFolderLoadingPaths(new Set());
      previewGenerationRef.current += 1;
      previewRequestsRef.current.clear();
      setDocumentPreviews({});
      setOpenTabs([]);
      setDocumentSources({});
      documentContextSourcesRef.current = {};
      setDocumentContextSources({});
      setSaveStatuses({});
      setLibrarySection("all");
      setActiveId(null);
      setTreeSelection(null);
      setSidebarView("files");
      setLibraryState(nextProject.tree?.length ? "ready" : "empty");
      await refreshRecentProjects();
      if (firstRun && !isOnboardingWindow) {
        setStartupError("");
        setStartupMode("workspace");
      }
      return true;
    } catch (error) {
      if (generation !== projectGenerationRef.current) return false;
      setLibraryState(documents.length ? "ready" : "empty");
      if (firstRun) setStartupError(error?.message || t("editor.openFailed"));
      else setToast({ message: error?.message || t("editor.openFailed") });
      await refreshRecentProjects();
      return false;
    }
  }

  async function startFirstRunProject(mode) {
    setStartupError("");
    setStartupMode(mode === "create" ? "creating" : "opening");
    const opened = await openProject(null, { create: mode === "create", firstRun: true });
    if (!opened) {
      setStartupMode("onboarding");
      return;
    }
    if (isOnboardingWindow) {
      try {
        await bridge.completeOnboarding();
      } catch (error) {
        setStartupError(error?.message || t("editor.openFailed"));
        setStartupMode("onboarding");
      }
      return;
    }
    if (previewFirstRun) {
      window.setTimeout(() => setWelcomeLoginOpen(true), 180);
    }
  }

  const refreshProjectTree = useCallback(async (imported) => {
    if (imported?.length) setProject((current) => ({ ...current, tree: withImportedAssets(current.tree, imported) }));
    if (bridge.isDemo) return;
    try {
      const refreshed = await bridge.refreshProject?.();
      if (refreshed?.tree) {
        setProject((current) => ({
          ...current,
          ...refreshed,
          tree: mergeWorkspaceChildren(current.tree, refreshed.tree),
        }));
      }
      const refreshedDocuments = allDocumentsLoadedRef.current
        ? await bridge.listDocuments?.({ force: true })
        : documentsFromWorkspaceTree(refreshed?.tree || []);
      if (Array.isArray(refreshedDocuments)) {
        setDocuments(refreshedDocuments);
        previewGenerationRef.current += 1;
        previewRequestsRef.current.clear();
        setDocumentPreviews({});
      }
    } catch {
      window.dispatchEvent(new CustomEvent("fylune-toast", { detail: { message: t("editor.addingFileRefresh") } }));
    }
  }, [t]);

  function resolveWorkspaceActionItem(treeItem) {
    return workspaceItems.find((item) => item.id === treeItem.id || item.path === treeItem.path) || treeItem;
  }

  function canMutateWorkspaceItem(item) {
    const affectedDocuments = item.type === "folder"
      ? workspaceItems.filter((candidate) => (
        candidate.type === "document" && workspacePathContains(item.path, candidate.path)
      ))
      : item.type === "document" ? [item] : [];
    const pendingDocument = affectedDocuments.find((candidate) => {
      if (!openTabs.includes(candidate.id)) return false;
      const status = saveStatuses[candidate.id] || "saved";
      return status !== "saved" && status !== "readonly";
    });
    if (!pendingDocument) return true;
    setToast({ message: t("files.waitForSave", { name: pendingDocument.name }) });
    return false;
  }

  async function renameWorkspaceItem(treeItem, name) {
    const item = resolveWorkspaceActionItem(treeItem);
    if (!canMutateWorkspaceItem(item)) return;
    try {
      const result = await bridge.renameWorkspaceItem({ path: item.path, name, expectedMtimeMs: item.mtimeMs });
      const nextId = result.path;
      const target = {
        id: item.id,
        path: item.path,
        nextId,
        nextPath: result.path,
        name: result.name,
        mtimeMs: result.mtimeMs,
      };
      const remapPath = (candidate) => remapWorkspacePath(candidate, item.path, result.path);
      const folderIdRemaps = new Map();
      const collectFolderIdRemaps = (items, parentPath = "") => {
        for (const branch of items || []) {
          const branchPath = workspaceTreePath(branch, parentPath);
          if (branch.type === "folder" && workspacePathContains(item.path, branchPath)) {
            folderIdRemaps.set(branch.id, remapPath(branchPath));
          }
          if (branch.children) collectFolderIdRemaps(branch.children, branchPath);
        }
      };
      collectFolderIdRemaps(project.tree);
      const documentIdRemaps = new Map(documents
        .filter((document) => workspacePathContains(item.path, document.path.replaceAll(" / ", "/")))
        .map((document) => [
          document.id,
          remapPath(document.path.replaceAll(" / ", "/")),
        ]));
      const remapId = (candidate) => documentIdRemaps.get(candidate) || remapPath(candidate);
      const remapStateRecord = (record) => Object.fromEntries(Object.entries(record).map(([key, value]) => [
        remapId(key),
        value,
      ]));
      setProject((current) => ({ ...current, tree: renameWorkspaceTreeItem(current.tree, target) }));
      setDocuments((current) => current.map((document) => (
        workspacePathContains(item.path, document.path.replaceAll(" / ", "/"))
          ? {
              ...document,
              id: remapPath(document.path.replaceAll(" / ", "/")),
              title: item.type === "document" ? workspaceTitleFromName(result.name) : document.title,
              path: remapPath(document.path.replaceAll(" / ", "/")),
              modified: t("editor.justNow"),
            }
          : document
      )));
      setOpenTabs((current) => current.map(remapId));
      setActiveId((current) => remapId(current));
      setTreeSelection((current) => current?.path && workspacePathContains(item.path, current.path)
        ? { ...current, id: remapId(current.id), path: remapPath(current.path) }
        : current);
      setDocumentSources(remapStateRecord);
      setDocumentContextSources((current) => {
        const next = remapStateRecord(current);
        documentContextSourcesRef.current = remapStateRecord(documentContextSourcesRef.current);
        return next;
      });
      setDocumentPreviews(remapStateRecord);
      setSaveStatuses(remapStateRecord);
      updateExpandedFolders((current) => {
        const next = new Set([...current].map((id) => folderIdRemaps.get(id) || remapPath(id)));
        if (item.type === "folder") next.add(result.path);
        return next;
      });
      setDocumentLibraryState((current) => {
        const projectState = current[activeProjectLibraryKey] || {};
        return {
          ...current,
          [activeProjectLibraryKey]: remapRecordPathKeys(projectState, item.path, result.path),
        };
      });
      setToast({ message: t("files.renamed", { name: result.name }) });
    } catch (error) {
      setToast({ message: error?.message || t("files.renameFailed", { name: item.name }) });
    }
  }

  async function duplicateWorkspaceItem(treeItem) {
    const item = resolveWorkspaceActionItem(treeItem);
    if (!canMutateWorkspaceItem(item)) return;
    try {
      const result = await bridge.duplicateWorkspaceItem({ path: item.path, expectedMtimeMs: item.mtimeMs });
      const nextId = result.path;
      const target = {
        id: item.id,
        path: item.path,
        nextId,
        nextPath: result.path,
        name: result.name,
        mtimeMs: result.mtimeMs,
      };
      setProject((current) => ({ ...current, tree: duplicateWorkspaceTreeItem(current.tree, target) }));
      if (item.type === "folder") {
        setDocuments((current) => {
          const copies = current
            .filter((document) => workspacePathContains(item.path, document.path))
            .map((document) => {
              const sourcePath = document.path.replaceAll(" / ", "/");
              const nextPath = `${result.path}${sourcePath.slice(item.path.length)}`;
              return {
                ...document,
                id: nextPath,
                path: nextPath,
                modified: t("editor.justNow"),
                starred: false,
              };
            });
          return [...current, ...copies];
        });
      } else if (item.type === "document") {
        setDocuments((current) => current.flatMap((document) => (
          document.id === item.id || document.path.replaceAll(" / ", "/") === item.path
            ? [document, { ...document, id: nextId, title: workspaceTitleFromName(result.name), path: result.path, modified: t("editor.justNow"), starred: false }]
            : [document]
        )));
        setDocumentPreviews((current) => current[item.id]
          ? { ...current, [nextId]: current[item.id] }
          : current);
        setSaveStatuses((current) => ({ ...current, [nextId]: "saved" }));
      }
      setToast({ message: t("files.created", { name: result.name }) });
    } catch (error) {
      setToast({ message: error?.message || t("files.copyFailed", { name: item.name }) });
    }
  }

  async function deleteWorkspaceItem(treeItem) {
    const item = resolveWorkspaceActionItem(treeItem);
    if (!canMutateWorkspaceItem(item)) return;
    if (item.type === "folder" && !window.confirm(t("files.deleteFolderConfirm", { name: item.name }))) return;
    const affectedItems = item.type === "folder"
      ? workspaceItems.filter((candidate) => workspacePathContains(item.path, candidate.path))
      : [item];
    const affectedIds = new Set(affectedItems.map((candidate) => candidate.id));
    const affectedDocuments = affectedItems.filter((candidate) => candidate.type === "document");
    const affectedDocumentIds = affectedDocuments.map((candidate) => candidate.id);
    try {
      await bridge.deleteWorkspaceItem({ path: item.path, expectedMtimeMs: item.mtimeMs });
      setProject((current) => ({ ...current, tree: deleteWorkspaceTreeItem(current.tree, item) }));
      setDocuments((current) => current.filter((document) => (
        !workspacePathContains(item.path, document.path)
      )));
      setOpenTabs((current) => current.filter((id) => !affectedIds.has(id)));
      setActiveId((current) => affectedIds.has(current) ? null : current);
      setTreeSelection((current) => workspacePathContains(item.path, current?.path) ? null : current);
      updateExpandedFolders((current) => new Set([...current].filter((id) => !affectedIds.has(id))));
      setDocumentSources((current) => removeRecordKeys(current, affectedDocumentIds));
      setDocumentContextSources((current) => {
        const next = removeRecordKeys(current, affectedDocumentIds);
        documentContextSourcesRef.current = removeRecordKeys(documentContextSourcesRef.current, affectedDocumentIds);
        return next;
      });
      setDocumentPreviews((current) => removeRecordKeys(current, affectedDocumentIds));
      setSaveStatuses((current) => removeRecordKeys(current, affectedDocumentIds));
      setDocumentLibraryState((current) => {
        const projectState = current[activeProjectLibraryKey] || {};
        const nextProjectState = removeRecordKeys(
          projectState,
          affectedDocuments.map((document) => documentLibraryKey(document)),
        );
        return nextProjectState === projectState ? current : { ...current, [activeProjectLibraryKey]: nextProjectState };
      });
      setToast({ message: t("files.trashed", { name: item.name }) });
    } catch (error) {
      setToast({ message: error?.message || t("files.deleteFailed", { name: item.name }) });
    }
  }

  async function revealWorkspaceItem(treeItem) {
    const item = resolveWorkspaceActionItem(treeItem);
    try {
      await bridge.revealWorkspaceItem(item);
    } catch (error) {
      setToast({ message: error?.message || t("editor.showFinderFailed") });
    }
  }

  async function openWorkspaceItemInTerminal(treeItem) {
    const item = resolveWorkspaceActionItem(treeItem);
    try {
      await bridge.openWorkspaceItemInTerminal(item);
    } catch (error) {
      setToast({ message: error?.message || t("editor.openTerminalFailed") });
    }
  }

  const updateDocumentIcon = useCallback((target, icon) => {
    const targetPath = target?.path?.replaceAll(" / ", "/");
    if (!target?.id && !targetPath) return;
    setDocuments((current) => current.map((document) => (
      document.id === target.id || document.path.replaceAll(" / ", "/") === targetPath
        ? { ...document, icon: icon || null }
        : document
    )));
    setProject((current) => ({
      ...current,
      tree: updateWorkspaceTreeItemIcon(current.tree, { ...target, path: targetPath }, icon),
    }));
  }, []);

  function toggleStar(id) {
    const document = libraryDocuments.find((candidate) => candidate.id === id);
    if (document) updateDocumentLibraryEntry(document, { favorite: !document.starred });
  }

  const navigateDocumentContext = useCallback((item) => {
    const editor = window.document.querySelector(".editor-screen");
    if (!editor) return;
    const normalize = (value) => value?.replace(/\s+/g, " ").trim().toLocaleLowerCase() || "";
    const requestedText = normalize(item.text);
    let candidates = [];

    if (item.type === "heading") {
      candidates = [
        ...editor.querySelectorAll(".document-title-input, .fylune-mdx-content :is(h1, h2, h3, h4, h5, h6)"),
      ];
    } else if (item.type === "task") {
      candidates = [...editor.querySelectorAll(".fylune-mdx-content li")];
    } else if (item.type === "attachment") {
      candidates = [...editor.querySelectorAll(".fylune-mdx-content :is(img, video, a)")];
    }

    const target = candidates.find((candidate) => {
      const candidateText = normalize(
        candidate.getAttribute?.("alt")
        || candidate.getAttribute?.("title")
        || candidate.textContent,
      );
      const candidateReference = candidate.getAttribute?.("href") || candidate.getAttribute?.("src") || "";
      return candidateText === requestedText
        || candidateText.includes(requestedText)
        || (item.reference && candidateReference.includes(item.reference));
    });
    if (!target) return;
    target.scrollIntoView({ block: "center", behavior: "smooth" });
    target.classList.add("sidebar-navigation-target");
    window.setTimeout(() => target.classList.remove("sidebar-navigation-target"), 900);
  }, []);

  if (startupMode !== "workspace") {
    return (
      <div className="fylune-app is-first-run">
        {startupMode === "checking" ? (
          <div className="startup-splash" role="status" aria-label={t("onboarding.loading")}>
            <img src={fyluneIcon} alt="" />
          </div>
        ) : (
          <FirstRunOnboarding
            busyAction={
              startupMode === "creating"
                ? "create"
                : startupMode === "opening"
                  ? "open"
                  : ""
            }
            error={startupError}
            onCreateProject={() => startFirstRunProject("create")}
            onOpenProject={() => startFirstRunProject("open")}
          />
        )}
      </div>
    );
  }

  return (
    <div className={`fylune-app ${windowFullscreen ? "is-window-fullscreen" : ""} ${sidebarCollapsed ? "is-sidebar-collapsed" : ""}`}>
      <Sidebar
        project={project}
        documents={libraryDocuments}
        fileCount={workspaceFiles.length}
        activeId={activeId}
        activeDocument={activeDocument}
        activeDocumentSource={activeDocument
          ? documentContextSources[activeDocument.id] ?? documentSources[activeDocument.id] ?? ""
          : ""}
        selectedTreePath={activeItem?.path || (librarySection === "folder" ? treeSelection?.path || null : null)}
        workspaceRootSelected={!activeId && librarySection === "folder" && treeSelection?.type === "root"}
        workspaceRootExpanded={workspaceRootExpanded}
        librarySection={librarySection}
        sidebarView={sidebarView}
        expanded={expanded}
        onToggleFolder={(id) => updateExpandedFolders((current) => { const next = new Set(current); next.has(id) ? next.delete(id) : next.add(id); return next; })}
        onOpenDocument={openDocument}
        onSelectTreeItem={(item) => {
          if (item.type === "folder") {
            showFolder(item, { toggle: true });
          } else {
            setTreeSelection({ id: item.id, path: item.path, type: item.type });
          }
        }}
        onSelectWorkspaceRoot={() => {
          setTreeSelection({ id: project.id, path: "", type: "root" });
          setLibrarySection("folder");
          setActiveId(null);
        }}
        onToggleWorkspaceRoot={() => {
          setWorkspaceRootState((current) => ({
            ...current,
            [activeProjectNavigationKey]: !workspaceRootExpanded,
          }));
        }}
        onRefreshWorkspace={refreshProjectTree}
        onRenameWorkspaceItem={renameWorkspaceItem}
        onDuplicateWorkspaceItem={duplicateWorkspaceItem}
        onDeleteWorkspaceItem={deleteWorkspaceItem}
        onRevealWorkspaceItem={revealWorkspaceItem}
        onOpenWorkspaceItemInTerminal={openWorkspaceItemInTerminal}
        onShowAll={showAllFiles}
        onShowDocuments={showDocuments}
        onShowFavorites={showFavorites}
        onNewDocument={newDocument}
        onOpenProject={openProject}
        recentProjects={recentProjects}
        onOpenRecentProject={(projectId) => openProject(projectId)}
        onOpenSettings={() => setSettingsOpen(true)}
        accountDetails={accountDetails}
        collapsed={sidebarCollapsed}
        onToggleSidebar={() => setSidebarCollapsed((collapsed) => !collapsed)}
        onSidebarView={changeSidebarView}
        onNavigateDocument={navigateDocumentContext}
      />
      <DocumentTabs
        items={workspaceItems}
        openTabs={openTabs}
        activeId={activeId}
        onActivate={activateDocumentTab}
        onClose={closeDocumentTab}
        onCloseScope={closeDocumentTabs}
        onShowAll={showAllFiles}
        onNewDocument={newDocument}
        sidebarCollapsed={sidebarCollapsed}
        onToggleSidebar={() => setSidebarCollapsed(false)}
      />
      <div className="workspace">
        {activeDocument && /\.jsonl?$/i.test(activeDocument.path || "") ? (
          <JsonEditor key={activeDocument.id} document={activeDocument} source={documentSources[activeDocument.id]} saveStatus={saveStatuses[activeDocument.id] || "saved"} saveRequest={saveRequest} onSaveStatus={updateActiveDocumentStatus} onBack={showAllFiles} onSourceChange={rememberSource} onRenameDocument={renameWorkspaceItem} />
        ) : activeDocument ? (
          <Editor key={activeDocument.id} document={activeDocument} source={documentSources[activeDocument.id]} saveStatus={saveStatuses[activeDocument.id] || "saved"} saveRequest={saveRequest} onSaveStatus={updateActiveDocumentStatus} onBack={showAllFiles} onSourceChange={rememberSource} onContextSourceChange={rememberContextSource} onAssetImported={refreshProjectTree} onRenameDocument={renameWorkspaceItem} onDocumentIconChange={updateDocumentIcon} reviewAgentChanges={Boolean(preferences.reviewAgentChanges)} />
        ) : activeAsset ? (
          <AssetPreview
            item={activeAsset}
            src={bridge.previewAsset(activeAsset) || (activeAsset.id === "asset-cover" ? fyluneIcon : null)}
            loadData={() => bridge.readPreviewAsset(activeAsset)}
            onBack={showAllFiles}
            onReveal={() => bridge.revealAsset(activeAsset)}
            onOpenExternally={() => bridge.openAssetExternally(activeAsset)}
            readWorkbook={(asset) => bridge.readWorkbook(asset)}
            saveWorkbook={(asset, input) => bridge.saveWorkbook(asset, input)}
          />
        ) : selectedFolder && librarySection === "folder" ? (
          <FolderLibrary
            key={`${activeProjectLibraryKey}:folder`}
            folder={selectedFolder}
            breadcrumbs={selectedFolderBreadcrumbs}
            items={selectedFolderItems}
            loading={folderLoadingPaths.has(selectedFolder.path)}
            documentSources={documentSources}
            documentPreviews={documentPreviews}
            view={view}
            onView={setView}
            onOpen={openFolderItem}
            onStar={toggleStar}
            onRequestPreview={requestDocumentPreview}
            onOpenFolder={showFolder}
            onShowAll={showAllFiles}
            onNewDocument={newDocument}
          />
        ) : (
          <Library
            key={`${activeProjectLibraryKey}:library`}
            items={librarySection === "favorites"
              ? favoriteDocuments
              : librarySection === "documents"
                ? libraryDocuments
                : workspaceFiles}
            documentSources={documentSources}
            documentPreviews={documentPreviews}
            section={librarySection}
            view={view}
            onView={setView}
            onOpen={openDocument}
            onOpenFolder={showFolder}
            onStar={toggleStar}
            onRequestPreview={requestDocumentPreview}
            onShowAll={showAllFiles}
            onNewDocument={newDocument}
            onOpenProject={openProject}
            state={libraryState}
            onState={setLibraryState}
          />
        )}
      </div>
      {settingsOpen ? (
        <SettingsPanel
          preferences={preferences}
          onPreferences={setPreferences}
          accountDetails={accountDetails}
          onAccountChange={setAccountDetails}
          onRequestSignIn={() => setWelcomeLoginOpen(true)}
          onClose={() => setSettingsOpen(false)}
        />
      ) : null}
      {welcomeLoginOpen ? (
        <WelcomeLoginModal
          authBridge={bridge}
          locale={preferences.language === "system" ? undefined : preferences.language}
          onComplete={(result) => {
            window.localStorage?.setItem(welcomeAuthCompletedKey, "true");
            setWelcomeLoginOpen(false);
            if (result?.status === "signed-in" || result === "signed-in") void refreshAccount();
          }}
        />
      ) : null}
      <Toast toast={toast} onClose={() => setToast(null)} />
    </div>
  );
}
