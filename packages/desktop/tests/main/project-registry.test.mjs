import os from "node:os";
import path from "node:path";
import { mkdtemp, mkdir, readFile, realpath, rm } from "node:fs/promises";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

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
});
