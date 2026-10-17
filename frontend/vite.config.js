import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");

  if (mode === "production" && !env.VITE_API_URL?.trim()) {
    throw new Error(
      "Falta VITE_API_URL. Configurala con la URL publica del backend terminada en /api.",
    );
  }

  return {
    plugins: [react(), tailwindcss()],
    server: {
      port: 5173,
      watch: {
        ignored: ["**/public/**"],
      },
      proxy: {
        "/api": {
          target: "http://localhost:3001",
          changeOrigin: true,
        },
      },
    },
  };
});
