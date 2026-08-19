import fs from "fs";
import path from "path";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const pkg = JSON.parse(
  fs.readFileSync(path.resolve(__dirname, "package.json"), "utf8"),
);

// Small pure-JS packages pulled in by maplibre-gl; grouped into one chunk so
// they don't scatter across the bundle.
const MAPLIBRE_SUPPORT_DEPS = new Set([
  "earcut",
  "gl-matrix",
  "kdbush",
  "murmurhash-js",
  "pbf",
  "potpack",
  "quickselect",
  "supercluster",
  "tinyqueue",
]);

/** Extracts the npm package name (incl. scope) from a rollup module id. */
function packageNameOf(id) {
  const match = /[\\/]node_modules[\\/](.*)$/.exec(id);
  if (!match?.[1]) return null;

  const segments = match[1].split(/[\\/]/);
  if (segments.length === 0) return null;
  return segments[0].startsWith("@") && segments[1]
    ? `${segments[0]}/${segments[1]}`
    : segments[0];
}

function vendorChunk(id) {
  if (!id.includes("node_modules")) return undefined;

  const name = packageNameOf(id);
  if (name === "maplibre-gl") return "vendor-maplibre-core";
  if (
    name?.startsWith("@maplibre/") ||
    name?.startsWith("@mapbox/") ||
    MAPLIBRE_SUPPORT_DEPS.has(name)
  ) {
    return "vendor-maplibre-deps";
  }
  if (name?.startsWith("react-icons")) return "vendor-icons";
  if (["react", "react-dom", "react-colorful"].includes(name)) {
    return "vendor-react";
  }
  return undefined;
}

/** Emits an ads.txt into the build output when VITE_ADSENSE_CLIENT is set. */
function emitAdsTxt() {
  let config;
  return {
    name: "ads-txt",
    configResolved(resolved) {
      config = resolved;
    },
    closeBundle() {
      const client = config.env.VITE_ADSENSE_CLIENT;
      if (!client) {
        console.warn(
          "[ads-txt] VITE_ADSENSE_CLIENT is not set — skipping ads.txt generation",
        );
        return;
      }
      fs.writeFileSync(
        path.join(path.resolve(config.root, config.build.outDir), "ads.txt"),
        `google.com, ${client}, DIRECT, f08c47fec0942fa0\n`,
        "utf8",
      );
    },
  };
}

export default defineConfig({
  plugins: [react(), emitAdsTxt()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
    },
  },
  define: {
    "import.meta.env.VITE_APP_VERSION": JSON.stringify(
      String(pkg.version ?? "0.0.0"),
    ),
    // Set VITE_RENDER_API_URL=https://<project>.supabase.co in .env.production
    "__RENDER_API_URL__": JSON.stringify(process.env.VITE_RENDER_API_URL ?? ""),
  },
  build: {
    // maplibre-gl ships prebundled and can't be split further; raise the
    // warning threshold above its size instead.
    chunkSizeWarningLimit: 1100,
    rollupOptions: {
      output: {
        manualChunks: vendorChunk,
      },
    },
  },
});
