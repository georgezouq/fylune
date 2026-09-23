const path = require("node:path");

// macOS can deliver open-file before the asynchronous ESM entrypoint has loaded.
// Install these listeners synchronously and retain requests until startup completes.
function captureLaunchEvents(app) {
  let connect;
  const handlerReady = new Promise((resolve) => { connect = resolve; });
  let queue = Promise.resolve();
  const enqueue = (request) => {
    queue = queue.then(() => handlerReady).then((handle) => handle(request)).catch((error) => {
      process.stderr.write(`Could not open the requested path: ${error?.code || error?.message || "OPEN_FAILED"}\n`);
    });
  };

  app.on("open-file", (event, filePath) => {
    event.preventDefault();
    if (typeof filePath === "string" && path.isAbsolute(filePath)) enqueue({ filePath });
  });
  app.on("second-instance", (_event, argv) => enqueue({ argv }));

  return connect;
}

module.exports = { captureLaunchEvents };
