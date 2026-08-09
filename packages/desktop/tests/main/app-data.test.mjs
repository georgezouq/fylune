import path from "node:path";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, it } from "vitest";

import {
  prepareFyluneDataDirectory,
  resolveFyluneDataPath,
} from "../../electron/lib/app-data.mjs";

describe("durable Fylune app data", () => {
  const sandboxes = [];

  afterEach(async () => {
    await Promise.all(sandboxes.splice(0).map((sandbox) => rm(sandbox, { recursive: true, force: true })));
  });

  it("resolves the application state directory outside the app bundle", () => {
    expect(resolveFyluneDataPath("/Users/fylune")).toBe(path.join("/Users/fylune", ".fylune"));
  });

  it("migrates durable state and browser preferences without overwriting the new location", async () => {
    const sandbox = await mkdtemp(path.join(tmpdir(), "fylune-app-data-"));
    sandboxes.push(sandbox);
    const legacyPath = path.join(sandbox, "legacy");
    const targetPath = path.join(sandbox, ".fylune");
    await mkdir(path.join(legacyPath, "drafts"), { recursive: true });
    await mkdir(path.join(legacyPath, "Local Storage"), { recursive: true });
    await mkdir(targetPath, { recursive: true });
    await writeFile(path.join(legacyPath, "recent-projects.json"), "legacy projects");
    await writeFile(path.join(legacyPath, "drafts", "draft.json"), "draft");
    await writeFile(path.join(legacyPath, "Local Storage", "leveldb"), "preferences");
    await writeFile(path.join(targetPath, "recent-projects.json"), "current projects");

    const result = await prepareFyluneDataDirectory({ legacyPath, targetPath });

    expect(result.migrated).toEqual([
      "drafts",
      path.join("session", "Local Storage"),
    ]);
    expect(await readFile(path.join(targetPath, "recent-projects.json"), "utf8")).toBe("current projects");
    expect(await readFile(path.join(targetPath, "drafts", "draft.json"), "utf8")).toBe("draft");
    expect(await readFile(path.join(targetPath, "session", "Local Storage", "leveldb"), "utf8")).toBe("preferences");
  });
});
