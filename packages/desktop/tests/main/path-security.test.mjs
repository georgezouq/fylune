import os from "node:os";
import path from "node:path";
import { mkdtemp, mkdir, rm, symlink, writeFile } from "node:fs/promises";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { normalizeRelativePath, resolveProjectPath } from "../../electron/lib/path-security.mjs";

describe("project path security", () => {
  let sandbox;
  let root;

  beforeEach(async () => {
    sandbox = await mkdtemp(path.join(os.tmpdir(), "fylune-paths-"));
    root = path.join(sandbox, "project");
    await mkdir(root, { recursive: true });
    await writeFile(path.join(sandbox, "secret.md"), "secret");
    await symlink(path.join(sandbox, "secret.md"), path.join(root, "linked-secret.md"));
  });

  afterEach(async () => {
    await rm(sandbox, { recursive: true, force: true });
  });

  it.each(["../secret.md", "notes/../../secret.md", "/tmp/secret.md", "C:\\secret.md", "notes\\brief.md"])(
    "rejects traversal path %s",
    (candidate) => {
      expect(() => normalizeRelativePath(candidate)).toThrow();
    },
  );

  it("rejects symlinks that resolve outside the project", async () => {
    await expect(resolveProjectPath(root, "linked-secret.md")).rejects.toMatchObject({ code: "PATH_ESCAPE" });
  });

  it("allows a missing destination only when explicitly requested", async () => {
    await expect(resolveProjectPath(root, "assets/brief", { allowMissing: true })).resolves.toMatchObject({
      relativePath: "assets/brief",
    });
    await expect(resolveProjectPath(root, "assets/brief")).rejects.toMatchObject({ code: "FILE_NOT_FOUND" });
  });
});
