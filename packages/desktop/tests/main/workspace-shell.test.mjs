import { describe, expect, it, vi } from "vitest";

import {
  openDirectoryInTerminal,
  openWorkspaceEntryInTerminal,
  revealWorkspaceEntryInFinder,
} from "../../electron/lib/workspace-shell.mjs";

describe("workspace shell actions", () => {
  it("opens a validated directory in macOS Terminal without a shell command", async () => {
    const run = vi.fn().mockResolvedValue({});

    await expect(openDirectoryInTerminal("/Users/test/My project/docs", { platform: "darwin", run })).resolves.toEqual({ opened: true });
    expect(run).toHaveBeenCalledWith("/usr/bin/open", ["-a", "Terminal", "/Users/test/My project/docs"]);
  });

  it("reports unsupported platforms explicitly", async () => {
    await expect(openDirectoryInTerminal("/tmp/project", { platform: "linux", run: vi.fn() })).rejects.toMatchObject({
      code: "UNSUPPORTED_PLATFORM",
    });
  });

  it("opens Windows Terminal with a PowerShell fallback without interpolating the path", async () => {
    const launchWindows = vi.fn()
      .mockRejectedValueOnce(Object.assign(new Error("missing"), { code: "ENOENT" }))
      .mockResolvedValueOnce({});

    await expect(openDirectoryInTerminal("C:\\Users\\Sam\\My project", {
      platform: "win32",
      launchWindows,
    })).resolves.toEqual({ opened: true });
    expect(launchWindows).toHaveBeenNthCalledWith(1, "wt.exe", [
      "-d",
      "C:\\Users\\Sam\\My project",
    ]);
    expect(launchWindows).toHaveBeenNthCalledWith(2, "powershell.exe", [
      "-NoExit",
      "-Command",
      "Set-Location -LiteralPath $args[0]",
      "C:\\Users\\Sam\\My project",
    ]);
  });

  it("opens a folder itself in Terminal and a file's parent directory", async () => {
    const run = vi.fn().mockResolvedValue({});
    const folderInfo = { isDirectory: () => true };
    const fileInfo = { isDirectory: () => false };

    await openWorkspaceEntryInTerminal("/Users/test/project/docs", {
      getInfo: vi.fn().mockResolvedValue(folderInfo),
      platform: "darwin",
      run,
    });
    await openWorkspaceEntryInTerminal("/Users/test/project/docs/brief.md", {
      getInfo: vi.fn().mockResolvedValue(fileInfo),
      platform: "darwin",
      run,
    });

    expect(run).toHaveBeenNthCalledWith(1, "/usr/bin/open", ["-a", "Terminal", "/Users/test/project/docs"]);
    expect(run).toHaveBeenNthCalledWith(2, "/usr/bin/open", ["-a", "Terminal", "/Users/test/project/docs"]);
  });

  it("opens folders in Finder and reveals files in their folder", async () => {
    const openPath = vi.fn().mockResolvedValue("");
    const showItemInFolder = vi.fn();

    await revealWorkspaceEntryInFinder("/Users/test/project/docs", {
      getInfo: vi.fn().mockResolvedValue({ isDirectory: () => true }),
      openPath,
      showItemInFolder,
    });
    await revealWorkspaceEntryInFinder("/Users/test/project/docs/brief.md", {
      getInfo: vi.fn().mockResolvedValue({ isDirectory: () => false }),
      openPath,
      showItemInFolder,
    });

    expect(openPath).toHaveBeenCalledWith("/Users/test/project/docs");
    expect(showItemInFolder).toHaveBeenCalledWith("/Users/test/project/docs/brief.md");
  });
});
