import { defineConfig } from "vite";
import { svelte } from "@sveltejs/vite-plugin-svelte";
import { viteSingleFile } from "vite-plugin-singlefile";
import mkcert from "vite-plugin-mkcert";
import { execSync } from "child_process";

const buildHash = execSync("git rev-parse HEAD", { encoding: "utf-8" }).trim();
const isSingleFile = process.env["SINGLE_FILE"] === "true";

export default defineConfig({
  base: "./",
  plugins: [mkcert(), svelte(), ...(isSingleFile ? [viteSingleFile()] : [])],
  define: {
    __BUILD_HASH__: JSON.stringify(buildHash),
  },
  server: { port: 5173, open: true, host: true, allowedHosts: true },
  build: {
    chunkSizeWarningLimit: isSingleFile ? 3000 : 13000,
  },
});
