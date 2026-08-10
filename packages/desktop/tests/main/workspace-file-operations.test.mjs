import os from "node:os";
import path from "node:path";
import { access, mkdtemp, mkdir, readFile, realpath, rm, stat, writeFile } from "node:fs/promises";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  duplicateWorkspaceFile,
  renameWorkspaceFile,
  trashWorkspaceFile,
} from "../../electron/lib/file-engine.mjs";

describe("workspace file operations", () => {
  let sandbox;
  let root;

  beforeEach(async () => {
    sandbox = await mkdtemp(path.join(os.tmpdir(), "fylune-files-"));
    root = path.join(sandbox, "project");
    await mkdir(path.join(root, "docs"), { recursive: true });
    await writeFile(path.join(root, "docs", "brief.md"), "# Brief\n");
  });

  afterEach(async () => {
    await rm(sandbox, { recursive: true, force: true });
  });

  it("renames a current file without overwriting another file", async () => {
    const before = await stat(path.join(root, "docs", "brief.md"));
    const result = await renameWorkspaceFile({
      root,
      relativePath: "docs/brief.md",
      name: "plan.md",
      expectedMtimeMs: before.mtimeMs,
    });

    expect(result).toMatchObject({ previousPath: "docs/brief.md", path: "docs/plan.md", name: "plan.md" });
    expect(await readFile(path.join(root, "docs", "plan.md"), "utf8")).toBe("# Brief\n");

    await writeFile(path.join(root, "docs", "existing.md"), "existing");
    await expect(renameWorkspaceFile({
      root,
      relativePath: "docs/plan.md",
      name: "existing.md",
      expectedMtimeMs: result.mtimeMs,
    })).rejects.toMatchObject({ code: "FILE_EXISTS" });
  });

  it("rejects stale or extension-changing renames", async () => {
    const before = await stat(path.join(root, "docs", "brief.md"));
    await expect(renameWorkspaceFile({
      root,
      relativePath: "docs/brief.md",
      name: "brief.txt",
      expectedMtimeMs: before.mtimeMs,
    })).rejects.toMatchObject({ code: "INVALID_FILE_NAME" });
    await expect(renameWorkspaceFile({
      root,
      relativePath: "docs/brief.md",
      name: "plan.md",
      expectedMtimeMs: before.mtimeMs - 1000,
    })).rejects.toMatchObject({ code: "CONTENT_CONFLICT" });
  });

  it("renames a folder and preserves all nested files", async () => {
    await mkdir(path.join(root, "docs", "nested"), { recursive: true });
    await writeFile(path.join(root, "docs", "nested", "notes.md"), "# Notes\n");
    const before = await stat(path.join(root, "docs"));

    const result = await renameWorkspaceFile({
      root,
      relativePath: "docs",
      name: "Product notes",
      expectedMtimeMs: before.mtimeMs,
    });

    expect(result).toMatchObject({ previousPath: "docs", path: "Product notes", name: "Product notes" });
    expect(await readFile(path.join(root, "Product notes", "brief.md"), "utf8")).toBe("# Brief\n");
    expect(await readFile(path.join(root, "Product notes", "nested", "notes.md"), "utf8")).toBe("# Notes\n");
    await expect(access(path.join(root, "docs"))).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("creates collision-safe copies beside the original", async () => {
    const before = await stat(path.join(root, "docs", "brief.md"));
    const first = await duplicateWorkspaceFile({ root, relativePath: "docs/brief.md", expectedMtimeMs: before.mtimeMs });
    const second = await duplicateWorkspaceFile({ root, relativePath: "docs/brief.md", expectedMtimeMs: before.mtimeMs });

    expect(first.path).toBe("docs/brief copy.md");
    expect(second.path).toBe("docs/brief copy 2.md");
    expect(await readFile(path.join(root, first.path), "utf8")).toBe("# Brief\n");
  });

  it("creates collision-safe recursive copies of project folders", async () => {
    await mkdir(path.join(root, "docs", "nested"), { recursive: true });
    await mkdir(path.join(root, "docs", "node_modules", "ignored"), { recursive: true });
    await writeFile(path.join(root, "docs", "nested", "notes.md"), "# Notes\n");
    await writeFile(path.join(root, "docs", "node_modules", "ignored", "cache.txt"), "ignored");
    const before = await stat(path.join(root, "docs"));

    const first = await duplicateWorkspaceFile({ root, relativePath: "docs", expectedMtimeMs: before.mtimeMs });
    const second = await duplicateWorkspaceFile({ root, relativePath: "docs", expectedMtimeMs: before.mtimeMs });

    expect(first).toMatchObject({ path: "docs copy", name: "docs copy", kind: "directory" });
    expect(second.path).toBe("docs copy 2");
    expect(await readFile(path.join(root, "docs copy", "nested", "notes.md"), "utf8")).toBe("# Notes\n");
    await expect(access(path.join(root, "docs copy", "node_modules"))).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("validates the current file before moving it to Trash", async () => {
    const before = await stat(path.join(root, "docs", "brief.md"));
    const trashItem = vi.fn().mockResolvedValue(undefined);
    await expect(trashWorkspaceFile({
      root,
      relativePath: "docs/brief.md",
      expectedMtimeMs: before.mtimeMs,
      trashItem,
    })).resolves.toMatchObject({ path: "docs/brief.md", trashed: true });
    expect(trashItem).toHaveBeenCalledWith(path.join(await realpath(root), "docs", "brief.md"));
  });

  it("validates a project folder before moving it to Trash", async () => {
    const before = await stat(path.join(root, "docs"));
    const trashItem = vi.fn().mockResolvedValue(undefined);

    await expect(trashWorkspaceFile({
      root,
      relativePath: "docs",
      expectedMtimeMs: before.mtimeMs,
      trashItem,
    })).resolves.toMatchObject({ path: "docs", kind: "directory", trashed: true });
    expect(trashItem).toHaveBeenCalledWith(path.join(await realpath(root), "docs"));
  });
});
