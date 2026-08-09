import { beforeEach, describe, expect, it, vi } from "vitest";

describe("Fylune bridge adapter", () => {
  beforeEach(() => {
    vi.resetModules();
    delete window.fylune;
    const values = new Map();
    Object.defineProperty(window, "localStorage", {
      configurable: true,
      value: {
        getItem: (key) => values.get(key) ?? null,
        setItem: (key, value) => values.set(key, String(value)),
        removeItem: (key) => values.delete(key),
      },
    });
  });

  it("provides a complete browser demo when Electron is absent", async () => {
    const { getFyluneBridge } = await import("../../src/fyluneBridge.js");
    const bridge = getFyluneBridge();

    expect(bridge.isDemo).toBe(true);
    expect((await bridge.openProject()).name).toBe("Fylune Launch");
    expect((await bridge.createProject()).name).toBe("Fylune Launch");
    expect(await bridge.listRecentProjects()).toEqual([expect.objectContaining({ id: "project-fylune" })]);
    expect(await bridge.listDocuments()).toHaveLength(6);
    await expect(bridge.readDocument("Product/Launch roadmap.md")).resolves.toMatchObject({
      path: "Product / Launch roadmap.md",
      content: expect.stringContaining("# Launch roadmap"),
    });
    await expect(bridge.readDocumentPreview("Product/Launch roadmap.md")).resolves.toMatchObject({
      content: expect.stringContaining("# Launch roadmap"),
      truncated: false,
    });
    await expect(bridge.saveDocument({ id: "doc-brief", title: "Product brief" })).resolves.toMatchObject({ id: "doc-brief" });
    await expect(bridge.renameWorkspaceItem({ path: "Product/Product brief.mdx", name: "Brief.mdx" })).resolves.toMatchObject({ path: "Product/Brief.mdx" });
    await expect(bridge.duplicateWorkspaceItem({ path: "Product/Brief.mdx" })).resolves.toMatchObject({ path: "Product/Brief copy.mdx" });
    await expect(bridge.deleteWorkspaceItem({ path: "Product/Brief copy.mdx" })).resolves.toMatchObject({ trashed: true });
    await expect(bridge.revealWorkspaceItem({ path: "Product/Brief.mdx" })).resolves.toMatchObject({ revealed: true });
    await expect(bridge.openWorkspaceItemInTerminal({ path: "Product/Brief.mdx" })).resolves.toMatchObject({ opened: true });
  });

  it("resolves document-relative image references inside the selected project", async () => {
    const { resolveDocumentAssetPath } = await import("../../src/fyluneBridge.js");

    expect(resolveDocumentAssetPath("docs/product/prd.md", "diagram.png")).toBe("docs/product/diagram.png");
    expect(resolveDocumentAssetPath("docs/product/prd.md", "./images/diagram.png")).toBe("docs/product/images/diagram.png");
    expect(resolveDocumentAssetPath("docs/product/prd.md", "../shared/Diagram%202.png?raw=1#preview")).toBe("docs/shared/Diagram 2.png");
    expect(resolveDocumentAssetPath("docs/product/prd.md", "../../assets/cover.png")).toBe("assets/cover.png");
    expect(resolveDocumentAssetPath("docs/product/prd.md", "../../../outside.png")).toBeNull();
    expect(resolveDocumentAssetPath("docs/product/prd.md", "https://example.com/cover.png")).toBeNull();
    expect(resolveDocumentAssetPath("docs/product/prd.md", "./bad%path.png")).toBeNull();
    expect(resolveDocumentAssetPath("docs/product/prd.md", "..%2F..%2Foutside.png")).toBeNull();
  });

  it("treats JSON and JSONL files as editable workspace documents", async () => {
    const { flattenWorkspaceItems } = await import("../../src/fyluneBridge.js");
    expect(flattenWorkspaceItems([
      { kind: "file", name: "settings.json", path: "settings.json", extension: "json" },
      { kind: "file", name: "events.jsonl", path: "events.jsonl", extension: "jsonl" },
    ])).toEqual([
      expect.objectContaining({ path: "settings.json", title: "settings", type: "document" }),
      expect.objectContaining({ path: "events.jsonl", title: "events", type: "document" }),
    ]);
  });

  it("activates and forwards a file opened by the operating system", async () => {
    let openFile;
    window.fylune = {
      projects: {
        onOpenFile: (callback) => {
          openFile = callback;
          return () => {};
        },
      },
    };
    const { getFyluneBridge } = await import("../../src/fyluneBridge.js");
    const bridge = getFyluneBridge();
    const callback = vi.fn();
    bridge.onExternalFileOpen(callback);

    await openFile({
      projectId: "project-json",
      name: "Data",
      path: "/Users/test/Data",
      targetPath: "settings.json",
      tree: {
        kind: "directory",
        children: [{ kind: "file", name: "settings.json", path: "settings.json", extension: "json", fileType: "document" }],
      },
    });

    expect(callback).toHaveBeenCalledWith(expect.objectContaining({
      id: "project-json",
      targetPath: "settings.json",
      tree: [expect.objectContaining({ path: "settings.json", type: "document" })],
    }));
  });

  it("keeps the latest workspace active when an earlier switch finishes late", async () => {
    let finishFirstSwitch;
    const openRecent = vi.fn(({ projectId }) => projectId === "project-first"
      ? new Promise((resolve) => { finishFirstSwitch = resolve; })
      : Promise.resolve({
        projectId,
        name: "Second",
        path: "/Users/test/Second",
        tree: { kind: "directory", name: "Second", children: [] },
      }));
    window.fylune = {
      projects: { openRecent },
      assets: {
        previewUrl: ({ projectId, path }) => `fylune-asset://project/${projectId}/${path}`,
      },
    };

    const { getFyluneBridge } = await import("../../src/fyluneBridge.js");
    const bridge = getFyluneBridge();
    const firstSwitch = bridge.openRecentProject("project-first");
    await bridge.openRecentProject("project-second");
    finishFirstSwitch({
      projectId: "project-first",
      name: "First",
      path: "/Users/test/First",
      tree: { kind: "directory", name: "First", children: [] },
    });

    await expect(firstSwitch).resolves.toBeNull();
    expect(bridge.previewAsset({ path: "cover.png" })).toBe("fylune-asset://project/project-second/cover.png");
  });

  it("normalizes the preload project scan contract for the renderer", async () => {
    const projectId = "11111111-1111-4111-8111-111111111111";
    const recentProjectId = "22222222-2222-4222-8222-222222222222";
    const shallowTree = {
      kind: "directory",
      name: "My docs",
      loaded: true,
      children: [{ kind: "directory", name: "Plans", path: "Plans", loaded: false }],
    };
    const pick = vi.fn().mockResolvedValue({ projectId, name: "My docs", tree: shallowTree });
    const create = vi.fn().mockResolvedValue({ projectId, name: "My docs", tree: shallowTree });
    const listRecent = vi.fn().mockResolvedValue([{ projectId: recentProjectId, name: "Archive", path: "/Users/test/Archive", lastOpenedAt: "2026-07-22T03:00:00.000Z" }]);
    const openRecent = vi.fn().mockResolvedValue({ projectId: recentProjectId, name: "Archive", path: "/Users/test/Archive" });
    const scan = vi.fn(async ({ projectId: requestedId, path = "" }) => ({
      projectId: requestedId,
      name: requestedId === recentProjectId ? "Archive" : "My docs",
      path: requestedId === recentProjectId ? "/Users/test/Archive" : "/Users/test/My docs",
      tree: path === "Plans" ? {
        kind: "directory",
        name: "Plans",
        path: "Plans",
        loaded: true,
        children: [
          { kind: "file", fileType: "document", name: "Launch.md", path: "Plans/Launch.md" },
          { kind: "file", fileType: "pdf", name: "Research.pdf", path: "Plans/Research.pdf" },
        ],
      } : {
        kind: "directory",
        name: "My docs",
        children: [{
          kind: "directory",
          name: "Plans",
          path: "Plans",
          children: [
            { kind: "file", fileType: "document", name: "Launch.md", path: "Plans/Launch.md" },
            { kind: "file", fileType: "pdf", name: "Research.pdf", path: "Plans/Research.pdf" },
          ],
        }],
      },
    }));
    const hash = "a".repeat(64);
    const secondHash = "c".repeat(64);
    const read = vi.fn(async ({ path }) => ({
      path,
      content: path === "Plans/Second.md" ? "# Second\n" : "# Launch\n\nOriginal body.\n",
      hash: path === "Plans/Second.md" ? secondHash : hash,
      readOnly: false,
    }));
    const readFresh = vi.fn(async ({ path }) => ({
      path,
      content: "# Launch\n\nFresh external body.\n",
      hash: "d".repeat(64),
      readOnly: false,
    }));
    const acceptExternal = vi.fn(async ({ path, hash: acceptedHash }) => ({ path, hash: acceptedHash }));
    const preview = vi.fn().mockResolvedValue({ path: "Plans/Launch.md", content: "# Launch\n\nOriginal body.\n", truncated: false });
    const savedHash = "b".repeat(64);
    const save = vi.fn(async ({ path }) => ({ path, hash: savedHash }));
    const rename = vi.fn().mockResolvedValue({ previousPath: "Plans/Launch.md", path: "Plans/Roadmap.md", name: "Roadmap.md", mtimeMs: 2 });
    const duplicate = vi.fn().mockResolvedValue({ sourcePath: "Plans/Roadmap.md", path: "Plans/Roadmap copy.md", name: "Roadmap copy.md", mtimeMs: 3 });
    const remove = vi.fn().mockResolvedValue({ path: "Plans/Roadmap copy.md", trashed: true });
    const importDroppedFile = vi.fn().mockResolvedValue({ path: "assets/Cover.png", markdown: "![Cover](../assets/Cover.png)", kind: "image" });
    const previewUrl = vi.fn(({ projectId: currentProjectId, path }) => `fylune-asset://project/${currentProjectId}/${path}`);
    const readAsset = vi.fn().mockResolvedValue(new Uint8Array([37, 80, 68, 70]));
    const reveal = vi.fn().mockResolvedValue({ revealed: true });
    const openInTerminal = vi.fn().mockResolvedValue({ opened: true });
    const getWindowState = vi.fn().mockResolvedValue({ isFullscreen: true });
    const completeOnboarding = vi.fn().mockResolvedValue({ completed: true });
    const onFullscreenChange = vi.fn(() => () => {});
    const updateState = {
      distribution: "direct",
      canSelfUpdate: true,
      status: "available",
      currentVersion: "0.1.0",
      availableVersion: "0.2.0",
    };
    const getUpdateState = vi.fn().mockResolvedValue(updateState);
    const checkForUpdates = vi.fn().mockResolvedValue(updateState);
    const downloadUpdate = vi.fn().mockResolvedValue({ ...updateState, status: "downloaded" });
    const installUpdate = vi.fn().mockResolvedValue({ ...updateState, status: "installing" });
    const onUpdateStateChange = vi.fn(() => () => {});
    window.fylune = {
      window: { getState: getWindowState, completeOnboarding, onFullscreenChange },
      projects: { pick, create, listRecent, openRecent, scan },
      documents: { read, readFresh, acceptExternal, preview, save },
      files: { rename, duplicate, delete: remove, openInTerminal },
      assets: { importDroppedFile, previewUrl, read: readAsset, reveal },
      updates: {
        getState: getUpdateState,
        check: checkForUpdates,
        download: downloadUpdate,
        install: installUpdate,
        onStateChange: onUpdateStateChange,
      },
    };

    const { getFyluneBridge } = await import("../../src/fyluneBridge.js");
    const bridge = getFyluneBridge();
    const project = await bridge.openProject();
    await expect(bridge.createProject()).resolves.toMatchObject({ id: projectId, name: "My docs" });
    expect(create).toHaveBeenCalledOnce();
    const documents = await bridge.listDocuments();

    expect(bridge.isDemo).toBe(false);
    await expect(bridge.getWindowState()).resolves.toEqual({ isFullscreen: true });
    await expect(bridge.completeOnboarding()).resolves.toEqual({ completed: true });
    expect(completeOnboarding).toHaveBeenCalledOnce();
    expect(typeof bridge.onWindowFullscreenChange(() => {})).toBe("function");
    await expect(bridge.getUpdateState()).resolves.toEqual(updateState);
    await expect(bridge.checkForUpdates()).resolves.toEqual(updateState);
    await expect(bridge.downloadUpdate()).resolves.toMatchObject({ status: "downloaded" });
    await expect(bridge.installUpdate()).resolves.toMatchObject({ status: "installing" });
    expect(typeof bridge.onUpdateStateChange(() => {})).toBe("function");
    expect(project.tree[0]).toMatchObject({ name: "Plans", type: "folder" });
    await expect(bridge.listRecentProjects()).resolves.toEqual([expect.objectContaining({ id: recentProjectId, name: "Archive" })]);
    expect(documents[0]).toMatchObject({ title: "Launch", path: "Plans/Launch.md" });
    expect(scan).toHaveBeenCalledWith({ projectId, recursive: true, documentsOnly: true });
    await bridge.listDocuments();
    expect(scan).toHaveBeenCalledTimes(1);
    await expect(bridge.loadFolder("Plans")).resolves.toMatchObject({ path: "Plans", loaded: true });
    expect(scan).toHaveBeenCalledWith({ projectId, path: "Plans", folderPreviews: true });

    await bridge.readDocument("Plans/Launch.md");
    await expect(bridge.readDocumentFresh("Plans/Launch.md")).resolves.toMatchObject({
      content: "# Launch\n\nFresh external body.\n",
    });
    expect(readFresh).toHaveBeenCalledWith({ projectId, path: "Plans/Launch.md" });
    await expect(bridge.readDocumentPreview("Plans/Launch.md")).resolves.toMatchObject({ content: "# Launch\n\nOriginal body.\n" });
    expect(preview).toHaveBeenCalledWith({ projectId, path: "Plans/Launch.md" });
    await bridge.saveDocument({ path: "Plans/Launch.md", title: "Launch", content: "# Launch\n\nEdited full body.\n" });
    expect(save).toHaveBeenCalledWith({ projectId, path: "Plans/Launch.md", content: "# Launch\n\nEdited full body.\n", expectedHash: hash });
    await bridge.saveDocument({ path: "Plans/Untitled document.mdx", title: "Untitled document", content: "", expectedHash: null });
    expect(save).toHaveBeenCalledWith({
      projectId,
      path: "Plans/Untitled document.mdx",
      content: "",
      expectedHash: null,
    });
    await bridge.readDocument("Plans/Second.md");
    await bridge.saveDocument({ path: "Plans/Launch.md", title: "Launch", content: "# Launch\n\nAnother edit.\n" });
    expect(save).toHaveBeenCalledWith({
      projectId,
      path: "Plans/Launch.md",
      content: "# Launch\n\nAnother edit.\n",
      expectedHash: savedHash,
    });

    await expect(bridge.renameWorkspaceItem({ path: "Plans/Launch.md", name: "Roadmap.md", expectedMtimeMs: 1 })).resolves.toMatchObject({ path: "Plans/Roadmap.md" });
    expect(rename).toHaveBeenCalledWith({ projectId, path: "Plans/Launch.md", name: "Roadmap.md", expectedMtimeMs: 1 });
    await bridge.duplicateWorkspaceItem({ path: "Plans/Roadmap.md", expectedMtimeMs: 2 });
    expect(duplicate).toHaveBeenCalledWith({ projectId, path: "Plans/Roadmap.md", expectedMtimeMs: 2 });
    await bridge.deleteWorkspaceItem({ path: "Plans/Roadmap copy.md", expectedMtimeMs: 3 });
    expect(remove).toHaveBeenCalledWith({ projectId, path: "Plans/Roadmap copy.md", expectedMtimeMs: 3 });

    const file = new File(["image"], "Cover.png", { type: "image/png" });
    await bridge.importAsset(file, "Plans/Launch.md");
    expect(importDroppedFile).toHaveBeenCalledWith(file, { projectId, documentPath: "Plans/Launch.md" });
    expect(bridge.previewAsset({ path: "Plans/Research.pdf" })).toContain("Research.pdf");
    expect(bridge.previewDocumentAsset("./images/Diagram%202.png", "Plans/Launch.md")).toContain("Plans/images/Diagram 2.png");
    expect(previewUrl).toHaveBeenCalledWith({ projectId, path: "Plans/images/Diagram 2.png" });
    await expect(bridge.readPreviewAsset({ path: "Plans/Research.pdf", type: "pdf" })).resolves.toEqual(new Uint8Array([37, 80, 68, 70]));
    expect(readAsset).toHaveBeenCalledWith({ projectId, path: "Plans/Research.pdf" });
    await bridge.revealAsset({ path: "Plans/Research.pdf" });
    expect(reveal).toHaveBeenCalledWith({ projectId, path: "Plans/Research.pdf" });
    await bridge.revealWorkspaceItem({ path: "Plans/Launch.md" });
    expect(reveal).toHaveBeenCalledWith({ projectId, path: "Plans/Launch.md" });
    await bridge.openWorkspaceItemInTerminal({ path: "Plans/Launch.md" });
    expect(openInTerminal).toHaveBeenCalledWith({ projectId, path: "Plans/Launch.md" });

    await bridge.readDocument("Plans/Launch.md");
    await bridge.acceptExternalVersion("d".repeat(64));
    expect(acceptExternal).toHaveBeenCalledWith({
      projectId,
      path: "Plans/Launch.md",
      hash: "d".repeat(64),
    });
    await expect(bridge.openRecentProject(recentProjectId)).resolves.toMatchObject({ id: recentProjectId, name: "Archive" });
    expect(openRecent).toHaveBeenCalledWith({ projectId: recentProjectId });
    expect(scan).toHaveBeenCalledWith({ projectId: recentProjectId, folderPreviews: true });
  });
});
