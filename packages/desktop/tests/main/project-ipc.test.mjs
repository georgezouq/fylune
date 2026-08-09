import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const ipcHandlers = new Map();
const showOpenDialog = vi.fn();
const ipcMain = {
  handle: vi.fn((channel, handler) => ipcHandlers.set(channel, handler)),
  removeHandler: vi.fn((channel) => ipcHandlers.delete(channel)),
};

vi.mock("electron", () => ({
  clipboard: { writeText: vi.fn() },
  dialog: { showOpenDialog },
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
    await rm(workspacePath, { recursive: true, force: true });
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
    expect(registry.add).toHaveBeenCalledWith(workspacePath);
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
});
