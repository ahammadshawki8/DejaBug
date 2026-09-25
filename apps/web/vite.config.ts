import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const enginePort = process.env.DEJABUG_PORT ?? "4317";

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      "/api": { target: `http://localhost:${enginePort}`, changeOrigin: true },
    },
  },
});
