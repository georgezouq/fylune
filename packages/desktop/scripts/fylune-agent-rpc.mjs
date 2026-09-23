#!/usr/bin/env node
import { requestAgentRpc } from "../electron/lib/agent-rpc-client.mjs";

const [method, paramsJson = "{}"] = process.argv.slice(2);
if (!method) {
  process.stderr.write("Usage: fylune-agent-rpc <method> '{\"param\":\"value\"}'\n");
  process.exitCode = 2;
} else {
  const params = JSON.parse(paramsJson);
  const result = await requestAgentRpc(method, params);
  process.stdout.write(`${JSON.stringify({ jsonrpc: "2.0", id: 1, result })}\n`);
}
