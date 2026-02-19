import path from "path";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { readFileSync, writeFileSync, existsSync } from "fs";

const annotationsPath = path.join(__dirname, "public", "annotations.json");

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    {
      name: "annotations-api",
      configureServer(server) {
        server.middlewares.use("/api/annotations", (req, res, next) => {
          if (req.method === "GET") {
            try {
              const data = existsSync(annotationsPath)
                ? readFileSync(annotationsPath, "utf-8")
                : "[]";
              res.setHeader("Content-Type", "application/json");
              res.end(data);
            } catch (err) {
              res.statusCode = 500;
              res.end(JSON.stringify({ error: String(err) }));
            }
            return;
          }
          if (req.method === "POST") {
            let body = "";
            req.on("data", (chunk) => (body += chunk));
            req.on("end", () => {
              try {
                const parsed = JSON.parse(body);
                if (!Array.isArray(parsed)) {
                  res.statusCode = 400;
                  res.end(JSON.stringify({ error: "Expected array" }));
                  return;
                }
                writeFileSync(annotationsPath, JSON.stringify(parsed, null, 2));
                res.setHeader("Content-Type", "application/json");
                res.end(JSON.stringify({ ok: true }));
              } catch (err) {
                res.statusCode = 400;
                res.end(JSON.stringify({ error: String(err) }));
              }
            });
            return;
          }
          next();
        });
      },
    },
  ],
  resolve: {
    alias: { "@": path.resolve(__dirname, "./src") },
  },
});
