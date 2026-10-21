import http from "node:http";
import path from "node:path";
import fs from "node:fs";
import { execFile } from "node:child_process";
import { bundle } from "@remotion/bundler";
import { selectComposition, renderMedia, renderStill } from "@remotion/renderer";

const PORT = parseInt(process.env.PORT || "8765", 10);
const HOST = process.env.HOST || "0.0.0.0";
const localTsc = path.resolve("node_modules/typescript/bin/tsc");
const TSC_PATH = process.env.TSC_PATH || (
  fs.existsSync(localTsc)
    ? localTsc
    : fs.existsSync("/home/ids/projects/clipforge/apps/web/node_modules/typescript/bin/tsc")
      ? "/home/ids/projects/clipforge/apps/web/node_modules/typescript/bin/tsc"
      : "tsc"
);

function ensureWorkspaceNodeModules(workspaceDir) {
  try {
    const wsNm = path.join(workspaceDir, "node_modules");
    const localNm = path.resolve("node_modules");
    if (!fs.existsSync(wsNm) && fs.existsSync(localNm)) {
      fs.symlinkSync(localNm, wsNm, "dir");
    }
  } catch (_) {
    // Non-fatal
  }
}

// Safe environment keys allowed in worker (RULES §7.2)
const ALLOWED_ENV_KEYS = new Set([
  "PATH",
  "NODE_PATH",
  "HOME",
  "TMPDIR",
  "LANG",
  "LC_ALL",
  "NODE_ENV",
  "PORT",
  "HOST",
  "TSC_PATH",
  "PUPPETEER_EXECUTABLE_PATH",
  "REMOTION_CHROMIUM_EXECUTABLE_PATH",
]);

// Clean process.env on startup to guarantee leak-guard isolation
for (const key of Object.keys(process.env)) {
  if (!ALLOWED_ENV_KEYS.has(key)) {
    delete process.env[key];
  }
}

function parseJsonBody(req) {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", (chunk) => {
      body += chunk;
      if (body.length > 10 * 1024 * 1024) {
        reject(new Error("Request payload too large (max 10MB)"));
      }
    });
    req.on("end", () => {
      if (!body.trim()) return resolve({});
      try {
        resolve(JSON.parse(body));
      } catch (err) {
        reject(new Error(`Invalid JSON body: ${err.message}`));
      }
    });
    req.on("error", reject);
  });
}

