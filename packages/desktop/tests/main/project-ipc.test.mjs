import { mkdir, mkdtemp, realpath, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const ipcHandlers = new Map();
const showOpenDialog = vi.fn();
const showMessageBox = vi.fn();
const ipcMain = {
  handle: vi.fn((channel, handler) => ipcHandlers.set(channel, handler)),
  removeHandler: vi.fn((channel) => ipcHandlers.delete(channel)),
};

vi.mock("electron", () => ({
  clipboard: { writeText: vi.fn() },
  dialog: { showOpenDialog, showMessageBox },
  ipcMain,
  shell: {},
}));

describe("desktop project IPC", () => {
  let workspacePath;

  beforeEach(async () => {
    ipcHandlers.clear();
    vi.clearAllMocks();
    workspacePath = await mkdtemp(path.join(os.tmpdir(), "fylune-create-workspace-"));
  });

  afterEach(async () => {
    vi.unstubAllGlobals();
    await rm(workspacePath, { recursive: true, force: true });
  });

  it.each(["pick", "create"])("persists only the chosen folder bookmark for the MAS %s flow", async (action) => {
    const { registerIpcHandlers } = await import("../../electron/ipc.mjs");
    vi.stubGlobal("process", { ...process, mas: true });
    const project = { id: "11111111-1111-4111-8111-111111111111", name: "Workspace", root: workspacePath };
    const registry = { add: vi.fn(async () => project) };
    showOpenDialog.mockResolvedValue({ canceled: false, filePaths: [workspacePath], bookmarks: ["folder-grant"] });
    const dispose = registerIpcHandlers({
      app: { getLocale: () => "en" }, getWindow: () => null, registry,
      watchService: { watch: vi.fn(async () => {}) },
    });
    const response = await ipcHandlers.get(`fylune:projects:${action}`)({}, undefined);
    expect(response.ok).toBe(true);
    expect(showOpenDialog).toHaveBeenCalledWith(null, expect.objectContaining({ securityScopedBookmarks: true }));
    expect(registry.add).toHaveBeenCalledWith(workspacePath, "folder-grant");
    expect(response.value).not.toHaveProperty("bookmark");
    dispose();
  });

  it("opens the native create-directory flow with unopened folder previews", async () => {
    const { registerIpcHandlers } = await import("../../electron/ipc.mjs");
    const project = {
      id: "11111111-1111-4111-8111-111111111111",
      name: path.basename(workspacePath),
      root: workspacePath,
    };
    const registry = {
      add: vi.fn(async () => project),
    };
    const watchService = {
      watch: vi.fn(() => new Promise(() => {})),
    };
    showOpenDialog.mockResolvedValue({
      canceled: false,
      filePaths: [workspacePath],
    });
    await mkdir(path.join(workspacePath, "docs"));
    await writeFile(path.join(workspacePath, "docs", "README.md"), "# Read me\n");

    const dispose = registerIpcHandlers({
      app: { getLocale: () => "zh-CN", getName: () => "Fylune", getVersion: () => "0.1.0" },
      getWindow: () => ({ id: "window" }),
      registry,
      draftStore: {},
      snapshotStore: {},
      watchService,
      backend: {},
      authFlow: {},
      updateService: {},
      agentService: {},
      documentSessionStore: {},
      completeOnboarding: vi.fn(async () => {}),
    });

    const response = await Promise.race([
      ipcHandlers.get("fylune:projects:create")({}, undefined),
      new Promise((resolve) => setTimeout(() => resolve("watch-blocked-project-open"), 250)),
    ]);

    expect(response).not.toBe("watch-blocked-project-open");
    expect(showOpenDialog).toHaveBeenCalledWith(
      { id: "window" },
      expect.objectContaining({
        title: "创建工作空间文件夹",
        buttonLabel: "创建工作空间",
        properties: ["openDirectory", "createDirectory"],
      }),
    );
    expect(registry.add).toHaveBeenCalledWith(workspacePath, undefined);
    expect(watchService.watch).toHaveBeenCalledWith(project);
    expect(response).toMatchObject({
      ok: true,
      value: {
        projectId: project.id,
        name: project.name,
        path: workspacePath,
        tree: {
          kind: "directory",
          path: "",
          children: [{
            kind: "directory",
            name: "docs",
            loaded: false,
            itemCount: 1,
            previewChildren: [{
              kind: "file",
              fileType: "document",
              name: "README.md",
            }],
          }],
        },
      },
    });

    dispose();
  });

  it("creates a single-file payload for a document opened by macOS", async () => {
    const { openExternalFilePayload } = await import("../../electron/ipc.mjs");
    const filePath = path.join(workspacePath, "settings.json");
    await writeFile(filePath, '{"theme":"dark"}\n');
    const registry = {
      addExternalFile: vi.fn(async () => ({
        id: "22222222-2222-4222-8222-222222222222",
        name: path.basename(workspacePath),
        root: workspacePath,
        externalFile: filePath,
      })),
    };

    const payload = await openExternalFilePayload(filePath, registry);

    expect(payload).toMatchObject({
      projectId: "22222222-2222-4222-8222-222222222222",
      targetPath: "settings.json",
      targetDocument: { content: '{"theme":"dark"}\n', readOnly: false },
      tree: {
        itemCount: 1,
        children: [{ name: "settings.json", fileType: "document" }],
      },
    });
  });

  it("opens a CLI folder through the normal project scan and watcher", async () => {
    const { openExternalPathPayload } = await import("../../electron/ipc.mjs");
    const project = {
      id: "33333333-3333-4333-8333-333333333333",
      name: path.basename(workspacePath),
      root: workspacePath,
    };
    const registry = { add: vi.fn(async () => project) };
    const watchService = { watch: vi.fn(async () => {}) };
    await writeFile(path.join(workspacePath, "README.md"), "# CLI workspace\n");

    const payload = await openExternalPathPayload(workspacePath, registry, watchService);
    const canonicalWorkspacePath = await realpath(workspacePath);

    expect(registry.add).toHaveBeenCalledWith(canonicalWorkspacePath);
    expect(watchService.watch).toHaveBeenCalledWith(project);
    expect(payload).toMatchObject({
      projectId: project.id,
      path: workspacePath,
      tree: { children: [{ name: "README.md" }] },
    });
  });

  it("obtains and reuses a folder scope before serving a directly opened document's relative image", async () => {
    const { openExternalPathPayload } = await import("../../electron/ipc.mjs");
    const { ProjectRegistry } = await import("../../electron/lib/project-registry.mjs");
    const { assetPreviewUrl, createAssetProtocolResponse } = await import("../../electron/lib/asset-protocol.mjs");
    vi.stubGlobal("process", { ...process, mas: true });
    const root = await realpath(workspacePath);
    const filePath = path.join(root, "PRD.md");
    const markdown = "![Screenshot](screenshots/20-storage-error.jpg)\n";
    await writeFile(filePath, markdown);
    await mkdir(path.join(root, "screenshots"));
    await writeFile(path.join(root, "screenshots/20-storage-error.jpg"), "image-bytes");
    let granted = false;
    const stop = vi.fn();
    const startAccessing = vi.fn(() => { granted = true; return stop; });
    const registry = new ProjectRegistry({ startAccessing });
    const addExternalFile = vi.spyOn(registry, "addExternalFile");
    showOpenDialog.mockImplementation(async () => {
      expect(addExternalFile).not.toHaveBeenCalled();
      return { canceled: false, filePaths: [root], bookmarks: ["folder-scope"] };
    });
    const payload = await openExternalPathPayload(filePath, registry, null, { locale: "zh-CN" });
    expect(granted).toBe(true);
    expect(payload.targetDocument.content).toBe(markdown);
    expect(showOpenDialog).toHaveBeenCalledWith(null, expect.objectContaining({
      defaultPath: root, securityScopedBookmarks: true,
      properties: ["openDirectory", "showHiddenFiles"],
    }));
    const response = await createAssetProtocolResponse(new Request(assetPreviewUrl(payload.projectId, "screenshots/20-storage-error.jpg")), registry);
    expect(response.status).toBe(200);
    expect(await response.text()).toBe("image-bytes");
    await openExternalPathPayload(filePath, registry, null);
    expect(showOpenDialog).toHaveBeenCalledTimes(1);
    expect(startAccessing).toHaveBeenCalledExactlyOnceWith("folder-scope");
    registry.dispose();
    expect(stop).toHaveBeenCalledTimes(1);
  });

  it.each(["cancel", "wrong-folder", "empty-bookmark"])("does not open or register the document after %s", async (action) => {
    const { openExternalFilePayload } = await import("../../electron/ipc.mjs");
    vi.stubGlobal("process", { ...process, mas: true });
    const filePath = path.join(workspacePath, "PRD.md");
    await writeFile(filePath, "# Keep me unchanged\n");
    const registry = { listRecent: () => [], add: vi.fn(), addExternalFile: vi.fn() };
    showOpenDialog.mockResolvedValue({
      canceled: action === "cancel",
      filePaths: [action === "wrong-folder" ? path.dirname(workspacePath) : workspacePath],
      bookmarks: [action === "empty-bookmark" ? "" : "scope"],
    });
    expect(await openExternalFilePayload(filePath, registry)).toBeNull();
    expect(registry.add).not.toHaveBeenCalled();
    expect(registry.addExternalFile).not.toHaveBeenCalled();
  });

  it("renews a stale folder grant before opening a document", async () => {
    const { openExternalFilePayload } = await import("../../electron/ipc.mjs");
    const { ProjectRegistry } = await import("../../electron/lib/project-registry.mjs");
    vi.stubGlobal("process", { ...process, mas: true });
    const root = await realpath(workspacePath);
    const filePath = path.join(root, "PRD.md");
    await writeFile(filePath, "# Document\n");
    const registry = new ProjectRegistry({ startAccessing: (bookmark) => {
      if (bookmark === "stale") throw new Error("Scope expired");
      return () => {};
    } });
    await registry.add(root, "stale");
    showOpenDialog.mockResolvedValue({ canceled: false, filePaths: [root], bookmarks: ["fresh"] });
    expect(await openExternalFilePayload(filePath, registry)).toMatchObject({ targetPath: "PRD.md" });
    expect(showOpenDialog).toHaveBeenCalledTimes(1);
    registry.dispose();
  });
});
