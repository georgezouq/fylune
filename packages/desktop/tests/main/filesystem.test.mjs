import os from "node:os";
import path from "node:path";
import { mkdtemp, mkdir, rm, symlink, writeFile } from "node:fs/promises";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { readDocument, readDocumentPreview, scanProject } from "../../electron/lib/file-engine.mjs";
import { sha256 } from "../../electron/lib/hash.mjs";

describe("project filesystem", () => {
  let sandbox;
  let root;

  beforeEach(async () => {
    sandbox = await mkdtemp(path.join(os.tmpdir(), "fylune-files-"));
    root = path.join(sandbox, "project");
    await mkdir(path.join(root, "notes", "nested"), { recursive: true });
    await mkdir(path.join(root, "node_modules", "noise"), { recursive: true });
    await writeFile(path.join(root, "README.md"), "# Project\n");
    await writeFile(path.join(root, "notes", "brief.mdx"), '---\nicon: "🧪"\n---\n\n# Brief\n');
    await writeFile(path.join(root, "notes", "settings.json"), '{"theme":"dark"}\n');
    await writeFile(path.join(root, "notes", "events.jsonl"), '{"event":"open"}\n');
    await writeFile(path.join(root, "notes", "nested", "details.md"), "# Details\n");
    await writeFile(path.join(root, "notes", "ignored.txt"), "not a document");
    await writeFile(path.join(root, "notes", "cover.png"), "image");
    await writeFile(path.join(root, "notes", "walkthrough.mp4"), "video");
    await writeFile(path.join(root, "notes", "research.pdf"), "%PDF");
    await writeFile(path.join(root, "node_modules", "noise", "bad.md"), "hidden");
    await symlink(sandbox, path.join(root, "notes", "outside-link"));
  });

  afterEach(async () => {
    await rm(sandbox, { recursive: true, force: true });
  });

  it("returns only the first level by default", async () => {
    const tree = await scanProject(root);

    expect(tree).toMatchObject({ kind: "directory", path: "", loaded: true });
    expect(tree.children.map((entry) => entry.name)).toEqual(["notes", "README.md"]);
    expect(tree.children[0]).toMatchObject({ kind: "directory", path: "notes", loaded: false });
    expect(tree.children[0]).not.toHaveProperty("children");
  });

  it("loads one selected folder without walking its descendants", async () => {
    const tree = await scanProject(root, { relativePath: "notes" });

    expect(tree).toMatchObject({ kind: "directory", path: "notes", loaded: true });
    expect(tree.children.map((entry) => entry.name)).toEqual(["nested", "brief.mdx", "cover.png", "events.jsonl", "research.pdf", "settings.json", "walkthrough.mp4"]);
    expect(tree.children[0]).toMatchObject({ path: "notes/nested", loaded: false });
  });

  it("loads four preview items for unopened root folders", async () => {
    const tree = await scanProject(root, { folderPreviews: true });
    const notes = tree.children.find((entry) => entry.name === "notes");

    expect(notes).toMatchObject({ path: "notes", loaded: false, itemCount: 7 });
    expect(notes.previewChildren.map((entry) => entry.name)).toEqual([
      "nested",
      "brief.mdx",
      "cover.png",
      "events.jsonl",
    ]);
    expect(notes).not.toHaveProperty("children");
  });

  it("loads at most four preview items for each immediate child folder", async () => {
    for (const name of ["alpha.md", "beta.md", "gamma.md", "delta.md", "epsilon.md"]) {
      await writeFile(path.join(root, "notes", "nested", name), `# ${name}\n`);
    }

    const tree = await scanProject(root, { relativePath: "notes", folderPreviews: true });
    const nested = tree.children.find((entry) => entry.name === "nested");

    expect(nested).toMatchObject({ path: "notes/nested", loaded: false, itemCount: 6 });
    expect(nested.previewChildren.map((entry) => entry.name)).toEqual([
      "alpha.md",
      "beta.md",
      "delta.md",
      "details.md",
    ]);
    expect(nested).not.toHaveProperty("children");
  });

  it("returns a recursive tree while filtering technical paths", async () => {
    const tree = await scanProject(root, { recursive: true });

    expect(tree.kind).toBe("directory");
    expect(tree.children.map((entry) => entry.name)).toEqual(["notes", "README.md"]);
    expect(tree.children[0].children.map((entry) => entry.name)).toEqual(["nested", "brief.mdx", "cover.png", "events.jsonl", "research.pdf", "settings.json", "walkthrough.mp4"]);
    expect(tree.children[0].children.slice(1).map((entry) => entry.fileType)).toEqual(["document", "image", "document", "pdf", "document", "video"]);
    expect(tree.children[0].children[1].icon).toBe("🧪");
  });

  it("recursively returns documents only for the All documents view", async () => {
    const tree = await scanProject(root, { recursive: true, documentsOnly: true });

    expect(tree.children.map((entry) => entry.name)).toEqual(["notes", "README.md"]);
    expect(tree.children[0].children.map((entry) => entry.name)).toEqual(["nested", "brief.mdx", "events.jsonl", "settings.json"]);
    expect(tree.children[0].children[0].children.map((entry) => entry.path)).toEqual(["notes/nested/details.md"]);
  });

  it("reads content with a stable SHA-256 hash", async () => {
    const document = await readDocument(root, "notes/brief.mdx");

    expect(document).toMatchObject({
      path: "notes/brief.mdx",
      content: '---\nicon: "🧪"\n---\n\n# Brief\n',
      hash: sha256('---\nicon: "🧪"\n---\n\n# Brief\n'),
      readOnly: false,
    });
  });

  it("reads JSON and JSONL as editable local documents", async () => {
    await expect(readDocument(root, "notes/settings.json")).resolves.toMatchObject({
      content: '{"theme":"dark"}\n',
      readOnly: false,
    });
    await expect(readDocument(root, "notes/events.jsonl")).resolves.toMatchObject({
      content: '{"event":"open"}\n',
      readOnly: false,
    });
  });

  it("reads a bounded document preview without editor save metadata", async () => {
    const content = `# Large document\n\n${"Preview paragraph. ".repeat(4000)}`;
    await writeFile(path.join(root, "notes", "large.md"), content);

    const preview = await readDocumentPreview(root, "notes/large.md");

    expect(preview).toMatchObject({
      path: "notes/large.md",
      truncated: true,
    });
    expect(preview.content).toContain("# Large document");
    expect(Buffer.byteLength(preview.content, "utf8")).toBeLessThanOrEqual(48 * 1024);
    expect(preview).not.toHaveProperty("hash");
  });
});
