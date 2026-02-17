import { defineConfig } from "vitest/config";
import dts from "vite-plugin-dts";

export default defineConfig({
  plugins: [dts({ rollupTypes: false })],
  test: {
    include: ["tests/**/*.test.ts"],
    testTimeout: 60_000,
  },
  build: {
    lib: {
      entry: {
        index: "src/index.ts",
        "cli/index": "src/cli/index.ts",
        "mcp/index": "src/mcp/index.ts",
      },
      formats: ["es"],
    },
    rollupOptions: {
      external: (id) => !id.startsWith(".") && !id.startsWith("/"),
      output: {
        banner: (chunk) =>
          chunk.name === "cli/index" || chunk.name === "mcp/index"
            ? "#!/usr/bin/env node"
            : "",
        entryFileNames: "[name].js",
        chunkFileNames: "shared/[name]-[hash].js",
      },
    },
    outDir: "dist",
    sourcemap: true,
    target: "node18",
    minify: false,
  },
});
