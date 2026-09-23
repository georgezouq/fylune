const { contextBridge, ipcRenderer, webUtils } = require("electron");

// Sandboxed preload scripts cannot import ESM modules. Keep this bridge as one
// self-contained CommonJS file and expose only fixed, validated IPC channels.
const CHANNELS = Object.freeze({
  appInfo: "fylune:app:get-info",
  windowGetState: "fylune:window:get-state",
  windowCompleteOnboarding: "fylune:window:complete-onboarding",
  windowFullscreenChanged: "fylune:window:fullscreen-changed",
  cliGetStatus: "fylune:cli:get-status",
  cliInstall: "fylune:cli:install",
  cliUninstall: "fylune:cli:uninstall",
  projectPick: "fylune:projects:pick",
  projectCreate: "fylune:projects:create",
  projectListRecent: "fylune:projects:list-recent",
  projectOpenRecent: "fylune:projects:open-recent",
  projectOpenFile: "fylune:projects:open-file",
  projectScan: "fylune:projects:scan",
  documentRead: "fylune:documents:read",
  documentReadFresh: "fylune:documents:read-fresh",
  documentAcceptExternal: "fylune:documents:accept-external",
  documentPreview: "fylune:documents:preview",
  documentSave: "fylune:documents:save",
  fileRename: "fylune:files:rename",
  fileDuplicate: "fylune:files:duplicate",
  fileDelete: "fylune:files:delete",
  fileOpenTerminal: "fylune:files:open-terminal",
  draftSave: "fylune:drafts:save",
  draftLoad: "fylune:drafts:load",
  draftClear: "fylune:drafts:clear",
  assetImport: "fylune:assets:import",
  assetImportDropped: "fylune:assets:import-dropped",
  assetRead: "fylune:assets:read",
  assetReveal: "fylune:assets:reveal",
  assetOpenExternally: "fylune:assets:open-externally",
  workbookRead: "fylune:workbooks:read",
  workbookSave: "fylune:workbooks:save",
  clipboardWriteText: "fylune:clipboard:write-text",
  snapshotList: "fylune:snapshots:list",
  snapshotPreview: "fylune:snapshots:preview",
  snapshotRestore: "fylune:snapshots:restore",
  externalChange: "fylune:watch:external-change",
  accountGetSession: "fylune:account:get-session",
  accountSignIn: "fylune:account:sign-in",
  accountRegister: "fylune:account:register",
  accountSignOut: "fylune:account:sign-out",
  accountGetDetails: "fylune:account:get-details",
  agentStatus: "fylune:agent:status",
  agentSkills: "fylune:agent:skills",
  agentComplete: "fylune:agent:complete",
  updateGetState: "fylune:updates:get-state",
  updateCheck: "fylune:updates:check",
  updateDownload: "fylune:updates:download",
  updateInstall: "fylune:updates:install",
  updateStateChanged: "fylune:updates:state-changed",
});

let pendingProjectFile = null;
const projectFileListeners = new Set();
ipcRenderer.on(CHANNELS.projectOpenFile, (_event, payload) => {
  if (!projectFileListeners.size) pendingProjectFile = payload;
  else for (const listener of projectFileListeners) listener(payload);
});

async function invoke(channel, input) {
  const response = await ipcRenderer.invoke(channel, input);
  if (response?.ok) return response.value;
  const error = new Error(response?.error?.message ?? "Fylune could not complete the operation.");
  error.code = response?.error?.code ?? "INTERNAL_ERROR";
  error.details = response?.error?.details;
  throw error;
}

