import { realpath, stat } from "node:fs/promises";
import path from "node:path";

import { FyluneError } from "./errors.mjs";

export const OPENABLE_DOCUMENT_EXTENSIONS = new Set([
  ".md",
  ".markdown",
  ".mdx",
  ".json",
  ".jsonl",
]);

export function openTargetFromArgv(argv) {
  const encoded = argv.find((value) => value.startsWith("--fylune-open="));
  if (encoded) return encoded.slice("--fylune-open=".length) || null;
  const marker = argv.indexOf("--fylune-open");
  if (marker >= 0) return [...argv.slice(marker + 1)].reverse().find((value) => path.isAbsolute(value || "")) || null;
  return argv.find((value) => (
    path.isAbsolute(value || "")
    && OPENABLE_DOCUMENT_EXTENSIONS.has(path.extname(value).toLowerCase())
  )) || null;
}

export async function resolveOpenTarget(input, cwd = process.cwd()) {
  if (typeof input !== "string" || !input.trim()) {
    throw new FyluneError("INVALID_ARGUMENT", "Provide a file or folder to open.");
  }
  const targetPath = await realpath(path.resolve(cwd, input));
  const targetStat = await stat(targetPath);
  if (targetStat.isDirectory()) return { kind: "directory", path: targetPath };
  if (
    !targetStat.isFile()
    || !OPENABLE_DOCUMENT_EXTENSIONS.has(path.extname(targetPath).toLowerCase())
  ) {
    throw new FyluneError(
      "UNSUPPORTED_FILE",
      "Fylune can open Markdown, MDX, JSON, JSONL, or a folder from the command line.",
    );
  }
  return { kind: "file", path: targetPath };
}
