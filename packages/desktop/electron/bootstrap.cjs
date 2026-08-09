const { app, dialog } = require("electron");

app.setName("Fylune");

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else import("./main.mjs").catch((error) => {
  console.error("Fylune could not start", error);
  void app.whenReady().then(() => {
    dialog.showErrorBox(
      "Fylune could not start",
      "The application could not open its local workspace. Please restart Fylune or check the launch log.",
    );
    app.quit();
  });
});
