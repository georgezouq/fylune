import os from "node:os";
import path from "node:path";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { sha256 } from "../../electron/lib/hash.mjs";
import {
  createBlockDiff,
  DraftStore,
  restoreSnapshot,
  SnapshotStore,
} from "../../electron/lib/local-history.mjs";

describe("local snapshots", () => {
  let sandbox;
  let root;
  let snapshotStore;
  let draftStore;

  beforeEach(async () => {
    sandbox = await mkdtemp(path.join(os.tmpdir(), "fylune-snapshots-"));
    root = path.join(sandbox, "project");
    await mkdir(root, { recursive: true });
    await writeFile(path.join(root, "plan.mdx"), "current");
    snapshotStore = new SnapshotStore(path.join(sandbox, "support"));
    draftStore = new DraftStore(path.join(sandbox, "support"));
  });

  afterEach(async () => {
    await rm(sandbox, { recursive: true, force: true });
  });

  it("lists metadata without exposing content and makes restore undoable", async () => {
    const target = await snapshotStore.create(root, "plan.mdx", "older version", "before-external-update");
    const list = await snapshotStore.list(root, "plan.mdx");

    expect(list[0]).toMatchObject({ id: target.id, hash: sha256("older version") });
    expect(list[0]).not.toHaveProperty("content");

    await restoreSnapshot({
      root,
      relativePath: "plan.mdx",
      snapshotId: target.id,
      expectedHash: sha256("current"),
      snapshotStore,
      draftStore,
    });

    expect(await readFile(path.join(root, "plan.mdx"), "utf8")).toBe("older version");
    expect(await snapshotStore.list(root, "plan.mdx")).toEqual(expect.arrayContaining([
      expect.objectContaining({ hash: sha256("current"), source: "before-snapshot-restore" }),
    ]));
  });

  it("summarizes real paragraph changes and returns a content-safe preview on demand", async () => {
    const previous = "# Plan\n\nKeep local files.\n\nRemove this paragraph.";
    const current = "# Plan\n\nKeep local files.\n\nAdd this paragraph.";
    const target = await snapshotStore.create(root, "plan.mdx", previous, "before-fylune-save");

    const list = await snapshotStore.list(root, "plan.mdx", current);
    expect(list[0]).toMatchObject({
      id: target.id,
      changes: { added: 1, removed: 1 },
    });
    expect(list[0]).not.toHaveProperty("content");

    const preview = await snapshotStore.preview(root, "plan.mdx", target.id, current);
    expect(preview.content).toBe(previous);
    expect(preview.changes.summary).toEqual({ added: 1, removed: 1 });
    expect(preview.changes.segments).toEqual(expect.arrayContaining([
      expect.objectContaining({ type: "removed", content: "Remove this paragraph." }),
      expect.objectContaining({ type: "added", content: "Add this paragraph." }),
    ]));
  });

  it("bounds large diffs while preserving the changed middle", () => {
    const before = Array.from({ length: 401 }, (_, index) => `Before ${index}`).join("\n\n");
    const after = Array.from({ length: 401 }, (_, index) => `After ${index}`).join("\n\n");
    const diff = createBlockDiff(before, after);

    expect(diff.summary).toEqual({ added: 401, removed: 401 });
    expect(diff.segments).toHaveLength(2);
  });
});
