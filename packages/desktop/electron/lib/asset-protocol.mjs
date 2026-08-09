import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { Readable } from "node:stream";

import { assetTypeForPath } from "./assets.mjs";
import { resolveProjectPath } from "./path-security.mjs";

export const ASSET_PROTOCOL = "fylune-asset";

export function assetPreviewUrl(projectId, relativePath) {
  const encodedPath = relativePath.split("/").map(encodeURIComponent).join("/");
  return `${ASSET_PROTOCOL}://project/${encodeURIComponent(projectId)}/${encodedPath}`;
}

export function parseByteRange(value, size) {
  if (!value) return null;
  const match = /^bytes=(\d*)-(\d*)$/.exec(value.trim());
  if (!match || (!match[1] && !match[2]) || size <= 0) return { unsatisfiable: true };

  let start;
  let end;
  if (!match[1]) {
    const suffixLength = Number(match[2]);
    if (!Number.isSafeInteger(suffixLength) || suffixLength <= 0) return { unsatisfiable: true };
    start = Math.max(0, size - suffixLength);
    end = size - 1;
  } else {
    start = Number(match[1]);
    end = match[2] ? Number(match[2]) : size - 1;
    if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start > end || start >= size) {
      return { unsatisfiable: true };
    }
    end = Math.min(end, size - 1);
  }
  return { start, end };
}

function decodeAssetRequest(requestUrl) {
  const url = new URL(requestUrl);
  if (url.protocol !== `${ASSET_PROTOCOL}:` || url.hostname !== "project") throw new Error("Invalid asset URL");
  const segments = url.pathname.split("/").filter(Boolean).map(decodeURIComponent);
  if (segments.length < 2) throw new Error("Invalid asset URL");
  return { projectId: segments[0], relativePath: segments.slice(1).join("/") };
}

export async function createAssetProtocolResponse(request, registry) {
  if (!new Set(["GET", "HEAD"]).has(request.method)) return new Response(null, { status: 405 });

  try {
    const { projectId, relativePath } = decodeAssetRequest(request.url);
    const type = assetTypeForPath(relativePath);
    if (!type || type.legacy) return new Response("Unsupported preview type", { status: 415 });

    const project = registry.get(projectId);
    const resolved = await resolveProjectPath(project.root, relativePath);
    const info = await stat(resolved.absolutePath);
    if (!info.isFile()) return new Response("File not found", { status: 404 });

    const range = parseByteRange(request.headers.get("range"), info.size);
    if (range?.unsatisfiable) {
      return new Response(null, { status: 416, headers: { "Content-Range": `bytes */${info.size}` } });
    }

    const start = range?.start ?? 0;
    const end = range?.end ?? Math.max(0, info.size - 1);
    const contentLength = info.size === 0 ? 0 : end - start + 1;
    const headers = new Headers({
      "Accept-Ranges": "bytes",
      "Access-Control-Allow-Origin": "*",
      "Cache-Control": "private, max-age=0, must-revalidate",
      "Content-Length": String(contentLength),
      "Content-Type": type.mimeType,
      "Cross-Origin-Resource-Policy": "cross-origin",
    });
    if (range) headers.set("Content-Range", `bytes ${start}-${end}/${info.size}`);

    if (request.method === "HEAD" || info.size === 0) {
      return new Response(null, { status: range ? 206 : 200, headers });
    }
    const body = Readable.toWeb(createReadStream(resolved.absolutePath, { start, end }));
    return new Response(body, { status: range ? 206 : 200, headers });
  } catch {
    return new Response("File not found", { status: 404 });
  }
}

export function registerAssetProtocol(protocol, registry) {
  protocol.handle(ASSET_PROTOCOL, (request) => createAssetProtocolResponse(request, registry));
  return () => protocol.unhandle(ASSET_PROTOCOL);
}
