import os from "node:os";
import path from "node:path";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { assetPreviewUrl, createAssetProtocolResponse, parseByteRange } from "../../electron/lib/asset-protocol.mjs";

describe("asset preview protocol", () => {
  let sandbox;
  let root;
  const projectId = "11111111-1111-4111-8111-111111111111";

  beforeEach(async () => {
    sandbox = await mkdtemp(path.join(os.tmpdir(), "fylune-protocol-"));
    root = path.join(sandbox, "project");
    await mkdir(path.join(root, "assets"), { recursive: true });
    await mkdir(path.join(root, "docs", "product", "images"), { recursive: true });
    await writeFile(path.join(root, "assets", "clip.mp4"), "0123456789");
    await writeFile(path.join(root, "docs", "product", "images", "diagram.png"), "near-document-image");
  });

  afterEach(async () => {
    await rm(sandbox, { recursive: true, force: true });
  });

  it("parses complete, open, and suffix byte ranges", () => {
    expect(parseByteRange("bytes=2-5", 10)).toEqual({ start: 2, end: 5 });
    expect(parseByteRange("bytes=7-", 10)).toEqual({ start: 7, end: 9 });
    expect(parseByteRange("bytes=-3", 10)).toEqual({ start: 7, end: 9 });
    expect(parseByteRange("bytes=10-12", 10)).toEqual({ unsatisfiable: true });
  });

  it("streams project-scoped assets and honors video range requests", async () => {
    const registry = { get: (id) => id === projectId ? { root } : null };
    const request = new Request(assetPreviewUrl(projectId, "assets/clip.mp4"), { headers: { Range: "bytes=2-5" } });
    const response = await createAssetProtocolResponse(request, registry);

    expect(response.status).toBe(206);
    expect(response.headers.get("content-range")).toBe("bytes 2-5/10");
    expect(response.headers.get("content-type")).toBe("video/mp4");
    expect(response.headers.get("access-control-allow-origin")).toBe("*");
    expect(await response.text()).toBe("2345");
  });

  it("serves images stored next to a document after their relative path is resolved", async () => {
    const registry = { get: (id) => id === projectId ? { root } : null };
    const response = await createAssetProtocolResponse(new Request(assetPreviewUrl(projectId, "docs/product/images/diagram.png")), registry);

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("image/png");
    expect(await response.text()).toBe("near-document-image");
  });

  it("does not serve non-previewable or escaping paths", async () => {
    const registry = { get: () => ({ root }) };
    const unsupported = await createAssetProtocolResponse(new Request(assetPreviewUrl(projectId, "assets/secret.txt")), registry);
    const escaping = await createAssetProtocolResponse(new Request(`${assetPreviewUrl(projectId, "assets/clip.mp4")}/../../outside.pdf`), registry);

    expect(unsupported.status).toBe(415);
    expect(escaping.status).toBe(404);
  });
});
