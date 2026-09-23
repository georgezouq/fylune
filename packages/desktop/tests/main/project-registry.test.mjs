import os from "node:os";
import path from "node:path";
import { mkdirSync } from "node:fs";
import { mkdtemp, mkdir, readFile, realpath, rm, writeFile } from "node:fs/promises";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ProjectRegistry } from "../../electron/lib/project-registry.mjs";

describe("recent project registry", () => {
  let sandbox;
  let statePath;
  let firstRoot;
  let secondRoot;

  beforeEach(async () => {
    sandbox = await mkdtemp(path.join(os.tmpdir(), "fylune-project-registry-"));
    statePath = path.join(sandbox, "user-data", "recent-projects.json");
    firstRoot = path.join(sandbox, "First project");
    secondRoot = path.join(sandbox, "Second project");
    await mkdir(firstRoot);
    await mkdir(secondRoot);
    firstRoot = await realpath(firstRoot);
    secondRoot = await realpath(secondRoot);
  });

  afterEach(async () => {
    await rm(sandbox, { recursive: true, force: true });
  });

  it("persists a deduplicated most-recent-first project list across launches", async () => {
    const registry = new ProjectRegistry({ filePath: statePath });
    await registry.initialize();
    const first = await registry.add(firstRoot);
    const second = await registry.add(secondRoot);
    const reopenedFirst = await registry.add(firstRoot);

    expect(reopenedFirst.id).toBe(first.id);
    expect(registry.listRecent().map((project) => project.projectId)).toEqual([first.id, second.id]);
    expect(registry.listRecent().map((project) => project.path)).toEqual([firstRoot, secondRoot]);

    const restored = new ProjectRegistry({ filePath: statePath });
    await restored.initialize();
    expect(restored.listRecent()).toMatchObject([
      { projectId: first.id, name: "First project", path: firstRoot },
      { projectId: second.id, name: "Second project", path: secondRoot },
    ]);
    expect(JSON.parse(await readFile(statePath, "utf8"))).toMatchObject({ version: 1 });
  });

  it("reopens a saved project and removes a path that no longer exists", async () => {
    const registry = new ProjectRegistry({ filePath: statePath });
    await registry.initialize();
    const project = await registry.add(firstRoot);

    await expect(registry.reopen(project.id)).resolves.toMatchObject({ id: project.id, root: firstRoot });
    await rm(firstRoot, { recursive: true, force: true });
    await expect(registry.reopen(project.id)).rejects.toMatchObject({ code: "RECENT_PROJECT_MISSING" });
    expect(registry.listRecent()).toEqual([]);

    const restored = new ProjectRegistry({ filePath: statePath });
    await restored.initialize();
    expect(restored.listRecent()).toEqual([]);
  });

  it("keeps an externally opened file available without persisting its parent as a workspace", async () => {
    const filePath = path.join(firstRoot, "settings.json");
    await writeFile(filePath, '{"theme":"dark"}\n');
    const registry = new ProjectRegistry({ filePath: statePath });
    const saved = await registry.add(secondRoot);

    const project = await registry.addExternalFile(filePath);

    expect(registry.get(project.id)).toMatchObject({ root: firstRoot, externalFile: filePath, ephemeral: true });
    expect(registry.listRecent()).toMatchObject([{ projectId: saved.id, path: secondRoot }]);
    expect(JSON.parse(await readFile(statePath, "utf8")).projects).toMatchObject([{ id: saved.id, root: secondRoot }]);
  });

  it("restores sandbox access before filesystem checks, keeps bookmarks private, and releases access", async () => {
    const registry = new ProjectRegistry({ filePath: statePath });
    const project = await registry.add(firstRoot, "saved-bookmark");
    await rm(firstRoot, { recursive: true });
    const stop = vi.fn();
    const startAccessing = vi.fn(() => {
      // Model a directory that is unavailable until its bookmark is activated.
      mkdirSync(firstRoot);
      return stop;
    });
    const restored = new ProjectRegistry({ filePath: statePath, startAccessing });
    await restored.initialize();
    expect(startAccessing).not.toHaveBeenCalled();
    await expect(restored.reopen(project.id)).resolves.toMatchObject({ root: firstRoot });
    restored.get(project.id);
    await restored.reopen(project.id);
    expect(startAccessing).toHaveBeenCalledExactlyOnceWith("saved-bookmark");
    expect(restored.list()[0]).not.toHaveProperty("bookmark");
    expect(restored.listRecent()[0]).not.toHaveProperty("bookmark");
    expect(JSON.parse(await readFile(statePath, "utf8")).projects[0].bookmark).toBe("saved-bookmark");
    restored.dispose();
    restored.dispose();
    expect(stop).toHaveBeenCalledTimes(1);
  });

  it("refreshes reselected permissions, preserves legacy entries, and releases removed or evicted scopes", async () => {
    const stops = [vi.fn(), vi.fn(), vi.fn()];
    const startAccessing = vi.fn()
      .mockReturnValueOnce(stops[0])
      .mockReturnValueOnce(stops[1])
      .mockReturnValueOnce(stops[2]);
    const registry = new ProjectRegistry({ filePath: statePath, startAccessing, limit: 1 });
    const first = await registry.add(firstRoot);
    registry.get(first.id);
    expect(startAccessing).not.toHaveBeenCalled();
    await registry.add(firstRoot, "old");
    registry.get(first.id);
    await registry.add(firstRoot, "fresh");
    expect(stops[0]).toHaveBeenCalledTimes(1);
    registry.get(first.id);
    await registry.add(firstRoot);
    expect(registry.get(first.id).bookmark).toBe("fresh");
    const second = await registry.add(secondRoot, "second");
    expect(stops[1]).toHaveBeenCalledTimes(1);
    registry.get(second.id);
    await registry.remove(second.id);
    registry.dispose();
    expect(stops[2]).toHaveBeenCalledTimes(1);
  });

  it("does not discard a recent project when a bookmark cannot be restored", async () => {
    const registry = new ProjectRegistry({ startAccessing: () => { throw new Error("Access denied"); } });
    const project = await registry.add(firstRoot, "expired");
    await expect(registry.reopen(project.id)).rejects.toThrow("Access denied");
    expect(registry.listRecent()).toHaveLength(1);
  });
});
