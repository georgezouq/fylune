#!/usr/bin/env node
import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import net from "node:net";
import path from "node:path";

const [method, paramsJson = "{}"] = process.argv.slice(2);
if (!method) {
  process.stderr.write("Usage: fylune-agent-rpc <method> '{\"param\":\"value\"}'\n");
  process.exitCode = 2;
} else {
  const connection = JSON.parse(await readFile(path.join(homedir(), ".fylune", "agent-protocol.json"), "utf8"));
  const params = JSON.parse(paramsJson);
  const socket = net.createConnection(connection.socketPath);
  socket.setEncoding("utf8");
  socket.on("connect", () => {
    socket.write(`${JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method,
      params,
      token: connection.token,
    })}\n`);
  });
  let buffer = "";
  socket.on("data", (chunk) => {
    buffer += chunk;
    const newline = buffer.indexOf("\n");
    if (newline < 0) return;
    process.stdout.write(`${buffer.slice(0, newline)}\n`);
    socket.end();
  });
}
