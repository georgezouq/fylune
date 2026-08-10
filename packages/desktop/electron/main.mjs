import path from "node:path";
import { homedir } from "node:os";
import { fileURLToPath } from "node:url";
import { app, BrowserWindow, protocol, session, shell } from "electron";

import { CHANNELS } from "./channels.mjs";
import { openProjectPayload, registerIpcHandlers } from "./ipc.mjs";
import { AgentChangeServer } from "./lib/agent-change-server.mjs";
import { prepareFyluneDataDirectory, resolveFyluneDataPath } from "./lib/app-data.mjs";
import { ASSET_PROTOCOL, registerAssetProtocol } from "./lib/asset-protocol.mjs";
import { BackendClient } from "./lib/backend-client.mjs";
import { DraftStore, SnapshotStore } from "./lib/local-history.mjs";
import { DocumentSessionStore } from "./lib/document-session-store.mjs";
import { readDocument } from "./lib/file-engine.mjs";
import { ProjectRegistry } from "./lib/project-registry.mjs";
import { shouldUsePersistentSecureStorage } from "./lib/secure-storage-policy.mjs";
import { TokenVault } from "./lib/token-vault.mjs";
import { WatchService } from "./lib/watch-service.mjs";
import { createUpdateService } from "./update-runtime.mjs";

const currentDirectory = path.dirname(fileURLToPath(import.meta.url));
app.setName("Fylune");
protocol.registerSchemesAsPrivileged([{
  scheme: ASSET_PROTOCOL,
  privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true },
}]);
const legacyUserDataPath = app.getPath("userData");
const userDataPath = resolveFyluneDataPath(homedir());
await prepareFyluneDataDirectory({ legacyPath: legacyUserDataPath, targetPath: userDataPath });
app.setPath("userData", userDataPath);
app.setPath("sessionData", path.join(userDataPath, "session"));
let mainWindow = null;
let onboardingWindow = null;
let disposeIpc = null;
let disposeAssetProtocol = null;
let watchService = null;
let agentChangeServer = null;
let updateService = null;
let updateCheckTimer = null;
let pendingExternalFile = null;
let openExternalFile = null;

const OPENABLE_DOCUMENT_EXTENSIONS = new Set([".md", ".markdown", ".mdx", ".json", ".jsonl"]);
function supportedExternalFile(filePath) {
  return path.isAbsolute(filePath || "") && OPENABLE_DOCUMENT_EXTENSIONS.has(path.extname(filePath).toLowerCase());
}

app.on("open-file", (event, filePath) => {
  event.preventDefault();
  if (!supportedExternalFile(filePath)) return;
  if (openExternalFile) void openExternalFile(filePath).catch((error) => {
    process.stderr.write(`Could not open the requested document: ${error?.code || error?.message || "OPEN_FAILED"}\n`);
  });
  else pendingExternalFile = filePath;
});

app.on("second-instance", (_event, argv) => {
  const filePath = argv.find(supportedExternalFile);
  if (filePath) {
    if (openExternalFile) void openExternalFile(filePath).catch((error) => {
      process.stderr.write(`Could not open the requested document: ${error?.code || error?.message || "OPEN_FAILED"}\n`);
    });
    else pendingExternalFile = filePath;
    return;
  }
  if (!app.isReady()) return;
  const window = mainWindow && !mainWindow.isDestroyed() ? mainWindow : createWindow();
  if (window.isMinimized()) window.restore();
  window.show();
  window.focus();
});

function validatedDevServerUrl() {
  const value = process.env.VITE_DEV_SERVER_URL;
  if (!value) return null;
  const url = new URL(value);
  if (url.protocol !== "http:" || !new Set(["127.0.0.1", "localhost"]).has(url.hostname)) {
    throw new Error("VITE_DEV_SERVER_URL must point to the local development server");
  }
  return url.toString();
}

function configureWindow(window) {
  window.webContents.setWindowOpenHandler(({ url }) => {
    try {
      if (new URL(url).protocol === "https:") void shell.openExternal(url);
    } catch {
      // Ignore malformed external links.
    }
    return { action: "deny" };
  });
  window.webContents.on("will-navigate", (event) => event.preventDefault());
}

