import path from "node:path";
import { constants } from "node:fs";
import { copyFile, mkdir, realpath, stat } from "node:fs/promises";

import { FyluneError } from "./errors.mjs";
import { isWithin, resolveProjectPath } from "./path-security.mjs";

const MEBIBYTE = 1024 * 1024;

export const ASSET_TYPES = new Map([
  [".png", { kind: "image", mimeType: "image/png", maxBytes: 50 * MEBIBYTE }],
  [".jpg", { kind: "image", mimeType: "image/jpeg", maxBytes: 50 * MEBIBYTE }],
  [".jpeg", { kind: "image", mimeType: "image/jpeg", maxBytes: 50 * MEBIBYTE }],
  [".webp", { kind: "image", mimeType: "image/webp", maxBytes: 50 * MEBIBYTE }],
  [".gif", { kind: "image", mimeType: "image/gif", maxBytes: 50 * MEBIBYTE }],
  [".mp4", { kind: "video", mimeType: "video/mp4", maxBytes: 4 * 1024 * MEBIBYTE }],
  [".m4v", { kind: "video", mimeType: "video/x-m4v", maxBytes: 4 * 1024 * MEBIBYTE }],
  [".mov", { kind: "video", mimeType: "video/quicktime", maxBytes: 4 * 1024 * MEBIBYTE }],
  [".webm", { kind: "video", mimeType: "video/webm", maxBytes: 4 * 1024 * MEBIBYTE }],
  [".pdf", { kind: "pdf", mimeType: "application/pdf", maxBytes: 250 * MEBIBYTE }],
  [".docx", {
    kind: "word",
    mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    maxBytes: 100 * MEBIBYTE,
    readable: true,
  }],
  [".xlsx", {
    kind: "excel",
    mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    maxBytes: 100 * MEBIBYTE,
    readable: true,
    editable: true,
  }],
  [".pptx", {
    kind: "powerpoint",
    mimeType: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    maxBytes: 250 * MEBIBYTE,
    readable: true,
  }],
  // Word 97-2003 and its siblings are binary formats no browser can parse. Fylune
  // still recognises them so the library shows the right icon and the preview can
  // explain the one real recovery: open the file in the app that owns it.
  [".doc", { kind: "word", mimeType: "application/msword", maxBytes: 100 * MEBIBYTE, legacy: true }],
  [".xls", { kind: "excel", mimeType: "application/vnd.ms-excel", maxBytes: 100 * MEBIBYTE, legacy: true }],
  [".ppt", { kind: "powerpoint", mimeType: "application/vnd.ms-powerpoint", maxBytes: 250 * MEBIBYTE, legacy: true }],
]);

export function assetTypeForPath(filePath) {
  return ASSET_TYPES.get(path.extname(filePath).toLowerCase()) ?? null;
}

/**
 * Asset types the renderer may pull into memory as bytes. Streaming an asset over
 * `fylune-asset://` is enough for images, video, and PDF; Office documents have to
 * be parsed, so they travel through the explicit read channel instead.
 */
export function readableAssetTypeForPath(filePath) {
  const type = assetTypeForPath(filePath);
  if (!type || type.legacy) return null;
  return type.kind === "pdf" || type.readable ? type : null;
}

export function editableAssetTypeForPath(filePath) {
  const type = assetTypeForPath(filePath);
  return type?.editable && !type.legacy ? type : null;
}

