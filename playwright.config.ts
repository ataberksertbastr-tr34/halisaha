import { defineConfig } from "@playwright/test";

/** Uçtan uca testler: derlenmiş uygulama (vite preview) 360 px genişlikte, Türkçe yerelde. */
export default defineConfig({
  testDir: "e2e",
  testMatch: /.*\.spec\.ts/,
  // Eşitleme testleri Firebase emülatörü ister: playwright.sync.config.ts
  testIgnore: /sync\.spec\.ts/,
  timeout: 90_000,
  retries: 0,
  workers: 1,
  reporter: process.env.CI ? [["list"], ["html", { open: "never" }]] : "list",
  use: {
    baseURL: "http://localhost:4173",
    viewport: { width: 360, height: 760 },
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
    locale: "tr-TR",
    timezoneId: "Europe/Istanbul",
    browserName: "chromium",
    launchOptions: process.env.PW_CHROMIUM ? { executablePath: process.env.PW_CHROMIUM } : {},
    trace: "retain-on-failure",
  },
  webServer: {
    command: "node node_modules/vite/bin/vite.js preview --port 4173 --strictPort",
    url: "http://localhost:4173",
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
});