function sendJson(res, statusCode, data) {
  const payload = JSON.stringify(data);
  res.writeHead(statusCode, {
    "Content-Type": "application/json",
    "Content-Length": Buffer.byteLength(payload),
    "Access-Control-Allow-Origin": "*",
  });
  res.end(payload);
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || "127.0.0.1"}`);
  const method = req.method.toUpperCase();

  try {
    // 1. GET /health
    if (method === "GET" && url.pathname === "/health") {
      return sendJson(res, 200, {
        status: "ok",
        remotion_version: "4.0.530",
        node_version: process.version,
        pid: process.pid,
      });
    }

    // 2. GET /env-keys (Dump whitelisted environment keys for security verification)
    if (method === "GET" && url.pathname === "/env-keys") {
      const activeKeys = Object.keys(process.env).sort();
      return sendJson(res, 200, {
        keys: activeKeys,
        whitelisted_only: activeKeys.every((k) => ALLOWED_ENV_KEYS.has(k) || k.startsWith("npm_")),
      });
    }

    // 3. POST /typecheck
    if (method === "POST" && url.pathname === "/typecheck") {
      const body = await parseJsonBody(req);
      const workspaceDir = body.workspace_dir;
      if (!workspaceDir || !fs.existsSync(workspaceDir)) {
        return sendJson(res, 400, { success: false, error: "Missing or invalid workspace_dir" });
      }

      ensureWorkspaceNodeModules(workspaceDir);

      const tsconfigPath = path.join(workspaceDir, "tsconfig.json");
      if (!fs.existsSync(tsconfigPath)) {
        return sendJson(res, 400, { success: false, error: "tsconfig.json not found in workspace" });
      }

      execFile(
        process.execPath,
        [TSC_PATH, "--noEmit", "-p", tsconfigPath],
        { cwd: workspaceDir },
        (error, stdout, stderr) => {
          if (error) {
            const rawErrors = stdout.trim() || stderr.trim();
            const lines = rawErrors.split("\n").filter(Boolean);
            return sendJson(res, 200, {
              success: false,
              errors: lines,
              raw_output: rawErrors,
            });
          }
          return sendJson(res, 200, {
            success: true,
            errors: [],
          });
        }
      );
      return;
    }

    // 4. POST /still
    if (method === "POST" && url.pathname === "/still") {
      const startTime = Date.now();
      const body = await parseJsonBody(req);
      const { workspace_dir, output_path, frame = 0, composition_id = "Main" } = body;

      if (!workspace_dir || !output_path) {
        return sendJson(res, 400, { success: false, error: "workspace_dir and output_path are required" });
      }

      ensureWorkspaceNodeModules(workspace_dir);

      const entryPoint = path.join(workspace_dir, "src/index.ts");
      if (!fs.existsSync(entryPoint)) {
        return sendJson(res, 400, { success: false, error: `Entry point not found: ${entryPoint}` });
      }

      fs.mkdirSync(path.dirname(output_path), { recursive: true });

      const publicDir = path.join(workspace_dir, "public");
      const serveUrl = await bundle({ entryPoint, publicDir });
      const comp = await selectComposition({ serveUrl, id: composition_id });
      await renderStill({
        composition: comp,
        serveUrl,
        output: output_path,
        frame: parseInt(frame, 10),
      });

      const elapsed = (Date.now() - startTime) / 1000;
      return sendJson(res, 200, {
        success: true,
        output_path,
        elapsed_s: elapsed,
      });
    }

    // 5. POST /preview (low-res fast MP4)
    if (method === "POST" && url.pathname === "/preview") {
      const startTime = Date.now();
      const body = await parseJsonBody(req);
      const {
        workspace_dir,
        output_path,
        composition_id = "Main",
        concurrency = 2,
      } = body;

      if (!workspace_dir || !output_path) {
        return sendJson(res, 400, { success: false, error: "workspace_dir and output_path are required" });
      }

      ensureWorkspaceNodeModules(workspace_dir);

      const entryPoint = path.join(workspace_dir, "src/index.ts");
      if (!fs.existsSync(entryPoint)) {
        return sendJson(res, 400, { success: false, error: `Entry point not found: ${entryPoint}` });
      }

      fs.mkdirSync(path.dirname(output_path), { recursive: true });

      const publicDir = path.join(workspace_dir, "public");
      const serveUrl = await bundle({ entryPoint, publicDir });
      const comp = await selectComposition({ serveUrl, id: composition_id });

      await renderMedia({
        composition: comp,
        serveUrl,
        codec: "h264",
        outputLocation: output_path,
        scale: 0.5, // 540x960 fast preview
        crf: 28,
        concurrency: Math.min(concurrency, 8),
        pixelFormat: "yuv420p",
      });

      const elapsed = (Date.now() - startTime) / 1000;
      return sendJson(res, 200, {
        success: true,
        output_path,
        elapsed_s: elapsed,
      });
    }

    // 6. POST /render (full-res 1080x1920 raw video)
    if (method === "POST" && url.pathname === "/render") {
      const startTime = Date.now();
      const body = await parseJsonBody(req);
      const {
        workspace_dir,
        output_path,
        composition_id = "Main",
        concurrency = 2,
      } = body;

      if (!workspace_dir || !output_path) {
        return sendJson(res, 400, { success: false, error: "workspace_dir and output_path are required" });
      }

      ensureWorkspaceNodeModules(workspace_dir);

      const entryPoint = path.join(workspace_dir, "src/index.ts");
      if (!fs.existsSync(entryPoint)) {
        return sendJson(res, 400, { success: false, error: `Entry point not found: ${entryPoint}` });
      }

      fs.mkdirSync(path.dirname(output_path), { recursive: true });

      const publicDir = path.join(workspace_dir, "public");
      const serveUrl = await bundle({ entryPoint, publicDir });
      const comp = await selectComposition({ serveUrl, id: composition_id });

      await renderMedia({
        composition: comp,
        serveUrl,
        codec: "h264",
        outputLocation: output_path,
        scale: 1.0, // Full 1080x1920
        crf: 18,
        concurrency: Math.min(concurrency, 8),
        pixelFormat: "yuv420p",
      });

      const elapsed = (Date.now() - startTime) / 1000;
      return sendJson(res, 200, {
        success: true,
        output_path,
        elapsed_s: elapsed,
      });
    }

    // 404 Fallback
    return sendJson(res, 404, { error: `Not found: ${method} ${url.pathname}` });
  } catch (err) {
    console.error("Worker error handling request:", err);
    return sendJson(res, 500, {
      success: false,
      error: err.message || "Internal worker error",
    });
  }
});

server.listen(PORT, HOST, () => {
  console.log(`[ClipForge Remotion Worker] Listening on http://${HOST}:${PORT}`);
});
