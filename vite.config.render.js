/**
 * Vite lib build — compiles renderStoryCanvas + all dependencies into a single
 * self-contained IIFE for use by server/public/render.html.
 *
 * Output: server/public/render-lib.iife.js  (global: StoryShare)
 *
 * Run:  npm run build:render   (from mapimages root)
 */

import { defineConfig } from "vite";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  build: {
    lib: {
      entry:    path.resolve(__dirname, "src/demo/storyShareService.ts"),
      name:     "StoryShare",
      formats:  ["iife"],
      fileName: () => "render-lib.iife.js",
    },
    outDir:     "server/public",
    emptyOutDir: false,   // don't wipe render.html or other assets
    minify:     true,
    rollupOptions: {
      output: {
        inlineDynamicImports: true,  // flatten any dynamic import() calls
      },
    },
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
    },
  },
  // Don't copy Vite's public/ dir — we only want the IIFE file in server/public/
  publicDir: false,
  plugins: [],
});
