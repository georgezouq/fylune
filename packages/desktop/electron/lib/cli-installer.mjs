import { chmod, mkdir, readFile, rename, unlink, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import path from "node:path";

import { FyluneError } from "./errors.mjs";

const LAUNCHER_MARKER = "# Fylune CLI launcher v1";

function shellQuote(value) {
  return `'${String(value).replaceAll("'", `'\\''`)}'`;
}

export function cliInstallPath(homePath = homedir(), platform = process.platform) {
  return platform === "win32"
    ? path.join(process.env.LOCALAPPDATA || homePath, "Fylune", "bin", "fylune.cmd")
    : path.join(homePath, ".local", "bin", "fylune");
}

export function createCliLauncher({ executablePath, appPath, isPackaged, isAppStoreBuild, platform = process.platform }) {
  if (isAppStoreBuild && platform === "darwin") {
    const bundlePath = path.resolve(executablePath, "../../..");
    return `#!/bin/sh\n${LAUNCHER_MARKER}\n# App Store: Launch Services grants access to selected files; no sandbox bypass.\ncase "\${1-}" in\n  --help|-h) printf '%s\\n' 'Usage: fylune [open] [file or folder]' 'App Store launcher: opening only. Agent commands require the direct release.'; exit 0 ;;\n  agent|doctor) printf '%s\\n' 'Agent and doctor commands require the direct Fylune release.' >&2; exit 2 ;;\n  open) shift ;;\nesac\nif [ "$#" -eq 0 ]; then exec /usr/bin/open -a ${shellQuote(bundlePath)}; fi\nfor target in "$@"; do\n  case "$target" in /*) ;; *) target="$PWD/$target" ;; esac\n  /usr/bin/open -a ${shellQuote(bundlePath)} "$target" || exit "$?"\ndone\n`;
  }
  if (platform === "win32") {
    const appArg = isPackaged ? "" : ` "${appPath}"`;
    return `@echo off\r\nrem Fylune CLI launcher v1\r\n"${executablePath}"${appArg} --fylune-cli --cwd "%CD%" %*\r\n`;
  }
  const appArg = isPackaged ? "" : ` ${shellQuote(appPath)}`;
  return `#!/bin/sh\n${LAUNCHER_MARKER}\nexec ${shellQuote(executablePath)}${appArg} --fylune-cli --cwd "$PWD" "$@"\n`;
}

export function createManualCliInstallCommand(options) {
  const launcher = createCliLauncher({ ...options, platform: "darwin" });
  return `/bin/sh -c ${shellQuote(`set -eu
bin="$HOME/.local/bin"
target="$bin/fylune"
mkdir -p "$bin"
if [ -L "$target" ] || { [ -e "$target" ] && ! grep -Fqx ${shellQuote(LAUNCHER_MARKER)} "$target"; }; then
  printf '%s\\n' 'Another file owns ~/.local/bin/fylune. Nothing was overwritten.' >&2
  exit 1
fi
temporary=$(mktemp "$bin/.fylune.XXXXXX")
trap 'rm -f "$temporary"' EXIT
printf '%s' ${shellQuote(launcher)} > "$temporary"
chmod 755 "$temporary"
mv -f "$temporary" "$target"
printf '%s\\n' 'Installed ~/.local/bin/fylune. Run ~/.local/bin/fylune --help to check.'`)}`;
}

function isFyluneLauncher(content = "") {
  return content.includes("Fylune CLI launcher v1");
}

export async function getCliStatus(options) {
  const platform = options.platform || process.platform;
  const installPath = options.installPath || cliInstallPath(options.homePath, platform);
  const binPath = path.dirname(installPath);
  if (options.isAppStoreBuild) {
    // The sandbox home is not the user's shell home. Do not report a fake installation status.
    return {
      status: "unavailable", reason: "app-store", installPath: "~/.local/bin/fylune", pathConfigured: false,
      manualInstallCommand: createManualCliInstallCommand(options),
    };
  }
  if (platform !== "darwin") {
    return { status: "unavailable", reason: "platform", installPath, pathConfigured: false };
  }
  const expected = createCliLauncher({ ...options, platform });
  let content;
  try {
    content = await readFile(installPath, "utf8");
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
    content = null;
  }
  const pathConfigured = (options.pathValue ?? process.env.PATH ?? "")
    .split(platform === "win32" ? ";" : ":")
    .some((entry) => path.resolve(entry) === path.resolve(binPath));
  const status = content == null
    ? "not-installed"
    : !isFyluneLauncher(content)
      ? "conflict"
      : content === expected
        ? "installed"
        : "repair";
  return { status, installPath, binPath, pathConfigured };
}

export async function installCli(options) {
  const status = await getCliStatus(options);
  if (status.status === "unavailable") {
    throw new FyluneError("CLI_UNAVAILABLE", "This Fylune distribution cannot install the command line tool.");
  }
  if (status.status === "conflict") {
    throw new FyluneError("CLI_PATH_CONFLICT", `Another file already exists at ${status.installPath}.`);
  }
  const content = createCliLauncher({ ...options, platform: options.platform || process.platform });
  await mkdir(path.dirname(status.installPath), { recursive: true, mode: 0o755 });
  const temporaryPath = `${status.installPath}.${process.pid}.tmp`;
  await writeFile(temporaryPath, content, { encoding: "utf8", mode: 0o755 });
  await chmod(temporaryPath, 0o755);
  await rename(temporaryPath, status.installPath);
  return getCliStatus(options);
}

export async function uninstallCli(options) {
  const status = await getCliStatus(options);
  if (status.status === "conflict") {
    throw new FyluneError("CLI_PATH_CONFLICT", `Fylune will not remove the unrelated file at ${status.installPath}.`);
  }
  if (status.status !== "not-installed" && status.status !== "unavailable") {
    await unlink(status.installPath).catch((error) => {
      if (error?.code !== "ENOENT") throw error;
    });
  }
  return getCliStatus(options);
}

export function cliOptionsFromApp(app) {
  return {
    executablePath: app.getPath("exe"),
    appPath: app.getAppPath(),
    isPackaged: app.isPackaged,
    isAppStoreBuild: Boolean(process.mas),
  };
}
