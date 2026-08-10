import os from "node:os";
import path from "node:path";
import { mkdtemp, mkdir, readFile, realpath, rm, writeFile } from "node:fs/promises";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { saveDocument } from "../../electron/lib/file-engine.mjs";
import { sha256 } from "../../electron/lib/hash.mjs";
import { DraftStore, SnapshotStore } from "../../electron/lib/local-history.mjs";

describe("atomic document saves", () => {
  let sandbox;
  let root;
  let userData;
  let draftStore;
  let snapshotStore;

  beforeEach(async () => {
    sandbox = await mkdtemp(path.join(os.tmpdir(), "fylune-save-"));
    root = path.join(sandbox, "project");
    userData = path.join(sandbox, "support");
    await mkdir(root, { recursive: true });
    await writeFile(path.join(root, "brief.md"), "before");
    draftStore = new DraftStore(userData);
    snapshotStore = new SnapshotStore(userData);
  });

  afterEach(async () => {
    await rm(sandbox, { recursive: true, force: true });
  });

  it("snapshots, atomically writes, marks the self-write, then clears the draft", async () => {
    const onWrite = vi.fn();
    const result = await saveDocument({
      root,
      relativePath: "brief.md",
      content: "after",
      expectedHash: sha256("before"),
      snapshotStore,
      draftStore,
      onWrite,
    });

    expect(await readFile(path.join(root, "brief.md"), "utf8")).toBe("after");
    expect(result.hash).toBe(sha256("after"));
    expect(onWrite).toHaveBeenCalledWith(
      path.join(await realpath(root), "brief.md"),
      sha256("after"),
      { snapshotId: result.snapshotId },
    );
    expect(await draftStore.load(root, "brief.md")).toBeNull();
    expect(await snapshotStore.list(root, "brief.md")).toEqual([
      expect.objectContaining({ hash: sha256("before"), source: "before-fylune-save" }),
    ]);
  });

  it("rejects a stale expected hash without changing the file", async () => {
    await expect(saveDocument({
      root,
      relativePath: "brief.md",
      content: "unsafe overwrite",
      expectedHash: "0".repeat(64),
      snapshotStore,
      draftStore,
    })).rejects.toMatchObject({ code: "CONTENT_CONFLICT" });

    expect(await readFile(path.join(root, "brief.md"), "utf8")).toBe("before");
    expect(await snapshotStore.list(root, "brief.md")).toEqual([]);
  });

  it("creates a new document only when no base hash is supplied", async () => {
    const result = await saveDocument({
      root,
      relativePath: "Product/new-note.mdx",
      content: "# New note\n",
      expectedHash: null,
      snapshotStore,
      draftStore,
    });

    expect(await readFile(path.join(root, "Product/new-note.mdx"), "utf8")).toBe("# New note\n");
    expect(result.hash).toBe(sha256("# New note\n"));
  });
});
