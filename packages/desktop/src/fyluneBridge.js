import { demoDocuments, demoMarkdown, demoProject, demoSnapshots, demoWorkbook } from "./demoData.js";
import { isLegacyOfficeItem } from "./preview/officeFormats.js";

const delay = (ms = 120) => new Promise((resolve) => window.setTimeout(resolve, ms));
const READABLE_PREVIEW_TYPES = new Set(["pdf", "word", "excel", "powerpoint"]);
const PREVIEWABLE_WORKSPACE_TYPES = new Set(["document", "image", "video", "pdf", "word", "excel", "powerpoint"]);
const demoAssetUrls = new Map();
const demoDocumentContents = new Map();
let demoSession = { user: null };

function pick(source, paths) {
  for (const candidate of paths) {
    const parts = candidate.split(".");
    let value = source;
    let owner = source;
    for (const part of parts) {
      owner = value;
      value = value?.[part];
    }
    if (typeof value === "function") return value.bind(owner);
  }
  return null;
}

function asTreeItems(tree) {
  if (Array.isArray(tree)) return tree;
  return tree?.children || [];
}

function inferFileType(item, itemPath) {
  if (item.fileType) return item.fileType;
  if (item.type && item.type !== "file") return item.type;
  const extension = (item.extension || itemPath.split(".").at(-1) || "").toLowerCase();
  if (new Set(["md", "markdown", "mdx", "json", "jsonl"]).has(extension)) return "document";
  if (new Set(["png", "jpg", "jpeg", "webp", "gif"]).has(extension)) return "image";
  if (new Set(["mp4", "m4v", "mov", "webm"]).has(extension)) return "video";
  if (extension === "pdf") return "pdf";
  if (new Set(["docx", "doc"]).has(extension)) return "word";
  if (new Set(["xlsx", "xls"]).has(extension)) return "excel";
  if (new Set(["pptx", "ppt"]).has(extension)) return "powerpoint";
  return "file";
}

function normalizeTree(tree, prefix = "") {
  return asTreeItems(tree).map((item) => {
    const itemPath = item.path || (prefix ? `${prefix}/${item.name}` : item.name);
    const type = item.kind === "directory" || item.type === "folder" ? "folder" : inferFileType(item, itemPath);
    return {
      ...item,
      id: item.id || itemPath,
      path: itemPath,
      type,
      children: item.children ? normalizeTree(item.children, itemPath) : undefined,
      previewChildren: item.previewChildren ? normalizeTree(item.previewChildren, itemPath) : undefined,
    };
  });
}

function flattenDocuments(tree, prefix = "") {
  return asTreeItems(tree).flatMap((item) => {
    const itemPath = item.path || (prefix ? `${prefix}/${item.name}` : item.name);
    if (item.type === "folder" || item.kind === "directory" || item.children) {
      return flattenDocuments(item.children, itemPath);
    }
    if (!/\.(?:md|markdown|mdx|json|jsonl)$/i.test(item.name || itemPath)) return [];
    const name = item.name || itemPath.split("/").at(-1);
    return [{
      ...item,
      id: item.id || itemPath,
      title: name.replace(/\.(?:md|markdown|mdx|json|jsonl)$/i, ""),
      path: itemPath,
      modified: item.modified || "Recently",
      starred: false,
      kind: "brief",
      words: item.words || 0,
    }];
  });
}

export function flattenWorkspaceItems(tree, prefix = "") {
  return asTreeItems(tree).flatMap((item) => {
    const itemPath = item.path || (prefix ? `${prefix}/${item.name}` : item.name);
    if (item.type === "folder" || item.kind === "directory" || item.children) {
      return flattenWorkspaceItems(item.children, itemPath);
    }
    const type = inferFileType(item, itemPath);
    if (!PREVIEWABLE_WORKSPACE_TYPES.has(type)) return [];
    const name = item.name || itemPath.split("/").at(-1);
    return [{
      ...item,
      id: item.id || itemPath,
      name,
      title: type === "document" ? name.replace(/\.(?:md|markdown|mdx|json|jsonl)$/i, "") : name,
      path: itemPath,
      type,
      size: item.size || 0,
    }];
  });
}

