import { readFile } from "node:fs/promises";
import path from "node:path";

import { directUpdateFeed } from "./update-feed.mjs";
import { resolveUpdateDistribution, UpdateService } from "./update-service.mjs";

export async function readBuildChannel(app, readFileImpl = readFile) {
  try {
    const packagePath = path.join(app.getAppPath(), "package.json");
    const metadata = JSON.parse(await readFileImpl(packagePath, "utf8"));
    return typeof metadata.fyluneReleaseChannel === "string"
      ? metadata.fyluneReleaseChannel
      : null;
  } catch {
    return null;
  }
}

export async function createUpdateService({
  app,
  isMas = Boolean(process.mas),
  platform = process.platform,
  architecture = process.arch,
  buildChannel,
  logger = console,
  loadUpdater = async () => import("electron-updater"),
}) {
  const packagedChannel = buildChannel ?? await readBuildChannel(app);
  const distribution = resolveUpdateDistribution({
    isPackaged: app.isPackaged,
    isMas,
    platform,
    buildChannel: packagedChannel,
  });
  let updater = null;
  if (distribution === "direct") {
    try {
      const updaterModule = await loadUpdater();
      updater = updaterModule.autoUpdater ?? updaterModule.default?.autoUpdater;
      if (!updater) throw new Error("electron-updater did not expose autoUpdater");
      updater.setFeedURL(directUpdateFeed(architecture, platform));
    } catch {
      logger?.warn?.("Fylune updater could not be initialized", {
        errorCode: "UPDATER_UNAVAILABLE",
      });
    }
  }
  return new UpdateService({
    updater,
    currentVersion: app.getVersion(),
    distribution,
    logger,
  });
}
