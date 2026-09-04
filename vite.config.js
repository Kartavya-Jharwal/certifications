import { defineConfig } from "vite";

// Local preview serves the root index.html, which loads vanilla/ styles + JS.
// Production Pages artifact is assembled by scripts/build-vanilla.js into site/.
export default defineConfig({
  base: "./",
  server: {
    open: true,
  },
  build: {
    outDir: "dist",
    emptyOutDir: true,
  },
});
