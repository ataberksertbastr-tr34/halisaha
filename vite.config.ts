import { defineConfig } from "vitest/config";

export default defineConfig({
  // Göreli taban yol: GitHub Pages'te /halisaha/ altında da, özel alan adında da çalışır.
  base: "./",
  build: {
    target: "es2020",
    outDir: "dist",
    assetsInlineLimit: 0,
    sourcemap: false,
  },
  test: {
    include: ["tests/**/*.test.ts"],
    environment: "node",
  },
});
