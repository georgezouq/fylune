import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/e2e",
  outputDir: "../../tmp/qa/desktop/test-results",
  timeout: 45_000,
  fullyParallel: false,
  retries: 0,
  reporter: "list",
  use: {
    locale: "en-US",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  webServer: {
    command: "pnpm preview --host 127.0.0.1 --port 45173 --strictPort",
    url: "http://127.0.0.1:45173",
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