function loadRenderer(window, query = {}) {
  const devUrl = validatedDevServerUrl();
  if (devUrl) {
    const url = new URL(devUrl);
    for (const [key, value] of Object.entries(query)) url.searchParams.set(key, value);
    void window.loadURL(url.toString());
  } else {
    void window.loadFile(path.join(currentDirectory, "..", "dist", "client", "index.html"), { query });
  }
}

function createWindow({ postOnboarding = false } = {}) {
  if (mainWindow && !mainWindow.isDestroyed()) return mainWindow;
  const isMac = process.platform === "darwin";
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 960,
    minHeight: 640,
    show: false,
    title: "Fylune",
    titleBarStyle: isMac ? "hiddenInset" : "default",
    trafficLightPosition: isMac ? { x: 20, y: 20 } : undefined,
    transparent: isMac,
    vibrancy: isMac ? "under-window" : undefined,
    visualEffectState: isMac ? "active" : undefined,
    roundedCorners: isMac ? true : undefined,
    backgroundColor: isMac ? "#00000000" : "#f5f6f7",
    webPreferences: {
      preload: path.join(currentDirectory, "preload.cjs"),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
      webSecurity: true,
      allowRunningInsecureContent: false,
      spellcheck: true,
    },
  });

  mainWindow.once("ready-to-show", () => mainWindow?.show());
  const publishFullscreenState = () => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send(CHANNELS.windowFullscreenChanged, { isFullscreen: mainWindow.isFullScreen() });
    }
  };
  mainWindow.on("enter-full-screen", publishFullscreenState);
  mainWindow.on("leave-full-screen", publishFullscreenState);
  configureWindow(mainWindow);
  mainWindow.on("closed", () => {
    mainWindow = null;
  });

  loadRenderer(mainWindow, postOnboarding ? { postOnboarding: "1" } : {});
  return mainWindow;
}

function createOnboardingWindow() {
  if (onboardingWindow && !onboardingWindow.isDestroyed()) return onboardingWindow;
  const isMac = process.platform === "darwin";
  onboardingWindow = new BrowserWindow({
    width: 1080,
    height: 700,
    minWidth: 820,
    minHeight: 600,
    show: false,
    title: "Welcome to Fylune",
    titleBarStyle: isMac ? "hiddenInset" : "default",
    trafficLightPosition: isMac ? { x: 20, y: 20 } : undefined,
    transparent: isMac,
    vibrancy: isMac ? "under-window" : undefined,
    visualEffectState: isMac ? "active" : undefined,
    roundedCorners: isMac ? true : undefined,
    backgroundColor: isMac ? "#00000000" : "#f5f6f7",
    webPreferences: {
      preload: path.join(currentDirectory, "preload.cjs"),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
      webSecurity: true,
      allowRunningInsecureContent: false,
      spellcheck: true,
    },
  });

  onboardingWindow.once("ready-to-show", () => onboardingWindow?.show());
  configureWindow(onboardingWindow);
  onboardingWindow.on("closed", () => {
    onboardingWindow = null;
  });
  loadRenderer(onboardingWindow, { onboardingWindow: "1" });
  return onboardingWindow;
}

await app.whenReady();

session.defaultSession.setPermissionRequestHandler((_webContents, _permission, callback) => callback(false));
session.defaultSession.setPermissionCheckHandler(() => false);

const registry = new ProjectRegistry({ filePath: path.join(userDataPath, "recent-projects.json") });
await registry.initialize();
disposeAssetProtocol = registerAssetProtocol(session.defaultSession.protocol, registry);
const snapshotStore = new SnapshotStore(userDataPath);
const draftStore = new DraftStore(userDataPath);
const documentSessionStore = new DocumentSessionStore(userDataPath);
const usePersistentSecureStorage = await shouldUsePersistentSecureStorage({
  isPackaged: app.isPackaged,
  executablePath: app.getPath("exe"),
  allowDevelopmentPersistence:
    !app.isPackaged &&
    process.env.FYLUNE_PERSIST_TEST_SESSION === "1",
});
const apiOrigin =
  process.env.FYLUNE_API_URL ??
  "http://127.0.0.1:4318";
