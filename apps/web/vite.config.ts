import path from "node:path";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

const enginePort = process.env.DEJABUG_PORT ?? "4317";

export default defineConfig(({ mode }) => ({
  // The showcase is served from GitHub Pages at /DejaBug/.
  base: mode === "showcase" ? "/DejaBug/" : "/",
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: { "@engine": path.resolve(import.meta.dirname, "../../packages/engine/src") },
  },
  server: {
    port: 5173,
    proxy: {
      "/api": { target: `http://localhost:${enginePort}`, changeOrigin: true },
    },
  },
}));
