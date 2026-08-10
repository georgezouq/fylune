import { clipboard, dialog, ipcMain, shell } from "electron";
import { stat } from "node:fs/promises";

import { CHANNELS } from "./channels.mjs";
import {
  acceptExternalDocumentSchema,
  assetRequestSchema,
  clipboardWriteTextSchema,
  documentRequestSchema,
  emptySchema,
  importAssetSchema,
  importDroppedAssetSchema,
  previewSnapshotSchema,
  projectRequestSchema,
  projectScanSchema,
  restoreSnapshotSchema,
  renameWorkspaceFileSchema,
  saveDocumentSchema,
  saveDraftSchema,
  saveWorkbookSchema,
  signInSchema,
  registerSchema,
  workspaceFileMutationSchema,
} from "./contracts.mjs";
import { importAsset, readableAssetTypeForPath } from "./lib/assets.mjs";
import { readOfficeAsset, readWorkbook, writeWorkbookEdits } from "./lib/office.mjs";
import {
  duplicateWorkspaceFile,
  readDocument,
  readDocumentPreview,
  renameWorkspaceFile,
  saveDocument,
  scanProject,
  trashWorkspaceFile,
} from "./lib/file-engine.mjs";
import { restoreSnapshot } from "./lib/local-history.mjs";
import { nativeMessage } from "./lib/native-i18n.mjs";
import { toPublicError } from "./lib/errors.mjs";
import { resolveProjectPath } from "./lib/path-security.mjs";
import { openWorkspaceEntryInTerminal, revealWorkspaceEntryInFinder } from "./lib/workspace-shell.mjs";

function registerHandler(channel, schema, handler) {
  ipcMain.handle(channel, async (_event, rawInput) => {
    try {
      const input = schema.parse(rawInput);
      return { ok: true, value: await handler(input) };
    } catch (error) {
      return { ok: false, error: toPublicError(error) };
    }
  });
}

export async function openProjectPayload(project, watchService) {
  const tree = await scanProject(project.root, { folderPreviews: true });
  void watchService.watch(project).catch((error) => {
    process.stderr.write(`Could not start the workspace watcher: ${error?.code || error?.message || "WATCH_FAILED"}\n`);
  });
  return {
    projectId: project.id,
    name: project.name,
    path: project.root,
    tree,
  };
}

