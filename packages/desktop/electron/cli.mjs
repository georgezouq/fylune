import { spawn } from "node:child_process";
import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import path from "node:path";

import { requestAgentRpc, readAgentConnection } from "./lib/agent-rpc-client.mjs";
import { cliOptionsFromApp, getCliStatus } from "./lib/cli-installer.mjs";
import { resolveFyluneDataPath } from "./lib/app-data.mjs";
import { FyluneError } from "./lib/errors.mjs";
import { resolveOpenTarget } from "./lib/open-target.mjs";

const HELP = `Fylune CLI

Usage:
  fylune [path]                  Open Fylune, a folder, or a document
  fylune open <path>             Open a folder or document
  fylune doctor [--json]         Check the CLI and local Agent connection
  fylune agent status [--json]   Check the local Agent connection
  fylune agent workspaces        List available Fylune workspaces
  fylune agent open <document>   Read a document Base through the Agent protocol
  fylune agent rpc <method> [--params <json>]

Examples:
  fylune .
  fylune docs/notes.md
  fylune agent workspaces --json
`;

function parseInternalCwd(argv) {
  const args = [...argv];
  const index = args.indexOf("--cwd");
  if (index < 0) return { args, cwd: process.cwd() };
  const cwd = args[index + 1];
  if (!cwd) throw new FyluneError("INVALID_ARGUMENT", "The internal --cwd option needs a directory.");
  args.splice(index, 2);
  return { args, cwd };
}

function optionValue(args, name, fallback = null) {
  const index = args.indexOf(name);
  if (index < 0) return fallback;
  if (!args[index + 1]) throw new FyluneError("INVALID_ARGUMENT", `${name} needs a value.`);
  return args[index + 1];
}

function printJson(value) {
  process.stdout.write(`${JSON.stringify(value)}\n`);
}

function displayPath(value) {
  const home = homedir();
  return value === home || value.startsWith(`${home}${path.sep}`)
    ? `~${value.slice(home.length)}`
    : value;
}

async function dispatchDesktop(app, targetPath = null) {
  const childArgs = app.isPackaged ? [] : [app.getAppPath()];
  childArgs.push(targetPath ? `--fylune-open=${targetPath}` : "--fylune-focus");
  const env = { ...process.env };
  delete env.ELECTRON_RUN_AS_NODE;
  await new Promise((resolve, reject) => {
    const child = spawn(process.execPath, childArgs, {
      detached: true,
      stdio: "ignore",
      env,
    });
    child.once("spawn", () => {
      child.unref();
      resolve();
    });
    child.once("error", reject);
  });
}

async function agentStatus(options = {}) {
  const connection = await readAgentConnection(options.dataDir);
  await requestAgentRpc("workspace.list", {}, { ...options, connection });
  return {
    available: true,
    protocolVersion: connection.version,
    transport: connection.transport,
    pid: connection.pid,
  };
}

async function findAgentDocument(documentInput, cwd, dataDir) {
  const target = await resolveOpenTarget(documentInput, cwd);
  if (target.kind !== "file") {
    throw new FyluneError("INVALID_ARGUMENT", "Agent document open requires a Markdown, MDX, JSON, or JSONL file.");
  }
  let state;
  try {
    state = JSON.parse(await readFile(path.join(dataDir, "recent-projects.json"), "utf8"));
  } catch (error) {
    if (error?.code === "ENOENT") {
      throw new FyluneError("PROJECT_NOT_OPEN", "Open the document's workspace in Fylune first.");
    }
    throw error;
  }
  const candidates = (state?.projects || []).filter((project) => {
    if (typeof project?.id !== "string" || typeof project.root !== "string" || !path.isAbsolute(project.root)) return false;
    const relative = path.relative(project.root, target.path);
    return relative && relative !== ".." && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative);
  }).sort((left, right) => right.root.length - left.root.length);
  const project = candidates[0];
  if (!project) throw new FyluneError("PROJECT_NOT_OPEN", "Open the document's workspace in Fylune first.");
  return {
    projectId: project.id,
    documentPath: path.relative(project.root, target.path).split(path.sep).join("/"),
  };
}

