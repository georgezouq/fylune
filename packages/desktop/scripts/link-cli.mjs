#!/usr/bin/env node
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { installCli } from "../electron/lib/cli-installer.mjs";

const require = createRequire(import.meta.url);
const desktopPath = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const status = await installCli({
  executablePath: require("electron"),
  appPath: desktopPath,
  isPackaged: false,
  isAppStoreBuild: false,
});

process.stdout.write(`Fylune CLI linked at ${status.installPath}${status.pathConfigured ? "" : " (add ~/.local/bin to PATH)"}.\n`);
