import { EventEmitter } from "node:events";
import { describe, expect, it, vi } from "vitest";

import {
  classifyUpdateError,
  compareVersions,
  resolveUpdateDistribution,
  UpdateService,
} from "../../electron/update-service.mjs";
import {
  createUpdateService,
  readBuildChannel,
} from "../../electron/update-runtime.mjs";

class FakeUpdater extends EventEmitter {
  constructor() {
    super();
    this.checkResult = {
      isUpdateAvailable: true,
      updateInfo: {
        version: "0.2.0",
        releaseDate: "2026-07-23T00:00:00.000Z",
        stagingPercentage: 25,
      },
    };
    this.checkForUpdates = vi.fn(async () => this.checkResult);
    this.setFeedURL = vi.fn();
    this.downloadUpdate = vi.fn(async () => {
      this.emit("download-progress", { percent: 52.4 });
      this.emit("update-downloaded", this.checkResult.updateInfo);
    });
    this.quitAndInstall = vi.fn();
  }
}

describe("desktop update service", () => {
  it("separates direct, App Store, development, and unsupported distributions", () => {
    expect(resolveUpdateDistribution({
      isPackaged: true,
      isMas: false,
      platform: "darwin",
      buildChannel: "direct",
    })).toBe("direct");
    expect(resolveUpdateDistribution({
      isPackaged: true,
      isMas: true,
      platform: "darwin",
      buildChannel: "direct",
    })).toBe("app_store");
    expect(resolveUpdateDistribution({
      isPackaged: true,
      isMas: false,
      platform: "darwin",
      buildChannel: "mas",
    })).toBe("app_store");
    expect(resolveUpdateDistribution({
      isPackaged: false,
      isMas: false,
      platform: "darwin",
      buildChannel: null,
    })).toBe("development");
    expect(resolveUpdateDistribution({
      isPackaged: true,
      isMas: false,
      platform: "darwin",
      buildChannel: "candidate",
    })).toBe("development");
    expect(resolveUpdateDistribution({
      isPackaged: true,
      isMas: false,
      platform: "win32",
      buildChannel: "direct",
    })).toBe("direct");
    expect(resolveUpdateDistribution({
      isPackaged: true,
      isMas: false,
      platform: "linux",
      buildChannel: "direct",
    })).toBe("unsupported");
    expect(resolveUpdateDistribution({
      isPackaged: true,
      isMas: false,
      platform: "darwin",
      buildChannel: null,
    })).toBe("unsupported");
  });

  it("checks, downloads, and installs only a newer signed-channel candidate", async () => {
    const updater = new FakeUpdater();
    const service = new UpdateService({
      updater,
      currentVersion: "0.1.0",
      distribution: "direct",
    });

    expect(updater.autoDownload).toBe(false);
    expect(updater.autoInstallOnAppQuit).toBe(false);
    expect(updater.allowPrerelease).toBe(false);
    expect(updater.allowDowngrade).toBe(false);

    await expect(service.checkForUpdates()).resolves.toMatchObject({
      status: "available",
      currentVersion: "0.1.0",
      availableVersion: "0.2.0",
      stagingPercentage: 25,
    });
    await expect(service.downloadUpdate()).resolves.toMatchObject({
      status: "downloaded",
      progress: 100,
    });
    expect(service.installUpdate()).toMatchObject({ status: "installing" });
    expect(updater.quitAndInstall).toHaveBeenCalledWith(false, true);
  });

  it("rejects downgrade, malformed version, and install-before-download states", async () => {
    const updater = new FakeUpdater();
    const service = new UpdateService({
      updater,
      currentVersion: "1.2.0",
      distribution: "direct",
    });
    updater.checkResult.updateInfo.version = "1.1.9";

    await expect(service.checkForUpdates()).resolves.toMatchObject({
      status: "not_available",
      availableVersion: null,
    });
    expect(service.installUpdate()).toMatchObject({
      status: "error",
      errorCode: "UPDATE_NOT_DOWNLOADED",
    });

    updater.checkResult.updateInfo.version = "latest";
    await expect(service.checkForUpdates()).resolves.toMatchObject({
      status: "error",
      errorCode: "INVALID_UPDATE_VERSION",
    });
  });

  it("treats a successful same-version check as up to date", async () => {
    const updater = new FakeUpdater();
    updater.checkResult = {
      isUpdateAvailable: false,
      updateInfo: { version: "0.1.2" },
    };
    const service = new UpdateService({
      updater,
      currentVersion: "0.1.2",
      distribution: "direct",
    });

    await expect(service.checkForUpdates()).resolves.toMatchObject({
      status: "not_available",
      currentVersion: "0.1.2",
      availableVersion: null,
      errorCode: null,
    });
  });

  it("keeps the editor usable when restart/install fails synchronously", async () => {
    const updater = new FakeUpdater();
    const service = new UpdateService({
      updater,
      currentVersion: "0.1.0",
      distribution: "direct",
      logger: { warn: vi.fn() },
    });
    await service.checkForUpdates();
    await service.downloadUpdate();
    updater.quitAndInstall.mockImplementationOnce(() => {
      throw new Error("installer process could not start");
    });

    expect(service.installUpdate()).toMatchObject({
      status: "error",
      errorCode: "UPDATE_FAILED",
    });
  });

  it("maps offline and signature errors without exposing raw server messages", async () => {
    expect(classifyUpdateError({ code: "ENOTFOUND" })).toBe("OFFLINE");
    expect(classifyUpdateError(new Error("Code signature at URL is invalid"))).toBe(
      "SIGNATURE_INVALID",
    );

    const updater = new FakeUpdater();
    updater.checkForUpdates.mockRejectedValueOnce(
      Object.assign(new Error("getaddrinfo failed for a private host"), { code: "ENOTFOUND" }),
    );
    const service = new UpdateService({
      updater,
      currentVersion: "0.1.0",
      distribution: "direct",
      logger: { warn: vi.fn() },
    });
    await expect(service.checkForUpdates()).resolves.toMatchObject({
      status: "error",
      errorCode: "OFFLINE",
    });
    expect(JSON.stringify(service.getState())).not.toContain("private host");
  });

  it("compares stable versions and prereleases without allowing accidental downgrade", () => {
    expect(compareVersions("1.2.0", "1.1.9")).toBe(1);
    expect(compareVersions("1.2.0", "1.2.0")).toBe(0);
    expect(compareVersions("1.2.0-alpha.2", "1.2.0")).toBe(-1);
    expect(compareVersions("not-a-version", "1.2.0")).toBeNull();
  });

  it("never loads the updater module for MAS or development builds", async () => {
    const loadUpdater = vi.fn();
    const app = {
      getAppPath: () => "/Applications/Fylune.app/Contents/Resources/app.asar",
      getVersion: () => "0.1.0",
      isPackaged: true,
    };
    await expect(createUpdateService({
      app,
      isMas: false,
      platform: "darwin",
      buildChannel: "mas",
      loadUpdater,
    })).resolves.toMatchObject({
      state: {
        distribution: "app_store",
        canSelfUpdate: false,
        status: "disabled",
      },
    });
    expect(loadUpdater).not.toHaveBeenCalled();
  });

  it("keeps the editor available when a direct build is missing its updater", async () => {
    const logger = { warn: vi.fn() };
    const app = {
      getAppPath: () => "/Applications/Fylune.app/Contents/Resources/app.asar",
      getVersion: () => "0.1.0",
      isPackaged: true,
    };
    const service = await createUpdateService({
      app,
      isMas: false,
      platform: "darwin",
      buildChannel: "direct",
      logger,
      loadUpdater: async () => {
        throw new Error("missing dependency");
      },
    });
    expect(service.getState()).toMatchObject({
      distribution: "direct",
      canSelfUpdate: false,
      status: "error",
      errorCode: "UPDATER_UNAVAILABLE",
    });
    expect(logger.warn).toHaveBeenCalledWith(
      "Fylune updater could not be initialized",
      { errorCode: "UPDATER_UNAVAILABLE" },
    );
  });

  it("configures the public GitHub release feed at runtime", async () => {
    const updater = new FakeUpdater();
    const app = {
      getAppPath: () => "/Applications/Fylune.app/Contents/Resources/app.asar",
      getVersion: () => "0.1.2",
      isPackaged: true,
    };
    await createUpdateService({
      app,
      isMas: false,
      platform: "darwin",
      architecture: "arm64",
      buildChannel: "direct",
      loadUpdater: async () => ({ autoUpdater: updater }),
    });

    expect(updater.setFeedURL).toHaveBeenCalledWith({
      provider: "github",
      owner: "georgezouq",
      repo: "fylune",
      releaseType: "release",
    });
  });

  it("uses the same public release feed for Windows", async () => {
    const updater = new FakeUpdater();
    const app = {
      getAppPath: () => "C:\\Program Files\\Fylune\\resources\\app.asar",
      getVersion: () => "0.1.3",
      isPackaged: true,
    };
    await createUpdateService({
      app,
      isMas: false,
      platform: "win32",
      architecture: "x64",
      buildChannel: "direct",
      loadUpdater: async () => ({ autoUpdater: updater }),
    });

    expect(updater.setFeedURL).toHaveBeenCalledWith({
      provider: "github",
      owner: "georgezouq",
      repo: "fylune",
      releaseType: "release",
    });
  });

  it("reads the packaged build channel defensively", async () => {
    const app = { getAppPath: () => "/Applications/Fylune.app/Contents/Resources/app.asar" };
    const readFileImpl = vi.fn(async (filePath) => {
      expect(filePath.replaceAll("\\", "/")).toContain("app.asar/package.json");
      return JSON.stringify({ fyluneReleaseChannel: "direct" });
    });
    await expect(readBuildChannel(app, readFileImpl)).resolves.toBe("direct");
    await expect(readBuildChannel(app, async () => "{bad")).resolves.toBeNull();
  });
});
