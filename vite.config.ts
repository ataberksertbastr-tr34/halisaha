import { defineConfig } from "vitest/config";
import { readFileSync } from "node:fs";
import { swPlugin } from "./scripts/vite-plugin-sw";

const pkg = JSON.parse(readFileSync(new URL("./package.json", import.meta.url), "utf8")) as { version: string };
const sha = (process.env.GITHUB_SHA || "").slice(0, 7) || "yerel";

export default defineConfig({
  // Göreli taban yol: GitHub Pages'te /halisaha/ altında da, özel alan adında da çalışır.
  base: "./",
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version + " · " + sha),
  },
  build: {
    target: "es2020",
    outDir: "dist",
    assetsInlineLimit: 0,
    sourcemap: false,
  },
  plugins: [swPlugin()],
  test: {
    include: ["tests/**/*.test.ts"],
    environment: "node",
  },
});
