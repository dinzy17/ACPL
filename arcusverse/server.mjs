import { createServer } from "http";
import next from "next";
import { Server } from "socket.io";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import {
  loadStore,
  advertiseUrls,
  publicUrlPort,
  repointAdvertiseUrls,
  saveStore,
  saveUpload
} from "./server/store.mjs";
import { attachSockets } from "./server/sockets.mjs";
import { adminState } from "./server/engine.mjs";
import {
  getFormByToken,
  publicFormPayload,
  savePrivateUpload,
  submitRegistration,
  getPrivateFile,
  verifyFileAccess,
  PRIVATE_UPLOAD_DIR,
  migrateRegistration,
  dashboardForForm,
  formIsAccepting
} from "./server/registration.mjs";
import { startDailyRegistrationReportScheduler } from "./server/email.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC_UPLOAD_DIR = path.join(__dirname, "public", "uploads");

const dev = process.env.NODE_ENV !== "production";
const hostname = "0.0.0.0";
const port = Number(process.env.PORT || 3000);

const app = next({ dev, hostname, port });
const handle = app.getRequestHandler();

await app.prepare();

const store = loadStore();
migrateRegistration(store);
saveStore(store);
fs.mkdirSync(PRIVATE_UPLOAD_DIR, { recursive: true });
fs.mkdirSync(PUBLIC_UPLOAD_DIR, { recursive: true });

const UPLOAD_MIME = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  webp: "image/webp",
  gif: "image/gif",
  pdf: "application/pdf",
  svg: "image/svg+xml"
};

/** Serve public/uploads from disk — Next.js production often 404s files written after startup. */
function servePublicUpload(req, res) {
  const url = new URL(req.url || "/", `http://${req.headers.host || "localhost"}`);
  if (req.method !== "GET" && req.method !== "HEAD") return false;
  const m = url.pathname.match(/^\/uploads\/([a-zA-Z0-9._-]+)$/);
  if (!m) return false;
  const name = m[1];
  if (name.includes("..") || name.includes("/") || name.includes("\\")) {
    res.writeHead(400).end("Bad request");
    return true;
  }
  const abs = path.join(PUBLIC_UPLOAD_DIR, name);
  if (!abs.startsWith(PUBLIC_UPLOAD_DIR) || !fs.existsSync(abs) || !fs.statSync(abs).isFile()) {
    res.writeHead(404).end("Not found");
    return true;
  }
  const ext = (name.split(".").pop() || "").toLowerCase();
  const type = UPLOAD_MIME[ext] || "application/octet-stream";
  const buf = fs.readFileSync(abs);
  res.writeHead(200, {
    "Content-Type": type,
    "Content-Length": buf.length,
    "Cache-Control": "public, max-age=31536000, immutable"
  });
  if (req.method === "HEAD") res.end();
  else res.end(buf);
  return true;
}

/** @type {import("socket.io").Server | null} */
let io = null;

function readJson(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", () => {
      try {
        const raw = Buffer.concat(chunks).toString("utf8");
        resolve(raw ? JSON.parse(raw) : {});
      } catch (e) {
        reject(e);
      }
    });
    req.on("error", reject);
  });
}

function sendJson(res, status, body) {
  const data = JSON.stringify(body);
  res.writeHead(status, {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization"
  });
  res.end(data);
}

