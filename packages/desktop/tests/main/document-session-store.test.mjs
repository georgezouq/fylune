import { mkdtemp, readFile, rm, stat } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { DocumentSessionStore } from "../../electron/lib/document-session-store.mjs";

describe("DocumentSessionStore", () => {
  let dataDir;

  afterEach(async () => {
    if (dataDir) await rm(dataDir, { recursive: true, force: true });
  });

  it("persists an exact Base outside the workspace and advances generation", async () => {
    dataDir = await mkdtemp(path.join(os.tmpdir(), "fylune-document-session-"));
    const root = "/tmp/example-workspace";
    const store = new DocumentSessionStore(dataDir);
    const first = await store.advance(root, "docs/plan.md", "# Plan\n");
    const second = await store.advance(root, "docs/plan.md", "# Plan\n\nReady.\n");

    expect(first.generation).toBe(1);
    expect(second.generation).toBe(2);
    expect(await store.load(root, "docs/plan.md")).toMatchObject({
      baseHash: second.baseHash,
      baseContent: "# Plan\n\nReady.\n",
      generation: 2,
    });
    expect(store.pathFor(root, "docs/plan.md").startsWith(dataDir)).toBe(true);
    if (process.platform !== "win32") {
      expect((await stat(store.pathFor(root, "docs/plan.md"))).mode & 0o777).toBe(0o600);
    }
    expect(await readFile(store.pathFor(root, "docs/plan.md"), "utf8"))
      .not.toContain(root);
  });
});
