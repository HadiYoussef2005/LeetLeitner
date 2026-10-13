import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import hosting from "./hosting.config.json";
export default defineConfig({
  plugins: [react()],
  base: hosting.base,
  build: { outDir: `dist${hosting.base.slice(0, -1)}` },
});
