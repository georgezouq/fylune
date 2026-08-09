import { createHash, randomBytes, randomUUID } from "node:crypto";
import { chmod, unlink, writeFile } from "node:fs/promises";
import net from "node:net";
import path from "node:path";

import { segmentMarkdown } from "@fylune/document-collaboration";

import { readDocument } from "./file-engine.mjs";
import { FyluneError } from "./errors.mjs";
import { saveAgentCandidate } from "./agent-candidate.mjs";

const MAX_REQUEST_BYTES = 2 * 1024 * 1024;
const MAX_TRANSACTIONS = 100;
const MAX_OPEN_BASES = 100;

export function agentProtocolEndpoint(
  dataDir,
  {
    platform = process.platform,
    pid = process.pid,
    nonce = randomBytes(4).toString("hex"),
  } = {},
) {
  if (platform === "win32") {
    return `\\\\.\\pipe\\fylune-agent-${pid}-${nonce}`;
  }
  return path.join(dataDir, `a-${nonce}.sock`);
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function rpcError(code, message, data) {
  return { code, message, ...(data ? { data } : {}) };
}

function applyTextOperations(base, operations) {
  const ordered = [...operations].sort((left, right) => left.start - right.start || left.end - right.end);
  let previousEnd = 0;
  for (const operation of ordered) {
    if (
      !Number.isSafeInteger(operation.start)
      || !Number.isSafeInteger(operation.end)
      || operation.start < previousEnd
      || operation.start < 0
      || operation.end < operation.start
      || operation.end > base.length
      || typeof operation.text !== "string"
    ) {
      throw new FyluneError("INVALID_PATCH", "Patch ranges must be non-overlapping Base offsets.");
    }
    if (operation.beforeHash && sha256(base.slice(operation.start, operation.end)) !== operation.beforeHash) {
      throw new FyluneError("PATCH_BASE_MISMATCH", "The patch target no longer matches its declared Base range.");
    }
    previousEnd = operation.end;
  }
  let candidate = base;
  for (const operation of ordered.reverse()) {
    candidate = `${candidate.slice(0, operation.start)}${operation.text}${candidate.slice(operation.end)}`;
  }
  return candidate;
}

function normalizeOperation(base, operation) {
  if (operation?.type === "replace") {
    return {
      start: operation.start,
      end: operation.end,
      text: operation.text,
      beforeHash: operation.beforeHash || null,
    };
  }
  if (operation?.type !== "replace_block") {
    throw new FyluneError(
      "UNSUPPORTED_PATCH",
      "Use a Base-relative replace or semantic replace_block operation.",
    );
  }
  if (!/^[a-f0-9]{64}$/i.test(operation.fingerprint || "")) {
    throw new FyluneError("INVALID_PATCH", "A semantic block patch needs a SHA-256 fingerprint.");
  }
  const occurrence = operation.occurrence ?? 0;
  if (!Number.isSafeInteger(occurrence) || occurrence < 0 || typeof operation.text !== "string") {
    throw new FyluneError("INVALID_PATCH", "A semantic block patch has invalid fields.");
  }
  let offset = 0;
  let matched = 0;
  for (const block of segmentMarkdown(base)) {
    const start = offset;
    offset += block.length;
    if (sha256(block) !== operation.fingerprint) continue;
    if (matched === occurrence) {
      return {
        start,
        end: offset,
        text: operation.text,
        beforeHash: operation.fingerprint,
      };
    }
    matched += 1;
  }
  throw new FyluneError(
    "PATCH_BLOCK_NOT_FOUND",
    "The semantic block is not present in this transaction Base.",
  );
}

/**
 * Local-only JSON-RPC broker for integrated Agents.
 *
 * Authentication is a per-launch capability token stored in the user's data
 * directory beside the local endpoint descriptor. Every commit still goes through the same three-way merge,
 * snapshot, draft, and CAS path as the built-in Pi Agent.
 */
export class AgentChangeServer {
  #registry;
  #snapshotStore;
  #draftStore;
  #onPreview;
  #onDocumentWrite;
  #server = null;
  #token = null;
  #transactions = new Map();
  #openedBases = new Map();
  #subscribers = new Set();
  #platform;

  constructor({
    registry,
    snapshotStore,
    draftStore,
    dataDir,
    onPreview,
    onDocumentWrite,
    platform = process.platform,
  }) {
    this.#registry = registry;
    this.#snapshotStore = snapshotStore;
    this.#draftStore = draftStore;
    this.#onPreview = onPreview;
    this.#onDocumentWrite = onDocumentWrite;
    this.#platform = platform;
    // The descriptor is stable, while the actual local address is unique per
    // launch. An abandoned socket or another Fylune process can therefore
    // never block startup the way a fixed TCP port (or socket path) would.
    this.socketPath = agentProtocolEndpoint(dataDir, { platform });
    this.connectionFile = path.join(dataDir, "agent-protocol.json");
  }

  async start() {
    if (this.#server) return this.connectionInfo();
    this.#token = randomBytes(32).toString("hex");
    if (this.#platform !== "win32") {
      await unlink(this.socketPath).catch((error) => {
        if (error?.code !== "ENOENT") throw error;
      });
    }
    this.#server = net.createServer((socket) => this.#accept(socket));
    await new Promise((resolve, reject) => {
      this.#server.once("error", reject);
      this.#server.listen(this.socketPath, () => {
        this.#server.off("error", reject);
        resolve();
      });
    });
    if (this.#platform !== "win32") await chmod(this.socketPath, 0o600);
    await writeFile(this.connectionFile, JSON.stringify(this.connectionInfo(), null, 2), {
      encoding: "utf8",
      mode: 0o600,
    });
    if (this.#platform !== "win32") await chmod(this.connectionFile, 0o600);
    return this.connectionInfo();
  }

  connectionInfo() {
    return {
      version: 1,
      transport: "json-rpc+jsonl",
      socketPath: this.socketPath,
      token: this.#token,
      pid: process.pid,
    };
  }

  async close() {
    for (const socket of this.#subscribers) socket.destroy();
    this.#subscribers.clear();
    if (this.#server) {
      await new Promise((resolve) => this.#server.close(resolve));
      this.#server = null;
    }
    await Promise.all([
      this.#platform === "win32"
        ? Promise.resolve()
        : unlink(this.socketPath).catch(() => {}),
      unlink(this.connectionFile).catch(() => {}),
    ]);
  }

  #accept(socket) {
    socket.setEncoding("utf8");
    let buffer = "";
    socket.on("data", (chunk) => {
      buffer += chunk;
      if (Buffer.byteLength(buffer) > MAX_REQUEST_BYTES) {
        socket.destroy(new Error("Agent protocol request exceeded the local size limit."));
        return;
      }
      let newline = buffer.indexOf("\n");
      while (newline >= 0) {
        const line = buffer.slice(0, newline);
        buffer = buffer.slice(newline + 1);
        if (line.trim()) void this.#handleLine(socket, line);
        newline = buffer.indexOf("\n");
      }
    });
    socket.on("close", () => this.#subscribers.delete(socket));
  }

  async #handleLine(socket, line) {
    let request;
    try {
      request = JSON.parse(line);
      if (request?.jsonrpc !== "2.0" || request.id == null || typeof request.method !== "string") {
        throw new FyluneError("INVALID_REQUEST", "Expected a JSON-RPC 2.0 request with an id and method.");
      }
      if (request.token !== this.#token) {
        this.#reply(socket, request.id, null, rpcError("UNAUTHORIZED", "Invalid Fylune capability token."));
        return;
      }
      const result = await this.#dispatch(request.method, request.params || {}, socket);
      this.#reply(socket, request.id, result);
    } catch (error) {
      this.#reply(
        socket,
        request?.id ?? null,
        null,
        rpcError(error?.code || "INTERNAL_ERROR", error?.message || "Agent protocol request failed.", error?.details),
      );
    }
  }

  #reply(socket, id, result, error = null) {
    if (socket.destroyed) return;
    socket.write(`${JSON.stringify({ jsonrpc: "2.0", id, ...(error ? { error } : { result }) })}\n`);
  }

  #notify(method, params) {
    const payload = `${JSON.stringify({ jsonrpc: "2.0", method, params })}\n`;
    for (const socket of this.#subscribers) {
      if (!socket.destroyed) socket.write(payload);
    }
  }

  async #dispatch(method, params, socket) {
    if (method === "workspace.list") {
      return this.#registry.listRecent().map((project) => ({
        id: project.projectId || project.id,
        name: project.name,
      }));
    }
    if (method === "document.open") return this.#openDocument(params);
    if (method === "change.begin") return this.#begin(params);
    if (method === "change.patch") return this.#patch(params);
    if (method === "change.commit") return this.#commit(params);
    if (method === "change.cancel") return this.#cancel(params);
    if (method === "change.status") return this.#status(params);
    if (method === "change.subscribe") {
      this.#subscribers.add(socket);
      return { subscribed: true };
    }
    throw new FyluneError("METHOD_NOT_FOUND", `Unknown Fylune Agent protocol method: ${method}`);
  }

  async #openDocument({ projectId, documentPath }) {
    const project = this.#registry.get(projectId);
    const document = await readDocument(project.root, documentPath);
    this.#openedBases.set(`${projectId}:${document.path}:${document.hash}`, document);
    while (this.#openedBases.size > MAX_OPEN_BASES) {
      this.#openedBases.delete(this.#openedBases.keys().next().value);
    }
    return {
      sessionId: randomUUID(),
      documentPath: document.path,
      content: document.content,
      hash: document.hash,
      capabilities: {
        textPatch: true,
        structurePatch: true,
        preview: true,
        atomicCommit: true,
      },
    };
  }

  async #begin({ projectId, documentPath, baseHash, agent = {}, summary = null }) {
    if (this.#transactions.size >= MAX_TRANSACTIONS) {
      throw new FyluneError("TOO_MANY_TRANSACTIONS", "Finish or cancel an existing Agent transaction first.");
    }
    const project = this.#registry.get(projectId);
    const disk = await readDocument(project.root, documentPath);
    const base = disk.hash === baseHash
      ? disk
      : this.#openedBases.get(`${projectId}:${disk.path}:${baseHash}`);
    if (!base) {
      throw new FyluneError("BASE_NOT_AVAILABLE", "Open the document again before starting from this Base hash.");
    }
    const transactionId = randomUUID();
    const transaction = {
      transactionId,
      projectId,
      project,
      path: disk.path,
      base,
      sequence: 0,
      operations: [],
      operationIds: new Set(),
      candidate: base.content,
      status: "preview",
      sourceId: String(agent.id || "integrated-agent").slice(0, 80),
      displayName: String(agent.displayName || "Integrated Agent").slice(0, 80),
      sessionId: String(agent.sessionId || "").slice(0, 120) || null,
      summary: typeof summary === "string" ? summary.slice(0, 240) : null,
      createdAt: new Date().toISOString(),
    };
    this.#transactions.set(transactionId, transaction);
    this.#notify("change.updated", this.#publicStatus(transaction));
    return this.#publicStatus(transaction);
  }

  async #patch({ transactionId, sequence, operationId, baseHash, operation }) {
    const transaction = this.#requireTransaction(transactionId);
    if (transaction.status !== "preview") {
      throw new FyluneError("TRANSACTION_NOT_EDITABLE", "This Agent transaction is already being committed.");
    }
    if (typeof operationId !== "string" || operationId.length < 1 || operationId.length > 120) {
      throw new FyluneError("INVALID_PATCH", "Each patch needs a stable operationId.");
    }
    if (baseHash !== transaction.base.hash) {
      throw new FyluneError("BASE_HASH_MISMATCH", "This patch does not target the transaction Base.");
    }
    if (transaction.operationIds.has(operationId)) return this.#publicStatus(transaction);
    if (sequence !== transaction.sequence + 1) {
      throw new FyluneError("SEQUENCE_GAP", `Expected sequence ${transaction.sequence + 1}.`, {
        expected: transaction.sequence + 1,
      });
    }
    transaction.operations.push(normalizeOperation(transaction.base.content, operation));
    transaction.candidate = applyTextOperations(transaction.base.content, transaction.operations);
    transaction.sequence = sequence;
    transaction.operationIds.add(operationId);
    this.#onPreview?.({
      projectId: transaction.projectId,
      path: transaction.path,
      kind: "preview",
      transactionId,
      baseHash: transaction.base.hash,
      content: transaction.candidate,
      sourceKind: "integrated_agent",
      sourceId: transaction.sourceId,
      displayName: transaction.displayName,
      detectedAt: new Date().toISOString(),
    });
    this.#notify("change.updated", this.#publicStatus(transaction));
    return this.#publicStatus(transaction);
  }

  async #commit({ transactionId }) {
    const transaction = this.#requireTransaction(transactionId);
    if (transaction.status !== "preview") {
      throw new FyluneError("TRANSACTION_NOT_EDITABLE", "This Agent transaction is already being committed.");
    }
    transaction.status = "committing";
    this.#notify("change.updated", this.#publicStatus(transaction));
    try {
      const previous = await readDocument(transaction.project.root, transaction.path);
      const saved = await saveAgentCandidate({
        root: transaction.project.root,
        relativePath: transaction.path,
        candidate: transaction.candidate,
        baseline: transaction.base,
        previous,
        snapshotStore: this.#snapshotStore,
        draftStore: this.#draftStore,
        onWrite: (absolutePath, hash, metadata = {}) => this.#onDocumentWrite?.({
          absolutePath,
          hash,
          snapshotId: metadata.snapshotId ?? null,
          projectId: transaction.projectId,
          path: transaction.path,
          transactionId,
          sourceKind: "integrated_agent",
          sourceId: transaction.sourceId,
          displayName: transaction.displayName,
        }),
      });
      transaction.status = "merged";
      transaction.savedHash = saved.hash;
      this.#notify("change.updated", this.#publicStatus(transaction));
      this.#transactions.delete(transactionId);
      return { ...this.#publicStatus(transaction), hash: saved.hash, merged: saved.merged };
    } catch (error) {
      transaction.status = error?.code === "AGENT_REVIEW_REQUIRED" ? "review" : "failed";
      this.#onPreview?.({
        projectId: transaction.projectId,
        path: transaction.path,
        kind: "preview-cancel",
        transactionId,
        sourceKind: "integrated_agent",
        sourceId: transaction.sourceId,
        displayName: transaction.displayName,
        detectedAt: new Date().toISOString(),
      });
      this.#notify("change.updated", this.#publicStatus(transaction));
      this.#transactions.delete(transactionId);
      throw error;
    }
  }

  #cancel({ transactionId }) {
    const transaction = this.#requireTransaction(transactionId);
    if (transaction.status !== "preview") {
      throw new FyluneError("TRANSACTION_NOT_EDITABLE", "A committing Agent transaction cannot be cancelled.");
    }
    transaction.status = "cancelled";
    this.#onPreview?.({
      projectId: transaction.projectId,
      path: transaction.path,
      kind: "preview-cancel",
      transactionId,
      sourceKind: "integrated_agent",
      sourceId: transaction.sourceId,
      displayName: transaction.displayName,
      detectedAt: new Date().toISOString(),
    });
    this.#notify("change.updated", this.#publicStatus(transaction));
    this.#transactions.delete(transactionId);
    return { cancelled: true, transactionId };
  }

  #status({ transactionId }) {
    return this.#publicStatus(this.#requireTransaction(transactionId));
  }

  #requireTransaction(transactionId) {
    const transaction = this.#transactions.get(transactionId);
    if (!transaction) throw new FyluneError("TRANSACTION_NOT_FOUND", "The Agent transaction is no longer active.");
    return transaction;
  }

  #publicStatus(transaction) {
    return {
      transactionId: transaction.transactionId,
      projectId: transaction.projectId,
      documentPath: transaction.path,
      baseHash: transaction.base.hash,
      sequence: transaction.sequence,
      status: transaction.status,
      sourceId: transaction.sourceId,
      displayName: transaction.displayName,
      summary: transaction.summary,
      createdAt: transaction.createdAt,
    };
  }
}

export const applyAgentTextOperations = applyTextOperations;
