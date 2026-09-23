import { _electron, expect, test } from "@playwright/test";
import { mkdir, mkdtemp, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { ProjectRegistry } from "../../electron/lib/project-registry.mjs";

const qaRoot = fileURLToPath(new URL("../../../../tmp/qa/cold-start/", import.meta.url));
const entrypoint = fileURLToPath(new URL("../fixtures/cold-start.cjs", import.meta.url));

for (const hasRecentWorkspace of [true, false]) {
  test(`cold-start file open ${hasRecentWorkspace ? "overrides the remembered workspace" : "bypasses onboarding"}`, async () => {
    test.skip(process.platform !== "darwin", "Native macOS launch-event regression");
    await mkdir(qaRoot, { recursive: true });
    const root = await mkdtemp(path.join(qaRoot, "launch-"));
    const targetDirectory = path.join(root, "external");
    await mkdir(targetDirectory);
    const filePath = path.join(targetDirectory, "【NEW】统一登录 - v1.1.md");
    const content = "# Cold start document\n\nOpened on the very first request.\n";
    await writeFile(filePath, content, { flag: "wx" });
    const before = await stat(filePath);
    if (hasRecentWorkspace) {
      const oldWorkspace = path.join(root, "old-workspace");
      await mkdir(oldWorkspace);
      await writeFile(path.join(oldWorkspace, "Welcome.md"), "# Old workspace\n");
      const registry = new ProjectRegistry({ filePath: path.join(root, ".fylune", "recent-projects.json") });
      await registry.add(oldWorkspace);
    }

    const desktop = await _electron.launch({
      args: [entrypoint],
      env: {
        ...process.env,
        ELECTRON_RUN_AS_NODE: undefined,
        VITE_DEV_SERVER_URL: undefined,
        FYLUNE_QA_ROOT: root,
        FYLUNE_QA_OPEN_FILE: filePath,
        FYLUNE_PERSIST_TEST_SESSION: "0",
        FYLUNE_API_URL: "http://127.0.0.1:9",
        FYLUNE_WEBSITE_URL: "http://127.0.0.1:9",
      },
    });
    try {
      let page;
      await expect.poll(() => {
        page = desktop.windows().find((window) => !window.isClosed()
          && window.url().includes("index.html") && !window.url().includes("onboardingWindow"));
        return Boolean(page);
      }).toBe(true);
      const editor = page.getByRole("textbox", { name: "editable markdown", exact: true });
      await expect(editor).toContainText("Opened on the very first request.");
      await expect(page.locator(".fylune-app")).toHaveClass(/is-sidebar-collapsed/);
      await expect(page.getByRole("textbox", { name: "Document title", exact: true })).toHaveValue("Cold start document");
      await expect(page.locator(".save-status")).toHaveText("Saved locally");
      expect(await readFile(filePath, "utf8")).toBe(content);
      expect((await stat(filePath)).mtimeMs).toBe(before.mtimeMs);

      // The running app must still accept subsequent Finder and CLI requests.
      const jsonPath = path.join(targetDirectory, "settings.json");
      await writeFile(jsonPath, '{"coldStart":true}\n', { flag: "wx" });
      await desktop.evaluate(({ app }, requestedPath) => {
        app.emit("open-file", { preventDefault() {} }, requestedPath);
      }, jsonPath);
      await expect(page.locator(".cm-content")).toContainText('"coldStart"');
      await expect(page.locator(".fylune-app")).toHaveClass(/is-sidebar-collapsed/);

      await desktop.evaluate(({ app }, requestedPath) => {
        app.emit("second-instance", {}, ["Fylune", `--fylune-open=${requestedPath}`]);
      }, filePath);
      await expect(editor).toContainText("Opened on the very first request.");
      await expect(page.locator(".fylune-app")).toHaveClass(/is-sidebar-collapsed/);
      expect(await readFile(filePath, "utf8")).toBe(content);
      expect((await stat(filePath)).mtimeMs).toBe(before.mtimeMs);
    } finally {
      await desktop.close();
    }
  });
}
