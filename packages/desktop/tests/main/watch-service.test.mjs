import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { sha256 } from "../../electron/lib/hash.mjs";
import { WatchService } from "../../electron/lib/watch-service.mjs";

async function waitFor(predicate, timeoutMs = 10_000) {
  const startedAt = Date.now();
  while (!predicate()) {
    if (Date.now() - startedAt >= timeoutMs) throw new Error("Timed out waiting for watcher event");
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
}

describe("workspace document watcher", () => {
  let root;
  let file;
  let snapshots;
  let changes;
  let service;
  let additionalRoots;

  beforeEach(async () => {
    root = await mkdtemp(path.join(os.tmpdir(), "fylune-watch-"));
    await mkdir(path.join(root, "docs"));
    file = path.join(root, "docs/plan.md");
    await writeFile(file, "# Plan\n\nBase\n");
    snapshots = { create: vi.fn(async (_root, relativePath, content) => ({
      id: "snapshot-before-external",
      path: relativePath,
      content,
    })) };
    changes = [];
    additionalRoots = [];
    service = new WatchService({
      snapshotStore: snapshots,
      debounceMs: 30,
      onChange: (change) => changes.push(change),
    });
    await service.watch({ id: "watch-project", root });
    if (process.platform === "win32") await new Promise((resolve) => setTimeout(resolve, 500));
  });

  afterEach(async () => {
    await service?.close();
    await rm(root, { recursive: true, force: true });
    await Promise.all(additionalRoots.map((directory) => rm(directory, { recursive: true, force: true })));
  });

  it("coalesces an external save storm without inventing an Agent source", async () => {
    await writeFile(file, "# Plan\n\nFirst\n");
    await writeFile(file, "# Plan\n\nFinal\n");
    await waitFor(() => changes.length === 1);

    expect(changes[0]).toMatchObject({
      projectId: "watch-project",
      path: "docs/plan.md",
      kind: "change",
      hash: sha256("# Plan\n\nFinal\n"),
      snapshotId: "snapshot-before-external",
    });
    expect(changes[0]).not.toHaveProperty("sourceKind");
    expect(changes[0]).not.toHaveProperty("sourceId");
    expect(snapshots.create).toHaveBeenCalledWith(
      root,
      "docs/plan.md",
      "# Plan\n\nBase\n",
      "before-external-update",
    );
  });

  it("suppresses a verified Fylune self-write but keeps the new baseline", async () => {
    const next = "# Plan\n\nSaved by Fylune\n";
    service.markSelfWrite(file, sha256(next));
    await writeFile(file, next);
    await new Promise((resolve) => setTimeout(resolve, 500));
    expect(changes).toEqual([]);

    await writeFile(file, `${await readFile(file, "utf8")}\nExternal\n`);
    await waitFor(() => changes.length === 1);
    expect(snapshots.create).toHaveBeenCalledWith(
      root,
      "docs/plan.md",
      next,
      "before-external-update",
    );
  });

  it("keeps only the active workspace subscribed", async () => {
    const nextRoot = await mkdtemp(path.join(os.tmpdir(), "fylune-watch-next-"));
    additionalRoots.push(nextRoot);
    const nextFile = path.join(nextRoot, "notes.md");
    await writeFile(nextFile, "# Notes\n\nBase\n");

    await service.watch({ id: "next-project", root: nextRoot });
    if (process.platform === "win32") await new Promise((resolve) => setTimeout(resolve, 500));
    await writeFile(file, "# Plan\n\nOld workspace changed\n");
    await writeFile(nextFile, "# Notes\n\nActive workspace changed\n");
    await waitFor(() => changes.length === 1);

    expect(changes[0]).toMatchObject({
      projectId: "next-project",
      path: "notes.md",
      kind: "change",
    });
  });
});
