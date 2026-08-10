import { execFile, spawn } from "node:child_process";
import { stat } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

function spawnDetached(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      detached: true,
      stdio: "ignore",
      windowsHide: false,
    });
    child.once("error", reject);
    child.once("spawn", () => {
      child.unref();
      resolve({});
    });
  });
}

export async function openDirectoryInTerminal(
  directory,
  {
    platform = process.platform,
    run = execFileAsync,
    launchWindows = spawnDetached,
  } = {},
) {
  if (platform === "darwin") {
    await run("/usr/bin/open", ["-a", "Terminal", directory]);
    return { opened: true };
  }
  if (platform === "win32") {
    try {
      await launchWindows("wt.exe", ["-d", directory]);
    } catch (error) {
      if (error?.code !== "ENOENT") throw error;
      await launchWindows("powershell.exe", [
        "-NoExit",
        "-Command",
        "Set-Location -LiteralPath $args[0]",
        directory,
      ]);
    }
    return { opened: true };
  }
  throw Object.assign(new Error("Opening a project directory in a terminal is not available on this platform."), {
      code: "UNSUPPORTED_PLATFORM",
    });
}

export async function openWorkspaceEntryInTerminal(
  entryPath,
  { getInfo = stat, platform = process.platform, run = execFileAsync } = {},
) {
  const info = await getInfo(entryPath);
  const directory = info.isDirectory() ? entryPath : path.dirname(entryPath);
  return openDirectoryInTerminal(directory, { platform, run });
}

export async function revealWorkspaceEntryInFileManager(
  entryPath,
  { getInfo = stat, openPath, showItemInFolder } = {},
) {
  if (typeof openPath !== "function" || typeof showItemInFolder !== "function") {
    throw new TypeError("File-manager actions are required.");
  }
  const info = await getInfo(entryPath);
  if (info.isDirectory()) {
    const error = await openPath(entryPath);
    if (error) throw Object.assign(new Error(error), { code: "OPEN_FAILED" });
  } else {
    showItemInFolder(entryPath);
  }
  return { revealed: true };
}

export const revealWorkspaceEntryInFinder = revealWorkspaceEntryInFileManager;
