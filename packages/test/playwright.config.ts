/* global process */
import { defineConfig, devices } from "@playwright/test";

/**
 * See https://playwright.dev/docs/test-configuration.
 */
export default defineConfig({
  testDir: "./e2e",
  snapshotPathTemplate: "./e2e/snapshots/{arg}{ext}",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: "html",
  use: {
    baseURL: "http://localhost:4323",
    trace: "on-first-retry",
  },

  projects: [
    {
      name: "chromium",
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 1280, height: 720 },
        deviceScaleFactor: 1,
        // Pin the WebGL stack to SwiftShader so snapshots are identical across
        // machines (local dev, CI, contributors). Without this, rendering goes
        // through each host's GPU driver and alpha-heavy scenes diverge by a
        // few percent of pixels.
        launchOptions: {
          args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--disable-gpu"],
        },
      },
    },
  ],

  webServer: {
    command: "npm run start --workspace=@sigma/website -- --port 4323",
    url: "http://localhost:4323",
    reuseExistingServer: !process.env.CI,
    timeout: 120000,
  },
});
