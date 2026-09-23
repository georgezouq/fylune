const { app, dialog } = require("electron");

app.setName("Fylune");

const cliIndex = process.argv.indexOf("--fylune-cli");
if (cliIndex >= 0) {
  import("./cli.mjs")
    .then(({ runCli }) => runCli({ app, argv: process.argv.slice(cliIndex + 1) }))
    .then((code) => app.exit(code))
    .catch((error) => {
      process.stderr.write(`fylune: ${error?.message || "The command failed."} [INTERNAL_ERROR]\n`);
      app.exit(10);
    });
} else if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  const { captureLaunchEvents } = require("./lib/launch-events.cjs");
  const connectLaunchEvents = captureLaunchEvents(app);
  import("./main.mjs").then(({ handleLaunchRequest }) => {
    connectLaunchEvents(handleLaunchRequest);
  }).catch((error) => {
    console.error("Fylune could not start", error);
    void app.whenReady().then(() => {
      dialog.showErrorBox(
        "Fylune could not start",
        "The application could not open its local workspace. Please restart Fylune or check the launch log.",
      );
      app.quit();
    });
  });
}
