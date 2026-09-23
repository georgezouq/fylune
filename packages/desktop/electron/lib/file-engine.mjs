import path from "node:path";
import { access, copyFile, cp, lstat, mkdir, open, readdir, readFile, realpath, rename, stat, unlink } from "node:fs/promises";
import { constants } from "node:fs";
import writeFileAtomic from "write-file-atomic";

import { assetTypeForPath } from "./assets.mjs";
import { documentIconFromSource } from "./document-metadata.mjs";
import { FyluneError } from "./errors.mjs";
import { sha256 } from "./hash.mjs";
import { canonicalProjectRoot, resolveProjectPath } from "./path-security.mjs";

export const DOCUMENT_EXTENSIONS = new Set([".md", ".markdown", ".mdx", ".json", ".jsonl"]);
const MARKDOWN_EXTENSIONS = new Set([".md", ".markdown", ".mdx"]);
export const TECHNICAL_DIRECTORIES = new Set([
  ".git",
  ".hg",
  ".svn",
  ".cache",
  ".next",
  ".nuxt",
  ".output",
  ".turbo",
  ".vite",
  ".yarn",
  "build",
  "coverage",
  "dist",
  "node_modules",
  "out",
  "release",
  "target",
  "vendor",
]);

const MAX_DOCUMENT_BYTES = 20 * 1024 * 1024;
const MAX_DOCUMENT_PREVIEW_BYTES = 48 * 1024;
const MAX_DOCUMENT_METADATA_BYTES = 8 * 1024;
const MAX_DUPLICATE_ATTEMPTS = 100;
const PROJECT_SCAN_CONCURRENCY = 12;
const FOLDER_PREVIEW_LIMIT = 4;

async function readDocumentIcon(absolutePath, size) {
  const bytesToRead = Math.min(size, MAX_DOCUMENT_METADATA_BYTES);
  if (!bytesToRead) return null;
  const buffer = Buffer.alloc(bytesToRead);
  const handle = await open(absolutePath, "r");
  let bytesRead = 0;
  try {
    ({ bytesRead } = await handle.read(buffer, 0, bytesToRead, 0));
  } finally {
    await handle.close();
  }
  return documentIconFromSource(buffer.subarray(0, bytesRead).toString("utf8"));
}

export function isDocumentPath(filePath) {
  return DOCUMENT_EXTENSIONS.has(path.extname(filePath).toLowerCase());
}

export function workspaceFileType(filePath) {
  if (isDocumentPath(filePath)) return "document";
  return assetTypeForPath(filePath)?.kind ?? null;
}

export function isTechnicalPath(relativePath) {
  return relativePath.split(/[\\/]/).some((segment) => TECHNICAL_DIRECTORIES.has(segment));
}

function createIoLimiter(limit = PROJECT_SCAN_CONCURRENCY) {
  let active = 0;
  const queued = [];

  const runNext = () => {
    while (active < limit && queued.length) {
      const { operation, resolve, reject } = queued.shift();
      active += 1;
      Promise.resolve()
        .then(operation)
        .then(resolve, reject)
        .finally(() => {
          active -= 1;
          runNext();
        });
    }
  };

  return (operation) => new Promise((resolve, reject) => {
    queued.push({ operation, resolve, reject });
    runNext();
  });
}

async function mapWithConcurrency(values, limit, operation) {
  const results = new Array(values.length);
  let nextIndex = 0;
  const workers = Array.from({ length: Math.min(limit, values.length) }, async () => {
    while (nextIndex < values.length) {
      const index = nextIndex;
      nextIndex += 1;
      results[index] = await operation(values[index], index);
    }
  });
  await Promise.all(workers);
  return results;
}

