#!/usr/bin/env node
/**
 * 墨览本地静态服务：gzip + 缓存头。由 scripts/markdown-viewer.sh 调用。
 */
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import { fileURLToPath } from "node:url";

const root = path.resolve(process.env.MOLAN_ROOT || path.dirname(fileURLToPath(import.meta.url)));
const port = Number(process.env.MOLAN_SERVE_PORT || 5500);
const gzipCache = new Map();

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".md": "text/markdown; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".woff2": "font/woff2",
  ".ico": "image/x-icon",
};

const COMPRESS = new Set([".html", ".js", ".css", ".svg", ".json", ".md", ".txt", ".map"]);

function cacheControl(rel, url) {
  if (rel.startsWith("vendor/") || url.includes("?v=")) {
    return "public, max-age=604800";
  }
  return "public, max-age=0, must-revalidate";
}

function gzipBuffer(key, data) {
  let cached = gzipCache.get(key);
  if (!cached) {
    cached = zlib.gzipSync(data, { level: 6 });
    gzipCache.set(key, cached);
  }
  return cached;
}

http.createServer((req, res) => {
  const rawUrl = req.url || "/";
  const urlPath = decodeURIComponent(rawUrl.split("?")[0]);
  const rel = urlPath === "/" ? "index.html" : urlPath.replace(/^\/+/, "");
  const file = path.resolve(root, rel);
  const rootWithSep = root.endsWith(path.sep) ? root : root + path.sep;
  if (!file.startsWith(rootWithSep) && file !== root) {
    res.writeHead(403);
    res.end("Forbidden");
    return;
  }
  fs.stat(file, (statErr, stat) => {
    if (statErr || !stat.isFile()) {
      res.writeHead(404);
      res.end("Not found");
      return;
    }
    fs.readFile(file, (err, data) => {
      if (err) {
        res.writeHead(404);
        res.end("Not found");
        return;
      }
      const ext = path.extname(file).toLowerCase();
      const headers = {
        "Content-Type": MIME[ext] || "application/octet-stream",
        "Cache-Control": cacheControl(rel.replace(/\\/g, "/"), rawUrl),
      };
      const acceptGzip = String(req.headers["accept-encoding"] || "").includes("gzip");
      if (acceptGzip && COMPRESS.has(ext) && data.length > 256) {
        const key = `${file}:${stat.mtimeMs}:${stat.size}`;
        headers["Content-Encoding"] = "gzip";
        headers["Vary"] = "Accept-Encoding";
        data = gzipBuffer(key, data);
      }
      res.writeHead(200, headers);
      res.end(data);
    });
  });
}).listen(port, "127.0.0.1", () => {
  console.log("Serving " + root + " at http://127.0.0.1:" + port + "/");
});
