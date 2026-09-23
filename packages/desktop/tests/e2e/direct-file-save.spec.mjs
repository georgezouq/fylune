import { expect, test } from "@playwright/test";
import { mkdir, mkdtemp, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { readExternalDocument, saveDocument } from "../../electron/lib/file-engine.mjs";
import { DraftStore, SnapshotStore } from "../../electron/lib/local-history.mjs";
import { toPublicError } from "../../electron/lib/errors.mjs";

const qaRoot = fileURLToPath(new URL("../../../../tmp/qa/document-save/", import.meta.url));
const importedMarkdown = "## Imported notes\r\n\r\nVisit https://example.com/start and [the guide](https://example.com/guide).\r\n\r\n![Local screenshot](screenshots/diagram.png)\r\n\r\n*   First item\r\n\r\n```js\r\nconst ready = true;\r\n```\r\n";

for (const [label, content] of [["imported Markdown", importedMarkdown], ["an empty file", ""]]) {
  test(`directly opens ${label} without writes, then saves edits with conflict protection`, async ({ page }) => {
    await mkdir(qaRoot, { recursive: true });
    const root = await mkdtemp(path.join(qaRoot, "direct-open-"));
    const filePath = path.join(root, "Notes.md");
    await writeFile(filePath, content, { flag: "wx" });
    const before = await stat(filePath);
    const original = await readExternalDocument(filePath);
    const snapshotStore = new SnapshotStore(path.join(root, ".local"));
    const draftStore = new DraftStore(path.join(root, ".local"));
    const attempts = [];
    await page.route("**/qa-assets/11111111-1111-4111-8111-111111111111/screenshots/diagram.png", (route) => route.fulfill({
      contentType: "image/png",
      body: Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=", "base64"),
    }));
    await page.exposeFunction("qaSaveDocument", async (payload) => {
      expect(payload.path).toBe("Notes.md");
      attempts.push(payload);
      try {
        return { ok: true, value: await saveDocument({
          root, relativePath: payload.path, content: payload.content,
          expectedHash: payload.expectedHash, snapshotStore, draftStore,
        }) };
      } catch (error) {
        return { ok: false, error: toPublicError(error) };
      }
    });
    await page.exposeFunction("qaSaveDraft", (payload) => draftStore.save(root, "Notes.md", payload.content, payload.baseHash));
    await page.addInitScript(({ original }) => {
      window.localStorage.setItem("fylune-language", "en");
      window.fylune = {
        assets: { previewUrl: ({ projectId, path }) => `/qa-assets/${projectId}/${path}` },
        projects: {
          listRecent: async () => [],
          onOpenFile(callback) {
            queueMicrotask(() => callback({
              projectId: "11111111-1111-4111-8111-111111111111",
              name: "Downloads", path: "/test/Downloads", targetPath: "Notes.md", targetDocument: original,
              tree: { kind: "directory", children: [{ kind: "file", fileType: "document", name: "Notes.md", path: "Notes.md", extension: "md" }] },
            }));
            return () => {};
          },
        },
        documents: {
          async save(payload) {
            const result = await window.qaSaveDocument(payload);
            if (!result.ok) throw Object.assign(new Error(result.error.message), result.error);
            return result.value;
          },
          saveDraft: (payload) => window.qaSaveDraft(payload),
        },
      };
    }, { original });
    await page.goto("http://127.0.0.1:45173");
    const editor = page.getByRole("textbox", { name: "editable markdown", exact: true });
    await expect(editor).toBeVisible();
    if (content) {
      const image = editor.getByRole("img", { name: "Local screenshot", exact: true });
      await expect(image).toBeVisible();
      await expect.poll(() => image.evaluate((element) => element.naturalWidth)).toBe(1);
      await expect(editor.getByRole("link", { name: "https://example.com/start", exact: true })).toBeVisible();
      await expect(editor.getByRole("link", { name: "the guide", exact: true })).toBeVisible();
    }
    await editor.focus();
    // Allow both import normalization and delayed autolink updates to settle.
    await page.waitForTimeout(900);
    expect(attempts).toHaveLength(0);
    expect(await readFile(filePath, "utf8")).toBe(content);
    expect((await stat(filePath)).mtimeMs).toBe(before.mtimeMs);
    expect(await draftStore.load(root, "Notes.md")).toBeNull();
    expect(await snapshotStore.list(root, "Notes.md")).toEqual([]);

    await page.keyboard.press("ControlOrMeta+s");
    await expect.poll(() => attempts.length).toBe(1);
    await expect(page.locator(".save-status")).toHaveText("Saved locally");
    expect(attempts[0]).toMatchObject({ expectedHash: original.hash, content });
    expect(await readFile(filePath, "utf8")).toBe(content);

    await editor.press("ControlOrMeta+Home");
    await page.keyboard.type("Z");
    await expect.poll(async () => readFile(filePath, "utf8")).toContain("Z");
    await expect(page.locator(".save-status")).toHaveText("Saved locally");
    const firstEdit = await readExternalDocument(filePath);
    await page.getByRole("textbox", { name: "Document title" }).fill("Updated notes");
    await expect.poll(async () => readFile(filePath, "utf8")).toContain("# Updated notes");
    await expect(page.locator(".save-status")).toHaveText("Saved locally");
    expect(attempts.at(-1).expectedHash).toBe(firstEdit.hash);
    if (content) {
      const saved = await readFile(filePath, "utf8");
      expect(saved).toContain("Visit https://example.com/start");
      expect(saved).not.toContain("[https://example.com/start]");
      expect(saved).toContain("[the guide](https://example.com/guide)");
    }

    const lastSaved = await readExternalDocument(filePath);
    const externalContent = `${lastSaved.content}\nExternal edit.\n`;
    await saveDocument({ root, relativePath: "Notes.md", content: externalContent, expectedHash: lastSaved.hash, snapshotStore, draftStore });
    await page.getByRole("textbox", { name: "Document title" }).fill("Conflicting local title");
    await expect(page.locator(".save-status")).toHaveText("Protected conflict");
    expect(await readFile(filePath, "utf8")).toBe(externalContent);
    expect(await draftStore.load(root, "Notes.md")).toMatchObject({ baseHash: lastSaved.hash });
  });
}
