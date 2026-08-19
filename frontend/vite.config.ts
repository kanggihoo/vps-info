import { defineConfig } from "vite";

export default defineConfig({
  server: { proxy: { "/api": "http://backend:8000" } },
  test: { environment: "jsdom" },
});
