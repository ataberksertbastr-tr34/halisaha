import { defineConfig } from "vitest/config";

/** Firebase emülatörleri açıkken çalışan entegrasyon testleri (npm run test:emu). */
export default defineConfig({
  test: { include: ["tests/emulator/**/*.test.ts"], environment: "node", testTimeout: 20000 },
});
