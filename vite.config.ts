/// <reference types="vitest/config" />
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { resolve } from "node:path";
import { readFileSync } from "node:fs";

const base = process.env.BASE_PATH || "/";
export default defineConfig({
  define: {
    __BASE_PATH__: JSON.stringify(base),
  },
  plugins: [react()],
  base,
  build: {
    sourcemap: true,
    outDir: 'out',
  },
  resolve: {
    alias: {
      "@": resolve(import.meta.dirname, "./src"),
    },
  },
  server: {
    port: 3000,
    host: "0.0.0.0",
    // Développement : l'API est servie sur la même origine, comme derrière l'Ingress.
    proxy: { "/api": process.env.VITE_API_PROXY || "http://127.0.0.1:8080" },
    // HTTPS local (npm run dev:local -- --https) : certificat fourni par le script.
    https: process.env.VITE_HTTPS_CERT && process.env.VITE_HTTPS_KEY
      ? { cert: readFileSync(process.env.VITE_HTTPS_CERT), key: readFileSync(process.env.VITE_HTTPS_KEY) }
      : undefined,
  },
  // Tests unitaires du front ; ceux de l'API (api/test/) tournent avec node --test.
  test: {
    include: ["src/**/*.test.ts"],
  },
});
