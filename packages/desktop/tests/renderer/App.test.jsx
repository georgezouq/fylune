/* eslint-disable no-unused-vars -- the base ESLint config does not mark JSX references as usage */
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { App } from "../../src/App.jsx";
import { WORKSPACE_RESOURCE_DRAG_TYPE } from "../../src/agentComposer.js";
import { demoBridge } from "../../src/fyluneBridge.js";

async function showAllDocuments(user) {
  const destination = screen.getByRole("button", { name: /All documents/ });
  if (!destination.hasAttribute("aria-current")) await user.click(destination);
  await screen.findByRole("heading", { name: "All documents", level: 1 });
}

async function openLibraryDocument(user, title) {
  let target = screen.queryByRole("button", { name: `Open ${title}` });
  if (!target) {
    await showAllDocuments(user);
    target = await screen.findByRole("button", { name: `Open ${title}` });
  }
  await user.click(target);
}

async function expandTreeFolder(user, name) {
  const folder = screen.getByRole("treeitem", { name });
  if (folder.getAttribute("aria-expanded") !== "true") await user.click(folder);
  await waitFor(() => expect(folder).toHaveAttribute("aria-expanded", "true"));
  return folder;
}

describe("Fylune renderer", () => {
  it("offers App Store CLI installation instructions without attempting a sandbox write", async () => {
    vi.spyOn(demoBridge, "getCliStatus").mockResolvedValue({
      status: "unavailable", reason: "app-store", manualInstallCommand: "safe-install-command",
    });
    const install = vi.spyOn(demoBridge, "installCli");
    const copy = vi.spyOn(demoBridge, "copyText").mockResolvedValue({ copied: true });
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByRole("button", { name: "Settings" }));
    const dialog = screen.getByRole("dialog", { name: "Settings" });
    await user.click(await within(dialog).findByRole("button", { name: "Copy install command" }));
    expect(copy).toHaveBeenCalledWith("safe-install-command");
    expect(install).not.toHaveBeenCalled();
    expect(within(dialog).getByText(/Paste the command into Terminal/)).toBeInTheDocument();
    expect(within(dialog).queryByText(/The fylune command is installed/)).not.toBeInTheDocument();
    await user.click(within(dialog).getByRole("button", { name: "Copy PATH command" }));
    expect(copy).toHaveBeenLastCalledWith('export PATH="$HOME/.local/bin:$PATH"');
  });

  it("installs the direct-build CLI and exposes uninstall after success", async () => {
    vi.spyOn(demoBridge, "getCliStatus").mockResolvedValue({ status: "not-installed" });
    const install = vi.spyOn(demoBridge, "installCli").mockResolvedValue({ status: "installed", installPath: "~/.local/bin/fylune", pathConfigured: false });
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByRole("button", { name: "Settings" }));
    await user.click(await screen.findByRole("button", { name: "Install CLI" }));
    expect(install).toHaveBeenCalledTimes(1);
    expect(await screen.findByRole("button", { name: "Uninstall CLI" })).toBeInTheDocument();
    expect(screen.getByText("fylune .")).toBeInTheDocument();
  });


  it("opens literal object syntax in Markdown as ordinary document text", async () => {
    Range.prototype.getClientRects ??= () => [];
    Range.prototype.getBoundingClientRect ??= () => ({
      bottom: 0, height: 0, left: 0, right: 0, top: 0, width: 0, x: 0, y: 0, toJSON: () => ({}),
    });
    const markdown = "### 登录响应\n\n返回格式 {\"success\":true,\"data\":{\"displayName\":\"张三\"}}\n";
    vi.spyOn(demoBridge, "onExternalFileOpen").mockImplementation((callback) => {
      queueMicrotask(() => callback({
        id: "external-markdown",
        name: "Downloads",
        path: "/Users/test/Downloads",
        targetPath: "统一登录.md",
        targetDocument: { path: "统一登录.md", content: markdown },
        tree: [{ id: "统一登录.md", type: "document", name: "统一登录.md", path: "统一登录.md" }],
      }));
      return () => {};
    });

    render(<App />);

    await screen.findByRole("textbox", { name: "Document title" });
    await waitFor(() => expect(document.querySelector(".fylune-mdx-content")).toHaveTextContent("返回格式"));
    expect(document.querySelector(".mdxeditor-source-editor")).not.toBeInTheDocument();
  });


  beforeEach(() => {
    const values = new Map();
    Object.defineProperty(window, "localStorage", {
      configurable: true,
      value: {
        clear: () => values.clear(),
        getItem: (key) => values.get(key) ?? null,
        setItem: (key, value) => values.set(key, String(value)),
        removeItem: (key) => values.delete(key),
      },
    });
    window.localStorage.clear();
    document.documentElement.removeAttribute("data-theme");
    Object.defineProperty(document, "fullscreenElement", { configurable: true, value: null });
    Object.defineProperty(globalThis, "CSS", { configurable: true, value: { highlights: new Map() } });
    Object.defineProperty(globalThis, "Highlight", { configurable: true, value: class Highlight { constructor(...ranges) { this.ranges = ranges; } } });
    Object.defineProperty(window, "confirm", { configurable: true, value: vi.fn(() => true) });
    URL.createObjectURL = () => "blob:fylune-test-asset";
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it("opens an externally supplied JSON document without waiting for a workspace scan", async () => {
    Range.prototype.getClientRects ??= () => [];
    Range.prototype.getBoundingClientRect ??= () => ({
      bottom: 0, height: 0, left: 0, right: 0, top: 0, width: 0, x: 0, y: 0, toJSON: () => ({}),
    });
    const readDocument = vi.spyOn(demoBridge, "readDocument");
    vi.spyOn(demoBridge, "onExternalFileOpen").mockImplementation((callback) => {
      queueMicrotask(() => callback({
        id: "external-json",
        name: "Downloads",
        path: "/Users/test/Downloads",
        targetPath: "settings.json",
        targetDocument: { path: "settings.json", content: '{"theme":"dark"}\n', readOnly: true },
        tree: [{ id: "settings.json", type: "document", name: "settings.json", path: "settings.json" }],
      }));
      return () => {};
    });

    render(<App />);

    expect(await screen.findByRole("textbox", { name: "JSON editor" })).toHaveTextContent('"theme":"dark"');
    expect(document.querySelector(".fylune-app")).toHaveClass("is-sidebar-collapsed");
    expect(screen.queryByRole("complementary", { name: "Workspace navigation" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Show sidebar" })).toBeInTheDocument();
    expect(readDocument).not.toHaveBeenCalledWith("settings.json");
  });

  it("shows the current project, real folder tree, and document previews", async () => {
    const user = userEvent.setup();
    render(<App />);

    expect(document.querySelector(".project-button")).toHaveTextContent("Fylune Launch");
    expect(screen.getByRole("tree", { name: "Workspace" })).toBeInTheDocument();
    expect(screen.getByRole("treeitem", { name: /Product$/ })).toHaveAttribute("aria-expanded", "false");
    expect(screen.getByRole("button", { name: /All files 4/ })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("button", { name: /All documents 6/ })).not.toHaveAttribute("aria-current");
    expect(screen.getByRole("button", { name: "Open folder Product" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Open Project README" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Open launch-cover.png" })).not.toBeInTheDocument();
    await showAllDocuments(user);
    expect(screen.getByRole("button", { name: "Open Product brief" })).toBeInTheDocument();
    expect(screen.queryByText("Everything in Fylune Launch, stored in its original folders.")).not.toBeInTheDocument();
    const productPreview = screen.getByRole("button", { name: "Open Product brief" });
    expect(await within(productPreview).findByText(/Fylune is a private document workspace/)).toBeInTheDocument();
    expect(within(productPreview).getByText("Who it is for")).toBeInTheDocument();
    const productMeta = productPreview.closest(".document-card").querySelector(".document-card-meta");
    expect(productMeta.querySelector(".card-title")).toHaveTextContent(/^Product brief\.mdx$/);
    expect(productMeta.querySelector(".card-title strong")).not.toBeInTheDocument();
    expect(productMeta.querySelector(".card-title span")).not.toBeInTheDocument();
    expect(productMeta).not.toHaveTextContent("2 min ago");
    expect(screen.queryByText("Document preview")).not.toBeInTheDocument();
    expect(screen.queryByText("A local document in this project.")).not.toBeInTheDocument();
    expect(document.querySelector(".preview-footer")).not.toBeInTheDocument();
    expect(document.querySelector(".preview-subheading")).not.toBeInTheDocument();
    expect(document.querySelector(".preview-supporting")).not.toBeInTheDocument();

    await user.click(document.querySelector(".project-button"));
    expect(screen.getByRole("button", { name: "Current workspace Fylune Launch" })).toHaveAttribute("aria-current", "true");
  });

  it("shows a selected folder as frosted folders and real file previews", async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getByRole("treeitem", { name: /Product$/ }));

    expect(screen.getByRole("heading", { name: "Product", level: 1 })).toBeInTheDocument();
    const folders = screen.getByRole("region", { name: "Folders" });
    const files = screen.getByRole("region", { name: "Files" });
    const planning = within(folders).getByRole("button", { name: "Open folder Planning" });
    expect(planning.querySelector(".folder-pocket")).toBeInTheDocument();
    expect(within(planning).getByText("release-timeline.pdf")).toBeInTheDocument();
    expect(within(planning).getByText("PDF")).toBeInTheDocument();
    expect(within(files).getByRole("button", { name: "Open Product brief" })).toBeInTheDocument();
    expect(within(files).getByRole("button", { name: "Open Launch roadmap" })).toBeInTheDocument();
    expect(within(files).getByRole("button", { name: "Open Editing guidelines" })).toBeInTheDocument();
    expect(within(files).getByRole("button", { name: "Open Product brief" })).toHaveClass("document-preview");

    await user.click(planning);
    expect(screen.getByRole("heading", { name: "Planning", level: 1 })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Open release-timeline.pdf" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Open folder Planning" })).toHaveAttribute("aria-current", "page");

    await user.click(screen.getByRole("button", { name: "Open folder Product" }));
    expect(screen.getByRole("heading", { name: "Product", level: 1 })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Open folder Product" })).toHaveAttribute("aria-current", "page");

    await user.click(screen.getByRole("button", { name: "Back to all documents" }));
    expect(screen.getByRole("heading", { name: "All files" })).toBeInTheDocument();
  });

  it("caches folder expansion and keeps navigation selection exclusive", async () => {
    const user = userEvent.setup();
    render(<App />);

    const allFiles = screen.getByRole("button", { name: /All files 4/ });
    const product = screen.getByRole("treeitem", { name: /Product$/ });
    expect(product).toHaveAttribute("aria-expanded", "false");

    await user.click(product);
    expect(product).toHaveAttribute("aria-expanded", "true");
    expect(product).toHaveAttribute("aria-selected", "true");
    expect(allFiles).not.toHaveAttribute("aria-current");

    await user.click(allFiles);
    expect(allFiles).toHaveAttribute("aria-current", "page");
    expect(product).toHaveAttribute("aria-selected", "false");

    const research = screen.getByRole("treeitem", { name: /Research$/ });
    await user.click(research);
    expect(research).toHaveAttribute("aria-selected", "true");
    expect(allFiles).not.toHaveAttribute("aria-current");

    const favorites = screen.getByRole("button", { name: /Favorites 2/ });
    await user.click(favorites);
    expect(favorites).toHaveAttribute("aria-current", "page");
    expect(research).toHaveAttribute("aria-selected", "false");

    await waitFor(() => {
      const stored = JSON.parse(window.localStorage.getItem("fylune-workspace-navigation-state"));
      expect(stored["~/Documents/Fylune Launch"]).toEqual(["folder-product", "folder-research"]);
    });
  });

  it("restores cached folder expansion for the current workspace", async () => {
    window.localStorage.setItem("fylune-workspace-navigation-state", JSON.stringify({
      "~/Documents/Fylune Launch": [],
    }));
    render(<App />);

    expect(screen.getByRole("treeitem", { name: /Product$/ })).toHaveAttribute("aria-expanded", "false");
    expect(screen.getByRole("treeitem", { name: /Research$/ })).toHaveAttribute("aria-expanded", "false");
    await showAllDocuments(userEvent.setup());
    expect(await within(screen.getByRole("button", { name: "Open Product brief" })).findByText(
      /Fylune is a private document workspace/,
    )).toBeInTheDocument();
  });

  it("selects and collapses the workspace root while keeping refresh available", async () => {
    const user = userEvent.setup();
    render(<App />);

    const rootRow = document.querySelector(".workspace-root-row");
    expect(rootRow).toHaveTextContent("Fylune Launch");
    await user.click(rootRow);

    expect(rootRow).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("heading", { name: "Fylune Launch", level: 1 })).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Folders" })).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Files" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Refresh workspace" })).toBeEnabled();

    await user.click(screen.getByRole("button", { name: "Collapse workspace" }));
    expect(screen.queryByRole("tree", { name: "Workspace" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Expand workspace" })).toHaveAttribute("aria-expanded", "false");
    expect(rootRow).toHaveAttribute("aria-current", "page");

    await user.click(screen.getByRole("button", { name: "Refresh workspace" }));
    expect(rootRow).toHaveAttribute("aria-current", "page");
  });

  it("shows locally remembered projects and reopens one from the project menu", async () => {
    const user = userEvent.setup();
    window.localStorage.setItem("fylune-recent-projects", JSON.stringify([
      {
        id: "project-archive",
        name: "Research archive",
        path: "/Users/test/Documents/Research archive",
        lastOpenedAt: "2026-07-22T03:00:00.000Z",
        tree: [{ id: "folder-archive", name: "Archive", path: "Archive", type: "folder", children: [], itemCount: 0 }],
      },
    ]));
    render(<App />);

    await user.type(screen.getByRole("textbox", { name: "Search documents" }), "Product");

    await user.click(document.querySelector(".project-button"));
    const recentProject = await screen.findByRole("button", { name: "Open workspace Research archive" });
    expect(within(recentProject).getByText("/Users/test/Documents/Research archive")).toBeInTheDocument();
    await user.click(recentProject);

    await waitFor(() => expect(document.querySelector(".project-button")).toHaveTextContent("Research archive"));
    expect(screen.getByRole("textbox", { name: "Search documents" })).toHaveValue("");
    expect(screen.getByRole("button", { name: "Open folder Archive" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Open folder Product" })).not.toBeInTheDocument();
    expect(screen.queryByText("Everything in Research archive, stored in its original folders.")).not.toBeInTheDocument();
  });

  it("dismisses the project menu when the surrounding sidebar is clicked", async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(document.querySelector(".project-button"));
    expect(screen.getByRole("button", { name: "Current workspace Fylune Launch" })).toBeInTheDocument();

    await user.click(screen.getByText("Workspace"));
    expect(screen.queryByRole("button", { name: "Current workspace Fylune Launch" })).not.toBeInTheDocument();
  });

  it("dismisses library and insertion menus when clicking outside or pressing Escape", async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getByRole("button", { name: "More library options" }));
    expect(screen.getByRole("button", { name: "Show loading state" })).toBeInTheDocument();
    await user.click(screen.getByRole("heading", { name: "All files" }));
    expect(screen.queryByRole("button", { name: "Show loading state" })).not.toBeInTheDocument();

    await openLibraryDocument(user, "Product brief");
    await screen.findByRole("region", { name: "Editing Product brief" });
    await user.click(screen.getByRole("button", { name: "Insert content" }));
    expect(screen.getByRole("button", { name: /ExperimentTrack a question and measure/i })).toBeInTheDocument();
    await user.click(screen.getByRole("textbox", { name: "Document title" }));
    expect(screen.queryByRole("button", { name: /ExperimentTrack a question and measure/i })).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Insert content" }));
    fireEvent.keyDown(window, { key: "Escape" });
    expect(screen.queryByRole("button", { name: /ExperimentTrack a question and measure/i })).not.toBeInTheDocument();
  });

  it("uses a full-width tab header when the sidebar is collapsed", async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getByRole("button", { name: "Hide sidebar" }));

    const app = document.querySelector(".fylune-app");
    const tabStrip = screen.getByRole("tablist", { name: "Open documents" });
    const workspace = document.querySelector(".workspace");
    expect(app).toHaveClass("is-sidebar-collapsed");
    expect(screen.queryByRole("complementary")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Show sidebar" })).toBeInTheDocument();
    expect(tabStrip.parentElement).toBe(app);
    expect(workspace.parentElement).toBe(app);

    await user.click(screen.getByRole("button", { name: "Show sidebar" }));
    expect(app).not.toHaveClass("is-sidebar-collapsed");
    expect(screen.getByRole("complementary", { name: "Workspace navigation" })).toBeInTheDocument();
  });

  it("shows full file-name tooltips and manages files from the tree context menu", async () => {
    const user = userEvent.setup();
    render(<App />);

    await expandTreeFolder(user, "Product");
    const original = screen.getByRole("treeitem", { name: "Product brief.mdx" });
    expect(within(original).getByText("Product brief.mdx")).toHaveAttribute("title", "Product brief.mdx");

    fireEvent.contextMenu(original, { clientX: 120, clientY: 180 });
    let menu = screen.getByRole("menu", { name: "File actions for Product brief.mdx" });
    expect(within(menu).getByRole("menuitem", { name: "Show in folder" })).toBeInTheDocument();
    expect(within(menu).getByRole("menuitem", { name: "Open in Terminal" })).toBeInTheDocument();
    await user.click(within(menu).getByRole("menuitem", { name: "Rename" }));

    const renameInput = screen.getByRole("textbox", { name: "Rename Product brief.mdx" });
    await user.clear(renameInput);
    await user.type(renameInput, "Renamed brief.mdx{Enter}");
    const renamed = await screen.findByRole("treeitem", { name: "Renamed brief.mdx" });

    fireEvent.contextMenu(renamed, { clientX: 120, clientY: 180 });
    menu = screen.getByRole("menu", { name: "File actions for Renamed brief.mdx" });
    await user.click(within(menu).getByRole("menuitem", { name: "Copy" }));
    const duplicate = await screen.findByRole("treeitem", { name: "Renamed brief copy.mdx" });

    fireEvent.contextMenu(duplicate, { clientX: 120, clientY: 180 });
    menu = screen.getByRole("menu", { name: "File actions for Renamed brief copy.mdx" });
    await user.click(within(menu).getByRole("menuitem", { name: "Delete" }));
    await waitFor(() => expect(screen.queryByRole("treeitem", { name: "Renamed brief copy.mdx" })).not.toBeInTheDocument());
    expect(screen.getByText("Renamed brief copy.mdx moved to Trash")).toBeInTheDocument();
  });

  it("shows folder actions from the hover menu and manages a folder copy", async () => {
    const user = userEvent.setup();
    render(<App />);

    const folder = screen.getByRole("treeitem", { name: "Product" });
    const more = screen.getByRole("button", { name: "File actions for Product" });
    expect(more).toHaveAttribute("aria-expanded", "false");

    await user.click(more);
    let menu = screen.getByRole("menu", { name: "File actions for Product" });
    expect(within(menu).getByRole("menuitem", { name: "Open in Terminal" })).toBeInTheDocument();
    expect(within(menu).getByRole("menuitem", { name: "Show in folder" })).toBeInTheDocument();
    expect(within(menu).getByRole("menuitem", { name: "Copy" })).toBeInTheDocument();
    expect(within(menu).getByRole("menuitem", { name: "Delete" })).toBeInTheDocument();
    expect(within(menu).getByRole("menuitem", { name: "Rename" })).toBeInTheDocument();

    await user.click(within(menu).getByRole("menuitem", { name: "Copy" }));
    const duplicate = await screen.findByRole("treeitem", { name: "Product copy" });
    expect(duplicate).toBeInTheDocument();
    expect(screen.getByText("Created Product copy")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "File actions for Product copy" }));
    menu = screen.getByRole("menu", { name: "File actions for Product copy" });
    await user.click(within(menu).getByRole("menuitem", { name: "Delete" }));

    expect(window.confirm).toHaveBeenCalledWith("Move the folder “Product copy” and everything inside it to Trash?");
    await waitFor(() => expect(screen.queryByRole("treeitem", { name: "Product copy" })).not.toBeInTheDocument());
    expect(screen.getByText("Product copy moved to Trash")).toBeInTheDocument();
    expect(folder).toBeInTheDocument();
  });

  it("renames a folder from its context menu and keeps descendants attached", async () => {
    const user = userEvent.setup();
    render(<App />);

    await expandTreeFolder(user, "Product");
    fireEvent.contextMenu(screen.getByRole("treeitem", { name: "Product" }), { clientX: 120, clientY: 180 });
    const menu = screen.getByRole("menu", { name: "File actions for Product" });
    await user.click(within(menu).getByRole("menuitem", { name: "Rename" }));

    const renameInput = screen.getByRole("textbox", { name: "Rename Product" });
    await user.clear(renameInput);
    await user.type(renameInput, "Product notes{Enter}");

    const renamedFolder = await screen.findByRole("treeitem", { name: "Product notes" });
    const renamedGroup = renamedFolder.closest(".tree-group");
    await waitFor(() => expect(renamedFolder).toHaveAttribute("aria-expanded", "true"));
    expect(within(renamedGroup).getByRole("treeitem", { name: "Product brief.mdx" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Product notes", level: 1 })).toBeInTheDocument();
    await user.click(within(renamedGroup).getByRole("treeitem", { name: "Product brief.mdx" }));
    expect(await screen.findByText("Product notes/")).toBeInTheDocument();
  });

  it("creates a root document when the project tree has no selection", async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getAllByRole("button", { name: "New document" })[0]);

    const tree = screen.getByRole("tree", { name: "Workspace" });
    const document = await screen.findByRole("treeitem", { name: "Untitled document.mdx" });
    expect(document.closest(".tree-group").parentElement).toBe(tree);
    expect(document).toHaveAttribute("aria-selected", "true");
    expect(document).not.toHaveClass("active");
    expect(screen.getByRole("button", { name: "Rename Untitled document.mdx" })).toBeInTheDocument();
    expect(await screen.findByText("Start writing here.")).toBeInTheDocument();
    expect(await screen.findByRole("textbox", { name: "editable markdown" })).toHaveTextContent("");
  });

  it("clears the editor when creating a document and keeps its placeholder out of the file", async () => {
    const user = userEvent.setup();
    render(<App />);

    await openLibraryDocument(user, "Product brief");
    expect(await screen.findByText(/Fylune is a private document workspace/)).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Create document tab" }));

    expect(await screen.findByRole("region", { name: "Editing Untitled document" })).toBeInTheDocument();
    expect(screen.queryByText(/Fylune is a private document workspace/)).not.toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "editable markdown" })).toHaveTextContent("");
    expect(screen.getByText("Start writing here.")).toBeInTheDocument();
    expect(document.querySelector(".document-meta")).toHaveTextContent("0 words");
    expect(screen.queryByRole("region", { name: "Decision block" })).not.toBeInTheDocument();
    expect(screen.queryByText("External update ready")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Close Untitled document" }));
    await user.click(screen.getByRole("treeitem", { name: "Untitled document.mdx" }));

    expect(await screen.findByRole("region", { name: "Editing Untitled document" })).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "editable markdown" })).toHaveTextContent("");
    expect(screen.getByText("Start writing here.")).toBeInTheDocument();
  });

  it("creates documents beside a selected file or inside a selected folder and shows them in the tree", async () => {
    const user = userEvent.setup();
    render(<App />);

    await expandTreeFolder(user, "Product");
    await user.click(screen.getByRole("treeitem", { name: "Product brief.mdx" }));
    await screen.findByRole("region", { name: "Editing Product brief" });
    await user.click(screen.getAllByRole("button", { name: "New document" })[0]);

    const productFolder = screen.getByRole("treeitem", { name: /Product$/ });
    const productGroup = productFolder.closest(".tree-group");
    const productDocument = await within(productGroup).findByRole("treeitem", { name: "Untitled document.mdx" });
    expect(productDocument).toHaveAttribute("aria-selected", "true");
    expect(screen.getByText("Product/")).toBeInTheDocument();

    await user.click(screen.getAllByRole("button", { name: "New document" })[0]);
    const secondProductDocument = await within(productGroup).findByRole("treeitem", { name: "Untitled document 2.mdx" });
    expect(secondProductDocument).toHaveAttribute("aria-selected", "true");

    await user.click(screen.getByRole("treeitem", { name: /Research$/ }));
    await user.click(screen.getAllByRole("button", { name: "New document" })[0]);

    const researchFolder = screen.getByRole("treeitem", { name: /Research$/ });
    const researchGroup = researchFolder.closest(".tree-group");
    const researchDocument = await within(researchGroup).findByRole("treeitem", { name: "Untitled document.mdx" });
    expect(researchFolder).toHaveAttribute("aria-expanded", "true");
    expect(researchDocument).toHaveAttribute("aria-selected", "true");
    expect(screen.getByText("Research/")).toBeInTheDocument();
  });

  it("switches between grid and list views", async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getByRole("button", { name: "List view" }));
    expect(document.querySelector(".document-list")).toBeInTheDocument();
    expect(await screen.findAllByText(/Fylune is a private document workspace/)).not.toHaveLength(0);

    await user.click(screen.getByRole("button", { name: "Grid view" }));
    expect(document.querySelector(".document-grid")).toBeInTheDocument();
  });

  it("orders documents by recent openings and filters durable favorites", async () => {
    const user = userEvent.setup();
    render(<App />);

    expect(document.querySelector(".sidebar-separator")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /All files 4/ })).toHaveAttribute("aria-current", "page");

    await openLibraryDocument(user, "Editing guidelines");
    await screen.findByRole("region", { name: "Editing Editing guidelines" });
    await user.click(screen.getByRole("tab", { name: "All" }));
    await showAllDocuments(user);
    let previews = within(document.querySelector(".document-grid")).getAllByRole("button", { name: /^Open / });
    expect(previews[0]).toHaveAccessibleName("Open Editing guidelines");

    await openLibraryDocument(user, "Launch roadmap");
    await screen.findByRole("region", { name: "Editing Launch roadmap" });
    await user.click(screen.getByRole("tab", { name: "All" }));
    await showAllDocuments(user);
    previews = within(document.querySelector(".document-grid")).getAllByRole("button", { name: /^Open / });
    expect(previews.slice(0, 2).map((preview) => preview.getAttribute("aria-label"))).toEqual(["Open Launch roadmap", "Open Editing guidelines"]);

    const favorites = screen.getByRole("button", { name: /Favorites 2/ });
    await user.click(favorites);
    expect(favorites).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("heading", { name: "Favorites" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Open Product brief" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Open Customer interviews" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Open Launch roadmap" })).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Unstar Product brief" }));
    expect(screen.queryByRole("button", { name: "Open Product brief" })).not.toBeInTheDocument();
    await waitFor(() => {
      const stored = JSON.parse(window.localStorage.getItem("fylune-document-library-state"));
      expect(stored["~/Documents/Fylune Launch"]["Product/Product brief.mdx"].favorite).toBe(false);
      expect(stored["~/Documents/Fylune Launch"]["Product/Launch roadmap.md"].lastOpenedAt).toBeGreaterThan(0);
    });
  });

  it("removes the macOS traffic-light inset while the window is fullscreen", async () => {
    render(<App />);
    const app = document.querySelector(".fylune-app");
    expect(app).not.toHaveClass("is-window-fullscreen");

    Object.defineProperty(document, "fullscreenElement", { configurable: true, value: document.documentElement });
    fireEvent(document, new Event("fullscreenchange"));

    await waitFor(() => expect(app).toHaveClass("is-window-fullscreen"));
  });

  it("opens a frameless document and resolves an external update", async () => {
    const user = userEvent.setup();
    render(<App />);

    await openLibraryDocument(user, "Product brief");
    expect(await screen.findByRole("region", { name: "Editing Product brief" })).toBeInTheDocument();
    expect(screen.getAllByRole("status").map((element) => element.textContent).join(" ")).toMatch(/external update/i);
    expect(document.querySelector(".document-canvas")).toBeInTheDocument();
    expect(document.querySelector(".editor-screen > .editor-toolbar")).toBeInTheDocument();
    expect(document.querySelector(".editor-screen > .editor-scroll")).toBeInTheDocument();
    expect(within(screen.getByRole("region", { name: "Editing Product brief" })).queryByRole("button", { name: "Settings" })).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Review changes" }));
    const review = screen.getByRole("complementary", { name: "External update review" });
    expect(within(review).getByText("1 of 3")).toBeInTheDocument();
    expect(review.querySelector(".review-panel-body")).toBeInTheDocument();
    expect(review.querySelector(":scope > footer")).toBeInTheDocument();

    for (let index = 0; index < 3; index += 1) {
      await user.click(within(review).getByRole("button", { name: "Use external update" }));
      await user.click(within(review).getByText(index === 2 ? "Finish review" : "Next change", { selector: ".primary-button" }));
    }

    expect(screen.queryByRole("complementary", { name: "External update review" })).not.toBeInTheDocument();
    expect(screen.getByText("External update reviewed")).toBeInTheDocument();
  });

  it("renames the active file from the document toolbar", async () => {
    const user = userEvent.setup();
    render(<App />);

    await expandTreeFolder(user, "Product");
    await openLibraryDocument(user, "Product brief");
    const renameButton = await screen.findByRole("button", { name: "Rename Product brief.mdx" });
    expect(renameButton.querySelector(".document-name-edit-icon")).toBeInTheDocument();

    await user.click(renameButton);
    const renameInput = screen.getByRole("textbox", { name: "Rename Product brief.mdx" });
    expect(renameInput).toHaveValue("Product brief.mdx");
    expect(renameInput.selectionStart).toBe(0);
    expect(renameInput.selectionEnd).toBe("Product brief".length);

    await user.clear(renameInput);
    await user.type(renameInput, "Launch brief.mdx{Escape}");
    expect(screen.getByRole("button", { name: "Rename Product brief.mdx" })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Rename Product brief.mdx" }));
    const committedInput = screen.getByRole("textbox", { name: "Rename Product brief.mdx" });
    await user.clear(committedInput);
    await user.type(committedInput, "Launch brief.mdx{Enter}");

    expect(await screen.findByRole("button", { name: "Rename Launch brief.mdx" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Launch brief" })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("treeitem", { name: "Launch brief.mdx" })).toBeInTheDocument();
    expect(screen.getByText("Renamed to Launch brief.mdx")).toBeInTheDocument();
  });

  it("moves from the title into the body and keeps a chosen icon in document navigation", async () => {
    const user = userEvent.setup();
    render(<App />);

    await expandTreeFolder(user, "Product");
    await openLibraryDocument(user, "Product brief");
    const editor = await screen.findByRole("region", { name: "Editing Product brief" });
    const title = screen.getByRole("textbox", { name: "Document title" });
    const content = await waitFor(() => {
      const editable = editor.querySelector(".fylune-mdx-content");
      expect(editable).toBeInTheDocument();
      return editable;
    });
    title.focus();
    expect(fireEvent.keyDown(title, { key: "Enter" })).toBe(false);
    expect(content).toHaveFocus();

    await user.click(screen.getByRole("button", { name: "Add Icon" }));
    const picker = screen.getByRole("dialog", { name: "Choose document icon" });
    expect(within(picker).getByRole("textbox", { name: "Filter document icons" })).toHaveFocus();
    await user.click(within(picker).getByRole("option", { name: "Document icon 🚀" }));

    const treeItem = screen.getByRole("treeitem", { name: "Product brief.mdx" });
    expect(within(treeItem).getByTestId("document-icon")).toHaveTextContent("🚀");
    expect(within(screen.getByRole("tab", { name: "Product brief" })).getByTestId("document-icon")).toHaveTextContent("🚀");
    expect(screen.getByRole("button", { name: "Change document icon" })).toHaveTextContent("🚀");
    expect(title.parentElement).toHaveClass("document-heading", "with-icon");
    expect(title.previousElementSibling).toContainElement(
      screen.getByRole("button", { name: "Change document icon" }),
    );
  });

  it("switches the sidebar between project files and current-document views", async () => {
    const user = userEvent.setup();
    render(<App />);

    await openLibraryDocument(user, "Product brief");
    await screen.findByRole("region", { name: "Editing Product brief" });

    const views = screen.getByRole("tablist", { name: "Document sidebar views" });
    expect(within(views).getByRole("tab", { name: "Workspace" })).toHaveAttribute("aria-selected", "true");

    await user.click(within(views).getByRole("tab", { name: "Table of contents" }));
    expect(screen.getByRole("heading", { name: "Table of contents" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Product brief" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Who it is for" })).toBeInTheDocument();

    await user.click(within(views).getByRole("tab", { name: "Tasks" }));
    expect(screen.getByText("No tasks in this document")).toBeInTheDocument();

    await user.click(within(views).getByRole("tab", { name: "Attachments" }));
    expect(screen.getByText("No attachments in this document")).toBeInTheDocument();

    await user.click(within(views).getByRole("tab", { name: "Workspace" }));
    expect(screen.getByRole("tree", { name: "Workspace" })).toBeInTheDocument();
  });

  it("updates the document outline immediately when the document heading changes", async () => {
    const user = userEvent.setup();
    render(<App />);

    await openLibraryDocument(user, "Product brief");
    await screen.findByRole("region", { name: "Editing Product brief" });
    const views = screen.getByRole("tablist", { name: "Document sidebar views" });
    await user.click(within(views).getByRole("tab", { name: "Table of contents" }));
    expect(screen.getByRole("button", { name: "Who it is for" })).toBeInTheDocument();

    const title = screen.getByRole("textbox", { name: "Document title" });
    await user.clear(title);
    await user.type(title, "Live outline document");

    await waitFor(() => expect(screen.getByRole("button", { name: "Live outline document" })).toBeInTheDocument());
    expect(screen.queryByRole("button", { name: "Product brief" })).not.toBeInTheDocument();

    await user.clear(title);
    await user.type(title, "Product brief");
    await waitFor(() => expect(screen.getByRole("button", { name: "Product brief" })).toBeInTheDocument());
  });

  it("dismisses document options after clicking the empty document area", async () => {
    const user = userEvent.setup();
    render(<App />);

    await openLibraryDocument(user, "Product brief");
    const editor = await screen.findByRole("region", { name: "Editing Product brief" });
    const options = screen.getByRole("button", { name: "More document options" });

    await user.click(options);
    expect(screen.getByRole("button", { name: "Save document" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Show in folder" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Open in Terminal" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Show in folder" }));
    expect(screen.queryByRole("button", { name: "Save document" })).not.toBeInTheDocument();

    await user.click(options);
    await user.click(screen.getByRole("button", { name: "Open in Terminal" }));
    expect(screen.queryByRole("button", { name: "Save document" })).not.toBeInTheDocument();

    await user.click(options);
    await user.click(editor.querySelector(".editor-scroll"));
    expect(screen.queryByRole("button", { name: "Save document" })).not.toBeInTheDocument();

    await user.click(options);
    fireEvent.keyDown(window, { key: "Escape" });
    expect(screen.queryByRole("button", { name: "Save document" })).not.toBeInTheDocument();
  });

  it("performs a real local save for Command-S and leaves the spinner", async () => {
    const user = userEvent.setup();
    let finishSave;
    const saveSpy = vi.spyOn(demoBridge, "saveDocument").mockImplementation(() => new Promise((resolve) => {
      finishSave = resolve;
    }));
    render(<App />);

    await openLibraryDocument(user, "Product brief");
    await screen.findByRole("region", { name: "Editing Product brief" });
    saveSpy.mockClear();

    fireEvent.keyDown(window, { key: "s", metaKey: true });
    expect(document.querySelector(".save-status")).toHaveTextContent("Saving");
    finishSave({ path: "Product/Product brief.mdx" });
    await waitFor(() => expect(document.querySelector(".save-status")).toHaveTextContent("Saved locally"), { timeout: 1500 });
    expect(saveSpy).toHaveBeenCalledTimes(1);
  });

  it("does not autosave an unchanged document just because the editor mounted", async () => {
    const user = userEvent.setup();
    const saveSpy = vi.spyOn(demoBridge, "saveDocument").mockResolvedValue({ path: "Product/Product brief.mdx" });
    render(<App />);

    await openLibraryDocument(user, "Product brief");
    await screen.findByRole("region", { name: "Editing Product brief" });
    await new Promise((resolve) => window.setTimeout(resolve, 520));

    expect(saveSpy).not.toHaveBeenCalled();
    expect(document.querySelector(".save-status")).toHaveTextContent("Saved locally");
  });

  it.each([
    "## Imported notes\r\n\r\nVisit https://example.com/docs and www.example.com.\r\n\r\n*   A list item\r\n\r\n```js\r\nconst ready = true;\r\n```\r\n",
    "# Notes\n\nEmail hello@example.com or use [the guide](https://example.com/guide).\n",
    "",
  ])("preserves untouched imported Markdown through mount, manual save, and close (%#)", async (content) => {
    const user = userEvent.setup();
    const saveSpy = vi.spyOn(demoBridge, "saveDocument").mockResolvedValue({ path: "Notes.md" });
    const draftSpy = vi.spyOn(demoBridge, "saveDraft");
    vi.spyOn(demoBridge, "onExternalFileOpen").mockImplementation((callback) => {
      queueMicrotask(() => callback({
        id: "external-notes",
        name: "Downloads",
        path: "/Users/test/Downloads",
        targetPath: "Notes.md",
        targetDocument: { path: "Notes.md", content, readOnly: false },
        tree: [{ id: "Notes.md", type: "document", name: "Notes.md", path: "Notes.md" }],
      }));
      return () => {};
    });
    render(<App />);
    await screen.findByRole("region", { name: "Editing Notes" });
    await act(() => new Promise((resolve) => window.setTimeout(resolve, 700)));
    expect(saveSpy).not.toHaveBeenCalled();
    expect(draftSpy).not.toHaveBeenCalled();
    expect(document.querySelector(".save-status")).toHaveTextContent("Saved locally");

    fireEvent.keyDown(window, { key: "s", metaKey: true });
    await waitFor(() => expect(saveSpy).toHaveBeenCalledTimes(1));
    expect(saveSpy).toHaveBeenLastCalledWith(expect.objectContaining({ path: "Notes.md", content }));
    await waitFor(() => expect(document.querySelector(".save-status")).toHaveTextContent("Saved locally"));
    await user.click(screen.getByRole("button", { name: "Close Notes" }));
    expect(saveSpy).toHaveBeenCalledTimes(1);
    expect(draftSpy).not.toHaveBeenCalled();
  });

  it("shows calm local-change feedback during the autosave debounce", async () => {
    const user = userEvent.setup();
    vi.spyOn(demoBridge, "saveDocument").mockImplementation(async (payload) => ({
      ...payload,
      path: payload.path,
      content: payload.content,
      savedAt: new Date().toISOString(),
    }));
    render(<App />);

    await openLibraryDocument(user, "Product brief");
    await screen.findByRole("region", { name: "Editing Product brief" });
    const title = screen.getByRole("textbox", { name: "Document title" });
    await user.type(title, " updated");

    expect(document.querySelector(".save-status")).toHaveTextContent("Local changes");
    expect(document.querySelector(".save-status .spin")).not.toBeInTheDocument();
    await waitFor(() => expect(document.querySelector(".save-status")).toHaveTextContent("Saved locally"), { timeout: 1800 });
  });

  it("presents a document fullscreen with projector zoom controls", async () => {
    const user = userEvent.setup();
    render(<App />);

    await openLibraryDocument(user, "Product brief");
    await screen.findByRole("region", { name: "Editing Product brief" });
    await user.click(screen.getByRole("button", { name: "Present document" }));

    const presentation = screen.getByRole("region", { name: "Presenting Product brief" });
    expect(presentation).toHaveClass("presentation-mode");
    expect(screen.getByRole("textbox", { name: "Document title" })).toHaveAttribute("readonly");
    expect(screen.getByRole("toolbar", { name: "Presentation controls" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Close" })).toHaveClass("presentation-exit");
    expect(screen.queryByRole("button", { name: /Close Present document/ })).not.toBeInTheDocument();
    expect(screen.getByLabelText("Presentation zoom")).toHaveTextContent("100%");

    await user.click(screen.getByRole("button", { name: "Zoom in" }));
    expect(screen.getByLabelText("Presentation zoom")).toHaveTextContent("110%");
    expect(presentation.querySelector(".document-canvas")).toHaveStyle({ "--presentation-scale": "1.1" });

    const scroll = presentation.querySelector(".editor-scroll");
    fireEvent.wheel(scroll, { ctrlKey: true, deltaY: -20 });
    expect(screen.getByLabelText("Presentation zoom")).toHaveTextContent("115%");
    fireEvent.wheel(scroll, { metaKey: true, deltaY: 20 });
    expect(screen.getByLabelText("Presentation zoom")).toHaveTextContent("110%");
    fireEvent.wheel(scroll, { deltaY: -20 });
    expect(screen.getByLabelText("Presentation zoom")).toHaveTextContent("110%");

    await user.click(screen.getByRole("button", { name: "Reset" }));
    expect(screen.getByLabelText("Presentation zoom")).toHaveTextContent("100%");

    await user.keyboard("0");
    expect(screen.getByLabelText("Presentation zoom")).toHaveTextContent("100%");
    await user.keyboard("{Escape}");
    expect(screen.getByRole("region", { name: "Editing Product brief" })).not.toHaveClass("presentation-mode");
  });

  it("finds and replaces document text from the Ctrl+F floating search", async () => {
    const user = userEvent.setup();
    render(<App />);

    await openLibraryDocument(user, "Product brief");
    const editor = await screen.findByRole("region", { name: "Editing Product brief" });
    await waitFor(() => expect(editor.querySelector(".fylune-mdx-content")).toBeInTheDocument());
    fireEvent.keyDown(window, { key: "f", ctrlKey: true });

    const search = await screen.findByRole("search", { name: "Find in document" });
    expect(within(search).queryByText("Find in document")).not.toBeInTheDocument();
    expect(within(search).queryByRole("status")).not.toBeInTheDocument();
    await user.type(within(search).getByRole("textbox", { name: "Find" }), "Fylune");
    await waitFor(() => expect(within(search).getByRole("status")).toHaveTextContent("1 of 2"));

    await user.click(within(search).getByRole("button", { name: "Toggle replace" }));
    await user.type(within(search).getByRole("textbox", { name: "Replace with" }), "Moonbase");
    await user.click(within(search).getByRole("button", { name: "Replace all" }));

    await waitFor(() => expect(editor.querySelector(".fylune-mdx-content")).toHaveTextContent("Moonbase is a private document workspace"));
    expect(editor.querySelector(".fylune-mdx-content")).not.toHaveTextContent("Fylune");
    fireEvent.keyDown(search, { key: "Escape" });
    expect(screen.queryByRole("search", { name: "Find in document" })).not.toBeInTheDocument();
  });

  it("keeps multiple documents open in tabs and closes the active tab", async () => {
    const user = userEvent.setup();
    render(<App />);

    const tablist = screen.getByRole("tablist", { name: "Open documents" });
    expect(within(tablist).getByRole("tab", { name: "All" })).toHaveAttribute("aria-selected", "true");

    await openLibraryDocument(user, "Product brief");
    expect(await within(tablist).findByRole("tab", { name: "Product brief" })).toHaveAttribute("aria-selected", "true");

    await user.click(within(tablist).getByRole("tab", { name: "All" }));
    await openLibraryDocument(user, "Launch roadmap");
    expect(await within(tablist).findByRole("tab", { name: "Launch roadmap" })).toHaveAttribute("aria-selected", "true");
    expect(within(tablist).getByRole("tab", { name: "Product brief" })).toBeInTheDocument();

    await user.click(within(tablist).getByRole("tab", { name: "Product brief" }));
    expect(await screen.findByRole("region", { name: "Editing Product brief" })).toBeInTheDocument();
    await user.click(within(tablist).getByRole("button", { name: "Close Product brief" }));

    expect(within(tablist).queryByRole("tab", { name: "Product brief" })).not.toBeInTheDocument();
    expect(within(tablist).getByRole("tab", { name: "Launch roadmap" })).toHaveAttribute("aria-selected", "true");
    expect(await screen.findByRole("region", { name: "Editing Launch roadmap" })).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "Document title" })).toHaveValue("Launch roadmap");
  });

  it("closes tab groups from the context menu while preserving All", async () => {
    const user = userEvent.setup();
    render(<App />);

    const tablist = screen.getByRole("tablist", { name: "Open documents" });
    const allTab = within(tablist).getByRole("tab", { name: "All" });
    await openLibraryDocument(user, "Product brief");
    await within(tablist).findByRole("tab", { name: "Product brief" });
    await user.click(allTab);
    await openLibraryDocument(user, "Launch roadmap");
    await within(tablist).findByRole("tab", { name: "Launch roadmap" });
    await user.click(allTab);
    await openLibraryDocument(user, "Editing guidelines");
    await within(tablist).findByRole("tab", { name: "Editing guidelines" });

    fireEvent.contextMenu(within(tablist).getByRole("tab", { name: "Launch roadmap" }), { clientX: 420, clientY: 40 });
    let menu = screen.getByRole("menu", { name: "Tab actions for Launch roadmap" });
    within(menu).getAllByRole("menuitem").forEach((menuItem) => {
      expect(menuItem.firstElementChild?.tagName).toBe("svg");
      expect(menuItem.lastElementChild?.tagName).toBe("SPAN");
    });
    const closeRight = within(menu).getByRole("menuitem", { name: "Close tabs to the right" });
    expect(closeRight).toBeEnabled();
    await user.hover(closeRight);
    await user.click(closeRight);
    expect(within(tablist).queryByRole("tab", { name: "Editing guidelines" })).not.toBeInTheDocument();
    expect(allTab).toBeInTheDocument();

    await user.click(within(tablist).getByRole("button", { name: "Tab actions for Launch roadmap" }));
    menu = screen.getByRole("menu", { name: "Tab actions for Launch roadmap" });
    await user.click(within(menu).getByRole("menuitem", { name: "Close tabs to the left" }));
    expect(within(tablist).queryByRole("tab", { name: "Product brief" })).not.toBeInTheDocument();
    expect(allTab).toBeInTheDocument();

    fireEvent.contextMenu(within(tablist).getByRole("tab", { name: "Launch roadmap" }), { clientX: 420, clientY: 40 });
    menu = screen.getByRole("menu", { name: "Tab actions for Launch roadmap" });
    await user.click(within(menu).getByRole("menuitem", { name: "Close all tabs" }));
    expect(within(tablist).queryByRole("tab", { name: "Launch roadmap" })).not.toBeInTheDocument();
    expect(allTab).toHaveAttribute("aria-selected", "true");
  });

  it("opens project images in the same top-tab workspace", async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getByRole("treeitem", { name: /Assets$/ }));
    await user.click(screen.getByRole("treeitem", { name: "launch-cover.png" }));

    const preview = screen.getByRole("region", { name: "Previewing launch-cover.png" });
    expect(preview).toBeInTheDocument();
    expect(screen.getByTestId("image-preview")).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "launch-cover.png" })).toHaveAttribute("aria-selected", "true");
    expect(preview.querySelector(".preview-filebar")).not.toBeInTheDocument();
    expect(within(preview).queryByRole("button", { name: "Settings" })).not.toBeInTheDocument();
    expect(within(preview).queryByRole("button", { name: "Show in Finder" })).not.toBeInTheDocument();

    await user.click(within(preview).getByRole("button", { name: "More preview options" }));
    const details = screen.getByRole("dialog", { name: "File details for launch-cover.png" });
    expect(within(details).getByText("launch-cover.png")).toBeInTheDocument();
    expect(within(details).getByText("Image")).toBeInTheDocument();
    expect(within(details).getByText("Assets/launch-cover.png")).toBeInTheDocument();
    expect(within(details).getByRole("button", { name: "Show in folder" })).toBeInTheDocument();

    await user.click(screen.getByTestId("image-preview"));
    expect(screen.queryByRole("dialog", { name: "File details for launch-cover.png" })).not.toBeInTheDocument();
  });

  it("shows a block insertion line and drops an asset at that document position", async () => {
    const user = userEvent.setup();
    render(<App />);
    await openLibraryDocument(user, "Product brief");
    const editor = await screen.findByRole("region", { name: "Editing Product brief" });
    const scroll = editor.querySelector(".editor-scroll");
    await waitFor(() => expect(editor.querySelector(".fylune-mdx-content")).toBeInTheDocument());
    const content = editor.querySelector(".fylune-mdx-content");
    Object.defineProperty(scroll, "scrollTop", { configurable: true, value: 0 });
    scroll.getBoundingClientRect = () => ({ top: 0, right: 900, bottom: 700, left: 0, width: 900, height: 700, x: 0, y: 0, toJSON() {} });
    content.getBoundingClientRect = () => ({ top: 100, right: 800, bottom: 600, left: 200, width: 600, height: 500, x: 200, y: 100, toJSON() {} });
    [...content.children].forEach((block, index) => {
      block.getBoundingClientRect = () => ({ top: 100 + index * 80, right: 800, bottom: 140 + index * 80, left: 200, width: 600, height: 40, x: 200, y: 100 + index * 80, toJSON() {} });
    });
    const file = new File(["image"], "Launch cover.png", { type: "image/png" });
    const dataTransfer = { types: ["Files"], files: [file], dropEffect: "none" };

    fireEvent.dragEnter(scroll, { dataTransfer, clientX: 420, clientY: 160 });
    fireEvent.dragOver(scroll, { dataTransfer, clientX: 420, clientY: 160 });
    const indicator = screen.getByTestId("asset-drop-indicator");
    expect(indicator).toHaveStyle({ top: "87px", left: "200px", width: "600px" });
    expect(screen.queryByText("Drop to add to this document")).not.toBeInTheDocument();
    fireEvent.drop(scroll, { dataTransfer, clientX: 420, clientY: 160 });

    expect(await screen.findByText("Files copied to assets: 1")).toBeInTheDocument();
    expect(screen.queryByTestId("asset-drop-indicator")).not.toBeInTheDocument();
    await user.click(screen.getByRole("treeitem", { name: /Assets$/ }));
    expect(screen.getByRole("treeitem", { name: "Launch cover.png" })).toBeInTheDocument();
  });

  it("drops a workspace tree file at the indicated document block", async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByRole("treeitem", { name: /Assets$/ }));
    await openLibraryDocument(user, "Product brief");
    const editor = await screen.findByRole("region", { name: "Editing Product brief" });
    const scroll = editor.querySelector(".editor-scroll");
    await waitFor(() => expect(editor.querySelector(".fylune-mdx-content")).toBeInTheDocument());
    const content = editor.querySelector(".fylune-mdx-content");
    Object.defineProperty(scroll, "scrollTop", { configurable: true, value: 0 });
    scroll.getBoundingClientRect = () => ({ top: 0, right: 900, bottom: 700, left: 0, width: 900, height: 700, x: 0, y: 0, toJSON() {} });
    content.getBoundingClientRect = () => ({ top: 100, right: 800, bottom: 600, left: 200, width: 600, height: 500, x: 200, y: 100, toJSON() {} });
    [...content.children].forEach((block, index) => {
      block.getBoundingClientRect = () => ({ top: 100 + index * 80, right: 800, bottom: 140 + index * 80, left: 200, width: 600, height: 40, x: 200, y: 100 + index * 80, toJSON() {} });
    });

    const data = new Map();
    const dataTransfer = {
      types: [],
      files: [],
      dropEffect: "none",
      effectAllowed: "none",
      setData(type, value) {
        data.set(type, value);
        if (!this.types.includes(type)) this.types.push(type);
      },
      getData(type) {
        return data.get(type) || "";
      },
    };
    fireEvent.dragStart(screen.getByRole("treeitem", { name: "launch-cover.png" }), { dataTransfer });
    expect(dataTransfer.types).toContain(WORKSPACE_RESOURCE_DRAG_TYPE);

    fireEvent.dragEnter(scroll, { dataTransfer, clientX: 420, clientY: 160 });
    fireEvent.dragOver(scroll, { dataTransfer, clientX: 420, clientY: 160 });
    expect(screen.getByTestId("asset-drop-indicator")).toHaveStyle({
      top: "87px",
      left: "200px",
      width: "600px",
    });
    fireEvent.drop(scroll, { dataTransfer, clientX: 420, clientY: 160 });

    expect(await screen.findByText("launch-cover.png added to this document")).toBeInTheDocument();
    expect(screen.queryByTestId("asset-drop-indicator")).not.toBeInTheDocument();
  });

  it("routes video and PDF files into dedicated preview surfaces", async () => {
    const user = userEvent.setup();
    render(<App />);
    await openLibraryDocument(user, "Product brief");
    const editor = await screen.findByRole("region", { name: "Editing Product brief" });
    const files = [
      new File(["video"], "Walkthrough.mp4", { type: "video/mp4" }),
      new File(["%PDF-1.4"], "Research pack.pdf", { type: "application/pdf" }),
    ];
    fireEvent.drop(editor.querySelector(".editor-scroll"), { dataTransfer: { types: ["Files"], files, dropEffect: "none" } });
    expect(await screen.findByText("Files copied to assets: 2")).toBeInTheDocument();

    await user.click(screen.getByRole("treeitem", { name: /Assets$/ }));
    await user.click(screen.getByRole("treeitem", { name: "Walkthrough.mp4" }));
    const videoPreview = screen.getByRole("region", { name: "Previewing Walkthrough.mp4" });
    expect(videoPreview).toHaveClass("content-surface");
    expect(videoPreview.querySelector(":scope > header")).toHaveClass("content-surface-header");
    expect(videoPreview.querySelector(":scope > main")).toHaveClass("content-surface-panel", "video");
    expect(screen.getByTestId("video-preview")).toBeInTheDocument();
    expect(screen.getByLabelText("Video preview of Walkthrough.mp4")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "More preview options" }));
    expect(within(screen.getByRole("dialog", { name: "File details for Walkthrough.mp4" })).getByText("Video")).toBeInTheDocument();
    fireEvent.keyDown(window, { key: "Escape" });

    await user.click(screen.getByRole("treeitem", { name: "Research pack.pdf" }));
    const pdfPreview = screen.getByRole("region", { name: "Previewing Research pack.pdf" });
    expect(pdfPreview).toHaveClass("content-surface");
    expect(pdfPreview.querySelector(":scope > header")).toHaveClass("content-surface-header");
    expect(pdfPreview.querySelector(":scope > main")).toHaveClass("content-surface-panel", "pdf");
    expect(screen.getByLabelText("PDF page controls")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "More preview options" }));
    const pdfDetails = screen.getByRole("dialog", { name: "File details for Research pack.pdf" });
    expect(within(pdfDetails).getByText("PDF document")).toBeInTheDocument();
    expect(within(pdfDetails).getByRole("button", { name: "Show in folder" })).toBeInTheDocument();
  });

  it("inserts structured MDX blocks and opens local snapshot history", async () => {
    const user = userEvent.setup();
    render(<App />);
    await openLibraryDocument(user, "Product brief");
    await screen.findByRole("region", { name: "Editing Product brief" });

    await user.click(screen.getByRole("button", { name: "Insert content" }));
    await user.click(screen.getByRole("button", { name: /ExperimentTrack a question/i }));
    expect(screen.getByRole("region", { name: "Experiment block" })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Version history" }));
    const history = await screen.findByRole("complementary", { name: "Version history" });
    expect(await screen.findByText("Before external update")).toBeInTheDocument();
    expect(within(history).getByText("2 added · 1 deleted")).toBeInTheDocument();
    const previewButtons = within(history).getAllByRole("button", { name: "Preview" });
    const restoreButtons = within(history).getAllByRole("button", { name: "Restore" });
    expect(restoreButtons[0]).toBeEnabled();

    await user.click(previewButtons[0]);
    const preview = await screen.findByRole("region", { name: "Version preview" });
    expect(await within(preview).findByText("Added")).toBeInTheDocument();
    expect(within(preview).getByText("Deleted")).toBeInTheDocument();
    expect(preview.querySelector(".history-diff-segment.added")).toBeInTheDocument();
    expect(preview.querySelector(".history-diff-segment.removed")).toBeInTheDocument();
    await user.click(within(preview).getByRole("button", { name: "Version" }));
    expect(preview.querySelector(".history-version-document")).toBeInTheDocument();
  });

  it("supports appearance and optional account controls without blocking local use", async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByRole("button", { name: "Settings" }));

    const dialog = screen.getByRole("dialog", { name: "Settings" });
    await user.click(within(dialog).getByRole("button", { name: "Dark" }));
    expect(document.documentElement).toHaveAttribute("data-theme", "dark");

    await user.click(within(dialog).getByRole("button", { name: "Sign in" }));
    const signIn = await screen.findByRole("dialog", { name: "Use Fylune locally or sign in" });
    expect(within(signIn).getByRole("button", { name: "Continue without an account" })).toBeEnabled();
  });

  it("exposes useful empty and recovery states", async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getByRole("button", { name: "More library options" }));
    await user.click(screen.getByRole("button", { name: "Show load error" }));
    expect(screen.getByRole("alert")).toHaveTextContent("Documents could not be loaded");

    await user.click(screen.getByRole("button", { name: "Reload documents" }));
    expect(screen.getByRole("button", { name: "Open folder Product" })).toBeInTheDocument();
  });
});
