import { chmod, mkdtemp, mkdir, readFile, realpath, rm, symlink, writeFile } from "node:fs/promises";
import net from "node:net";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { requestAgentRpc } from "../../electron/lib/agent-rpc-client.mjs";
import {
  getCliStatus,
  createCliLauncher,
  installCli,
  uninstallCli,
} from "../../electron/lib/cli-installer.mjs";
import { openTargetFromArgv, resolveOpenTarget } from "../../electron/lib/open-target.mjs";

const temporaryPaths = [];

afterEach(async () => {
  await Promise.all(temporaryPaths.splice(0).map((entry) => rm(entry, { recursive: true, force: true })));
});

describe("Fylune CLI", () => {
  it.skipIf(process.platform !== "darwin")("provides a safe manual App Store installer without claiming installation", async () => {
    const homePath = await mkdtemp(path.join(os.tmpdir(), "fylune-manual-cli-"));
    temporaryPaths.push(homePath);
    const options = {
      homePath, executablePath: "/Applications/Fylune user's.app/Contents/MacOS/Fylune",
      isPackaged: true, isAppStoreBuild: true, platform: "darwin",
    };
    const status = await getCliStatus(options);
    expect(status).toMatchObject({ status: "unavailable", reason: "app-store", installPath: "~/.local/bin/fylune" });
    await expect(installCli(options)).rejects.toMatchObject({ code: "CLI_UNAVAILABLE" });
    const run = promisify(execFile);
    const env = { ...process.env, HOME: homePath };
    await run("/bin/sh", ["-c", status.manualInstallCommand], { env });
    const target = path.join(homePath, ".local/bin/fylune");
    expect(await readFile(target, "utf8")).toBe(createCliLauncher(options));
    expect((await run(target, ["--help"], { env })).stdout).toContain("opening only");
    await expect(run(target, ["agent", "status"], { env })).rejects.toMatchObject({ code: 2 });
    await run("/bin/sh", ["-c", status.manualInstallCommand], { env });
    await writeFile(target, "#!/bin/sh\necho unrelated\n");
    await expect(run("/bin/sh", ["-c", status.manualInstallCommand], { env })).rejects.toMatchObject({ code: 1 });
    expect(await readFile(target, "utf8")).toContain("unrelated");
    await rm(target);
    const unrelated = path.join(homePath, "other");
    await writeFile(unrelated, "private");
    await symlink(unrelated, target);
    await expect(run("/bin/sh", ["-c", status.manualInstallCommand], { env })).rejects.toMatchObject({ code: 1 });
    expect(await readFile(unrelated, "utf8")).toBe("private");
  });
  it("keeps automatic installation unavailable outside direct macOS builds", async () => {
    await expect(getCliStatus({
      homePath: "C:\\Users\\test",
      executablePath: "C:\\Program Files\\Fylune\\Fylune.exe",
      appPath: "C:\\Program Files\\Fylune\\resources\\app.asar",
      isPackaged: true,
      isAppStoreBuild: false,
      platform: "win32",
    })).resolves.toMatchObject({ status: "unavailable", reason: "platform" });
  });

  it("resolves relative files and folders before handing them to Desktop", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "fylune-cli-open-"));
    temporaryPaths.push(root);
    await mkdir(path.join(root, "workspace"));
    await writeFile(path.join(root, "workspace", "说明.md"), "# CLI\n");
    await symlink(path.join(root, "workspace", "说明.md"), path.join(root, "linked.md"));

    const canonicalRoot = await realpath(root);
    await expect(resolveOpenTarget("workspace", root)).resolves.toEqual({
      kind: "directory",
      path: path.join(canonicalRoot, "workspace"),
    });
    await expect(resolveOpenTarget("linked.md", root)).resolves.toEqual({
      kind: "file",
      path: path.join(canonicalRoot, "workspace", "说明.md"),
    });
    expect(openTargetFromArgv(["app", `--fylune-open=${path.join(root, "workspace")}`]))
      .toBe(path.join(root, "workspace"));
  });

  it("installs, repairs, and removes only Fylune-owned launchers", async () => {
    if (process.platform !== "darwin") return;
    const homePath = await mkdtemp(path.join(os.tmpdir(), "fylune-cli-home-"));
    temporaryPaths.push(homePath);
    const options = {
      homePath,
      executablePath: "/Applications/Fylune.app/Contents/MacOS/Fylune",
      appPath: "/Applications/Fylune.app/Contents/Resources/app.asar",
      isPackaged: true,
      isAppStoreBuild: false,
      platform: "darwin",
      pathValue: path.join(homePath, ".local", "bin"),
    };

    expect((await getCliStatus(options)).status).toBe("not-installed");
    const installed = await installCli(options);
    expect(installed).toMatchObject({ status: "installed", pathConfigured: true });
    expect(await readFile(installed.installPath, "utf8")).toContain("--fylune-cli");
    await writeFile(installed.installPath, "#!/bin/sh\necho mine\n");
    await chmod(installed.installPath, 0o755);
    await expect(uninstallCli(options)).rejects.toMatchObject({ code: "CLI_PATH_CONFLICT" });
    expect(await readFile(installed.installPath, "utf8")).toContain("echo mine");
  });

  it("reuses the authenticated local Agent protocol", async () => {
    if (process.platform === "win32") return;
    const dataDir = await mkdtemp(path.join(os.tmpdir(), "fylune-cli-agent-"));
    temporaryPaths.push(dataDir);
    const socketPath = path.join(dataDir, "agent.sock");
    const token = "test-capability-token-32-characters";
    const server = net.createServer((socket) => {
      socket.setEncoding("utf8");
      socket.once("data", (chunk) => {
        const request = JSON.parse(chunk.trim());
        expect(request).toMatchObject({ method: "workspace.list", token });
        socket.end(`${JSON.stringify({ jsonrpc: "2.0", id: request.id, result: [{ id: "one", name: "Notes" }] })}\n`);
      });
    });
    await new Promise((resolve, reject) => {
      server.once("error", reject);
      server.listen(socketPath, resolve);
    });
    await writeFile(path.join(dataDir, "agent-protocol.json"), JSON.stringify({
      version: 1,
      transport: "json-rpc+jsonl",
      socketPath,
      token,
      pid: process.pid,
    }), { mode: 0o600 });
    await chmod(path.join(dataDir, "agent-protocol.json"), 0o600);

    await expect(requestAgentRpc("workspace.list", {}, { dataDir }))
      .resolves.toEqual([{ id: "one", name: "Notes" }]);
    await new Promise((resolve) => server.close(resolve));
  });
});
