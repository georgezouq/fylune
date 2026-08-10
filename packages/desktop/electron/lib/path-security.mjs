import path from "node:path";
import { lstat, realpath } from "node:fs/promises";

import { FyluneError } from "./errors.mjs";

const WINDOWS_ABSOLUTE = /^[a-zA-Z]:[\\/]/;

export function isWithin(parent, candidate) {
  const relative = path.relative(parent, candidate);
  return relative === "" || (!relative.startsWith(`..${path.sep}`) && relative !== ".." && !path.isAbsolute(relative));
}

export function normalizeRelativePath(relativePath) {
  if (typeof relativePath !== "string" || relativePath.length === 0) {
    throw new FyluneError("INVALID_PATH", "A project-relative path is required.");
  }
  if (relativePath.includes("\0") || relativePath.includes("\\")) {
    throw new FyluneError("INVALID_PATH", "The path contains unsupported characters.");
  }
  if (path.isAbsolute(relativePath) || WINDOWS_ABSOLUTE.test(relativePath)) {
    throw new FyluneError("PATH_ESCAPE", "Only project-relative paths are allowed.");
  }

  const normalized = path.posix.normalize(relativePath);
  if (normalized === "." || normalized === ".." || normalized.startsWith("../")) {
    throw new FyluneError("PATH_ESCAPE", "The path must stay inside the selected project.");
  }
  return normalized.replace(/^\.\//, "");
}

async function nearestExistingParent(candidate) {
  let current = candidate;
  while (true) {
    try {
      await lstat(current);
      return current;
    } catch (error) {
      if (error?.code !== "ENOENT") throw error;
      const parent = path.dirname(current);
      if (parent === current) throw error;
      current = parent;
    }
  }
}

export async function canonicalProjectRoot(root) {
  const resolved = await realpath(root);
  const info = await lstat(resolved);
  if (!info.isDirectory()) {
    throw new FyluneError("INVALID_PROJECT", "The selected project must be a folder.");
  }
  return resolved;
}

export async function resolveProjectPath(root, relativePath, options = {}) {
  const normalized = normalizeRelativePath(relativePath);
  const canonicalRoot = await canonicalProjectRoot(root);
  const candidate = path.resolve(canonicalRoot, ...normalized.split("/"));

  if (!isWithin(canonicalRoot, candidate)) {
    throw new FyluneError("PATH_ESCAPE", "The path must stay inside the selected project.");
  }

  const existing = await nearestExistingParent(candidate);
  const canonicalExisting = await realpath(existing);
  if (!isWithin(canonicalRoot, canonicalExisting)) {
    throw new FyluneError("PATH_ESCAPE", "Symbolic links outside the project are not allowed.");
  }

  if (existing === candidate) {
    const info = await lstat(candidate);
    if (info.isSymbolicLink()) {
      throw new FyluneError("PATH_ESCAPE", "Symbolic links are not supported for writable project files.");
    }
    const canonicalCandidate = await realpath(candidate);
    if (!isWithin(canonicalRoot, canonicalCandidate)) {
      throw new FyluneError("PATH_ESCAPE", "The path resolves outside the selected project.");
    }
  } else if (!options.allowMissing) {
    throw new FyluneError("FILE_NOT_FOUND", "The requested file does not exist.");
  }

  return { absolutePath: candidate, relativePath: normalized, root: canonicalRoot };
}
