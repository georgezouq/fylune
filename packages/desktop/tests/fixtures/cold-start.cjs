const { app } = require("electron");
const os = require("node:os");
const path = require("node:path");
const process = require("node:process");
const { syncBuiltinESMExports } = require("node:module");

const root = process.env.FYLUNE_QA_ROOT;
if (!root || !path.isAbsolute(root)) throw new Error("An isolated QA directory is required");
// Isolate both the instance lock and all Fylune state without changing the user's
// HOME, installed app, recent projects, Keychain, or screenshot preferences.
app.setPath("userData", path.join(root, "legacy"));
os.homedir = () => root;
syncBuiltinESMExports();
app.commandLine.appendSwitch("lang", "en-US");
require("../../electron/bootstrap.cjs");

// Reproduce LaunchServices delivery on the first tick, before main.mjs imports
// or data migration can complete. This must not be passed through process.argv.
app.emit("open-file", { preventDefault() {} }, process.env.FYLUNE_QA_OPEN_FILE);
