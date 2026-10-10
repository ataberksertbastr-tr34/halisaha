/**
 * Küçük Vite eklentisi:
 *  1) src/sw.ts'i derler, derlenen tüm dosyaların listesini (precache) ve
 *     içerikten türetilen sürüm numarasını içine yazar → dist/sw.js
 *  2) index.html'e kritik fontlar için <link rel="preload"> ekler.
 * Çalışma zamanı bağımlılığı yoktur.
 */
import { createHash } from "node:crypto";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { transformWithEsbuild, type Plugin } from "vite";

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) out.push(...walk(p));
    else out.push(p);
  }
  return out;
}

const PRELOAD_FONTS = [/barlow-latin-400-normal/, /barlow-latin-600-normal/, /barlow-condensed-latin-800-normal/, /barlow-condensed-latin-ext-800-normal/];

export function swPlugin(): Plugin {
  let publicDir = "public";
  return {
    name: "halisaha-sw",
    apply: "build",
    configResolved(cfg) {
      publicDir = cfg.publicDir;
    },
    transformIndexHtml: {
      order: "post",
      handler(_html, ctx) {
        if (!ctx.bundle) return [];
        const fonts = Object.keys(ctx.bundle).filter((f) => f.endsWith(".woff2") && PRELOAD_FONTS.some((r) => r.test(f)));
        return fonts.map((f) => ({
          tag: "link",
          attrs: { rel: "preload", href: "./" + f, as: "font", type: "font/woff2", crossorigin: "" },
          injectTo: "head" as const,
        }));
      },
    },
    async generateBundle(_opts, bundle) {
      const hash = createHash("sha256");
      const files = new Set<string>(["./"]);
      for (const [name, item] of Object.entries(bundle)) {
        if (name.endsWith(".map")) continue;
        files.add(name);
        hash.update(name);
        hash.update(item.type === "chunk" ? item.code : typeof item.source === "string" ? item.source : Buffer.from(item.source));
      }
      for (const p of walk(publicDir)) {
        const rel = relative(publicDir, p).split("\\").join("/");
        files.add(rel);
        hash.update(rel);
        hash.update(readFileSync(p));
      }
      files.add("index.html");
      const version = hash.digest("hex").slice(0, 12);
      const src = readFileSync(new URL("../src/sw.ts", import.meta.url), "utf8");
      const out = await transformWithEsbuild(src, "sw.ts", { loader: "ts", minify: true, target: "es2020", format: "iife" });
      const code = out.code
        .replace(/__PRECACHE__/g, JSON.stringify([...files].sort()))
        .replace(/__VERSION__/g, JSON.stringify(version));
      this.emitFile({ type: "asset", fileName: "sw.js", source: code });
      this.emitFile({ type: "asset", fileName: "version.json", source: JSON.stringify({ version }) + "\n" });
    },
  };
}