async function runAgent(args, cwd) {
  const command = args[0] || "status";
  const json = args.includes("--json");
  const dataDir = resolveFyluneDataPath(homedir());
  let result;
  if (command === "status") {
    result = await agentStatus({ dataDir });
    if (json) printJson({ version: 1, ...result });
    else process.stdout.write(`Fylune Agent is available (protocol ${result.protocolVersion}, pid ${result.pid}).\n`);
    return;
  }
  if (command === "workspaces") {
    result = await requestAgentRpc("workspace.list", {}, { dataDir });
  } else if (command === "open") {
    if (!args[1] || args[1].startsWith("--")) {
      throw new FyluneError("INVALID_ARGUMENT", "Usage: fylune agent open <document> [--json]");
    }
    const params = await findAgentDocument(args[1], cwd, dataDir);
    result = await requestAgentRpc("document.open", params, { dataDir });
  } else if (command === "rpc") {
    const method = args[1];
    if (!method || method.startsWith("--")) {
      throw new FyluneError("INVALID_ARGUMENT", "Usage: fylune agent rpc <method> [--params <json>]");
    }
    let params;
    try {
      params = JSON.parse(optionValue(args, "--params", "{}"));
    } catch {
      throw new FyluneError("INVALID_ARGUMENT", "--params must be valid JSON.");
    }
    result = await requestAgentRpc(method, params, { dataDir });
  } else {
    throw new FyluneError("INVALID_ARGUMENT", `Unknown Agent command: ${command}`);
  }
  if (json) {
    printJson(command === "workspaces"
      ? { version: 1, workspaces: result }
      : command === "open"
        ? { version: 1, document: result }
        : { version: 1, result });
  } else if (command === "rpc" || command === "open") printJson(result);
  else for (const workspace of result) process.stdout.write(`${workspace.id}\t${workspace.name}\n`);
}

async function runDoctor(app, json) {
  const cli = await getCliStatus(cliOptionsFromApp(app));
  let agent;
  try {
    agent = await agentStatus();
  } catch (error) {
    agent = { available: false, code: error?.code || "AGENT_UNAVAILABLE" };
  }
  const result = {
    version: 1,
    ok: cli.status === "installed" && cli.pathConfigured,
    desktopVersion: app.getVersion(),
    cli: {
      status: cli.status,
      pathConfigured: cli.pathConfigured,
      installPath: displayPath(cli.installPath),
    },
    agent,
  };
  if (json) printJson(result);
  else {
    process.stdout.write(`Fylune Desktop: ${result.desktopVersion}\n`);
    process.stdout.write(`CLI launcher: ${cli.status}${cli.pathConfigured ? "" : " (not on PATH)"}\n`);
    process.stdout.write(`Agent: ${agent.available ? "available" : "unavailable"}\n`);
  }
}

function exitCodeFor(error) {
  if (error?.code === "AGENT_UNAVAILABLE") return 4;
  if (String(error?.code || "").startsWith("AGENT_")) return 5;
  if (new Set(["ENOENT", "EACCES", "EPERM", "INVALID_ARGUMENT", "UNSUPPORTED_FILE", "PROJECT_NOT_OPEN"]).has(error?.code)) return 2;
  return 10;
}

export async function runCli({ app, argv }) {
  let json = argv.includes("--json");
  try {
    const parsed = parseInternalCwd(argv);
    const args = parsed.args;
    json = args.includes("--json");
    if (args.includes("--help") || args.includes("-h")) {
      process.stdout.write(HELP);
      return 0;
    }
    if (args.includes("--version") || args.includes("-v")) {
      process.stdout.write(`${app.getVersion()}\n`);
      return 0;
    }
    if (args[0] === "doctor") {
      await runDoctor(app, json);
      return 0;
    }
    if (args[0] === "agent") {
      await runAgent(args.slice(1), parsed.cwd);
      return 0;
    }
    const openArgs = args[0] === "open" ? args.slice(1) : args;
    if (openArgs.length > 1) {
      throw new FyluneError("INVALID_ARGUMENT", "Open one file or folder at a time.");
    }
    const target = openArgs[0] ? await resolveOpenTarget(openArgs[0], parsed.cwd) : null;
    await dispatchDesktop(app, target?.path || null);
    return 0;
  } catch (error) {
    const code = error?.code || "INTERNAL_ERROR";
    if (json) printJson({ version: 1, ok: false, error: { code, message: error?.message || "Fylune CLI failed." } });
    else process.stderr.write(`fylune: ${error?.message || "The command failed."} [${code}]\n`);
    return exitCodeFor(error);
  }
}