async function handleRegistrationApi(req, res) {
  const url = new URL(req.url || "/", `http://${req.headers.host || "localhost"}`);
  const { pathname } = url;

  if (req.method === "OPTIONS" && pathname.startsWith("/api/")) {
    sendJson(res, 204, {});
    return true;
  }

  // GET /api/public/register/:token
  let m = pathname.match(/^\/api\/public\/register\/([^/]+)$/);
  if (m && req.method === "GET") {
    const form = getFormByToken(store, m[1]);
    if (!form) {
      sendJson(res, 404, { ok: false, error: "Not found" });
      return true;
    }
    sendJson(res, 200, { ok: true, ...publicFormPayload(store, form) });
    return true;
  }

  // POST /api/public/register/:token/upload
  m = pathname.match(/^\/api\/public\/register\/([^/]+)\/upload$/);
  if (m && req.method === "POST") {
    try {
      const form = getFormByToken(store, m[1]);
      if (!form) {
        sendJson(res, 404, { ok: false, error: "Not found" });
        return true;
      }
      if (form.status !== "open") {
        sendJson(res, 403, { ok: false, error: "Registration is not open" });
        return true;
      }
      const body = await readJson(req);
      const field = (form.fields || []).find((f) => f.key === body.fieldKey);
      if (!field || field.enabled === false) {
        sendJson(res, 400, { ok: false, error: "Unknown field" });
        return true;
      }
      if (field.fieldType !== "file" && field.fieldType !== "image") {
        sendJson(res, 400, { ok: false, error: "Not an upload field" });
        return true;
      }
      const file = savePrivateUpload(store, {
        dataUrl: body.dataUrl,
        filename: body.filename || "upload",
        fieldKey: body.fieldKey,
        formId: form.id,
        maxBytes: field.validation?.maxBytes || 5 * 1024 * 1024,
        allowedMime: field.validation?.mime
      });
      saveStore(store);
      sendJson(res, 200, { ok: true, fileId: file.id, mimeType: file.mimeType, fileSize: file.fileSize });
    } catch (e) {
      sendJson(res, 400, { ok: false, error: e.message });
    }
    return true;
  }

  // POST /api/public/register/:token
  m = pathname.match(/^\/api\/public\/register\/([^/]+)$/);
  if (m && req.method === "POST") {
    try {
      const body = await readJson(req);
      const result = await submitRegistration(
        store,
        { token: m[1], values: body.values || {}, fileIds: body.fileIds || {} },
        {
          saveUploadFn: saveUpload,
          performedBy: "public",
          appUrl: urls?.appUrl || `http://${req.headers.host || "localhost:3000"}`
        }
      );
      saveStore(store);
      io?.to("admin").emit("admin-state", adminState(store));
      sendJson(res, 200, { ok: true, ...result });
    } catch (e) {
      const status = e.validation ? 422 : e.duplicate ? 409 : 400;
      sendJson(res, status, {
        ok: false,
        error: e.message,
        validation: e.validation || undefined,
        duplicate: e.duplicate
          ? { registrationId: e.duplicate.registrationId, status: e.duplicate.status }
          : undefined
      });
    }
    return true;
  }

  // GET /api/registration/files/:fileId?exp=&sig=
  m = pathname.match(/^\/api\/registration\/files\/([^/]+)$/);
  if (m && req.method === "GET") {
    const fileId = m[1];
    const exp = url.searchParams.get("exp");
    const sig = url.searchParams.get("sig");
    if (!verifyFileAccess(store, fileId, exp, sig)) {
      sendJson(res, 403, { ok: false, error: "Forbidden" });
      return true;
    }
    const row = getPrivateFile(store, fileId);
    if (!row) {
      sendJson(res, 404, { ok: false, error: "Not found" });
      return true;
    }
    const buf = fs.readFileSync(row.abs);
    res.writeHead(200, {
      "Content-Type": row.file.mimeType || "application/octet-stream",
      "Content-Length": buf.length,
      "Content-Disposition": `inline; filename="${String(row.file.originalFilename || "file").replace(/"/g, "")}"`,
      "Cache-Control": "private, no-store"
    });
    res.end(buf);
    return true;
  }

  return false;
}

async function requestHandler(req, res) {
  try {
    if (servePublicUpload(req, res)) return;
    if (await handleRegistrationApi(req, res)) return;
  } catch (e) {
    sendJson(res, 500, { ok: false, error: e.message || "Server error" });
    return;
  }
  return handle(req, res);
}

const httpServer = createServer(requestHandler);

io = new Server(httpServer, {
  cors: { origin: true, credentials: true },
  // Allow tournament logo / photo uploads as base64 data URLs (default 1MB is too small)
  maxHttpBufferSize: 15 * 1024 * 1024
});

const urls = advertiseUrls(port);
attachSockets(io, store, urls);

// Read lazily by the scheduler, so a port fallback also corrects emailed links.
const emailDeps = {
  appUrl: urls.appUrl || process.env.PUBLIC_URL || "",
  dashboardForForm,
  formIsAccepting
};
startDailyRegistrationReportScheduler(() => store, emailDeps);

/**
 * PUBLIC_URL is usually set without a port so chat apps linkify the registration
 * URL, which makes port 80 part of the contract. Serve it from this process rather
 * than a separate reverse proxy: when that proxy is missing or wedged, every shared
 * link dies while the app still looks healthy on PORT. Needs
 * CAP_NET_BIND_SERVICE for ports below 1024 (see deploy/arcusverse.service).
 */
function serveAdvertisedPort() {
  const advertisedPort = publicUrlPort(port);
  if (!advertisedPort || advertisedPort === port) return Promise.resolve(null);

  return new Promise((resolve) => {
    const mirror = createServer(requestHandler);
    io.attach(mirror);
    mirror.once("error", (err) => {
      const reason =
        err.code === "EACCES"
          ? "permission denied — grant CAP_NET_BIND_SERVICE"
          : err.code === "EADDRINUSE"
            ? "already in use — stop whatever else holds it"
            : err.message;
      // Advertise the port we do serve: a working long link beats a dead short one.
      repointAdvertiseUrls(urls, port);
      emailDeps.appUrl = urls.appUrl;
      mirror.close();
      resolve({ port: advertisedPort, error: reason });
    });
    mirror.listen(advertisedPort, hostname, () => resolve({ port: advertisedPort }));
  });
}

const advertised = await serveAdvertisedPort();

httpServer.listen(port, hostname, () => {
  console.log("\n  ArcusVerse auction is live\n");
  if (urls.mode === "public") {
    console.log(`  App (admin / owner / auctioneer):  ${urls.appUrl}`);
    console.log(`  Spectator:                         ${urls.spectatorUrls[0]}`);
  } else {
    console.log(`  This machine:  http://localhost:${port}`);
    if (urls.lan.length) {
      for (const ip of urls.lan) {
        console.log(`  Same Wi-Fi:    http://${ip}:${port}`);
      }
    } else {
      console.log("  No LAN IPv4 found — set PUBLIC_URL for internet hosting.");
    }
  }
  if (advertised?.error) {
    console.warn(`\n  ! Port ${advertised.port} unavailable (${advertised.error})`);
    console.warn(`  ! Shared registration links now use port ${port}`);
  } else if (advertised) {
    console.log(`  Shared links also served on port ${advertised.port}`);
  }
  console.log("");
});
