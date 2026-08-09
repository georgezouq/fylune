import { readFile } from "node:fs/promises";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";
import { beforeEach, describe, expect, it, vi } from "vitest";

const ipcHandlers = new Map();
const ipcMain = {
  handle: vi.fn((channel, handler) => ipcHandlers.set(channel, handler)),
  removeHandler: vi.fn((channel) => ipcHandlers.delete(channel)),
};

vi.mock("electron", () => ({
  clipboard: { writeText: vi.fn() },
  dialog: {},
  ipcMain,
  shell: {},
}));

const desktopDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

describe("desktop update IPC", () => {
  beforeEach(() => {
    ipcHandlers.clear();
    vi.clearAllMocks();
  });

  it("registers fixed update operations and returns the public state envelope", async () => {
    const { registerIpcHandlers } = await import("../../electron/ipc.mjs");
    const state = {
      distribution: "direct",
      canSelfUpdate: true,
      status: "available",
      currentVersion: "0.1.0",
      availableVersion: "0.2.0",
    };
    const updateService = {
      getState: vi.fn(() => state),
      checkForUpdates: vi.fn(async () => state),
      downloadUpdate: vi.fn(async () => ({ ...state, status: "downloaded" })),
      installUpdate: vi.fn(() => ({ ...state, status: "installing" })),
    };
    const noop = vi.fn();
    const completeOnboarding = vi.fn(async () => {});
    const dispose = registerIpcHandlers({
      app: { getLocale: () => "en", getName: () => "Fylune", getVersion: () => "0.1.0" },
      getWindow: () => null,
      registry: {},
      draftStore: {},
      snapshotStore: {},
      watchService: {},
      backend: {},
      authFlow: {},
      updateService,
      completeOnboarding,
      onWrite: noop,
    });

    const onboardingResponse = await ipcHandlers.get("fylune:window:complete-onboarding")({}, undefined);
    expect(onboardingResponse).toEqual({ ok: true, value: { completed: true } });
    expect(completeOnboarding).toHaveBeenCalledOnce();

    const response = await ipcHandlers.get("fylune:updates:check")({}, undefined);
    expect(response).toEqual({ ok: true, value: state });
    expect(updateService.checkForUpdates).toHaveBeenCalledOnce();

    const invalid = await ipcHandlers.get("fylune:updates:download")({}, { url: "https://evil.test" });
    expect(invalid).toMatchObject({
      ok: false,
      error: { code: "INTERNAL_ERROR" },
    });

    dispose();
    expect(ipcHandlers.has("fylune:updates:check")).toBe(false);
  });

  it("exposes update methods and a removable state listener from the sandboxed preload", async () => {
    const source = await readFile(
      path.join(desktopDir, "electron", "preload.cjs"),
      "utf8",
    );
    const listeners = new Map();
    const ipcRenderer = {
      invoke: vi.fn(async (channel) => ({
        ok: true,
        value: { channel, status: "idle" },
      })),
      on: vi.fn((channel, listener) => listeners.set(channel, listener)),
      removeListener: vi.fn((channel, listener) => {
        if (listeners.get(channel) === listener) listeners.delete(channel);
      }),
    };
    let exposedApi = null;
    vm.runInNewContext(source, {
      Error,
      Object,
      Promise,
      String,
      TypeError,
      encodeURIComponent,
      require(moduleName) {
        if (moduleName !== "electron") throw new Error(`Unexpected module: ${moduleName}`);
        return {
          contextBridge: {
            exposeInMainWorld(_name, api) {
              exposedApi = api;
            },
          },
          ipcRenderer,
          webUtils: { getPathForFile: () => "" },
        };
      },
    });

    await expect(exposedApi.updates.getState()).resolves.toMatchObject({
      channel: "fylune:updates:get-state",
    });
    await expect(exposedApi.window.completeOnboarding()).resolves.toMatchObject({
      channel: "fylune:window:complete-onboarding",
    });
    await expect(exposedApi.projects.create()).resolves.toMatchObject({
      channel: "fylune:projects:create",
    });
    await expect(exposedApi.updates.download()).resolves.toMatchObject({
      channel: "fylune:updates:download",
    });
    await expect(exposedApi.clipboard.writeText({ text: "local text" })).resolves.toMatchObject({
      channel: "fylune:clipboard:write-text",
    });
    await expect(exposedApi.snapshots.preview({ snapshotId: "snapshot-id" })).resolves.toMatchObject({
      channel: "fylune:snapshots:preview",
    });
    expect(exposedApi.agent).toBeUndefined();
    const callback = vi.fn();
    const unsubscribe = exposedApi.updates.onStateChange(callback);
    listeners.get("fylune:updates:state-changed")({}, { status: "downloaded" });
    expect(callback).toHaveBeenCalledWith({ status: "downloaded" });
    unsubscribe();
    expect(listeners.has("fylune:updates:state-changed")).toBe(false);
  });
});