async function scanDirectory(root, absoluteDirectory, relativeDirectory, options) {
  const { recursive, documentsOnly, folderPreviews, resultLimit, runIo } = options;
  const entries = await runIo(() => readdir(absoluteDirectory, { withFileTypes: true }));
  entries.sort((a, b) => {
    if (a.isDirectory() !== b.isDirectory()) return a.isDirectory() ? -1 : 1;
    return a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: "base" });
  });

  const supportedEntries = entries.filter((entry) => {
    if (entry.isSymbolicLink()) return false;
    const relativePath = relativeDirectory ? `${relativeDirectory}/${entry.name}` : entry.name;
    if (isTechnicalPath(relativePath)) return false;
    if (entry.isDirectory()) return true;
    const fileType = entry.isFile() ? workspaceFileType(entry.name) : null;
    return Boolean(fileType && (!documentsOnly || fileType === "document"));
  });
  const entriesToScan = Number.isInteger(resultLimit)
    ? supportedEntries.slice(0, resultLimit)
    : supportedEntries;

  const children = (await mapWithConcurrency(entriesToScan, PROJECT_SCAN_CONCURRENCY, async (entry) => {
    const relativePath = relativeDirectory ? `${relativeDirectory}/${entry.name}` : entry.name;
    const absolutePath = path.join(absoluteDirectory, entry.name);

    if (entry.isDirectory()) {
      if (!recursive) {
        const preview = folderPreviews
          ? await scanDirectory(root, absolutePath, relativePath, {
            ...options,
            folderPreviews: false,
            resultLimit: FOLDER_PREVIEW_LIMIT,
          })
          : null;
        return {
          kind: "directory",
          name: entry.name,
          path: relativePath,
          loaded: false,
          ...(preview ? {
            itemCount: preview.itemCount,
            previewChildren: preview.children,
          } : {}),
        };
      }
      const nested = await scanDirectory(root, absolutePath, relativePath, options);
      return !documentsOnly || nested.children.length > 0 ? nested : null;
    }

    const fileType = workspaceFileType(entry.name);
    return runIo(async () => {
      const fileInfo = await stat(absolutePath);
      const icon = fileType === "document" && MARKDOWN_EXTENSIONS.has(path.extname(entry.name).toLowerCase())
        ? await readDocumentIcon(absolutePath, fileInfo.size)
        : null;
      return {
        kind: "file",
        fileType,
        name: entry.name,
        path: relativePath,
        extension: path.extname(entry.name).slice(1).toLowerCase(),
        size: fileInfo.size,
        mtimeMs: fileInfo.mtimeMs,
        ...(icon ? { icon } : {}),
      };
    });
  })).filter(Boolean);

  const directoryInfo = await runIo(() => stat(absoluteDirectory));
  return {
    kind: "directory",
    name: relativeDirectory ? path.posix.basename(relativeDirectory) : path.basename(root),
    path: relativeDirectory,
    mtimeMs: directoryInfo.mtimeMs,
    loaded: true,
    children,
    itemCount: Number.isInteger(resultLimit) ? supportedEntries.length : children.length,
  };
}

