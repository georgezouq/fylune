import os from "node:os";
import path from "node:path";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { assetTypeForPath, createAssetFilename, importAsset, slugifyDocument } from "../../electron/lib/assets.mjs";

describe("workspace assets", () => {
  let sandbox;
  let root;
  let source;

  beforeEach(async () => {
    sandbox = await mkdtemp(path.join(os.tmpdir(), "fylune-assets-"));
    root = path.join(sandbox, "project");
    await mkdir(path.join(root, "docs"), { recursive: true });
    await writeFile(path.join(root, "docs", "My Brief.mdx"), "# Brief");
    source = path.join(sandbox, "Launch cover.png");
    await writeFile(source, Buffer.from([0x89, 0x50, 0x4e, 0x47]));
  });

  afterEach(async () => {
    await rm(sandbox, { recursive: true, force: true });
  });

  it("keeps readable filenames and recognizes previewable file types", () => {
    expect(slugifyDocument("docs/My Brief.mdx")).toBe("my-brief");
    expect(createAssetFilename("Launch: cover.jpeg")).toBe("Launch- cover.jpg");
    expect(assetTypeForPath("demo.mov")).toMatchObject({ kind: "video", mimeType: "video/quicktime" });
    expect(assetTypeForPath("brief.pdf")).toMatchObject({ kind: "pdf", mimeType: "application/pdf" });
  });

  it("copies into the workspace-root assets directory and returns Markdown", async () => {
    const result = await importAsset({ root, documentPath: "docs/My Brief.mdx", sourcePath: source });

    expect(result).toMatchObject({
      name: "Launch cover.png",
      path: "assets/Launch cover.png",
      markdownUrl: "../assets/Launch%20cover.png",
      markdown: "![Launch cover](../assets/Launch%20cover.png)",
      kind: "image",
      mimeType: "image/png",
      size: 4,
    });
    expect(await readFile(path.join(root, result.path))).toEqual(Buffer.from([0x89, 0x50, 0x4e, 0x47]));
  });

  it("never overwrites a colliding filename", async () => {
    const first = await importAsset({ root, documentPath: "docs/My Brief.mdx", sourcePath: source });
    const second = await importAsset({ root, documentPath: "docs/My Brief.mdx", sourcePath: source });

    expect(second.path).not.toBe(first.path);
    expect(second.path).toBe("assets/Launch cover-2.png");
  });

  it("imports video and PDF files as ordinary Markdown links", async () => {
    const video = path.join(sandbox, "Walkthrough.mp4");
    const pdf = path.join(sandbox, "Research pack.pdf");
    await writeFile(video, "video");
    await writeFile(pdf, "%PDF-1.4");

    await expect(importAsset({ root, documentPath: "docs/My Brief.mdx", sourcePath: video })).resolves.toMatchObject({
      path: "assets/Walkthrough.mp4",
      kind: "video",
      markdown: "[Walkthrough.mp4](../assets/Walkthrough.mp4)",
    });
    await expect(importAsset({ root, documentPath: "docs/My Brief.mdx", sourcePath: pdf })).resolves.toMatchObject({
      path: "assets/Research pack.pdf",
      kind: "pdf",
      markdown: "[Research pack.pdf](../assets/Research%20pack.pdf)",
    });
  });

  it("rejects files outside the supported preview set", async () => {
    const text = path.join(sandbox, "notes.txt");
    await writeFile(text, "not supported");
    await expect(importAsset({ root, documentPath: "docs/My Brief.mdx", sourcePath: text })).rejects.toMatchObject({ code: "UNSUPPORTED_ASSET" });
  });
});
