import { readFile, stat } from "node:fs/promises";
import { homedir } from "node:os";
import net from "node:net";
import path from "node:path";

import { resolveFyluneDataPath } from "./app-data.mjs";
import { FyluneError } from "./errors.mjs";

export async function readAgentConnection(dataDir = resolveFyluneDataPath(homedir())) {
  const connectionFile = path.join(dataDir, "agent-protocol.json");
  let raw;
  try {
    const info = await stat(connectionFile);
    if (process.platform !== "win32" && (info.mode & 0o077) !== 0) {
      throw new FyluneError("AGENT_DESCRIPTOR_INSECURE", "The Fylune Agent descriptor has unsafe permissions.");
    }
    raw = await readFile(connectionFile, "utf8");
  } catch (error) {
    if (error?.code === "ENOENT") {
      throw new FyluneError("AGENT_UNAVAILABLE", "Fylune is not running. Open Fylune and try again.");
    }
    throw error;
  }
  let connection;
  try {
    connection = JSON.parse(raw);
  } catch {
    throw new FyluneError("AGENT_PROTOCOL_INVALID", "The Fylune Agent descriptor is invalid or incompatible.");
  }
  if (
    connection?.version !== 1
    || connection.transport !== "json-rpc+jsonl"
    || typeof connection.socketPath !== "string"
    || typeof connection.token !== "string"
    || connection.token.length < 32
    || !Number.isSafeInteger(connection.pid)
    || connection.pid <= 0
  ) {
    throw new FyluneError("AGENT_PROTOCOL_INVALID", "The Fylune Agent descriptor is invalid or incompatible.");
  }
  try {
    process.kill(connection.pid, 0);
  } catch {
    throw new FyluneError("AGENT_UNAVAILABLE", "Fylune is not running. Open Fylune and try again.");
  }
  return connection;
}

export async function requestAgentRpc(method, params = {}, options = {}) {
  if (typeof method !== "string" || !method) {
    throw new FyluneError("INVALID_ARGUMENT", "An Agent RPC method is required.");
  }
  const connection = options.connection || await readAgentConnection(options.dataDir);
  const timeoutMs = options.timeoutMs ?? 5_000;
  const id = 1;
  return new Promise((resolve, reject) => {
    const socket = net.createConnection(connection.socketPath);
    socket.setEncoding("utf8");
    socket.setTimeout(timeoutMs);
    let buffer = "";
    let settled = false;
    const finish = (callback, value) => {
      if (settled) return;
      settled = true;
      socket.destroy();
      callback(value);
    };
    socket.on("connect", () => socket.write(`${JSON.stringify({
      jsonrpc: "2.0",
      id,
      method,
      params,
      token: connection.token,
    })}\n`));
    socket.on("data", (chunk) => {
      buffer += chunk;
      let newline = buffer.indexOf("\n");
      while (newline >= 0) {
        const line = buffer.slice(0, newline);
        buffer = buffer.slice(newline + 1);
        newline = buffer.indexOf("\n");
        if (!line.trim()) continue;
        let response;
        try {
          response = JSON.parse(line);
        } catch {
          finish(reject, new FyluneError("AGENT_PROTOCOL_INVALID", "Fylune returned an invalid Agent response."));
          return;
        }
        if (response.id !== id) continue;
        if (response.error) {
          finish(reject, new FyluneError(
            response.error.code || "AGENT_RPC_FAILED",
            response.error.message || "The Fylune Agent request failed.",
            response.error.data,
          ));
        } else finish(resolve, response.result);
        return;
      }
    });
    socket.on("timeout", () => finish(reject, new FyluneError("AGENT_TIMEOUT", "Fylune did not answer the Agent request.")));
    socket.on("error", () => finish(reject, new FyluneError("AGENT_UNAVAILABLE", "Fylune Agent is unavailable. Open Fylune and try again.")));
    socket.on("end", () => finish(reject, new FyluneError("AGENT_PROTOCOL_INVALID", "Fylune closed the Agent connection without a response.")));
  });
}