export async function scanProject(root, options = {}) {
  const canonicalRoot = await canonicalProjectRoot(root);
  const relativeDirectory = String(options.relativePath || "").replace(/^\.\//, "");
  const absoluteDirectory = relativeDirectory
    ? (await resolveProjectPath(canonicalRoot, relativeDirectory)).absolutePath
    : canonicalRoot;
  const directoryInfo = await stat(absoluteDirectory);
  if (!directoryInfo.isDirectory()) {
    throw new FyluneError("UNSUPPORTED_FILE", "The selected project path is not a folder.");
  }
  return scanDirectory(canonicalRoot, absoluteDirectory, relativeDirectory, {
    recursive: Boolean(options.recursive),
    documentsOnly: Boolean(options.documentsOnly),
    folderPreviews: Boolean(options.folderPreviews),
    runIo: createIoLimiter(),
  });
}

export async function readDocument(root, relativePath) {
  if (!isDocumentPath(relativePath)) {
    throw new FyluneError("UNSUPPORTED_FILE", "Fylune can edit Markdown, MDX, JSON, and JSONL documents only.");
  }
  const resolved = await resolveProjectPath(root, relativePath);
  const info = await stat(resolved.absolutePath);
  if (!info.isFile()) throw new FyluneError("UNSUPPORTED_FILE", "The selected path is not a document.");
  if (info.size > MAX_DOCUMENT_BYTES) {
    throw new FyluneError("FILE_TOO_LARGE", "This document is larger than the 20 MB safety limit.");
  }

  const content = await readFile(resolved.absolutePath, "utf8");
  let readOnly = false;
  try {
    await access(resolved.absolutePath, constants.W_OK);
  } catch {
    readOnly = true;
  }
  return {
    path: resolved.relativePath,
    content,
    hash: sha256(content),
    mtimeMs: info.mtimeMs,
    readOnly,
  };
}

export async function readExternalDocument(filePath) {
  if (!isDocumentPath(filePath)) {
    throw new FyluneError("UNSUPPORTED_FILE", "Fylune can edit Markdown, MDX, JSON, and JSONL documents only.");
  }
  const sourceInfo = await lstat(filePath);
  if (!sourceInfo.isFile() || sourceInfo.isSymbolicLink()) {
    throw new FyluneError("UNSUPPORTED_FILE", "The selected path is not a document.");
  }
  const absolutePath = await realpath(filePath);
  const info = await stat(absolutePath);
  if (info.size > MAX_DOCUMENT_BYTES) {
    throw new FyluneError("FILE_TOO_LARGE", "This document is larger than the 20 MB safety limit.");
  }
  const content = await readFile(absolutePath, "utf8");
  let readOnly = false;
  try {
    await access(absolutePath, constants.W_OK);
  } catch {
    readOnly = true;
  }
  return {
    path: path.basename(absolutePath),
    content,
    hash: sha256(content),
    mtimeMs: info.mtimeMs,
    size: info.size,
    readOnly,
  };
}

export async function readDocumentPreview(root, relativePath) {
  if (!isDocumentPath(relativePath)) {
    throw new FyluneError("UNSUPPORTED_FILE", "Fylune can preview Markdown, MDX, JSON, and JSONL documents only.");
  }
  const resolved = await resolveProjectPath(root, relativePath);
  const info = await stat(resolved.absolutePath);
  if (!info.isFile()) throw new FyluneError("UNSUPPORTED_FILE", "The selected path is not a document.");

  const bytesToRead = Math.min(info.size, MAX_DOCUMENT_PREVIEW_BYTES);
  const buffer = Buffer.alloc(bytesToRead);
  const handle = await open(resolved.absolutePath, "r");
  let bytesRead = 0;
  try {
    ({ bytesRead } = await handle.read(buffer, 0, bytesToRead, 0));
  } finally {
    await handle.close();
  }

  return {
    path: resolved.relativePath,
    content: buffer.subarray(0, bytesRead).toString("utf8").replace(/\uFFFD$/, ""),
    truncated: info.size > bytesRead,
    mtimeMs: info.mtimeMs,
  };
}

export async function saveDocument({
  root,
  relativePath,
  content,
  expectedHash,
  snapshotStore,
  draftStore,
  onWrite,
}) {
  if (!isDocumentPath(relativePath)) {
    throw new FyluneError("UNSUPPORTED_FILE", "Fylune can save Markdown, MDX, JSON, and JSONL documents only.");
  }
  const resolved = await resolveProjectPath(root, relativePath, { allowMissing: expectedHash == null });
  let before = null;
  try {
    before = await readFile(resolved.absolutePath, "utf8");
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
  }
  const currentHash = before == null ? null : sha256(before);
  if (currentHash !== (expectedHash ?? null)) {
    const currentInfo = await stat(resolved.absolutePath);
    throw new FyluneError("CONTENT_CONFLICT", "The document changed on disk before Fylune could save it.", {
      currentHash,
      mtimeMs: currentInfo.mtimeMs,
    });
  }

  await draftStore.save(root, resolved.relativePath, content, expectedHash);
  const snapshot = before == null
    ? null
    : await snapshotStore.create(root, resolved.relativePath, before, "before-fylune-save");

  try {
    const beforeInfo = before == null ? null : await stat(resolved.absolutePath);
    await mkdir(path.dirname(resolved.absolutePath), { recursive: true });
    await writeFileAtomic(resolved.absolutePath, content, {
      encoding: "utf8",
      fsync: true,
      ...(beforeInfo ? { mode: beforeInfo.mode } : {}),
    });
  } catch (error) {
    throw new FyluneError("SAVE_FAILED", "The draft is safe, but Fylune could not write the document.", {
      reason: error?.code ?? "UNKNOWN",
    });
  }

  const savedHash = sha256(content);
  onWrite?.(resolved.absolutePath, savedHash, { snapshotId: snapshot?.id ?? null });
  await draftStore.clear(root, resolved.relativePath);
  const afterInfo = await stat(resolved.absolutePath);
  return {
    path: resolved.relativePath,
    hash: savedHash,
    mtimeMs: afterInfo.mtimeMs,
    snapshotId: snapshot?.id ?? null,
  };
}

function validateWorkspaceFileName(relativePath, name, { keepExtension = true } = {}) {
  const normalized = String(name ?? "").trim();
  if (!normalized || normalized === "." || normalized === ".." || normalized.includes("\0") || /[\\/]/.test(normalized)) {
    throw new FyluneError("INVALID_FILE_NAME", "Use a file name without folders or path separators.");
  }
  if (Buffer.byteLength(normalized, "utf8") > 255) {
    throw new FyluneError("INVALID_FILE_NAME", "The file name is too long.");
  }
  if (keepExtension && path.extname(normalized).toLowerCase() !== path.extname(relativePath).toLowerCase()) {
    throw new FyluneError("INVALID_FILE_NAME", "Keep the existing file extension when renaming this file.");
  }
  return normalized;
}

async function workspaceEntryForMutation(root, relativePath, expectedMtimeMs, { allowDirectory = false } = {}) {
  if (isTechnicalPath(relativePath)) {
    throw new FyluneError("UNSUPPORTED_FILE", "Fylune cannot manage technical project folders.");
  }
  const resolved = await resolveProjectPath(root, relativePath);
  const info = await stat(resolved.absolutePath);
  const supportedFile = info.isFile() && workspaceFileType(relativePath);
  const supportedDirectory = allowDirectory && info.isDirectory();
  if (!supportedFile && !supportedDirectory) {
    throw new FyluneError("UNSUPPORTED_FILE", allowDirectory
      ? "Fylune can manage project folders, Markdown, image, video, and PDF files only."
      : "Fylune can manage Markdown, image, video, and PDF project files only.");
  }
  if (expectedMtimeMs !== undefined && Math.abs(info.mtimeMs - expectedMtimeMs) > 0.5) {
    throw new FyluneError("CONTENT_CONFLICT", "The selected item changed on disk before Fylune could update it.", {
      mtimeMs: info.mtimeMs,
    });
  }
  return { ...resolved, info };
}

async function ensureDestinationIsAvailable(root, relativePath) {
  const destination = await resolveProjectPath(root, relativePath, { allowMissing: true });
  try {
    await access(destination.absolutePath);
  } catch (error) {
    if (error?.code === "ENOENT") return destination;
    throw error;
  }
  throw new FyluneError("FILE_EXISTS", "A file with that name already exists in this folder.");
}

export async function renameWorkspaceFile({ root, relativePath, name, expectedMtimeMs }) {
  const source = await workspaceEntryForMutation(root, relativePath, expectedMtimeMs, { allowDirectory: true });
  const nextName = validateWorkspaceFileName(source.relativePath, name, { keepExtension: !source.info.isDirectory() });
  const parent = path.posix.dirname(source.relativePath);
  const nextPath = parent === "." ? nextName : `${parent}/${nextName}`;
  if (nextPath === source.relativePath) {
    return { previousPath: source.relativePath, path: source.relativePath, name: nextName, mtimeMs: source.info.mtimeMs };
  }
  const destination = await ensureDestinationIsAvailable(root, nextPath);
  await rename(source.absolutePath, destination.absolutePath);
  const info = await stat(destination.absolutePath);
  return { previousPath: source.relativePath, path: destination.relativePath, name: nextName, mtimeMs: info.mtimeMs };
}

export async function duplicateWorkspaceFile({ root, relativePath, expectedMtimeMs }) {
  const source = await workspaceEntryForMutation(root, relativePath, expectedMtimeMs, { allowDirectory: true });
  const extension = source.info.isDirectory() ? "" : path.posix.extname(source.relativePath);
  const baseName = path.posix.basename(source.relativePath, extension);
  const parent = path.posix.dirname(source.relativePath);

  for (let attempt = 1; attempt <= MAX_DUPLICATE_ATTEMPTS; attempt += 1) {
    const suffix = attempt === 1 ? " copy" : ` copy ${attempt}`;
    const name = `${baseName}${suffix}${extension}`;
    const nextPath = parent === "." ? name : `${parent}/${name}`;
    const destination = await resolveProjectPath(root, nextPath, { allowMissing: true });
    try {
      if (source.info.isDirectory()) {
        await cp(source.absolutePath, destination.absolutePath, {
          recursive: true,
          force: false,
          errorOnExist: true,
          preserveTimestamps: true,
          filter: (entryPath) => {
            const relativeEntry = path.relative(source.absolutePath, entryPath);
            return !relativeEntry || !isTechnicalPath(relativeEntry);
          },
        });
      } else {
        await copyFile(source.absolutePath, destination.absolutePath, constants.COPYFILE_EXCL);
      }
      const info = await stat(destination.absolutePath);
      return {
        sourcePath: source.relativePath,
        path: destination.relativePath,
        name,
        kind: source.info.isDirectory() ? "directory" : "file",
        mtimeMs: info.mtimeMs,
      };
    } catch (error) {
      if (!new Set(["EEXIST", "ERR_FS_CP_EEXIST"]).has(error?.code)) throw error;
    }
  }

  throw new FyluneError("FILE_EXISTS", "Fylune could not find an available name for the copy.");
}

export async function trashWorkspaceFile({ root, relativePath, expectedMtimeMs, trashItem }) {
  const source = await workspaceEntryForMutation(root, relativePath, expectedMtimeMs, { allowDirectory: true });
  if (typeof trashItem !== "function") throw new TypeError("A trash function is required.");
  await trashItem(source.absolutePath);
  return {
    path: source.relativePath,
    name: path.posix.basename(source.relativePath),
    kind: source.info.isDirectory() ? "directory" : "file",
    trashed: true,
  };
}

export async function removeFileIfPresent(filePath) {
  try {
    await unlink(filePath);
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
  }
}
