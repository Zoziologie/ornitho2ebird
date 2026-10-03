import { defineConfig, devices } from "@playwright/test";

// Not the default preview port, so a `npm run preview` left running is never tested by mistake.
const PORT = 4179;

// End-to-end tests (`npm run test:e2e`) on the production build, in Chromium only.
// External network is stubbed in each test (test/e2e/network.js).
export default defineConfig({
  testDir: "test/e2e",
  testMatch: "**/*.spec.js",
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: 0,
  reporter: process.env.CI ? [["list"], ["html", { open: "never" }]] : "list",
  use: {
    baseURL: `http://localhost:${PORT}`,
    locale: "en-US",
    trace: "retain-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: `npm run build && npx vite preview --port ${PORT} --strictPort`,
    url: `http://localhost:${PORT}`,
    reuseExistingServer: false,
    timeout: 120_000,
  },
});