function remapWorkspacePath(candidate, previousPath, nextPath) {
  if (candidate === previousPath) return nextPath;
  return candidate?.startsWith(`${previousPath}/`)
    ? `${nextPath}${candidate.slice(previousPath.length)}`
    : candidate;
}

function remapPathMapEntries(map, previousPath, nextPath) {
  for (const [candidate, value] of [...map.entries()]) {
    const remapped = remapWorkspacePath(candidate, previousPath, nextPath);
    if (remapped === candidate) continue;
    map.delete(candidate);
    map.set(remapped, value);
  }
}

export function resolveDocumentAssetPath(documentPath, source) {
  if (!documentPath || !source || /^(?:[a-z]+:|\/)/i.test(source)) return null;
  const cleanSource = source.trim().split(/[?#]/, 1)[0];
  if (!cleanSource) return null;
  const segments = documentPath.replaceAll(" / ", "/").split("/").filter(Boolean).slice(0, -1);
  for (const rawSegment of cleanSource.split("/")) {
    let segment;
    try {
      segment = decodeURIComponent(rawSegment);
    } catch {
      return null;
    }
    if (!segment || segment === ".") continue;
    if (segment.includes("/") || segment.includes("\\") || segment.includes("\0")) return null;
    if (segment === "..") {
      if (!segments.length) return null;
      segments.pop();
    } else segments.push(segment);
  }
  return segments.length ? segments.join("/") : null;
}

const demoBridge = {
  isDemo: true,
  async getWindowState() {
    return { isFullscreen: Boolean(document.fullscreenElement) };
  },
  onWindowFullscreenChange(callback) {
    const listener = () => callback({ isFullscreen: Boolean(document.fullscreenElement) });
    document.addEventListener("fullscreenchange", listener);
    return () => document.removeEventListener("fullscreenchange", listener);
  },
  async completeOnboarding() {
    return { completed: true };
  },
  async openProject() {
    await delay();
    return demoProject;
  },
  async createProject() {
    await delay();
    return demoProject;
  },
  async listRecentProjects() {
    const stored = window.localStorage?.getItem("fylune-recent-projects");
    return stored ? JSON.parse(stored) : [{ ...demoProject, lastOpenedAt: new Date().toISOString() }];
  },
  async openRecentProject(projectId) {
    const project = (await this.listRecentProjects()).find((candidate) => candidate.id === projectId);
    return project ? { ...demoProject, ...project, tree: project.tree || demoProject.tree } : null;
  },
  onExternalFileOpen() {
    return () => {};
  },
  async listDocuments() {
    return demoDocuments;
  },
  async loadFolder(relativePath = "") {
    const findFolder = (items) => {
      for (const item of items) {
        if (item.type === "folder" && item.path === relativePath) return item;
        const match = item.children ? findFolder(item.children) : null;
        if (match) return match;
      }
      return null;
    };
    const tree = normalizeTree(demoProject.tree);
    return (relativePath ? findFolder(tree) : null) || { path: "", loaded: true, children: tree };
  },
  async refreshProject() {
    return demoProject;
  },
  async readDocument(id) {
    const normalizedId = id?.replaceAll(" / ", "/");
    const match = demoDocuments.find((item) => item.id === id || item.path.replaceAll(" / ", "/") === normalizedId);
    const content = demoDocumentContents.has(normalizedId)
      ? demoDocumentContents.get(normalizedId)
      : demoMarkdown.replace("# Product brief", `# ${match?.title || "Product brief"}`);
    return { id, path: match?.path || id, content, hash: "demo-hash", baseHash: "demo-hash", baseContent: content, readOnly: false };
  },
  async readDocumentPreview(id) {
    const document = await this.readDocument(id);
    return { path: document.path, content: document.content, truncated: false };
  },
  async readDocumentFresh(id) {
    return this.readDocument(id);
  },
  async acceptExternalVersion(hash) {
    return { hash };
  },
  async saveDocument(payload) {
    const documentPath = (payload.path || payload.id)?.replaceAll(" / ", "/");
    const content = typeof payload.content === "string" ? payload.content : `# ${payload.title || "Untitled document"}\n`;
    if (documentPath) demoDocumentContents.set(documentPath, content);
    return { ...payload, path: documentPath, content, hash: "demo-hash", savedAt: new Date().toISOString() };
  },
  async saveDraft(payload) {
    return payload;
  },
  async loadDraft() {
    return null;
  },
  async clearDraft() {
    return { cleared: true };
  },
  async renameWorkspaceItem({ path, name }) {
    const parent = path.includes("/") ? path.slice(0, path.lastIndexOf("/")) : "";
    return { previousPath: path, path: parent ? `${parent}/${name}` : name, name, mtimeMs: Date.now() };
  },
  async duplicateWorkspaceItem({ path }) {
    const parent = path.includes("/") ? path.slice(0, path.lastIndexOf("/")) : "";
    const fileName = path.split("/").at(-1);
    const dot = fileName.lastIndexOf(".");
    const name = `${dot > 0 ? fileName.slice(0, dot) : fileName} copy${dot > 0 ? fileName.slice(dot) : ""}`;
    return { sourcePath: path, path: parent ? `${parent}/${name}` : name, name, mtimeMs: Date.now() };
  },
  async deleteWorkspaceItem({ path }) {
    return { path, name: path.split("/").at(-1), trashed: true };
  },
  async importAsset(file, documentPath = demoDocuments[0].path.replaceAll(" / ", "/")) {
    const name = file?.name || "imported-image.png";
    const extension = name.split(".").at(-1)?.toLowerCase();
    const kind = extension === "pdf" ? "pdf" : new Set(["mp4", "m4v", "mov", "webm"]).has(extension) ? "video" : "image";
    const depth = Math.max(0, documentPath.split("/").length - 1);
    const markdownUrl = `${depth ? "../".repeat(depth) : "./"}assets/${encodeURIComponent(name)}`;
    const previewUrl = file ? URL.createObjectURL(file) : null;
    if (previewUrl) demoAssetUrls.set(`assets/${name}`, previewUrl);
    return {
      name,
      kind,
      path: `assets/${name}`,
      markdownUrl,
      markdown: kind === "image" ? `![${name.replace(/\.[^.]+$/, "")}](${markdownUrl})` : `[${name}](${markdownUrl})`,
      previewUrl,
    };
  },
  previewAsset(item) {
    return item?.previewUrl || demoAssetUrls.get(item?.path) || null;
  },
  previewDocumentAsset(source, documentPath) {
    if (/^(?:blob:|data:|https?:)/i.test(source)) return source;
    return demoAssetUrls.get(resolveDocumentAssetPath(documentPath, source)) || source;
  },
  async readPreviewAsset() {
    return null;
  },
  async readWorkbook() {
    return structuredClone(demoWorkbook);
  },
  async saveWorkbook() {
    throw Object.assign(new Error("Open a project folder to save this workbook."), { code: "NO_PROJECT" });
  },
  async revealAsset() {
    return { revealed: true };
  },
  async revealWorkspaceItem() {
    return { revealed: true };
  },
  async openWorkspaceItemInTerminal() {
    return { opened: true };
  },
  async openAssetExternally() {
    return { opened: true };
  },
  async copyText(text) {
    await navigator.clipboard.writeText(text);
    return { copied: true };
  },
  async listSnapshots() {
    return demoSnapshots;
  },
  async previewSnapshot(id) {
    return {
      ...(demoSnapshots.find((item) => item.id === id) || demoSnapshots[0]),
      content: demoMarkdown,
      changes: {
        segments: [
          { type: "unchanged", content: "# Product brief", count: 1 },
          { type: "removed", content: "The first release focuses on calm editing.", count: 1 },
          { type: "added", content: "The first release focuses on safe local editing and reviewable external changes.", count: 1 },
        ],
      },
    };
  },
  async restoreSnapshot(id) {
    return { id, restored: true, hash: "demo-hash" };
  },
  async getPreferences() {
    const raw = window.localStorage.getItem("fylune-preferences");
    return raw ? JSON.parse(raw) : {};
  },
  async setPreferences(next) {
    window.localStorage.setItem("fylune-preferences", JSON.stringify(next));
    return next;
  },
  async getSession() {
    return demoSession;
  },
  async getAccount() {
    return demoSession;
  },
  async signIn({ email } = {}) {
    demoSession = { user: { id: "demo-user", email: email || "demo@fylune.com", name: "Demo User", avatarUrl: null } };
    return demoSession;
  },
  async register({ email } = {}) {
    return this.signIn({ email });
  },
  async signOut() {
    demoSession = { user: null };
    return demoSession;
  },
  onExternalChange() {
    return () => {};
  },
  getUpdateState: async () => ({ distribution: "development", canSelfUpdate: false, status: "disabled", currentVersion: "0.1.6" }),
  checkForUpdates: async () => ({ distribution: "development", canSelfUpdate: false, status: "disabled", currentVersion: "0.1.6" }),
  downloadUpdate: async () => ({ distribution: "development", canSelfUpdate: false, status: "disabled", currentVersion: "0.1.6" }),
  installUpdate: async () => ({ distribution: "development", canSelfUpdate: false, status: "disabled", currentVersion: "0.1.6" }),
  onUpdateStateChange() {
    return () => {};
  },
};

function nativeBridge(source) {
  const getWindowState = pick(source, ["window.getState"]);
  const completeOnboarding = pick(source, ["window.completeOnboarding"]);
  const onWindowFullscreenChange = pick(source, ["window.onFullscreenChange"]);
  const pickProject = pick(source, ["projects.pick"]);
  const createProjectRequest = pick(source, ["projects.create"]);
  const listRecentProjects = pick(source, ["projects.listRecent"]);
  const openRecentProject = pick(source, ["projects.openRecent"]);
  const onOpenFile = pick(source, ["projects.onOpenFile"]);
  const scanProject = pick(source, ["projects.scan"]);
  const readDocument = pick(source, ["documents.read"]);
  const readDocumentFresh = pick(source, ["documents.readFresh"]);
  const acceptExternalDocument = pick(source, ["documents.acceptExternal"]);
  const readDocumentPreview = pick(source, ["documents.preview"]);
  const saveDocument = pick(source, ["documents.save"]);
  const saveDraft = pick(source, ["documents.saveDraft"]);
  const loadDraft = pick(source, ["documents.loadDraft"]);
  const clearDraft = pick(source, ["documents.clearDraft"]);
  const renameFile = pick(source, ["files.rename"]);
  const duplicateFile = pick(source, ["files.duplicate"]);
  const deleteFile = pick(source, ["files.delete"]);
  const openFileInTerminal = pick(source, ["files.openInTerminal"]);
  const pickAsset = pick(source, ["assets.import"]);
  const importDroppedAsset = pick(source, ["assets.importDroppedFile"]);
  const previewAssetUrl = pick(source, ["assets.previewUrl"]);
  const readAsset = pick(source, ["assets.read"]);
  const revealAssetFile = pick(source, ["assets.reveal"]);
  const openAssetFileExternally = pick(source, ["assets.openExternally"]);
  const readWorkbookFile = pick(source, ["workbooks.read"]);
  const saveWorkbookFile = pick(source, ["workbooks.save"]);
  const copyText = pick(source, ["clipboard.writeText"]);
  const listSnapshots = pick(source, ["snapshots.list"]);
  const previewSnapshot = pick(source, ["snapshots.preview"]);
  const restoreSnapshot = pick(source, ["snapshots.restore"]);
  let activeProject = null;
  let activeDocumentPath = demoDocuments[0].path.replaceAll(" / ", "/");
  let cachedDocuments = null;
  let projectGeneration = 0;
  const documentHashes = new Map();

  function invalidateDocuments() {
    cachedDocuments = null;
  }

  async function activateProject(picked, generation) {
    if (!picked) return null;
    const projectId = picked.projectId || picked.id;
    const scanned = picked.tree || !scanProject ? picked : await scanProject({ projectId, folderPreviews: true });
    if (generation !== projectGeneration) return null;
    activeProject = scanned?.projectId || projectId;
    activeDocumentPath = demoDocuments[0].path.replaceAll(" / ", "/");
    documentHashes.clear();
    invalidateDocuments();
    return {
      ...picked,
      ...scanned,
      id: activeProject,
      tree: normalizeTree(scanned?.tree || picked.tree),
    };
  }

  async function requestProject(request) {
    const generation = ++projectGeneration;
    return activateProject(await request(), generation);
  }

  return {
    getWindowState: getWindowState || demoBridge.getWindowState,
    completeOnboarding: completeOnboarding || demoBridge.completeOnboarding,
    onWindowFullscreenChange: onWindowFullscreenChange || demoBridge.onWindowFullscreenChange,
    openProject: () => pickProject ? requestProject(() => pickProject()) : demoBridge.openProject(),
    createProject: () => createProjectRequest ? requestProject(() => createProjectRequest()) : demoBridge.createProject(),
    async listRecentProjects() {
      if (!listRecentProjects) return demoBridge.listRecentProjects();
      return (await listRecentProjects() || []).map((project) => ({ ...project, id: project.projectId || project.id }));
    },
    openRecentProject: (projectId) => openRecentProject ? requestProject(() => openRecentProject({ projectId })) : null,
    onExternalFileOpen(callback) {
      if (!onOpenFile) return () => {};
      return onOpenFile(async (payload) => {
        projectGeneration += 1;
        const project = await activateProject(payload, projectGeneration);
        if (project) callback({ ...project, targetPath: payload.targetPath });
      });
    },
    async listDocuments({ force = false } = {}) {
      if (!scanProject || !activeProject) return demoBridge.listDocuments();
      if (!force && cachedDocuments) return cachedDocuments;
      const scanned = await scanProject({ projectId: activeProject, recursive: true, documentsOnly: true });
      cachedDocuments = flattenDocuments(scanned?.tree);
      return cachedDocuments;
    },
    async loadFolder(relativePath = "") {
      if (!scanProject || !activeProject) return demoBridge.loadFolder(relativePath);
      const scanned = await scanProject({ projectId: activeProject, path: relativePath, folderPreviews: true });
      return { ...scanned?.tree, path: scanned?.tree?.path || relativePath, loaded: true, children: normalizeTree(scanned?.tree) };
    },
    async refreshProject() {
      if (!scanProject || !activeProject) return demoBridge.refreshProject();
      invalidateDocuments();
      const scanned = await scanProject({ projectId: activeProject, folderPreviews: true });
      return { ...scanned, id: activeProject, tree: normalizeTree(scanned?.tree) };
    },
    async readDocument(idOrPath) {
      if (!readDocument || !activeProject) return demoBridge.readDocument(idOrPath);
      const requestedPath = idOrPath.replaceAll(" / ", "/");
      const result = await readDocument({ projectId: activeProject, path: requestedPath });
      activeDocumentPath = result?.path || requestedPath;
      if (result?.hash) documentHashes.set(activeDocumentPath, result.hash);
      return result;
    },
    async readDocumentPreview(idOrPath) {
      return readDocumentPreview && activeProject
        ? readDocumentPreview({ projectId: activeProject, path: idOrPath })
        : demoBridge.readDocumentPreview(idOrPath);
    },
    async readDocumentFresh(idOrPath = activeDocumentPath) {
      const readLatest = readDocumentFresh || readDocument;
      return readLatest && activeProject
        ? readLatest({ projectId: activeProject, path: idOrPath })
        : demoBridge.readDocumentFresh(idOrPath);
    },
    async acceptExternalVersion(hash) {
      if (!hash) return null;
      if (!acceptExternalDocument || !activeProject) return { hash };
      const accepted = await acceptExternalDocument({ projectId: activeProject, path: activeDocumentPath, hash });
      documentHashes.set(activeDocumentPath, accepted?.hash || hash);
      return accepted;
    },
    async saveDocument(payload) {
      if (!saveDocument || !activeProject) return demoBridge.saveDocument(payload);
      const documentPath = (payload.path || activeDocumentPath).replaceAll(" / ", "/");
      const content = typeof payload.content === "string" ? payload.content : `# ${payload.title || "Untitled document"}\n`;
      const expectedHash = Object.hasOwn(payload, "expectedHash") ? payload.expectedHash : documentHashes.get(documentPath);
      const result = await saveDocument({ projectId: activeProject, path: documentPath, content, expectedHash });
      if (expectedHash == null) invalidateDocuments();
      activeDocumentPath = result?.path || documentPath;
      if (result?.hash) documentHashes.set(activeDocumentPath, result.hash);
      return result;
    },
    saveDraft: (payload) => saveDraft && activeProject
      ? saveDraft({ projectId: activeProject, path: (payload.path || activeDocumentPath).replaceAll(" / ", "/"), content: payload.content, baseHash: Object.hasOwn(payload, "baseHash") ? payload.baseHash : documentHashes.get(payload.path || activeDocumentPath) || null })
      : demoBridge.saveDraft(payload),
    loadDraft: (payload = {}) => loadDraft && activeProject
      ? loadDraft({ projectId: activeProject, path: (payload.path || activeDocumentPath).replaceAll(" / ", "/") })
      : demoBridge.loadDraft(payload),
    clearDraft: (payload = {}) => clearDraft && activeProject
      ? clearDraft({ projectId: activeProject, path: (payload.path || activeDocumentPath).replaceAll(" / ", "/") })
      : demoBridge.clearDraft(payload),
    async renameWorkspaceItem(payload) {
      if (!renameFile || !activeProject) return demoBridge.renameWorkspaceItem(payload);
      const result = await renameFile({ projectId: activeProject, ...payload });
      activeDocumentPath = remapWorkspacePath(activeDocumentPath, payload.path, result.path);
      remapPathMapEntries(documentHashes, payload.path, result.path);
      invalidateDocuments();
      return result;
    },
    async duplicateWorkspaceItem(payload) {
      const result = duplicateFile && activeProject
        ? await duplicateFile({ projectId: activeProject, ...payload })
        : await demoBridge.duplicateWorkspaceItem(payload);
      invalidateDocuments();
      return result;
    },
    async deleteWorkspaceItem(payload) {
      const result = deleteFile && activeProject
        ? await deleteFile({ projectId: activeProject, ...payload })
        : await demoBridge.deleteWorkspaceItem(payload);
      documentHashes.delete(payload.path);
      invalidateDocuments();
      return result;
    },
    async importAsset(file, documentPath = activeDocumentPath) {
      if (!activeProject) return demoBridge.importAsset(file, documentPath);
      if (file && importDroppedAsset) return importDroppedAsset(file, { projectId: activeProject, documentPath });
      return pickAsset ? pickAsset({ projectId: activeProject, documentPath }) : demoBridge.importAsset(file, documentPath);
    },
    previewAsset(item) {
      return previewAssetUrl && activeProject ? previewAssetUrl({ projectId: activeProject, path: item.path }) : demoBridge.previewAsset(item);
    },
    previewDocumentAsset(sourcePath, documentPath = activeDocumentPath) {
      if (/^(?:blob:|data:|https?:)/i.test(sourcePath)) return sourcePath;
      const assetPath = resolveDocumentAssetPath(documentPath, sourcePath);
      return assetPath && previewAssetUrl && activeProject
        ? previewAssetUrl({ projectId: activeProject, path: assetPath })
        : demoBridge.previewDocumentAsset(sourcePath, documentPath);
    },
    async readPreviewAsset(item) {
      if (!readAsset || !activeProject || !READABLE_PREVIEW_TYPES.has(item?.type) || isLegacyOfficeItem(item)) return null;
      const value = await readAsset({ projectId: activeProject, path: item.path });
      return value instanceof Uint8Array ? value : new Uint8Array(value);
    },
    readWorkbook: (item) => readWorkbookFile && activeProject ? readWorkbookFile({ projectId: activeProject, path: item.path }) : demoBridge.readWorkbook(item),
    saveWorkbook: (item, input) => saveWorkbookFile && activeProject ? saveWorkbookFile({ projectId: activeProject, path: item.path, ...input }) : demoBridge.saveWorkbook(item, input),
    revealAsset: (item) => revealAssetFile && activeProject ? revealAssetFile({ projectId: activeProject, path: item.path }) : demoBridge.revealAsset(item),
    revealWorkspaceItem: (item) => revealAssetFile && activeProject ? revealAssetFile({ projectId: activeProject, path: item.path }) : demoBridge.revealWorkspaceItem(item),
    openWorkspaceItemInTerminal: (item) => openFileInTerminal && activeProject ? openFileInTerminal({ projectId: activeProject, path: item.path }) : demoBridge.openWorkspaceItemInTerminal(item),
    openAssetExternally: (item) => openAssetFileExternally && activeProject ? openAssetFileExternally({ projectId: activeProject, path: item.path }) : demoBridge.openAssetExternally(item),
    copyText: (text) => copyText ? copyText({ text }) : demoBridge.copyText(text),
    listSnapshots: () => listSnapshots && activeProject ? listSnapshots({ projectId: activeProject, path: activeDocumentPath }) : demoBridge.listSnapshots(),
    previewSnapshot: (id) => previewSnapshot && activeProject ? previewSnapshot({ projectId: activeProject, path: activeDocumentPath, snapshotId: id }) : demoBridge.previewSnapshot(id),
    async restoreSnapshot(id) {
      if (!restoreSnapshot || !activeProject) return demoBridge.restoreSnapshot(id);
      const result = await restoreSnapshot({ projectId: activeProject, path: activeDocumentPath, snapshotId: id, expectedHash: documentHashes.get(activeDocumentPath) });
      if (result?.hash) documentHashes.set(activeDocumentPath, result.hash);
      return result;
    },
    getPreferences: demoBridge.getPreferences,
    setPreferences: demoBridge.setPreferences,
    onExternalChange: pick(source, ["watch.onExternalChange"]),
    getSession: pick(source, ["account.getSession"]) || demoBridge.getSession,
    getAccount: pick(source, ["account.getDetails"]) || demoBridge.getAccount,
    signIn: pick(source, ["account.signIn"]) || demoBridge.signIn,
    register: pick(source, ["account.register"]) || demoBridge.register,
    signOut: pick(source, ["account.signOut"]) || demoBridge.signOut,
    getUpdateState: pick(source, ["updates.getState"]) || demoBridge.getUpdateState,
    checkForUpdates: pick(source, ["updates.check"]) || demoBridge.checkForUpdates,
    downloadUpdate: pick(source, ["updates.download"]) || demoBridge.downloadUpdate,
    installUpdate: pick(source, ["updates.install"]) || demoBridge.installUpdate,
    onUpdateStateChange: pick(source, ["updates.onStateChange"]) || demoBridge.onUpdateStateChange,
  };
}

export function getFyluneBridge() {
  if (typeof window === "undefined" || !window.fylune) return demoBridge;
  return { isDemo: false, ...nativeBridge(window.fylune) };
}

export { demoBridge };
