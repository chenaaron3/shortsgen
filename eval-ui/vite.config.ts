import { existsSync, readFileSync, writeFileSync } from 'fs';
import path from 'path';
import { defineConfig } from 'vite';

import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';

const annotationsPath = path.join(__dirname, "public", "annotations.json");
const evalDatasetPath = path.join(__dirname, "public", "eval-dataset.json");

export default defineConfig({
  server: {
    watch: {
      ignored: [
        "**/annotations.json",
        "**/eval-dataset.json",
      ],
    },
  },
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
    {
      name: "eval-dataset-api",
      configureServer(server) {
        server.middlewares.use("/api/eval-dataset", (req, res, next) => {
          if (req.method !== "DELETE" || !req.url) {
            next();
            return;
          }
          let rest = (req.url ?? "").split("?")[0].trim();
          rest = rest.replace(/^\/api\/eval-dataset\/?/, "");
          if (rest.startsWith("/")) rest = rest.slice(1);
          const traceId = rest.split("/")[0] || rest;
          if (!traceId || !/^[a-f0-9]+$/i.test(traceId)) {
            res.statusCode = 400;
            res.setHeader("Content-Type", "application/json");
            res.end(JSON.stringify({ error: "Missing or invalid traceId" }));
            return;
          }
          try {
            const data = existsSync(evalDatasetPath)
              ? JSON.parse(readFileSync(evalDatasetPath, "utf-8"))
              : [];
            if (!Array.isArray(data)) {
              res.statusCode = 500;
              res.end(JSON.stringify({ error: "Invalid eval-dataset.json" }));
              return;
            }
            const filtered = data.filter(
              (t: { id?: string }) => t.id !== traceId,
            );
            if (filtered.length === data.length) {
              res.statusCode = 404;
              res.end(JSON.stringify({ error: "Trace not found" }));
              return;
            }
            writeFileSync(evalDatasetPath, JSON.stringify(filtered, null, 2));
            res.setHeader("Content-Type", "application/json");
            res.end(JSON.stringify({ ok: true, removed: traceId }));
          } catch (err) {
            res.statusCode = 500;
            res.end(JSON.stringify({ error: String(err) }));
          }
        });
      },
    },
  ],
  resolve: {
    alias: { "@": path.resolve(__dirname, "./src") },
  },
});