export function registerIpcHandlers({
  app,
  getWindow,
  registry,
  draftStore,
  snapshotStore,
  watchService,
  backend,
  updateService,
  documentSessionStore,
  completeOnboarding,
}) {
  registerHandler(CHANNELS.appInfo, emptySchema, async () => ({
    name: app.getName(),
    version: app.getVersion(),
    platform: process.platform,
  }));
  registerHandler(CHANNELS.windowGetState, emptySchema, async () => ({
    isFullscreen: Boolean(getWindow()?.isFullScreen()),
  }));
  registerHandler(CHANNELS.windowCompleteOnboarding, emptySchema, async () => {
    await completeOnboarding();
    return { completed: true };
  });

  registerHandler(CHANNELS.projectPick, emptySchema, async () => {
    const locale = app.getLocale();
    const result = await dialog.showOpenDialog(getWindow(), {
      title: nativeMessage(locale, "openProjectTitle"),
      buttonLabel: nativeMessage(locale, "openProjectButton"),
      properties: ["openDirectory"],
    });
    if (result.canceled || !result.filePaths[0]) return null;
    const project = await registry.add(result.filePaths[0]);
    return openProjectPayload(project, watchService);
  });

  registerHandler(CHANNELS.projectCreate, emptySchema, async () => {
    const locale = app.getLocale();
    const result = await dialog.showOpenDialog(getWindow(), {
      title: nativeMessage(locale, "createProjectTitle"),
      buttonLabel: nativeMessage(locale, "createProjectButton"),
      properties: ["openDirectory", "createDirectory"],
    });
    if (result.canceled || !result.filePaths[0]) return null;
    const project = await registry.add(result.filePaths[0]);
    return openProjectPayload(project, watchService);
  });

  registerHandler(CHANNELS.projectListRecent, emptySchema, async () => registry.listRecent());

  registerHandler(CHANNELS.projectOpenRecent, projectRequestSchema, async ({ projectId }) => {
    const project = await registry.reopen(projectId);
    return openProjectPayload(project, watchService);
  });

  registerHandler(CHANNELS.projectScan, projectScanSchema, async ({ projectId, path: relativePath, recursive, documentsOnly, folderPreviews }) => {
    const project = registry.get(projectId);
    return {
      projectId,
      name: project.name,
      path: project.root,
      tree: await scanProject(project.root, { relativePath, recursive, documentsOnly, folderPreviews }),
    };
  });

  registerHandler(CHANNELS.documentRead, documentRequestSchema, async ({ projectId, path: documentPath }) => {
    const root = registry.get(projectId).root;
    const document = await readDocument(root, documentPath);
    const session = await documentSessionStore.advance(
      root,
      document.path,
      document.content,
      document.hash,
    );
    return {
      ...document,
      baseHash: session.baseHash,
      baseContent: session.baseContent,
    };
  });

  registerHandler(CHANNELS.documentReadFresh, documentRequestSchema, async ({ projectId, path: documentPath }) =>
    readDocument(registry.get(projectId).root, documentPath));

  registerHandler(CHANNELS.documentAcceptExternal, acceptExternalDocumentSchema, async ({ projectId, path: documentPath, hash }) => {
    const root = registry.get(projectId).root;
    const document = await readDocument(root, documentPath);
    if (document.hash !== hash) {
      throw Object.assign(new Error("The document changed again before this version was accepted."), {
        code: "CONTENT_CONFLICT",
      });
    }
    const session = await documentSessionStore.advance(
      root,
      document.path,
      document.content,
      document.hash,
    );
    return { path: document.path, hash: session.baseHash };
  });

  registerHandler(CHANNELS.documentPreview, documentRequestSchema, async ({ projectId, path }) =>
    readDocumentPreview(registry.get(projectId).root, path));

  registerHandler(CHANNELS.documentSave, saveDocumentSchema, async ({ projectId, path: documentPath, content, expectedHash }) => {
    const root = registry.get(projectId).root;
    const saved = await saveDocument({
      root,
      relativePath: documentPath,
      content,
      expectedHash,
      snapshotStore,
      draftStore,
      onWrite: (absolutePath, hash) => watchService.markSelfWrite(absolutePath, hash),
    });
    await documentSessionStore.advance(root, saved.path, content, saved.hash);
    return saved;
  });

  registerHandler(CHANNELS.fileRename, renameWorkspaceFileSchema, async ({ projectId, path, name, expectedMtimeMs }) =>
    renameWorkspaceFile({
      root: registry.get(projectId).root,
      relativePath: path,
      name,
      expectedMtimeMs,
    }));
  registerHandler(CHANNELS.fileDuplicate, workspaceFileMutationSchema, async ({ projectId, path, expectedMtimeMs }) =>
    duplicateWorkspaceFile({
      root: registry.get(projectId).root,
      relativePath: path,
      expectedMtimeMs,
    }));
  registerHandler(CHANNELS.fileDelete, workspaceFileMutationSchema, async ({ projectId, path, expectedMtimeMs }) =>
    trashWorkspaceFile({
      root: registry.get(projectId).root,
      relativePath: path,
      expectedMtimeMs,
      trashItem: (absolutePath) => shell.trashItem(absolutePath),
    }));
  registerHandler(CHANNELS.fileOpenTerminal, documentRequestSchema, async ({ projectId, path: relativePath }) => {
    const resolved = await resolveProjectPath(registry.get(projectId).root, relativePath);
    return openWorkspaceEntryInTerminal(resolved.absolutePath);
  });

  registerHandler(CHANNELS.draftSave, saveDraftSchema, async ({ projectId, path, content, baseHash }) =>
    draftStore.save(registry.get(projectId).root, path, content, baseHash));
  registerHandler(CHANNELS.draftLoad, documentRequestSchema, async ({ projectId, path }) =>
    draftStore.load(registry.get(projectId).root, path));
  registerHandler(CHANNELS.draftClear, documentRequestSchema, async ({ projectId, path }) => {
    await draftStore.clear(registry.get(projectId).root, path);
    return { cleared: true };
  });

  registerHandler(CHANNELS.assetImport, importAssetSchema, async ({ projectId, documentPath }) => {
    const locale = app.getLocale();
    const result = await dialog.showOpenDialog(getWindow(), {
      title: nativeMessage(locale, "addFileTitle"),
      buttonLabel: nativeMessage(locale, "addFileButton"),
      properties: ["openFile"],
      filters: [
        {
          name: nativeMessage(locale, "assetFilter"),
          extensions: [
            "png", "jpg", "jpeg", "webp", "gif",
            "mp4", "m4v", "mov", "webm",
            "pdf", "docx", "xlsx", "pptx", "doc", "xls", "ppt",
          ],
        },
      ],
    });
    if (result.canceled || !result.filePaths[0]) return null;
    return importAsset({ root: registry.get(projectId).root, documentPath, sourcePath: result.filePaths[0] });
  });
  registerHandler(CHANNELS.assetImportDropped, importDroppedAssetSchema, async ({ projectId, documentPath, sourcePath }) =>
    importAsset({ root: registry.get(projectId).root, documentPath, sourcePath }));
  registerHandler(CHANNELS.assetRead, assetRequestSchema, async ({ projectId, path: relativePath }) => {
    if (!readableAssetTypeForPath(relativePath)) {
      throw Object.assign(new Error(nativeMessage(app.getLocale(), "unsupportedPreview")), { code: "UNSUPPORTED_PREVIEW" });
    }
    const { bytes } = await readOfficeAsset({ root: registry.get(projectId).root, relativePath });
    return bytes;
  });
  registerHandler(CHANNELS.assetReveal, assetRequestSchema, async ({ projectId, path }) => {
    const resolved = await resolveProjectPath(registry.get(projectId).root, path);
    return revealWorkspaceEntryInFinder(resolved.absolutePath, {
      openPath: (entryPath) => shell.openPath(entryPath),
      showItemInFolder: (entryPath) => shell.showItemInFolder(entryPath),
    });
  });
  registerHandler(CHANNELS.assetOpenExternally, assetRequestSchema, async ({ projectId, path: relativePath }) => {
    const resolved = await resolveProjectPath(registry.get(projectId).root, relativePath);
    const info = await stat(resolved.absolutePath);
    if (!info.isFile()) {
      throw Object.assign(new Error(nativeMessage(app.getLocale(), "unsupportedPreview")), { code: "UNSUPPORTED_PREVIEW" });
    }
    const failure = await shell.openPath(resolved.absolutePath);
    if (failure) throw Object.assign(new Error(failure), { code: "OPEN_FAILED" });
    return { opened: true };
  });
  registerHandler(CHANNELS.workbookRead, assetRequestSchema, async ({ projectId, path: relativePath }) =>
    readWorkbook({ root: registry.get(projectId).root, relativePath }));
  registerHandler(CHANNELS.workbookSave, saveWorkbookSchema, async ({ projectId, path: relativePath, edits, expectedHash }) =>
    writeWorkbookEdits({
      root: registry.get(projectId).root,
      relativePath,
      edits,
      expectedHash,
      onWrite: (absolutePath, hash) => watchService.markSelfWrite(absolutePath, hash),
    }));

  registerHandler(CHANNELS.clipboardWriteText, clipboardWriteTextSchema, async ({ text }) => {
    clipboard.writeText(text);
    return { copied: true };
  });
  registerHandler(CHANNELS.snapshotList, documentRequestSchema, async ({ projectId, path }) => {
    const root = registry.get(projectId).root;
    const current = await readDocument(root, path);
    return snapshotStore.list(root, path, current.content);
  });
  registerHandler(CHANNELS.snapshotPreview, previewSnapshotSchema, async ({ projectId, path, snapshotId }) => {
    const root = registry.get(projectId).root;
    const current = await readDocument(root, path);
    return snapshotStore.preview(root, path, snapshotId, current.content);
  });
  registerHandler(CHANNELS.snapshotRestore, restoreSnapshotSchema, async ({ projectId, path, snapshotId, expectedHash }) =>
    restoreSnapshot({
      root: registry.get(projectId).root,
      relativePath: path,
      snapshotId,
      expectedHash,
      snapshotStore,
      draftStore,
      onWrite: (absolutePath, hash) => watchService.markSelfWrite(absolutePath, hash),
    }));

  registerHandler(CHANNELS.accountGetSession, emptySchema, async () => backend.getSession());
  registerHandler(CHANNELS.accountSignIn, signInSchema, async (input) => backend.signIn(input));
  registerHandler(CHANNELS.accountRegister, registerSchema, async (input) => backend.register(input));
  registerHandler(CHANNELS.accountSignOut, emptySchema, async () => backend.signOut());
  registerHandler(CHANNELS.accountGetDetails, emptySchema, async () => backend.getAccount());
  registerHandler(CHANNELS.updateGetState, emptySchema, async () => updateService.getState());
  registerHandler(CHANNELS.updateCheck, emptySchema, async () => updateService.checkForUpdates());
  registerHandler(CHANNELS.updateDownload, emptySchema, async () => updateService.downloadUpdate());
  registerHandler(CHANNELS.updateInstall, emptySchema, async () => updateService.installUpdate());

  return () => {
    const rendererEventChannels = new Set([
      CHANNELS.externalChange,
      CHANNELS.updateStateChanged,
      CHANNELS.windowFullscreenChanged,
    ]);
    for (const channel of Object.values(CHANNELS)) {
      if (!rendererEventChannels.has(channel)) ipcMain.removeHandler(channel);
    }
  };
}
