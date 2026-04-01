import path from "path"
import react from "@vitejs/plugin-react"
import { defineConfig } from "vite"

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes("node_modules")) return

          if (
            id.includes("/react/") ||
            id.includes("/react-dom/") ||
            id.includes("react-router-dom")
          ) {
            return "react-vendor"
          }

          if (id.includes("@tanstack/react-query")) {
            return "query-vendor"
          }

          if (id.includes("@tanstack/react-table")) {
            return "table-vendor"
          }

          if (id.includes("lucide-react")) {
            return "icons-vendor"
          }

          if (
            id.includes("@radix-ui/") ||
            id.includes("cmdk") ||
            id.includes("vaul")
          ) {
            return "ui-vendor"
          }

          if (
            id.includes("react-hook-form") ||
            id.includes("@hookform/resolvers") ||
            id.includes("zod")
          ) {
            return "forms-vendor"
          }

          if (id.includes("jspdf") || id.includes("jspdf-autotable")) {
            return "pdf-vendor"
          }

          if (id.includes("html2canvas")) {
            return "canvas-vendor"
          }

          if (id.includes("recharts")) {
            return "charts-vendor"
          }

          if (id.includes("react-day-picker") || id.includes("date-fns")) {
            return "date-vendor"
          }
        },
      },
    },
  },
  server: {
    allowedHosts: ["busked-matilde-shamefully.ngrok-free.dev"],
    proxy: {
      "/api": {
        target: "http://localhost:5001",
        changeOrigin: true,
      },
    },
  },
})
