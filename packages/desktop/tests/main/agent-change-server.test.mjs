import { createHash } from "node:crypto";
import { readFile, rm, stat, writeFile, mkdtemp, mkdir } from "node:fs/promises";
import net from "node:net";
import os from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  AgentChangeServer,
  agentProtocolEndpoint,
  applyAgentTextOperations,
} from "../../electron/lib/agent-change-server.mjs";
import { DraftStore, SnapshotStore } from "../../electron/lib/local-history.mjs";

function hash(value) {
  return createHash("sha256").update(value).digest("hex");
}

function rpc(connection, method, params = {}) {
  return new Promise((resolve, reject) => {
    const socket = net.createConnection(connection.socketPath);
    socket.setEncoding("utf8");
    let buffer = "";
    socket.on("error", reject);
    socket.on("connect", () => {
      socket.write(`${JSON.stringify({
        jsonrpc: "2.0",
        id: `${method}-${Date.now()}-${Math.random()}`,
        method,
        params,
        token: connection.token,
      })}\n`);
    });
    socket.on("data", (chunk) => {
      buffer += chunk;
      const newline = buffer.indexOf("\n");
      if (newline < 0) return;
      socket.end();
      resolve(JSON.parse(buffer.slice(0, newline)));
    });
  });
}

describe("local Agent change protocol", () => {
  let root;
  let dataDir;
  let server;
  let connection;
  let previews;
  let writes;

  it("uses a per-launch named pipe on Windows instead of a Unix socket path", () => {
    expect(agentProtocolEndpoint("C:\\Users\\Sam\\.fylune", {
      platform: "win32",
      pid: 4210,
      nonce: "a1b2c3d4",
    })).toBe("\\\\.\\pipe\\fylune-agent-4210-a1b2c3d4");
  });

  beforeEach(async () => {
    root = await mkdtemp(path.join(os.tmpdir(), "fylune-agent-protocol-workspace-"));
    dataDir = await mkdtemp(path.join(os.tmpdir(), "fylune-agent-protocol-data-"));
    await mkdir(path.join(root, "docs"));
    await writeFile(path.join(root, "docs", "plan.md"), "# Plan\n\nOwner: Sam\n\nStatus: Draft\n");
    previews = [];
    writes = [];
    const project = { id: "project-1", name: "Workspace", root };
    server = new AgentChangeServer({
      registry: {
        get: vi.fn(() => project),
        listRecent: vi.fn(() => [{
          projectId: project.id,
          name: project.name,
          path: project.root,
          lastOpenedAt: new Date().toISOString(),
        }]),
      },
      snapshotStore: new SnapshotStore(dataDir),
      draftStore: new DraftStore(dataDir),
      dataDir,
      onPreview: (event) => previews.push(event),
      onDocumentWrite: (event) => writes.push(event),
    });
    connection = await server.start();
  });

  afterEach(async () => {
    await server?.close();
    await Promise.all([
      rm(root, { recursive: true, force: true }),
      rm(dataDir, { recursive: true, force: true }),
    ]);
  });

  it("publishes a 0600 capability file and applies idempotent Base-relative patches", async () => {
    if (process.platform === "win32") {
      expect(connection.socketPath).toMatch(/^\\\\\.\\pipe\\fylune-agent-\d+-[a-f0-9]{8}$/);
    } else {
      expect(path.basename(connection.socketPath)).toMatch(/^a-[a-f0-9]{8}\.sock$/);
      expect(connection.socketPath).not.toBe(path.join(dataDir, "agent-change.sock"));
      expect((await stat(connection.socketPath)).mode & 0o777).toBe(0o600);
      expect((await stat(server.connectionFile)).mode & 0o777).toBe(0o600);
    }
    const persisted = JSON.parse(await readFile(server.connectionFile, "utf8"));
    expect(persisted).toMatchObject({
      version: 1,
      transport: "json-rpc+jsonl",
      socketPath: connection.socketPath,
    });
    expect(persisted.token).toHaveLength(64);

    const opened = (await rpc(connection, "document.open", {
      projectId: "project-1",
      documentPath: "docs/plan.md",
    })).result;
    const begun = (await rpc(connection, "change.begin", {
      projectId: "project-1",
      documentPath: "docs/plan.md",
      baseHash: opened.hash,
      agent: { id: "codex", displayName: "Codex", sessionId: "session-1" },
    })).result;
    const start = opened.content.indexOf("Sam");
    const params = {
      transactionId: begun.transactionId,
      sequence: 1,
      operationId: "owner-1",
      baseHash: opened.hash,
      operation: {
        type: "replace",
        start,
        end: start + 3,
        text: "Lee",
        beforeHash: hash("Sam"),
      },
    };
    expect((await rpc(connection, "change.patch", params)).result.sequence).toBe(1);
    expect((await rpc(connection, "change.patch", params)).result.sequence).toBe(1);
    expect(previews.at(-1)).toMatchObject({
      kind: "preview",
      transactionId: begun.transactionId,
      sourceKind: "integrated_agent",
      sourceId: "codex",
      displayName: "Codex",
    });
    expect(previews.at(-1).content).toContain("Owner: Lee");

    const committed = await rpc(connection, "change.commit", { transactionId: begun.transactionId });
    expect(committed.result).toMatchObject({ status: "merged", merged: false });
    expect(await readFile(path.join(root, "docs", "plan.md"), "utf8")).toContain("Owner: Lee");
    expect(writes.at(-1)).toMatchObject({
      transactionId: begun.transactionId,
      sourceKind: "integrated_agent",
      sourceId: "codex",
    });
  });

  it("targets semantic Markdown blocks by fingerprint without relying on stale offsets", async () => {
    const opened = (await rpc(connection, "document.open", {
      projectId: "project-1",
      documentPath: "docs/plan.md",
    })).result;
    expect(opened.capabilities.structurePatch).toBe(true);
    const begun = (await rpc(connection, "change.begin", {
      projectId: "project-1",
      documentPath: opened.documentPath,
      baseHash: opened.hash,
      agent: { id: "semantic-agent", displayName: "Semantic Agent" },
    })).result;

    const patched = await rpc(connection, "change.patch", {
      transactionId: begun.transactionId,
      sequence: 1,
      operationId: "status-block",
      baseHash: opened.hash,
      operation: {
        type: "replace_block",
        fingerprint: hash("Status: Draft\n"),
        text: "Status: Ready\n",
      },
    });

    expect(patched.result.sequence).toBe(1);
    expect(previews.at(-1).content).toContain("Status: Ready");
    await rpc(connection, "change.commit", { transactionId: begun.transactionId });
    expect(await readFile(path.join(root, "docs", "plan.md"), "utf8"))
      .toContain("Status: Ready");
  });

  it("merges two Agent transactions from the same Base without losing either change", async () => {
    const opened = (await rpc(connection, "document.open", {
      projectId: "project-1",
      documentPath: "docs/plan.md",
    })).result;
    const first = (await rpc(connection, "change.begin", {
      projectId: "project-1",
      documentPath: opened.documentPath,
      baseHash: opened.hash,
      agent: { id: "agent-a", displayName: "Agent A" },
    })).result;
    const second = (await rpc(connection, "change.begin", {
      projectId: "project-1",
      documentPath: opened.documentPath,
      baseHash: opened.hash,
      agent: { id: "agent-b", displayName: "Agent B" },
    })).result;
    const ownerStart = opened.content.indexOf("Sam");
    const statusStart = opened.content.indexOf("Draft");

    await rpc(connection, "change.patch", {
      transactionId: first.transactionId,
      sequence: 1,
      operationId: "agent-a-owner",
      baseHash: opened.hash,
      operation: { type: "replace", start: ownerStart, end: ownerStart + 3, text: "Lee" },
    });
    await rpc(connection, "change.patch", {
      transactionId: second.transactionId,
      sequence: 1,
      operationId: "agent-b-status",
      baseHash: opened.hash,
      operation: { type: "replace", start: statusStart, end: statusStart + 5, text: "Ready" },
    });
    await rpc(connection, "change.commit", { transactionId: first.transactionId });
    const secondCommit = await rpc(connection, "change.commit", { transactionId: second.transactionId });

    expect(secondCommit.result.merged).toBe(true);
    expect(await readFile(path.join(root, "docs", "plan.md"), "utf8"))
      .toBe("# Plan\n\nOwner: Lee\n\nStatus: Ready\n");
  });

  it("rejects sequence gaps and rolls a cancelled preview back through the renderer event", async () => {
    const opened = (await rpc(connection, "document.open", {
      projectId: "project-1",
      documentPath: "docs/plan.md",
    })).result;
    const begun = (await rpc(connection, "change.begin", {
      projectId: "project-1",
      documentPath: opened.documentPath,
      baseHash: opened.hash,
    })).result;
    const rejected = await rpc(connection, "change.patch", {
      transactionId: begun.transactionId,
      sequence: 2,
      operationId: "out-of-order",
      baseHash: opened.hash,
      operation: { type: "replace", start: 0, end: 0, text: "Draft " },
    });
    expect(rejected.error).toMatchObject({ code: "SEQUENCE_GAP" });

    const cancelled = await rpc(connection, "change.cancel", { transactionId: begun.transactionId });
    expect(cancelled.result).toEqual({ cancelled: true, transactionId: begun.transactionId });
    expect(previews.at(-1)).toMatchObject({
      kind: "preview-cancel",
      transactionId: begun.transactionId,
    });
  });

  it("keeps overlapping concurrent Agent content as a draft instead of overwriting", async () => {
    const opened = (await rpc(connection, "document.open", {
      projectId: "project-1",
      documentPath: "docs/plan.md",
    })).result;
    const first = (await rpc(connection, "change.begin", {
      projectId: "project-1",
      documentPath: opened.documentPath,
      baseHash: opened.hash,
      agent: { id: "agent-a" },
    })).result;
    const second = (await rpc(connection, "change.begin", {
      projectId: "project-1",
      documentPath: opened.documentPath,
      baseHash: opened.hash,
      agent: { id: "agent-b" },
    })).result;
    const ownerStart = opened.content.indexOf("Sam");
    await rpc(connection, "change.patch", {
      transactionId: first.transactionId,
      sequence: 1,
      operationId: "owner-a",
      baseHash: opened.hash,
      operation: { type: "replace", start: ownerStart, end: ownerStart + 3, text: "Lee" },
    });
    await rpc(connection, "change.patch", {
      transactionId: second.transactionId,
      sequence: 1,
      operationId: "owner-b",
      baseHash: opened.hash,
      operation: { type: "replace", start: ownerStart, end: ownerStart + 3, text: "Taylor" },
    });
    await rpc(connection, "change.commit", { transactionId: first.transactionId });
    const rejected = await rpc(connection, "change.commit", { transactionId: second.transactionId });

    expect(rejected.error).toMatchObject({
      code: "AGENT_REVIEW_REQUIRED",
    });
    expect(await readFile(path.join(root, "docs", "plan.md"), "utf8"))
      .toContain("Owner: Lee");
    const draft = await new DraftStore(dataDir).load(root, "docs/plan.md");
    expect(draft.content).toContain("Owner: Taylor");
    expect(previews.at(-1)).toMatchObject({
      kind: "preview-cancel",
      transactionId: second.transactionId,
    });
  });
});

describe("Agent patch validation", () => {
  it("applies non-overlapping operations against immutable Base offsets", () => {
    expect(applyAgentTextOperations("abcdef", [
      { start: 1, end: 2, text: "B" },
      { start: 4, end: 5, text: "E" },
    ])).toBe("aBcdEf");
  });

  it("rejects overlapping ranges and stale before hashes", () => {
    expect(() => applyAgentTextOperations("abcdef", [
      { start: 1, end: 4, text: "x" },
      { start: 3, end: 5, text: "y" },
    ])).toThrow(/non-overlapping/);
    expect(() => applyAgentTextOperations("abcdef", [
      { start: 1, end: 2, text: "B", beforeHash: hash("wrong") },
    ])).toThrow(/no longer matches/);
  });
});