const api = Object.freeze({
  app: Object.freeze({ getInfo: () => invoke(CHANNELS.appInfo) }),
  cli: Object.freeze({
    getStatus: () => invoke(CHANNELS.cliGetStatus),
    install: () => invoke(CHANNELS.cliInstall),
    uninstall: () => invoke(CHANNELS.cliUninstall),
  }),
  window: Object.freeze({
    getState: () => invoke(CHANNELS.windowGetState),
    completeOnboarding: () => invoke(CHANNELS.windowCompleteOnboarding),
    onFullscreenChange: (callback) => {
      if (typeof callback !== "function") throw new TypeError("A fullscreen callback is required");
      const listener = (_event, payload) => callback(payload);
      ipcRenderer.on(CHANNELS.windowFullscreenChanged, listener);
      return () => ipcRenderer.removeListener(CHANNELS.windowFullscreenChanged, listener);
    },
  }),
  projects: Object.freeze({
    pick: () => invoke(CHANNELS.projectPick),
    create: () => invoke(CHANNELS.projectCreate),
    listRecent: () => invoke(CHANNELS.projectListRecent),
    openRecent: (input) => invoke(CHANNELS.projectOpenRecent, input),
    scan: (input) => invoke(CHANNELS.projectScan, input),
    onOpenFile: (callback) => {
      if (typeof callback !== "function") throw new TypeError("A file-open callback is required");
      projectFileListeners.add(callback);
      if (pendingProjectFile) {
        const payload = pendingProjectFile;
        pendingProjectFile = null;
        callback(payload);
      }
      return () => projectFileListeners.delete(callback);
    },
  }),
  documents: Object.freeze({
    read: (input) => invoke(CHANNELS.documentRead, input),
    readFresh: (input) => invoke(CHANNELS.documentReadFresh, input),
    acceptExternal: (input) => invoke(CHANNELS.documentAcceptExternal, input),
    preview: (input) => invoke(CHANNELS.documentPreview, input),
    save: (input) => invoke(CHANNELS.documentSave, input),
    saveDraft: (input) => invoke(CHANNELS.draftSave, input),
    loadDraft: (input) => invoke(CHANNELS.draftLoad, input),
    clearDraft: (input) => invoke(CHANNELS.draftClear, input),
  }),
  files: Object.freeze({
    rename: (input) => invoke(CHANNELS.fileRename, input),
    duplicate: (input) => invoke(CHANNELS.fileDuplicate, input),
    delete: (input) => invoke(CHANNELS.fileDelete, input),
    openInTerminal: (input) => invoke(CHANNELS.fileOpenTerminal, input),
  }),
  assets: Object.freeze({
    import: (input) => invoke(CHANNELS.assetImport, input),
    importDroppedFile: (file, input) => {
      const sourcePath = webUtils.getPathForFile(file);
      if (!sourcePath) return Promise.reject(Object.assign(new Error("Choose a file stored on this device."), { code: "FILE_PATH_UNAVAILABLE" }));
      return invoke(CHANNELS.assetImportDropped, { ...input, sourcePath });
    },
    read: (input) => invoke(CHANNELS.assetRead, input),
    previewUrl: ({ projectId, path }) => {
      const encoded = String(path).split("/").map(encodeURIComponent).join("/");
      return `fylune-asset://project/${encodeURIComponent(projectId)}/${encoded}`;
    },
    reveal: (input) => invoke(CHANNELS.assetReveal, input),
    openExternally: (input) => invoke(CHANNELS.assetOpenExternally, input),
  }),
  workbooks: Object.freeze({
    read: (input) => invoke(CHANNELS.workbookRead, input),
    save: (input) => invoke(CHANNELS.workbookSave, input),
  }),
  clipboard: Object.freeze({
    writeText: (input) => invoke(CHANNELS.clipboardWriteText, input),
  }),
  snapshots: Object.freeze({
    list: (input) => invoke(CHANNELS.snapshotList, input),
    preview: (input) => invoke(CHANNELS.snapshotPreview, input),
    restore: (input) => invoke(CHANNELS.snapshotRestore, input),
  }),
  watch: Object.freeze({
    onExternalChange: (callback) => {
      if (typeof callback !== "function") throw new TypeError("A change callback is required");
      const listener = (_event, payload) => callback(payload);
      ipcRenderer.on(CHANNELS.externalChange, listener);
      return () => ipcRenderer.removeListener(CHANNELS.externalChange, listener);
    },
  }),
  account: Object.freeze({
    getSession: () => invoke(CHANNELS.accountGetSession),
    getDetails: () => invoke(CHANNELS.accountGetDetails),
    signIn: (input) => invoke(CHANNELS.accountSignIn, input),
    register: (input) => invoke(CHANNELS.accountRegister, input),
    signOut: () => invoke(CHANNELS.accountSignOut),
  }),
  agent: Object.freeze({
    status: () => invoke(CHANNELS.agentStatus),
    skills: () => invoke(CHANNELS.agentSkills),
    complete: (input) => invoke(CHANNELS.agentComplete, input),
  }),
  updates: Object.freeze({
    getState: () => invoke(CHANNELS.updateGetState),
    check: () => invoke(CHANNELS.updateCheck),
    download: () => invoke(CHANNELS.updateDownload),
    install: () => invoke(CHANNELS.updateInstall),
    onStateChange: (callback) => {
      if (typeof callback !== "function") throw new TypeError("An update callback is required");
      const listener = (_event, payload) => callback(payload);
      ipcRenderer.on(CHANNELS.updateStateChanged, listener);
      return () => ipcRenderer.removeListener(CHANNELS.updateStateChanged, listener);
    },
  }),
});

contextBridge.exposeInMainWorld("fylune", api);
