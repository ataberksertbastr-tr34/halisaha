import { defineConfig } from "@playwright/test";

/**
 * Cihazlar arası eşitleme testleri: Firebase emülatörlerine bağlanan derleme
 * (npm run build:emu → dist-emu) üzerinde, iki ayrı tarayıcı (telefon ve bilgisayar).
 * Çalıştırma: firebase emulators:exec --only auth,firestore "npm run e2e:sync"
 */
export default defineConfig({
  testDir: "e2e",
  testMatch: /sync\.spec\.ts/,
  timeout: 120_000,
  retries: 0,
  workers: 1,
  reporter: process.env.CI ? [["list"], ["html", { open: "never", outputFolder: "playwright-report-sync" }]] : "list",
  use: {
    baseURL: "http://localhost:4174",
    locale: "tr-TR",
    timezoneId: "Europe/Istanbul",
    browserName: "chromium",
    launchOptions: process.env.PW_CHROMIUM ? { executablePath: process.env.PW_CHROMIUM } : {},
    trace: "retain-on-failure",
  },
  webServer: {
    command: "node node_modules/vite/bin/vite.js preview --port 4174 --strictPort --outDir dist-emu",
    url: "http://localhost:4174",
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
});
