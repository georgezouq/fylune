import { EventEmitter } from "node:events";

const updateStatuses = new Set([
  "disabled",
  "idle",
  "checking",
  "available",
  "not_available",
  "downloading",
  "downloaded",
  "installing",
  "error",
]);

function numericVersion(value) {
  const match = String(value ?? "").trim().match(/^v?(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?$/);
  if (!match) return null;
  return {
    numbers: match.slice(1, 4).map(Number),
    prerelease: match[4] ?? null,
  };
}

export function compareVersions(left, right) {
  const leftVersion = numericVersion(left);
  const rightVersion = numericVersion(right);
  if (!leftVersion || !rightVersion) return null;
  for (let index = 0; index < leftVersion.numbers.length; index += 1) {
    if (leftVersion.numbers[index] !== rightVersion.numbers[index]) {
      return leftVersion.numbers[index] > rightVersion.numbers[index] ? 1 : -1;
    }
  }
  if (leftVersion.prerelease === rightVersion.prerelease) return 0;
  if (!leftVersion.prerelease) return 1;
  if (!rightVersion.prerelease) return -1;
  return leftVersion.prerelease.localeCompare(rightVersion.prerelease, "en", {
    numeric: true,
    sensitivity: "base",
  });
}

export function resolveUpdateDistribution({
  isPackaged,
  isMas,
  platform,
  buildChannel,
}) {
  const normalizedChannel = String(buildChannel ?? "").trim().toLowerCase();
  if (isMas || new Set(["mas", "app-store", "app_store"]).has(normalizedChannel)) {
    return "app_store";
  }
  if (normalizedChannel === "candidate") return "development";
  if (!isPackaged) return "development";
  if (!new Set(["darwin", "win32"]).has(platform)) return "unsupported";
  if (normalizedChannel === "direct") return "direct";
  return "unsupported";
}

export function classifyUpdateError(error) {
  const code = String(error?.code ?? "").toUpperCase();
  const message = String(error?.message ?? "").toLowerCase();
  if (
    /(?:ENOTFOUND|ENETUNREACH|ECONNRESET|ECONNREFUSED|ETIMEDOUT|ERR_INTERNET_DISCONNECTED)/.test(code)
    || /(?:offline|network|internet|timed out|timeout|unable to resolve)/.test(message)
  ) {
    return "OFFLINE";
  }
  if (/(?:signature|code sign|codesign|not signed|certificate)/.test(message)) {
    return "SIGNATURE_INVALID";
  }
  if (/(?:401|403|404|release feed|latest(?:-mac)?\.yml)/.test(message)) {
    return "FEED_UNAVAILABLE";
  }
  return "UPDATE_FAILED";
}

function normalizedInfo(info) {
  if (!info || typeof info !== "object") return null;
  const version = typeof info.version === "string" ? info.version.trim() : "";
  if (!numericVersion(version)) return null;
  return {
    version,
    releaseDate: typeof info.releaseDate === "string" ? info.releaseDate : null,
    stagingPercentage: Number.isFinite(info.stagingPercentage)
      ? Math.min(100, Math.max(0, info.stagingPercentage))
      : null,
  };
}

function initialState({ distribution, currentVersion }) {
  const enabled = distribution === "direct";
  return {
    distribution,
    canSelfUpdate: enabled,
    status: enabled ? "idle" : "disabled",
    currentVersion,
    availableVersion: null,
    releaseDate: null,
    stagingPercentage: null,
    progress: null,
    errorCode: null,
  };
}

export class UpdateService extends EventEmitter {
  #listeners = [];
  #operation = null;
  #updater;

  constructor({
    updater = null,
    currentVersion,
    distribution,
    logger = console,
  }) {
    super();
    this.#updater = updater;
    this.logger = logger;
    this.state = initialState({ distribution, currentVersion });
    if (distribution === "direct" && !updater) {
      this.state = Object.freeze({
        ...this.state,
        canSelfUpdate: false,
        status: "error",
        errorCode: "UPDATER_UNAVAILABLE",
      });
    }
    if (updater) this.#configureUpdater(updater);
  }

  #configureUpdater(updater) {
    updater.autoDownload = false;
    updater.autoInstallOnAppQuit = false;
    updater.allowPrerelease = false;
    updater.allowDowngrade = false;
    updater.fullChangelog = false;
    updater.logger = {
      info: () => {},
      warn: () => {},
      error: () => {},
      debug: () => {},
    };
    this.#listen("checking-for-update", () => this.#setState({ status: "checking", errorCode: null }));
    this.#listen("update-available", (info) => this.#acceptAvailableUpdate(info));
    this.#listen("update-not-available", () => this.#setState({
      status: "not_available",
      availableVersion: null,
      releaseDate: null,
      stagingPercentage: null,
      progress: null,
      errorCode: null,
    }));
    this.#listen("download-progress", (progress) => {
      const percent = Number.isFinite(progress?.percent)
        ? Math.min(100, Math.max(0, progress.percent))
        : 0;
      this.#setState({ status: "downloading", progress: Math.round(percent), errorCode: null });
    });
    this.#listen("update-downloaded", (info) => {
      this.#acceptAvailableUpdate(info, "downloaded");
    });
    this.#listen("error", (error) => this.#handleError(error));
  }

  #listen(event, handler) {
    this.#updater.on(event, handler);
    this.#listeners.push([event, handler]);
  }

  #setState(patch) {
    const next = { ...this.state, ...patch };
    if (!updateStatuses.has(next.status)) throw new TypeError(`Unknown update status: ${next.status}`);
    this.state = Object.freeze(next);
    this.emit("state", this.getState());
    return this.state;
  }

  #handleError(error) {
    const errorCode = classifyUpdateError(error);
    this.logger?.warn?.("Fylune update operation failed", { errorCode });
    this.#setState({ status: "error", progress: null, errorCode });
  }

  #acceptAvailableUpdate(info, status = "available") {
    const update = normalizedInfo(info);
    const comparison = update ? compareVersions(update.version, this.state.currentVersion) : null;
    if (!update || comparison === null) {
      this.#setState({ status: "error", progress: null, errorCode: "INVALID_UPDATE_VERSION" });
      return false;
    }
    if (comparison <= 0) {
      this.#setState({
        status: "not_available",
        availableVersion: null,
        releaseDate: null,
        stagingPercentage: null,
        progress: null,
        errorCode: null,
      });
      return false;
    }
    this.#setState({
      status,
      availableVersion: update.version,
      releaseDate: update.releaseDate,
      stagingPercentage: update.stagingPercentage,
      progress: status === "downloaded" ? 100 : null,
      errorCode: null,
    });
    return true;
  }

  getState() {
    return { ...this.state };
  }

  async #run(operation) {
    if (this.#operation) return this.#operation;
    this.#operation = Promise.resolve()
      .then(operation)
      .finally(() => {
        this.#operation = null;
      });
    return this.#operation;
  }

  async checkForUpdates() {
    if (!this.state.canSelfUpdate || !this.#updater) return this.getState();
    return this.#run(async () => {
      this.#setState({ status: "checking", progress: null, errorCode: null });
      try {
        const result = await this.#updater.checkForUpdates();
        if (result?.isUpdateAvailable && result.updateInfo) {
          this.#acceptAvailableUpdate(result.updateInfo);
        } else if (this.state.status === "checking") {
          this.#setState({
            status: "not_available",
            availableVersion: null,
            releaseDate: null,
            stagingPercentage: null,
            progress: null,
            errorCode: null,
          });
        }
      } catch (error) {
        this.#handleError(error);
      }
      return this.getState();
    });
  }

  async downloadUpdate() {
    if (!this.state.canSelfUpdate || !this.#updater) return this.getState();
    if (this.state.status !== "available") {
      return this.#setState({ status: "error", errorCode: "UPDATE_NOT_AVAILABLE" });
    }
    return this.#run(async () => {
      this.#setState({ status: "downloading", progress: 0, errorCode: null });
      try {
        await this.#updater.downloadUpdate();
        if (this.state.status === "downloading") {
          this.#setState({ status: "downloaded", progress: 100, errorCode: null });
        }
      } catch (error) {
        this.#handleError(error);
      }
      return this.getState();
    });
  }

  installUpdate() {
    if (!this.state.canSelfUpdate || !this.#updater) return this.getState();
    if (this.state.status !== "downloaded") {
      return this.#setState({ status: "error", errorCode: "UPDATE_NOT_DOWNLOADED" });
    }
    this.#setState({ status: "installing", errorCode: null });
    try {
      this.#updater.quitAndInstall(false, true);
    } catch (error) {
      this.#handleError(error);
    }
    return this.getState();
  }

  dispose() {
    for (const [event, handler] of this.#listeners) {
      this.#updater?.off?.(event, handler);
    }
    this.#listeners = [];
    this.removeAllListeners();
  }
}