const backend = new BackendClient({
  baseUrl: apiOrigin,
  tokenVault: usePersistentSecureStorage ? new TokenVault(userDataPath) : null,
});
watchService = new WatchService({
  snapshotStore,
  onChange: (payload) => {
    if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send(CHANNELS.externalChange, payload);
  },
});
const publishIntegratedWrite = (payload) => {
  watchService.markSelfWrite(payload.absolutePath, payload.hash);
  void (async () => {
    const project = registry.get(payload.projectId);
    const document = await readDocument(project.root, payload.path);
    if (document.hash !== payload.hash) return;
    await documentSessionStore.advance(
      project.root,
      document.path,
      document.content,
      document.hash,
    );
  })().catch((error) => {
    process.stderr.write(`Could not advance the document Base: ${error?.code || "BASE_ADVANCE_FAILED"}\n`);
  });
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send(CHANNELS.externalChange, {
      projectId: payload.projectId,
      path: payload.path,
      kind: "change",
      transactionId: payload.transactionId ?? null,
      hash: payload.hash,
      snapshotId: payload.snapshotId ?? null,
      sourceKind: payload.sourceKind,
      sourceId: payload.sourceId,
      displayName: payload.displayName,
      detectedAt: new Date().toISOString(),
    });
  }
};
agentChangeServer = new AgentChangeServer({
  registry,
  snapshotStore,
  draftStore,
  dataDir: userDataPath,
  onPreview: (payload) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send(CHANNELS.externalChange, payload);
    }
  },
  onDocumentWrite: publishIntegratedWrite,
});
try {
  await agentChangeServer.start();
} catch (error) {
  process.stderr.write(`Fylune Agent protocol unavailable: ${error?.code || "START_FAILED"}\n`);
  agentChangeServer = null;
}
updateService = await createUpdateService({ app });

disposeIpc = registerIpcHandlers({
  app,
  getWindow: () => BrowserWindow.getFocusedWindow() ?? onboardingWindow ?? mainWindow,
  registry,
  draftStore,
  snapshotStore,
  watchService,
  backend,
  updateService,
  documentSessionStore,
  completeOnboarding: async () => {
    if (!registry.listRecent().length) {
      throw new Error("Choose a project folder before continuing.");
    }
    onboardingWindow?.close();
    onboardingWindow = null;
    createWindow({ postOnboarding: true });
  },
});

if (registry.listRecent().length) createWindow();
else createOnboardingWindow();

openExternalFile = async (filePath) => {
  if (!supportedExternalFile(filePath)) return;
  const project = await registry.add(path.dirname(filePath));
  const payload = await openProjectPayload(project, watchService);
  if (onboardingWindow && !onboardingWindow.isDestroyed()) onboardingWindow.close();
  const window = createWindow();
  const send = () => window.webContents.send(CHANNELS.projectOpenFile, {
    ...payload,
    targetPath: path.basename(filePath),
  });
  if (window.webContents.isLoadingMainFrame()) window.webContents.once("did-finish-load", send);
  else send();
  if (window.isMinimized()) window.restore();
  window.show();
  window.focus();
};

const commandLineFile = process.argv.slice(1).find(supportedExternalFile);
if (pendingExternalFile || commandLineFile) {
  const filePath = pendingExternalFile || commandLineFile;
  pendingExternalFile = null;
  void openExternalFile(filePath).catch((error) => {
    process.stderr.write(`Could not open the requested document: ${error?.code || error?.message || "OPEN_FAILED"}\n`);
  });
}
updateService.on("state", (state) => {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send(CHANNELS.updateStateChanged, state);
  }
});
if (updateService.getState().canSelfUpdate) {
  updateCheckTimer = setTimeout(() => {
    void updateService?.checkForUpdates();
  }, 0);
  updateCheckTimer.unref?.();
}

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length > 0) return;
  if (registry.listRecent().length) createWindow();
  else createOnboardingWindow();
});

app.on("before-quit", () => {
  void agentChangeServer?.close();
  disposeIpc?.();
  disposeAssetProtocol?.();
  void watchService?.close();
  if (updateCheckTimer) clearTimeout(updateCheckTimer);
  updateService?.dispose();
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