export function slugifyDocument(documentPath) {
  const basename = path.posix.basename(documentPath, path.posix.extname(documentPath));
  const slug = basename
    .normalize("NFKD")
    .replace(/\p{Mark}+/gu, "")
    .toLocaleLowerCase("en-US")
    .replace(/[^\p{Letter}\p{Number}]+/gu, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
  return slug || "document";
}

export function createAssetFilename(sourcePath, suffix = "") {
  const extension = path.extname(sourcePath).toLowerCase();
  const type = assetTypeForPath(sourcePath);
  if (!type) {
    throw new FyluneError("UNSUPPORTED_ASSET", "Add an image, video, PDF, Word, Excel, or PowerPoint file.");
  }

  const originalStem = path.basename(sourcePath, path.extname(sourcePath));
  const stem = originalStem
    .normalize("NFKC")
    .replace(/[\p{Cc}<>:"/\\|?*]+/gu, "-")
    .replace(/\s+/g, " ")
    .replace(/^[.\s-]+|[.\s-]+$/g, "")
    .slice(0, 120) || type.kind;
  const normalizedExtension = extension === ".jpeg" ? ".jpg" : extension;
  return `${stem}${suffix ? `-${suffix}` : ""}${normalizedExtension}`;
}

function encodeRelativeUrl(relativePath) {
  return relativePath
    .split("/")
    .map((segment) => (segment === ".." || segment === "." ? segment : encodeURIComponent(segment)))
    .join("/");
}

function markdownForAsset({ kind, filename, markdownUrl }) {
  const label = path.basename(filename, path.extname(filename));
  if (kind === "image") return `![${label}](${markdownUrl})`;
  return `[${filename}](${markdownUrl})`;
}

export async function importAsset({ root, documentPath, sourcePath }) {
  const document = await resolveProjectPath(root, documentPath);
  const documentInfo = await stat(document.absolutePath);
  if (!documentInfo.isFile()) throw new FyluneError("UNSUPPORTED_FILE", "Choose a document before adding a file.");

  const sourceInfo = await stat(sourcePath);
  if (!sourceInfo.isFile()) throw new FyluneError("UNSUPPORTED_ASSET", "The dropped item is not a file.");

  const type = assetTypeForPath(sourcePath);
  if (!type) throw new FyluneError("UNSUPPORTED_ASSET", "Add a PNG, JPEG, WebP, GIF, MP4, MOV, WebM, or PDF file.");
  if (sourceInfo.size > type.maxBytes) {
    const limit = Math.round(type.maxBytes / MEBIBYTE);
    throw new FyluneError("ASSET_TOO_LARGE", `Choose a ${type.kind} file smaller than ${limit.toLocaleString("en-US")} MB.`);
  }

  const assetDirectory = await resolveProjectPath(root, "assets", { allowMissing: true });
  await mkdir(assetDirectory.absolutePath, { recursive: true });
  await resolveProjectPath(root, "assets");

  const canonicalSource = await realpath(sourcePath);
  let filename = createAssetFilename(sourcePath);
  let absoluteDestination = path.join(assetDirectory.absolutePath, filename);
  if (isWithin(assetDirectory.absolutePath, canonicalSource)) {
    filename = path.relative(assetDirectory.absolutePath, canonicalSource).split(path.sep).join("/");
    absoluteDestination = canonicalSource;
  } else {
    let attempt = 1;
    while (true) {
      try {
        await copyFile(canonicalSource, absoluteDestination, constants.COPYFILE_EXCL);
        break;
      } catch (error) {
        if (error?.code !== "EEXIST") throw error;
        attempt += 1;
        filename = createAssetFilename(sourcePath, String(attempt));
        absoluteDestination = path.join(assetDirectory.absolutePath, filename);
      }
    }
  }

  const assetPath = `assets/${filename}`;
  let markdownUrl = path.posix.relative(path.posix.dirname(document.relativePath), assetPath);
  if (!markdownUrl.startsWith(".")) markdownUrl = `./${markdownUrl}`;
  const encodedUrl = encodeRelativeUrl(markdownUrl);
  return {
    name: path.posix.basename(filename),
    path: assetPath,
    markdownUrl: encodedUrl,
    markdown: markdownForAsset({ kind: type.kind, filename: path.posix.basename(filename), markdownUrl: encodedUrl }),
    kind: type.kind,
    mimeType: type.mimeType,
    size: sourceInfo.size,
  };
}

export const importImage = importAsset;
