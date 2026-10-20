import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import hosting from "./hosting.config.json";
import { metadataPlugin } from "./server/vite-metadata";
export default defineConfig({
  plugins: [react(), metadataPlugin()],
  base: hosting.base,
  build: { outDir: `dist${hosting.base.slice(0, -1)}` },
});
