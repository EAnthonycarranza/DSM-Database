/* server/server.js */
const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const cors = require("cors");
const fs = require("fs").promises;
const path = require("path");
const crypto = require("crypto");
const { MongoClient } = require("mongodb");
const multer = require("multer");
const { Storage } = require("@google-cloud/storage");
const nodemailer = require("nodemailer");
// Ensure we always read env from server/.env regardless of process.cwd()
try {
  const envPath = path.join(__dirname, ".env");
  require("dotenv").config({ path: envPath });
} catch {
  require("dotenv").config();
}
const speakeasy = require("speakeasy");
const QRCode = require("qrcode");
const APP_ISSUER = process.env.APP_NAME || "DSM";

const app = express();
const PORT = process.env.PORT || 4000;
const MONGODB_URI = process.env.MONGODB_URI || "";
const MONGODB_DISABLE = String(process.env.MONGODB_DISABLE || "0") === "1";
// Optional: provide a direct (non-SRV) fallback to avoid DNS SRV lookups when blocked
const MONGODB_URI_FALLBACK = process.env.MONGODB_URI_FALLBACK || process.env.MONGODB_URI_DIRECT || process.env.MONGODB_URI_NOSRV || "";
const MONGODB_DB = process.env.MONGODB_DB || "dsm";

const GCS_BUCKET   = process.env.GCS_BUCKET || "";
const GCS_PROJECT_ID = process.env.GCS_PROJECT_ID || "";
const GCS_KEYFILE  = process.env.GCS_KEYFILE || process.env.GOOGLE_APPLICATION_CREDENTIALS || "";
const GCS_PUBLIC   = String(process.env.GCS_PUBLIC || "1") === "1"; // default public
const GCS_BASE_URL = process.env.GCS_BASE_URL || "https://storage.googleapis.com";
// Google Maps Places API key (serve to client on demand; do NOT hardcode in frontend)
const GOOGLE_MAPS_API_KEY = process.env.GOOGLE_MAPS_API_KEY || process.env.MAPS_API_KEY || "";

// Normalize API prefix: leading slash, no trailing slash
const RAW_API_PREFIX = process.env.API_PREFIX || "/api";
const API_PREFIX = "/" + String(RAW_API_PREFIX || "/api").replace(/^\/+/ , "").replace(/\/+$/ , "");
const DB_PATH = path.join(__dirname, "data.json");

// --- Email (Nodemailer) ---
// SMTP configuration via env:
// SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, SMTP_SECURE ("1" for true), SMTP_FROM
let mailer = null;
function initMailer() {
  const host = process.env.SMTP_HOST;
  const port = Number(process.env.SMTP_PORT || 587);
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;
  const secure = String(process.env.SMTP_SECURE || "0") === "1"; // true for 465
  if (!host || !user || !pass) {
    console.log("Mail: SMTP not configured; password reset emails disabled.");
    return;
  }
  try {
    mailer = nodemailer.createTransport({ host, port, secure, auth: { user, pass } });
    console.log(`Mail: SMTP transporter ready (${host}:${port}, secure=${secure})`);
    // Optional verification (non-blocking): helps surface auth/connection issues early
    try {
      mailer.verify().then(() => {
        console.log("Mail: SMTP connection verified; ready to send emails.");
      }).catch((e) => {
        console.warn("Mail: transporter verify failed:", e?.message || e);
      });
    } catch {}
  } catch (e) {
    console.warn("Mail: failed to init transporter:", e.message);
  }
}

// --- Socket.IO & presence shared state ---
let ioRef = null;                               // assigned when we create the Socket.IO server
const socketsByUser = new Map();                // userId -> Set(socketId)
const userRoleById = new Map();                 // cache of userId -> role

function addUserSocket(userId, socketId) {
  let set = socketsByUser.get(userId);
  if (!set) {
    set = new Set();
    socketsByUser.set(userId, set);
  }
  set.add(socketId);
}
function removeUserSocket(userId, socketId) {
  const set = socketsByUser.get(userId);
  if (!set) return 0;
  set.delete(socketId);
  if (set.size === 0) {
    socketsByUser.delete(userId);
    return 0;
  }
  return set.size;
}

async function getAdminPresenceList() {
  try {
    const list = await dbList("users");
    return (Array.isArray(list) ? list : [])
      .filter(u => String(u.role || "").toLowerCase() === "admin")
      .map(u => ({
        userId: u.id,
        name: u.name || "",
        presence: u.presence || "offline",
        lastSeen: u.lastSeen || null,
      }));
  } catch {
    return [];
  }
}

async function broadcastAdminPresenceUpdate(userId) {
  try {
    if (!ioRef || !userId) return;
    const u = await dbGet("users", userId);
    if (u && String(u.role || "").toLowerCase() === "admin") {
      ioRef.emit("presence:update", {
        userId: u.id,
        name: u.name || "",
        presence: u.presence || "offline",
        lastSeen: u.lastSeen || Date.now(),
      });
    }
  } catch {}
}

async function setPresenceAndBroadcast(userId, presence) {
  try {
    const p = String(presence || "online").toLowerCase();
    await dbUpdate("users", userId, { presence: p, lastSeen: Date.now() });
    await broadcastAdminPresenceUpdate(userId);
  } catch {}
}

// CORS + JSON
const corsEnv = (process.env.CORS_ORIGIN || "").trim();
const corsOrigin = corsEnv ? corsEnv.split(",").map((s) => s.trim()).filter(Boolean) : true;
app.use(cors({ origin: corsOrigin, credentials: true }));
app.options(new RegExp(`^${escapeRegExp(API_PREFIX)}/.*$`), cors({ origin: corsOrigin, credentials: true }));
// Accept larger JSON bodies so template payloads with embedded PDFs can be saved
app.use(express.json({ limit: "25mb" }));

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 25 * 1024 * 1024 }, // 25MB per file
});

function escapeRegExp(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// Stores
const STORES = [
  "students",
  "tasks",
  "classes",
  "service",
  "documents",
  // New: PDF template library and envelopes for sending
  "pdfTemplates",
  "envelopes",
  // Form builder system
  "forms",
  "formSubmissions",
  "notifications",
  "messages",
  "users",
  "settings",
  "audit",
  "events",
];

const uid = () => (crypto.randomUUID ? crypto.randomUUID() : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`);

// ---------- Google Cloud Storage ----------
let gcs = null;
let gcsBucket = null;

function initGCS() {
  if (!GCS_BUCKET) {
    console.log("GCS not configured: set GCS_BUCKET to enable uploads.");
    return;
  }
  try {
    const opts = {};
    if (GCS_PROJECT_ID) opts.projectId = GCS_PROJECT_ID;
    
    // Use environment variables for credentials in production, fallback to keyfile for development
    if (process.env.GOOGLE_CLOUD_PRIVATE_KEY && process.env.GOOGLE_CLOUD_CLIENT_EMAIL) {
      opts.credentials = {
        type: 'service_account',
        project_id: process.env.GOOGLE_CLOUD_PROJECT_ID,
        private_key_id: process.env.GOOGLE_CLOUD_PRIVATE_KEY_ID,
        private_key: process.env.GOOGLE_CLOUD_PRIVATE_KEY.replace(/\\n/g, '\n'),
        client_email: process.env.GOOGLE_CLOUD_CLIENT_EMAIL,
        client_id: process.env.GOOGLE_CLOUD_CLIENT_ID,
        auth_uri: 'https://accounts.google.com/o/oauth2/auth',
        token_uri: 'https://oauth2.googleapis.com/token',
        auth_provider_x509_cert_url: 'https://www.googleapis.com/oauth2/v1/certs',
        client_x509_cert_url: `https://www.googleapis.com/robot/v1/metadata/x509/${process.env.GOOGLE_CLOUD_CLIENT_EMAIL}`,
        universe_domain: 'googleapis.com'
      };
    } else if (GCS_KEYFILE) {
      opts.keyFilename = GCS_KEYFILE;
    }
    
    gcs = new Storage(opts);
    gcsBucket = gcs.bucket(GCS_BUCKET);
    console.log(`GCS initialized. Bucket=${GCS_BUCKET}`);
  } catch (e) {
    console.warn("GCS initialization failed:", e.message);
  }
}

function safeName(name) {
  return String(name || "file")
    .replace(/[^A-Za-z0-9._-]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

// ---- 2FA helpers ----
function sha256(s) {
  return crypto.createHash("sha256").update(String(s)).digest("hex");
}

function randomBackupCode() {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no 0,O,1,I
  let s = "";
  for (let i = 0; i < 12; i++) s += alphabet[Math.floor(Math.random() * alphabet.length)];
  return `${s.slice(0, 4)}-${s.slice(4, 8)}-${s.slice(8, 12)}`;
}

function randomPassword(length = 12) {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz0123456789!@#$%?";
  let out = "";
  for (let i = 0; i < length; i++) {
    out += alphabet[Math.floor(Math.random() * alphabet.length)];
  }
  return out;
}

function ensureUserEmail(doc) {
  const out = { ...doc };
  const em = String(out.email || "").trim();
  if (!em) {
    // Use a placeholder unique email to avoid duplicate null/undefined issues with Mongo unique indexes
    out.email = `user-${out.id || uid()}@placeholder.local`;
  } else {
    out.email = em;
  }
  return out;
}

function generateBackupCodes(n = 8) {
  const plain = [];
  for (let i = 0; i < n; i++) plain.push(randomBackupCode());
  const hashed = plain.map((code) => ({ hash: sha256(code), usedAt: null }));
  return { plain, hashed };
}

async function gcsUploadBuffer(file, folder = "uploads") {
  if (!gcsBucket) throw new Error("GCS not configured");
  const ext = path.extname(file.originalname || "").toLowerCase();
  const base = safeName(path.basename(file.originalname || "file", ext));
  const key = `${folder}/${uid()}-${base}${ext || ""}`;
  const blob = gcsBucket.file(key);
  await new Promise((resolve, reject) => {
    const stream = blob.createWriteStream({
      resumable: false,
      contentType: file.mimetype || "application/octet-stream",
      metadata: { contentType: file.mimetype || "application/octet-stream", cacheControl: "public, max-age=31536000" },
    });
    stream.on("finish", resolve);
    stream.on("error", reject);
    stream.end(file.buffer);
  });
  if (GCS_PUBLIC) {
    try { await blob.makePublic(); } catch {}
    return { url: `${GCS_BASE_URL}/${GCS_BUCKET}/${encodeURI(key)}`, path: key };
  }
  return { url: `gs://${GCS_BUCKET}/${key}`, path: key };
}

// Upload an in-memory buffer (e.g., generated PDF) to GCS
async function gcsUploadRaw(buffer, { mime = "application/octet-stream", name = "file.bin", folder = "uploads" } = {}) {
  if (!gcsBucket) throw new Error("GCS not configured");
  const ext = path.extname(name || "").toLowerCase() || (mime === "application/pdf" ? ".pdf" : "");
  const base = safeName(path.basename(name || "file", ext));
  const key = `${folder}/${uid()}-${base}${ext}`;
  const blob = gcsBucket.file(key);
  await new Promise((resolve, reject) => {
    const stream = blob.createWriteStream({
      resumable: false,
      contentType: mime,
      metadata: { contentType: mime, cacheControl: "public, max-age=31536000" },
    });
    stream.on("finish", resolve);
    stream.on("error", reject);
    stream.end(buffer);
  });
  if (GCS_PUBLIC) {
    try { await blob.makePublic(); } catch {}
    return { url: `${GCS_BASE_URL}/${GCS_BUCKET}/${encodeURI(key)}`, path: key };
  }
  return { url: `gs://${GCS_BUCKET}/${key}`, path: key };
}

// --- Helper: Try delete GCS path/url ---
async function tryDeleteGcsPath(pathOrUrl) {
  try {
    if (!gcsBucket || !pathOrUrl) return false;
    let key = String(pathOrUrl).replace(/^\s+|\s+$/g, "");
    // Accept gs://, https://storage.googleapis.com, https://storage.cloud.google.com, or raw object path
    if (/^gs:\/\//i.test(key)) {
      // gs://bucket/folder/file
      const m = key.match(/^gs:\/\/(.+?)\/(.+)$/i);
      if (!m) return false;
      const [, b, k] = m;
      if (GCS_BUCKET && b !== GCS_BUCKET) return false;
      key = k;
    } else if (/^https?:\/\//i.test(key)) {
      const marker = `/${GCS_BUCKET}/`;
      const idx = key.indexOf(marker);
      if (idx === -1) return false;
      key = key.slice(idx + marker.length);
    }
    key = key.replace(/^\/+/, "");
    if (!key) return false;
    await gcsBucket.file(key).delete({ ignoreNotFound: true });
    return true;
  } catch (e) {
    console.warn("GCS delete skipped:", e.message);
    return false;
  }
}

// ---------- Optional MongoDB Adapter ----------
let mongoClient = null;
let mongoDb = null;
let USE_MONGO = false;
let MONGO_RECONNECT_TIMER = null;
let MONGO_CIRCUIT_UNTIL = 0; // when set in the future, skip attempts (cooldown)

// If Mongo errors mid-flight, fail over to file DB to keep the API responsive
function isTransientMongoError(err) {
  const msg = (err && (err.message || err.code)) || String(err || "");
  return /ECONNRESET|ENETUNREACH|ETIMEDOUT|client was closed|server selection error|Topology is closed|MongoNetworkError/i.test(msg);
}

function scheduleMongoReconnect(delayMs = 2000) {
  try { if (MONGO_RECONNECT_TIMER) clearTimeout(MONGO_RECONNECT_TIMER); } catch {}
  MONGO_RECONNECT_TIMER = setTimeout(async () => {
    try {
      await connectMongo();
    } catch {}
  }, delayMs);
}

function mongoFailover(err, where = "") {
  try {
    const msg = (err && (err.message || err.code)) || String(err || "");
    if (isTransientMongoError(err)) {
      console.warn(`[DB] Mongo transient error${where ? ` at ${where}` : ""}: ${msg}. Using file DB temporarily; will auto-reconnect.`);
      scheduleMongoReconnect();
    } else {
      console.error(`[DB] Mongo error${where ? ` at ${where}` : ""}: ${msg}. Failing over to file DB.`);
    }
  } catch {}
  try { if (mongoClient) mongoClient.close().catch(() => {}); } catch {}
  mongoClient = null;
  mongoDb = null;
  USE_MONGO = false;
}

async function connectMongo(uriOverride) {
  // Allow explicit disable in env (use file DB only)
  if (MONGODB_DISABLE) return false;
  // Respect a cooldown window if recent DNS/network errors were observed
  if (Date.now() < MONGO_CIRCUIT_UNTIL) return false;
  const primary = (uriOverride || MONGODB_URI || "").trim();
  if (!primary) return false;
  const opts = {
    maxPoolSize: 10,
    serverSelectionTimeoutMS: 8000,
    retryWrites: true,
    // Use unified topology defaults in modern driver
  };
  const tryConnect = async (uri) => {
    if (!uri) return false;
    const client = new MongoClient(uri, opts);
    await client.connect();
    mongoClient = client;
    mongoDb = client.db(MONGODB_DB);
    USE_MONGO = true;
    // Ensure indexes on `id` for all stores except settings (object)
    for (const s of STORES) {
      if (s === "settings") continue;
      const col = mongoDb.collection(s);
      await col.createIndex({ id: 1 }, { unique: true }).catch(() => {});
    }
    // On success, clear any circuit breaker
    MONGO_CIRCUIT_UNTIL = 0;
    return true;
  };
  try {
    return await tryConnect(primary);
  } catch (err) {
    const msg = String(err?.message || err || "");
    // If SRV/DNS failed and a fallback is provided, try that
    const looksDnsSrv = /querySrv|ENOTFOUND|EAI_AGAIN|DNS|_mongodb\._tcp/i.test(msg);
    if (looksDnsSrv && MONGODB_URI_FALLBACK) {
      try {
        console.warn("Mongo primary SRV failed; trying fallback connection string.");
        return await tryConnect(MONGODB_URI_FALLBACK);
      } catch (e2) {
        console.error("MongoDB fallback connection failed:", e2?.message || e2);
        // Open circuit for a while to avoid repeated DNS spam
        MONGO_CIRCUIT_UNTIL = Date.now() + 5 * 60 * 1000; // 5 minutes
        USE_MONGO = false;
        return false;
      }
    }
    // For timeouts or general network errors, back off briefly
    if (/ETIMEDOUT|ECONNREFUSED|ENETUNREACH|ECONNRESET/i.test(msg)) {
      MONGO_CIRCUIT_UNTIL = Date.now() + 30 * 1000; // 30 seconds
    }
    console.error("MongoDB connection failed, falling back to file DB:", msg);
    USE_MONGO = false;
    return false;
  }
}

async function ensureMongoSeed() {
  // No-op: you already manage data in MongoDB (Compass).
  // We only ensure collections/indexes in connectMongo().
  return;
}

// Unified DB helpers that switch between Mongo and file DB
async function dbList(store) {
  if (USE_MONGO) {
    try {
      if (store === "settings") {
        return await dbGetSettings();
      }
      const docs = await mongoDb.collection(store).find({}).toArray();
      // Strip Mongo's _id so clients don't send it back on PUT
      return docs.map(({ _id, ...rest }) => rest);
    } catch (e) {
      // Retry once after reconnect for transient errors
      if (isTransientMongoError(e)) {
        try { await connectMongo(); } catch {}
        if (USE_MONGO) {
          try {
            const docs = await mongoDb.collection(store).find({}).toArray();
            return docs.map(({ _id, ...rest }) => rest);
          } catch (e2) {
            mongoFailover(e2, `dbList(${store})`);
          }
        } else {
          mongoFailover(e, `dbList(${store})`);
        }
      } else {
        mongoFailover(e, `dbList(${store})`);
      }
    }
  }
  const db = await ensureDb();
  return store === "settings" ? db.settings : (Array.isArray(db[store]) ? db[store] : []);
}

async function dbGet(store, id) {
  if (USE_MONGO) {
    try {
      if (store === "settings") return await dbGetSettings();
      const doc = await mongoDb.collection(store).findOne({ id });
      if (!doc) return null;
      const { _id, ...rest } = doc;
      return rest;
    } catch (e) {
      if (isTransientMongoError(e)) {
        try { await connectMongo(); } catch {}
        if (USE_MONGO) {
          try {
            const doc = await mongoDb.collection(store).findOne({ id });
            if (!doc) return null;
            const { _id, ...rest } = doc;
            return rest;
          } catch (e2) { mongoFailover(e2, `dbGet(${store})`); }
        } else { mongoFailover(e, `dbGet(${store})`); }
      } else { mongoFailover(e, `dbGet(${store})`); }
    }
  }
  const db = await ensureDb();
  if (store === "settings") return db.settings;
  const list = Array.isArray(db[store]) ? db[store] : [];
  return list.find((x) => x.id === id) || null;
}

async function dbInsert(store, rec) {
  const now = Date.now();
  const doc = { ...rec };
  if (!doc.id) doc.id = uid();
  if (!doc.createdAt) doc.createdAt = now;
  if (!doc.updatedAt) doc.updatedAt = now;
  delete doc._id;
  if (store === "users") {
    Object.assign(doc, ensureUserEmail(doc));
  }
  if (USE_MONGO) {
    try {
      if (store === "settings") {
        await dbSetSettings(doc);
        return doc;
      }
      await mongoDb.collection(store).insertOne(doc);
      return doc;
    } catch (e) {
      if (isTransientMongoError(e)) {
        try { await connectMongo(); } catch {}
        if (USE_MONGO) {
          try { await mongoDb.collection(store).insertOne(doc); return doc; } catch (e2) { mongoFailover(e2, `dbInsert(${store})`); }
        } else { mongoFailover(e, `dbInsert(${store})`); }
      } else { mongoFailover(e, `dbInsert(${store})`); }
    }
  }
  const db = await ensureDb();
  if (store === "settings") {
    db.settings = { id: "settings", ...(db.settings || createDefaultSettings()), ...doc };
  } else {
    const list = Array.isArray(db[store]) ? db[store] : [];
    list.push(doc);
    db[store] = list;
  }
  await writeDb(db);
  return doc;
}

async function dbUpdate(store, id, patch) {
  const now = Date.now();
  const update = { ...patch, updatedAt: now };
  if (store === "users" && Object.prototype.hasOwnProperty.call(update, "email")) {
    Object.assign(update, ensureUserEmail({ ...update, id }));
  }
  if (USE_MONGO) {
    try {
      if (store === "settings") {
        const cur = await dbGetSettings();
        const next = { id: "settings", ...(cur || {}), ...update };
        await dbSetSettings(next);
        return next;
      }
      const col = mongoDb.collection(store);
      const cur = await col.findOne({ id });
      const next = cur ? { ...cur, ...update, id } : { id, createdAt: now, ...update };
      // Never attempt to $set the Mongo _id field
      const { _id, ...toSet } = next;
      await col.updateOne({ id }, { $set: toSet }, { upsert: true });
      return toSet;
    } catch (e) {
      if (isTransientMongoError(e)) {
        try { await connectMongo(); } catch {}
        if (USE_MONGO) {
          try {
            const col = mongoDb.collection(store);
            const cur = await col.findOne({ id });
            const next = cur ? { ...cur, ...update, id } : { id, createdAt: now, ...update };
            const { _id, ...toSet } = next;
            await col.updateOne({ id }, { $set: toSet }, { upsert: true });
            return toSet;
          } catch (e2) { mongoFailover(e2, `dbUpdate(${store})`); }
        } else { mongoFailover(e, `dbUpdate(${store})`); }
      } else { mongoFailover(e, `dbUpdate(${store})`); }
    }
  }
  const db = await ensureDb();
  if (store === "settings") {
    const next = { id: "settings", ...(db.settings || createDefaultSettings()), ...update };
    db.settings = next;
    await writeDb(db);
    return next;
  }
  const list = Array.isArray(db[store]) ? db[store] : [];
  const idx = list.findIndex((x) => x.id === id);
  const next = idx >= 0 ? { ...list[idx], ...update, id } : { id, createdAt: now, ...update };
  if (idx >= 0) list[idx] = next; else list.push(next);
  db[store] = list;
  await writeDb(db);
  return next;
}

async function dbDelete(store, id) {
  if (USE_MONGO) {
    try {
      if (store === "settings") throw new Error("Cannot delete settings");
      const res = await mongoDb.collection(store).deleteOne({ id });
      return res.deletedCount > 0;
    } catch (e) {
      if (isTransientMongoError(e)) {
        try { await connectMongo(); } catch {}
        if (USE_MONGO) {
          try { const res = await mongoDb.collection(store).deleteOne({ id }); return res.deletedCount > 0; } catch (e2) { mongoFailover(e2, `dbDelete(${store})`); }
        } else { mongoFailover(e, `dbDelete(${store})`); }
      } else { mongoFailover(e, `dbDelete(${store})`); }
    }
  }
  const db = await ensureDb();
  if (store === "settings") return false;
  const list = Array.isArray(db[store]) ? db[store] : [];
  const next = list.filter((x) => x.id !== id);
  const removed = next.length !== list.length;
  db[store] = next;
  await writeDb(db);
  return removed;
}

async function dbGetSettings() {
  if (USE_MONGO) {
    try {
      const doc = await mongoDb.collection("settings").findOne({ id: "settings" });
      if (!doc) return createDefaultSettings();
      const { _id, ...rest } = doc;
      return rest;
    } catch (e) {
      if (isTransientMongoError(e)) {
        try { await connectMongo(); } catch {}
        if (USE_MONGO) {
          try {
            const doc = await mongoDb.collection("settings").findOne({ id: "settings" });
            if (!doc) return createDefaultSettings();
            const { _id, ...rest } = doc; return rest;
          } catch (e2) { mongoFailover(e2, "dbGetSettings"); }
        } else { mongoFailover(e, "dbGetSettings"); }
      } else { mongoFailover(e, "dbGetSettings"); }
    }
  }
  const db = await ensureDb();
  return db.settings || createDefaultSettings();
}

async function dbSetSettings(next) {
  if (USE_MONGO) {
    try {
      const { _id, ...toSet } = next || {};
      await mongoDb.collection("settings").updateOne({ id: "settings" }, { $set: toSet }, { upsert: true });
      return toSet;
    } catch (e) {
      if (isTransientMongoError(e)) {
        try { await connectMongo(); } catch {}
        if (USE_MONGO) {
          try { const { _id, ...toSet } = next || {}; await mongoDb.collection("settings").updateOne({ id: "settings" }, { $set: toSet }, { upsert: true }); return toSet; } catch (e2) { mongoFailover(e2, "dbSetSettings"); }
        } else { mongoFailover(e, "dbSetSettings"); }
      } else { mongoFailover(e, "dbSetSettings"); }
    }
  }
  const db = await ensureDb();
  db.settings = next;
  await writeDb(db);
  return next;
}

// File locking mechanism to prevent concurrent writes
let dbWriteLock = false;
const dbWriteQueue = [];

async function readDb() {
  try {
    const raw = await fs.readFile(DB_PATH, "utf8");
    if (!raw || !raw.trim()) throw new Error("empty file");
    const data = JSON.parse(raw);
    return validateDbStructure(data);
  } catch (err) {
    try {
      // If file exists but is corrupted, back it up once to avoid loops
      const ts = new Date().toISOString().replace(/[:.]/g, "-");
      const backup = DB_PATH.replace(/\.json$/i, `.${ts}.corrupt.json`);
      // stat + copy inside try; ignore if file missing
      await fs.stat(DB_PATH).catch(() => null);
      await fs.copyFile(DB_PATH, backup).catch(() => null);
    } catch {}
    console.log("DB read error, creating new database:", err.message);
    return null;
  }
}

async function writeDb(db) {
  // Queue writes to prevent data corruption
  return new Promise((resolve, reject) => {
    const doWrite = async () => {
      if (dbWriteLock) {
        dbWriteQueue.push(() => doWrite());
        return;
      }

      dbWriteLock = true;
      try {
        // Validate data before writing
        const validated = validateDbStructure(db);
        // Atomic write: write to temp file then rename
        const tmp = `${DB_PATH}.tmp-${process.pid}`;
        await fs.writeFile(tmp, JSON.stringify(validated, null, 2), "utf8");
        await fs.rename(tmp, DB_PATH);
        resolve();
      } catch (err) {
        // Clean any temp file best-effort
        try { await fs.unlink(`${DB_PATH}.tmp-${process.pid}`); } catch {}
        console.warn("DB write error:", err?.message || err);
        reject(err);
      } finally {
        dbWriteLock = false;
        const next = dbWriteQueue.shift();
        if (next) next();
      }
    };

    doWrite();
  });
}

// Validate and fix database structure
function validateDbStructure(db) {
  if (!db || typeof db !== 'object') {
    return createDefaultDb();
  }
  
  const validated = { ...db };
  
  // Ensure all stores exist as arrays (except settings)
  STORES.forEach(store => {
    if (store === 'settings') {
      if (!validated.settings || typeof validated.settings !== 'object') {
        validated.settings = createDefaultSettings();
      } else {
        // Ensure settings has all required fields
        validated.settings = { ...createDefaultSettings(), ...validated.settings };
      }
    } else {
      if (!Array.isArray(validated[store])) {
        validated[store] = [];
      }
      // Validate each item has an id
      validated[store] = validated[store].map(item => {
        if (!item.id) {
          return { ...item, id: uid() };
        }
        return item;
      });
    }
  });
  
  return validated;
}

function createDefaultSettings() {
  return {
    id: "settings",
    capacity: 0,
    dorms: [],
    lists: {
      statuses: [],
      phases: [],
      squads: [],
      recordTypes: [],
    },
    visionApiKey: "",
    visionProxyUrl: "",
  };
}

function createDefaultDb() {
  // Empty shapes only; no demo/placeholder data.
  return {
    students: [],
    tasks: [],
    classes: [],
    service: [],
    documents: [],
  pdfTemplates: [],
  envelopes: [],
    notifications: [],
    messages: [],
    users: [],
    settings: createDefaultSettings(),
    audit: [],
    events: [],
  };
}


async function ensureDb() {
  let db = await readDb();

  if (!db) {
    // initialize an empty file DB with just empty shapes
    db = createDefaultDb();
    await writeDb(db);
    return db;
  }

  // Validate shape only; no auto-population with sample data
  const validated = validateDbStructure(db);
  return validated;
}

function sanitizeUser(u) {
  if (!u) return null;
  const { password, twoFactor, passwordReset, ...rest } = u;
  let tf = undefined;
  if (twoFactor) {
    const { enabled = false, updatedAt = twoFactor.updatedAt } = twoFactor;
    tf = { enabled, updatedAt }; // do not expose secret or backup codes
  }
  return { ...rest, ...(tf ? { twoFactor: tf } : {}) };
}

// Error handler middleware
function handleError(res, error, message = "An error occurred") {
  console.error(message, error);
  res.status(500).json({ 
    success: false, 
    error: message,
    details: process.env.NODE_ENV === 'development' ? error.message : undefined
  });
}

// Health
app.get(`${API_PREFIX}/health`, async (req, res) => {
  try {
    if (USE_MONGO) {
      const count = await mongoDb.collection("students").estimatedDocumentCount();
      res.json({ ok: true, ts: Date.now(), stores: STORES.length, students: count });
    } else {
      const db = await ensureDb();
      res.json({ ok: true, ts: Date.now(), stores: Object.keys(db).length, students: db.students?.length || 0 });
    }
  } catch (error) {
    res.json({ ok: false, ts: Date.now(), error: error.message });
  }
});

// Config: expose Google Maps key to client on demand
// Note: This still exposes the key to the browser at runtime, which is required for client-side Places Autocomplete.
// Restrict usage in the Google Cloud Console with HTTP referrers to mitigate abuse.
app.get(`${API_PREFIX}/config/maps-key`, (req, res) => {
  try {
    if (!GOOGLE_MAPS_API_KEY) return res.json({ enabled: false, key: "" });
    res.json({ enabled: true, key: GOOGLE_MAPS_API_KEY });
  } catch (e) {
    res.status(500).json({ enabled: false, key: "", error: e?.message || "Failed to read key" });
  }
});

// Convenience redirect if users hit the API origin for the reset page by mistake
app.get('/reset-password', (req, res) => {
  const origin = process.env.APP_PUBLIC_URL || 'http://localhost:3000';
  const url = new URL(origin.replace(/\/$/, '') + '/reset-password');
  const token = String(req.query.token || '').trim();
  if (token) url.searchParams.set('token', token);
  res.redirect(302, url.toString());
});

// Auth
app.post(`${API_PREFIX}/auth/login`, async (req, res) => {
  try {
    const { email = "", username = "", password = "", otp = "", backupCode = "" } = req.body || {};
    const idStr = String(username || email).trim();
    const em = String(email || "").toLowerCase().trim();
    const un = String(username || "").toLowerCase().trim();
    let user = null;

    // Try Mongo first (when enabled); on any Mongo error, fail over to file DB seamlessly
    if (USE_MONGO) {
      try {
        const q = { password: String(password) };
        const idForMatch = idStr || em || un;
        const rxId = new RegExp(`^${escapeRegExp(idForMatch)}$`, "i");
        // Accept either exact email OR exact username (case-insensitive)
        q.$or = [
          { email: rxId },
          { username: rxId },
        ];
        user = await mongoDb.collection("users").findOne(q);
      } catch (e) {
        // Network or driver error — switch to file DB and continue
        mongoFailover(e, "auth/login lookup");
      }
    }

    if (!user) {
      const db = await ensureDb();
      const idForMatch = (idStr || em || un).toLowerCase();
      user = (db.users || []).find((u) => {
        const byEmail = String(u.email || "").toLowerCase() === idForMatch;
        const byUser = String(u.username || "").toLowerCase() === idForMatch;
        return (byEmail || byUser) && String(u.password || "") === String(password);
      });
    }
    if (!user) {
      return res.status(401).json({ success: false, error: "Invalid username/email or password" });
    }

    // If 2FA is enabled for this user, require either TOTP code or a valid backup code
    const tf = user.twoFactor || {};
    if (tf.enabled) {
      const hasOtp = String(otp || "").trim().length === 6;
      const hasBackup = String(backupCode || "").trim().length > 0;

      let ok = false;
      if (hasOtp && tf.secret) {
        try {
          ok = speakeasy.totp.verify({
            secret: tf.secret,
            encoding: "base32",
            token: String(otp),
            window: 1,
          });
        } catch {}
      }

      // If not verified by OTP, try backup code
      if (!ok && hasBackup && Array.isArray(tf.backupCodes)) {
        const h = sha256(String(backupCode).replace(/\s+/g, "").toUpperCase());
        const idx = tf.backupCodes.findIndex((c) => c.hash === h && !c.usedAt);
        if (idx >= 0) {
          ok = true;
          // mark code used
          tf.backupCodes[idx] = { ...tf.backupCodes[idx], usedAt: Date.now() };
          // persist update
          await dbUpdate("users", user.id, { twoFactor: { ...tf } });
          if (USE_MONGO) {
            const col = mongoDb.collection("users");
            await col.updateOne({ id: user.id }, { $set: { twoFactor: { ...tf } } });
          }
          user.twoFactor = { ...tf };
        }
      }

      if (!ok) {
        return res.status(401).json({
          success: false,
          error: hasOtp || hasBackup ? "Invalid two-factor code" : "Two-factor code required",
          need2FA: true,
        });
      }
    }

    // Mark user online on successful login
    try { await dbUpdate("users", user.id, { presence: "online", lastSeen: Date.now() }); } catch {}
    try { await broadcastAdminPresenceUpdate(user.id); } catch {}
    const fresh = await dbGet("users", user.id);
    res.json({ success: true, user: sanitizeUser(fresh) });
  } catch (error) {
    handleError(res, error, "Login failed");
  }
});

// Logout: mark user offline (best-effort) and end session client-side
app.post(`${API_PREFIX}/auth/logout`, async (req, res) => {
  try {
    const { userId = "" } = req.body || {};
    if (userId) {
      try {
        await dbUpdate("users", userId, { presence: "offline", lastSeen: Date.now() });
        await broadcastAdminPresenceUpdate(userId);
      } catch {}
    }
    res.json({ success: true });
  } catch (error) {
    handleError(res, error, "Logout failed");
  }
});

// Start 2FA setup: generates a pending secret and QR for the user
app.post(`${API_PREFIX}/auth/2fa/start`, async (req, res) => {
  try {
    const { userId = "", label = "" } = req.body || {};
    if (!userId) return res.status(400).json({ success: false, error: "userId is required" });

    const user = await dbGet("users", userId);
    if (!user) return res.status(404).json({ success: false, error: "User not found" });

    const accountLabel = label || user.email || user.name || userId;
    const secret = speakeasy.generateSecret({
      name: `${APP_ISSUER} (${accountLabel})`,
      issuer: APP_ISSUER,
      length: 20,
    });

    // persist pending secret, do not enable yet
    const twoFactorPending = { secret: secret.base32, createdAt: Date.now() };
    await dbUpdate("users", user.id, { twoFactorPending });

    // build QR as data URL
    const otpauthUrl = secret.otpauth_url;
    const qrDataUrl = await QRCode.toDataURL(otpauthUrl);

    res.json({ success: true, otpauthUrl, qrDataUrl });
  } catch (error) {
    handleError(res, error, "Failed to start 2FA setup");
  }
});

// Verify 2FA token and enable permanently
app.post(`${API_PREFIX}/auth/2fa/verify`, async (req, res) => {
  try {
    const { userId = "", token = "" } = req.body || {};
    if (!userId || !token) return res.status(400).json({ success: false, error: "userId and token are required" });

    const user = await dbGet("users", userId);
    if (!user) return res.status(404).json({ success: false, error: "User not found" });

    const pending = user.twoFactorPending;
    if (!pending?.secret) return res.status(400).json({ success: false, error: "No pending 2FA setup" });

    const ok = speakeasy.totp.verify({
      secret: pending.secret,
      encoding: "base32",
      token: String(token),
      window: 1,
    });
    if (!ok) return res.status(401).json({ success: false, error: "Invalid verification code" });

    const { plain, hashed } = generateBackupCodes(8);
    const twoFactor = {
      enabled: true,
      secret: pending.secret,
      backupCodes: hashed,
      updatedAt: Date.now(),
    };

    await dbUpdate("users", user.id, { twoFactor, twoFactorPending: null });

    res.json({ success: true, enabled: true, backupCodes: plain });
  } catch (error) {
    handleError(res, error, "Failed to verify 2FA");
  }
});

// Disable 2FA
app.post(`${API_PREFIX}/auth/2fa/disable`, async (req, res) => {
  try {
    const { userId = "" } = req.body || {};
    if (!userId) return res.status(400).json({ success: false, error: "userId is required" });
    const user = await dbGet("users", userId);
    if (!user) return res.status(404).json({ success: false, error: "User not found" });

    await dbUpdate("users", user.id, { twoFactor: { enabled: false }, twoFactorPending: null });
    res.json({ success: true, disabled: true });
  } catch (error) {
    handleError(res, error, "Failed to disable 2FA");
  }
});

// Regenerate backup codes
app.post(`${API_PREFIX}/auth/2fa/backup/regenerate`, async (req, res) => {
  try {
    const { userId = "" } = req.body || {};
    if (!userId) return res.status(400).json({ success: false, error: "userId is required" });
    const user = await dbGet("users", userId);
    if (!user) return res.status(404).json({ success: false, error: "User not found" });

    if (!user.twoFactor?.enabled) return res.status(400).json({ success: false, error: "2FA is not enabled" });

    const { plain, hashed } = generateBackupCodes(8);
    const twoFactor = {
      ...user.twoFactor,
      backupCodes: hashed,
      updatedAt: Date.now(),
    };
    await dbUpdate("users", user.id, { twoFactor });
    res.json({ success: true, backupCodes: plain });
  } catch (error) {
    handleError(res, error, "Failed to regenerate backup codes");
  }
});

// --- Presence: track online/away/offline ---
app.post(`${API_PREFIX}/auth/presence`, async (req, res) => {
  try {
    const { userId = "", presence = "" } = req.body || {};
    if (!userId) return res.status(400).json({ success: false, error: "userId is required" });
    const p = String(presence || "").toLowerCase();
    const allowed = ["online", "away", "offline"];
    const val = allowed.includes(p) ? p : "online";
    await dbUpdate("users", userId, { presence: val, lastSeen: Date.now() });
    res.json({ success: true, presence: val });
  } catch (error) {
    handleError(res, error, "Failed to update presence");
  }
});

// --- Password Reset (email link flow) ---
// Helpers for reset token
function createResetToken() {
  return crypto.randomBytes(32).toString("hex");
}

function hashToken(t) {
  return sha256(String(t));
}

// Request a password reset link via email
// Body: { email?: string, userId?: string, origin?: string }
app.post(`${API_PREFIX}/auth/password/reset`, async (req, res) => {
  try {
    const { email = "", userId = "", origin = "" } = req.body || {};
    const em = String(email || "").trim().toLowerCase();
    const uidReq = String(userId || "").trim();

    // locate user by id or email
    let user = null;
    if (uidReq) {
      user = await dbGet("users", uidReq);
    }
    if (!user && em) {
      const list = await dbList("users");
      user = (Array.isArray(list) ? list : []).find((u) => String(u.email || "").toLowerCase() === em) || null;
    }
    if (!user) return res.status(404).json({ success: false, error: "User not found" });

  // generate and store token hash with expiry (1 minute)
    const token = createResetToken();
    const tokenHash = hashToken(token);
  const expiresAt = Date.now() + 60 * 1000;
    const reset = { tokenHash, expiresAt, requestedAt: Date.now(), requestedFor: user.id };
    await dbUpdate("users", user.id, { passwordReset: reset });

    // compose link
    const defaultOrigin = req.get("origin") || req.headers?.referer || process.env.APP_PUBLIC_URL || "http://localhost:3000";
    const base = String(origin || defaultOrigin).replace(/\/$/, "");
    const resetLink = `${base}/reset-password?token=${encodeURIComponent(token)}`;

    // send email if configured, otherwise return link for debugging
    let sent = false;
    try {
      if (mailer) {
        const from = process.env.SMTP_FROM || process.env.SMTP_USER || `no-reply@${APP_ISSUER.toLowerCase()}.local`;
        const to = user.email || em;
        const mail = {
          from,
          to,
          subject: `${APP_ISSUER} password reset`,
          text: `Hello${user.name ? ` ${user.name}` : ""},\n\nA password reset was requested for your account.\n\nClick the link below to reset your password (valid for 1 minute):\n${resetLink}\n\nIf you did not request this, please ignore this email.`,
          html: `<p>Hello${user.name ? ` ${user.name}` : ""},</p><p>A password reset was requested for your account.</p><p><a href="${resetLink}">Reset your password</a> (valid for 1 minute)</p><p>If you did not request this, please ignore this email.</p>`
        };
        await mailer.sendMail(mail);
        sent = true;
      }
    } catch (e) {
      console.warn("Mail send failed:", e.message);
    }

    res.json({ success: true, email: !!mailer && sent, link: resetLink });
  } catch (error) {
    handleError(res, error, "Failed to initiate password reset");
  }
});

// Validate a reset token
// Query: ?token=<token>
app.get(`${API_PREFIX}/auth/password/reset/check`, async (req, res) => {
  try {
    const token = String(req.query.token || "").trim();
    if (!token) return res.status(400).json({ success: false, error: "token is required" });
    const h = hashToken(token);
    const users = await dbList("users");
    const match = (Array.isArray(users) ? users : []).find((u) => u.passwordReset?.tokenHash === h);
    if (!match) return res.status(404).json({ success: false, valid: false, error: "Invalid token" });
    if ((match.passwordReset?.expiresAt || 0) < Date.now()) {
      return res.status(410).json({ success: false, valid: false, error: "Token expired" });
    }
    res.json({ success: true, valid: true, userId: match.id });
  } catch (error) {
    handleError(res, error, "Failed to validate reset token");
  }
});

// Complete a password reset
// Body: { token: string, newPassword: string }
app.post(`${API_PREFIX}/auth/password/reset/complete`, async (req, res) => {
  try {
    const { token = "", newPassword = "" } = req.body || {};
    if (!token || !newPassword) return res.status(400).json({ success: false, error: "token and newPassword are required" });
    if (String(newPassword).length < 6) return res.status(400).json({ success: false, error: "Password too short" });
    const h = hashToken(token);
    const users = await dbList("users");
    const match = (Array.isArray(users) ? users : []).find((u) => u.passwordReset?.tokenHash === h);
    if (!match) return res.status(404).json({ success: false, error: "Invalid token" });
    if ((match.passwordReset?.expiresAt || 0) < Date.now()) {
      return res.status(410).json({ success: false, error: "Token expired" });
    }
    // update password (plaintext to match existing system) and clear reset info
    await dbUpdate("users", match.id, { password: String(newPassword), passwordReset: null });
    res.json({ success: true });
  } catch (error) {
    handleError(res, error, "Failed to complete password reset");
  }
});

function isValidStore(s) { 
  return STORES.includes(s); 
}

// --- Students CRUD (explicit routes) ---
// These come BEFORE the generic `/:store` routes so they take precedence.
app.get(`${API_PREFIX}/students`, async (req, res) => {
  try {
  const list = await dbList("students");
  res.json(Array.isArray(list) ? list : []);
  } catch (error) {
    handleError(res, error, "Failed to fetch students");
  }
});

app.get(`${API_PREFIX}/students/:id`, async (req, res) => {
  try {
    const { id } = req.params;
    const item = await dbGet("students", id);
    if (!item) return res.status(404).json({ error: "Student not found" });
    res.json(item);
  } catch (error) {
    handleError(res, error, "Failed to fetch student");
  }
});

app.post(`${API_PREFIX}/students`, async (req, res) => {
  try {
    const body = req.body || {};

    // Basic validation
    const firstName = (body.firstName || "").trim();
    const lastName = (body.lastName || "").trim();
    if (!firstName && !lastName) {
      return res.status(400).json({ error: "firstName or lastName is required" });
    }

    const rec = await dbInsert("students", {
      id: body.id,
      firstName,
      lastName,
      status: body.status || "Current",
      phase: body.phase ?? "1",
      recordType: body.recordType || (body.status === "Waitlist" ? "Applicant" : "Resident"),
      dormId: body.dormId || body.dorm || "",
      squad: body.squad || "",
      intakeDate: body.intakeDate || body.createdAt || null,
      exitDate: body.exitDate || null,
      archived: !!body.archived,
      ...body
    });
    res.status(201).json(rec);
  } catch (error) {
    handleError(res, error, "Failed to create student");
  }
});

// Create or update a login for this student (role: student). Returns plain password for admin to share.
app.post(`${API_PREFIX}/students/:id/credentials`, async (req, res) => {
  try {
    const studentId = String(req.params.id || "").trim();
    const { username = "", email = "", password = "", generate = false } = req.body || {};

    // Defensive: try both direct get and a list scan (handles fallback DBs/desynced stores)
    let student = await dbGet("students", studentId);
    if (!student) {
      try {
        const all = await dbList("students");
        if (Array.isArray(all)) {
          student = all.find((s) => String(s.id) === studentId) || null;
        }
      } catch {}
    }
    if (!student) return res.status(404).json({ success: false, error: "Student not found" });

    const uname = String(username || "").trim();
    if (!uname) return res.status(400).json({ success: false, error: "Username is required" });
    const em = String(email || "").trim();
    const pwd = String(password || "").trim() || (generate ? randomPassword(12) : "");
    if (!pwd) return res.status(400).json({ success: false, error: "Password is required" });

    const users = await dbList("users");
    const arr = Array.isArray(users) ? users : [];
    const lowerU = uname.toLowerCase();
    const lowerE = em.toLowerCase();

    const existingForStudent = arr.find((u) => String(u.studentId || "") === String(studentId));
    const conflict = arr.find((u) => {
      if (existingForStudent && u.id === existingForStudent.id) return false;
      const uUser = String(u.username || "").toLowerCase();
      const uEmail = String(u.email || "").toLowerCase();
      if (lowerU && uUser === lowerU) return true;
      if (lowerE && uEmail === lowerE) return true;
      return false;
    });
    if (conflict) {
      return res.status(409).json({ success: false, error: "Username or email already exists" });
    }

    const baseUser = {
      name: `${student.firstName || ""} ${student.lastName || ""}`.trim() || uname || "Student",
      username: uname,
      email: em || undefined,
      password: pwd,
      role: "student",
      studentId,
      presence: existingForStudent?.presence || "offline",
    };

    let saved = null;
    let action = "created";
    if (existingForStudent) {
      action = "updated";
      saved = await dbUpdate("users", existingForStudent.id, { ...baseUser });
    } else {
      saved = await dbInsert("users", baseUser);
    }

    res.json({
      success: true,
      action,
      user: sanitizeUser(saved),
      password: pwd,
    });
  } catch (error) {
    handleError(res, error, "Failed to provision student login");
  }
});

app.put(`${API_PREFIX}/students/:id`, async (req, res) => {
  try {
    const { id } = req.params;
    const body = req.body || {};
    const updated = await dbUpdate("students", id, body);
    res.json(updated);
  } catch (error) {
    handleError(res, error, "Failed to update student");
  }
});

app.delete(`${API_PREFIX}/students/:id`, async (req, res) => {
  try {
    const { id } = req.params;
    const removed = await dbDelete("students", id);
    if (!removed) return res.status(404).json({ success: false, error: "Student not found" });
    res.json({ success: true, removed: true });
  } catch (error) {
    handleError(res, error, "Failed to delete student");
  }
});

// --- Documents (explicit filters + GCS-aware delete) ---
app.get(`${API_PREFIX}/documents`, async (req, res) => {
  try {
    const { studentId = "", kind = "", q = "", limit = "", sort = "desc" } = req.query || {};
    const list = await dbList("documents");
    const needle = String(q || "").trim().toLowerCase();
    let out = Array.isArray(list) ? list : [];
    if (studentId) out = out.filter((d) => String(d.studentId || "") === String(studentId));
    if (kind) out = out.filter((d) => String(d.kind || "").toLowerCase() === String(kind).toLowerCase());
    if (needle) out = out.filter((d) => `${d.name || ""} ${d.by || ""} ${d.mime || ""}`.toLowerCase().includes(needle));
    out.sort((a, b) => (b.at || b.updatedAt || 0) - (a.at || a.updatedAt || 0));
    if (String(sort).toLowerCase() === "asc") out.reverse();
    const lim = parseInt(limit, 10);
    if (!Number.isNaN(lim) && lim > 0) out = out.slice(0, lim);
    res.json(out);
  } catch (error) {
    handleError(res, error, "Failed to fetch documents");
  }
});

// GCS-aware delete for documents
app.delete(`${API_PREFIX}/documents/:id`, async (req, res) => {
  try {
    const { id } = req.params;
    // get the document first to know storage path/url
    const doc = await dbGet("documents", id);
    if (!doc) return res.status(404).json({ success: false, error: "Document not found" });

    // best-effort storage deletion
    let storageDeleted = false;
    if (doc.path) {
      storageDeleted = await tryDeleteGcsPath(doc.path);
    } else if (doc.url && GCS_BUCKET) {
      storageDeleted = await tryDeleteGcsPath(doc.url);
    }

    const removed = await dbDelete("documents", id);
    res.json({ success: true, removed, storageDeleted });
  } catch (error) {
    handleError(res, error, "Failed to delete document");
  }
});

/**
 * Upload files to Google Cloud Storage.
 * Multipart form fields:
 *  - files: one or more files
 *  - studentId (optional): if provided, creates 'documents' entries per upload
 *  - by (optional): uploader id or name; defaults to 'u-admin'
 *  - folder (optional): subfolder in bucket; defaults to 'uploads'
 */
app.post(`${API_PREFIX}/upload`, upload.any(), async (req, res) => {
  try {
    if (!gcsBucket) return res.status(503).json({ success: false, error: "GCS not configured" });

    const studentId = req.body?.studentId || "";
    const by = req.body?.by || "u-admin";
    const folder = req.body?.folder || (req.body?.kind === "photo" ? "photos" : "uploads");
    const files = Array.isArray(req.files) ? req.files : [];
    if (!files.length) return res.status(400).json({ success: false, error: "No files uploaded" });

    const out = [];
    const docs = [];

    for (const f of files) {
      const up = await gcsUploadBuffer(f, folder);
      const meta = {
        name: f.originalname,
        size: f.size,
        mime: f.mimetype,
        url: up.url,
        path: up.path,
      };
      out.push(meta);

      if (studentId) {
        const kind = /^image\//i.test(f.mimetype || "") ? "photo" : "file";
        const rec = await dbInsert("documents", {
          kind,
          studentId,
          name: meta.name,
          url: meta.url,
          path: meta.path, // keep object path so we can delete later
          at: Date.now(),
          by,
          size: meta.size,
          mime: meta.mime,
        });

        // Notification (mirror generic POST /:store behavior)
        try {
          const students = await dbList("students");
          const st = Array.isArray(students) ? students.find((s) => s.id === studentId) : null;
          const studentName = st ? `${st.firstName || ""} ${st.lastName || ""}`.trim() || "Student" : "Student";
          const isPhoto = kind === "photo";
          const notif = {
            id: uid(),
            kind: isPhoto ? "photo" : "doc",
            title: isPhoto ? "Photo Uploaded" : "Document Uploaded",
            body: `${studentName} — Uploaded by ${by}`,
            at: Date.now(),
            read: false,
            link: `/students/${studentId}?tab=${isPhoto ? "photos" : "documents"}`,
            studentId,
            docId: rec.id,
          };
          if (USE_MONGO) {
            await mongoDb.collection("notifications").insertOne(notif);
          } else {
            const db = await ensureDb();
            db.notifications = [notif, ...(db.notifications || [])].slice(0, 200);
            await writeDb(db);
          }
        } catch {}

        docs.push(rec);
      }
    }

    res.json({ success: true, bucket: GCS_BUCKET, public: GCS_PUBLIC, files: out, docs });
  } catch (error) {
    handleError(res, error, "Failed to upload to Google Cloud Storage");
  }
});

// ---------- Envelopes (sending, inbox, submission) ----------
// Helper: match a recipient to a userId by studentId or email
async function resolveRecipientUserId(recipient) {
  try {
    const users = await dbList("users");
    const arr = Array.isArray(users) ? users : [];
    const sid = recipient.studentId || recipient.id;
    if (sid) {
      const u = arr.find((x) => String(x.studentId || "") === String(sid));
      if (u) return u.id;
    }
    if (recipient.email) {
      const em = String(recipient.email).toLowerCase();
      const u = arr.find((x) => String(x.email || "").toLowerCase() === em);
      if (u) return u.id;
    }
  } catch {}
  return undefined;
}

// GET /envelopes with optional filtering: ?for=<userId> or ?studentId=<sid>
app.get(`${API_PREFIX}/envelopes`, async (req, res) => {
  try {
    const forUser = String(req.query.for || req.query.userId || req.query.uid || "").trim();
    const forStudent = String(req.query.studentId || req.query.sid || "").trim();
    let list = await dbList("envelopes");
    list = Array.isArray(list) ? list : [];
    if (forUser || forStudent) {
      list = list.filter((env) => {
        const recips = Array.isArray(env.recipients) ? env.recipients : [];
        for (const r of recips) {
          if (forStudent && (String(r.studentId || r.id || "") === forStudent)) return true;
          if (forUser && (String(r.userId || "") === forUser)) return true;
        }
        return false;
      });
    }
    // newest first
    list.sort((a, b) => (b.updatedAt || b.createdAt || 0) - (a.updatedAt || a.createdAt || 0));
    res.json(list);
  } catch (error) {
    handleError(res, error, "Failed to fetch envelopes");
  }
});

// GET /envelopes/:id
app.get(`${API_PREFIX}/envelopes/:id`, async (req, res) => {
  try {
    const { id } = req.params;
    const env = await dbGet("envelopes", id);
    if (!env) return res.status(404).json({ error: "Not found" });
    res.json(env);
  } catch (error) {
    handleError(res, error, "Failed to fetch envelope");
  }
});

// POST /envelopes (create + notify recipients)
app.post(`${API_PREFIX}/envelopes`, async (req, res) => {
  try {
    const body = req.body || {};
    const now = Date.now();
    const recipients = Array.isArray(body.recipients) ? body.recipients : [];
    const recipsEnriched = [];
    for (const r of recipients) {
      const rr = {
        id: r.id || r.studentId || r.userId || uid(),
        studentId: r.studentId || r.id || undefined,
        userId: r.userId || undefined,
        name: r.name || "Recipient",
        email: r.email || undefined,
        status: "pending",
        invitedAt: now,
      };
      if (!rr.userId) rr.userId = await resolveRecipientUserId(rr);
      recipsEnriched.push(rr);
    }

    const env = {
      id: body.id || uid(),
      templateId: body.templateId,
      formId: body.formId || undefined,
      kind: body.kind || (body.formId ? 'form' : 'document'),
      subject: body.subject || "Document",
      message: body.message || "",
      recipients: recipsEnriched,
      status: "queued",
      createdAt: now,
      updatedAt: now,
      sentBy: body.sentBy || undefined,
  emailRecipients: !!body.emailRecipients,
    };

    const saved = await dbInsert("envelopes", env);

    // Notifications + optional email
    try {
      for (const r of recipsEnriched) {
        const notif = {
          id: uid(),
          kind: "envelope",
          title: env.subject || "Document to Sign",
          body: env.message || "You have a document to complete.",
          at: Date.now(),
          read: false,
          action: "open:envelope",
          to: r.userId || undefined,
          envelopeId: saved.id,
          studentId: r.studentId || undefined,
        };
        if (USE_MONGO) {
          await mongoDb.collection("notifications").insertOne(notif);
        } else {
          const db = await ensureDb();
          db.notifications = Array.isArray(db.notifications) ? db.notifications : [];
          db.notifications.unshift(notif);
          db.notifications = db.notifications.slice(0, 200);
          await writeDb(db);
        }
        // Optional email
  if (env.emailRecipients && mailer && r.email) {
          try {
            const from = process.env.SMTP_FROM || process.env.SMTP_USER || `no-reply@${APP_ISSUER.toLowerCase()}.local`;
            const subj = env.subject || `${APP_ISSUER} Document`;
            const origin = process.env.APP_PUBLIC_URL || "http://localhost:3000";
            const openUrl = env.formId
              ? `${origin.replace(/\/$/, "")}/form/${encodeURIComponent(env.formId)}`
              : `${origin.replace(/\/$/, "")}/user/document?envelopeId=${encodeURIComponent(saved.id)}`;
            await mailer.sendMail({
              from,
              to: r.email,
              subject: subj,
              text: `${env.message || "You have a document to complete."}\n\nOpen: ${openUrl}`,
              html: `<p>${env.message || "You have a document to complete."}</p><p><a href="${openUrl}">Open Document</a></p>`,
            });
          } catch (e) {
            console.warn("Envelope email send failed:", e?.message || e);
          }
        }
      }
    } catch (e) {
      console.warn("Envelope notifications failed:", e?.message || e);
    }

    res.status(201).json(saved);
  } catch (error) {
    handleError(res, error, "Failed to create envelope");
  }
});

// POST /envelopes/:id/recipient/:rid/status { status }
app.post(`${API_PREFIX}/envelopes/:id/recipient/:rid/status`, async (req, res) => {
  try {
    const { id, rid } = req.params;
    const { status = "viewed" } = req.body || {};
    const env = await dbGet("envelopes", id);
    if (!env) return res.status(404).json({ error: "Not found" });
    const recips = Array.isArray(env.recipients) ? env.recipients : [];
    const idx = recips.findIndex((r) => String(r.id) === String(rid) || String(r.studentId || r.id) === String(rid));
    if (idx < 0) return res.status(404).json({ error: "Recipient not found" });
    recips[idx] = { ...recips[idx], status, updatedAt: Date.now() };
    const next = { ...env, recipients: recips, updatedAt: Date.now() };
    const saved = await dbUpdate("envelopes", id, next);
    res.json(saved);
  } catch (error) {
    handleError(res, error, "Failed to update recipient status");
  }
});

// POST /envelopes/:id/submit
// Body: { studentId?: string, recipientId?: string, fileName?: string, pdfBase64?: string }
app.post(`${API_PREFIX}/envelopes/:id/submit`, async (req, res) => {
  try {
    const { id } = req.params;
    const { studentId = "", recipientId = "", fileName = "signed-document.pdf", pdfBase64 = "" } = req.body || {};
    const env = await dbGet("envelopes", id);
    if (!env) return res.status(404).json({ success: false, error: "Envelope not found" });
    const recips = Array.isArray(env.recipients) ? env.recipients : [];
    // Locate recipient by explicit id or studentId
    const rid = String(recipientId || studentId || "");
    const idx = recips.findIndex((r) => (rid && (String(r.id) === rid || String(r.studentId || r.id) === rid)) || (!rid && studentId && String(r.studentId || "") === String(studentId)));
    if (idx < 0) return res.status(404).json({ success: false, error: "Recipient not found for this envelope" });

    // Decode base64 (data URL or plain b64)
    let b64 = String(pdfBase64 || "").trim();
    if (!b64) return res.status(400).json({ success: false, error: "pdfBase64 is required" });
    const comma = b64.indexOf(",");
    if (comma >= 0) b64 = b64.slice(comma + 1);
    let buffer;
    try {
      buffer = Buffer.from(b64, "base64");
    } catch {
      return res.status(400).json({ success: false, error: "Invalid base64" });
    }

    // Upload to GCS (if configured) and create a document entry for the student if provided
    let uploaded = { url: undefined, path: undefined };
    let docRec = null;
    try {
      const up = await gcsUploadRaw(buffer, { mime: "application/pdf", name: fileName || "signed-document.pdf", folder: "envelopes" });
      uploaded = up;
      if (studentId) {
        docRec = await dbInsert("documents", {
          kind: "file",
          studentId,
          name: fileName || "signed-document.pdf",
          url: up.url,
          path: up.path,
          at: Date.now(),
          by: env.sentBy || "system",
          size: buffer.length,
          mime: "application/pdf",
        });
      }
    } catch (e) {
      console.warn("Envelope submit upload failed:", e?.message || e);
    }

    // Update envelope recipient status to completed
    const now = Date.now();
    recips[idx] = {
      ...recips[idx],
      status: "completed",
      completedAt: now,
      documentId: docRec?.id,
      url: uploaded.url || recips[idx].url,
    };
    const next = { ...env, recipients: recips, status: "in-progress", updatedAt: now };
    // If all recipients completed, mark envelope completed
    const allDone = recips.every((r) => String(r.status || "").toLowerCase() === "completed");
    if (allDone) next.status = "completed";
    const saved = await dbUpdate("envelopes", id, next);

    // Notify sender (admin) that a recipient completed
    try {
      const sender = env.sentBy;
      const r = recips[idx];
      const notif = {
        id: uid(),
        kind: "envelope",
        title: "Document Completed",
        body: `${r.name || "Recipient"} completed: ${env.subject || "Document"}`,
        at: now,
        read: false,
        to: sender || undefined,
        envelopeId: env.id,
        studentId: r.studentId || undefined,
        docId: docRec?.id,
      };
      if (USE_MONGO) {
        await mongoDb.collection("notifications").insertOne(notif);
      } else {
        const db = await ensureDb();
        db.notifications = Array.isArray(db.notifications) ? db.notifications : [];
        db.notifications.unshift(notif);
        db.notifications = db.notifications.slice(0, 200);
        await writeDb(db);
      }
    } catch {}

    res.json({ success: true, envelope: saved, document: docRec, upload: uploaded });
  } catch (error) {
    handleError(res, error, "Failed to submit envelope");
  }
});

// --- Form Builder Routes ---
// GET /forms with optional filtering
app.get(`${API_PREFIX}/forms`, async (req, res) => {
  try {
    const { status = "", createdBy = "", q = "" } = req.query || {};
    let list = await dbList("forms");
    list = Array.isArray(list) ? list : [];
    
    // Filter by status
    if (status) {
      list = list.filter(form => String(form.status || 'active').toLowerCase() === status.toLowerCase());
    }
    
    // Filter by creator
    if (createdBy) {
      list = list.filter(form => String(form.createdBy || '') === String(createdBy));
    }
    
    // Search filter
    if (q) {
      const needle = String(q).toLowerCase();
      list = list.filter(form => 
        (form.title || '').toLowerCase().includes(needle) ||
        (form.description || '').toLowerCase().includes(needle)
      );
    }
    
    // Sort by updated date, newest first
    list.sort((a, b) => (b.updatedAt || b.createdAt || 0) - (a.updatedAt || a.createdAt || 0));
    res.json(list);
  } catch (error) {
    handleError(res, error, "Failed to fetch forms");
  }
});

// GET /forms/:id/submissions - Get submissions for a specific form
app.get(`${API_PREFIX}/forms/:id/submissions`, async (req, res) => {
  try {
    const { id } = req.params;
    const { limit = "", status = "" } = req.query || {};
    
    let submissions = await dbList("formSubmissions");
    submissions = Array.isArray(submissions) ? submissions : [];
    
    // Filter by form ID
    submissions = submissions.filter(sub => String(sub.formId || '') === String(id));
    
    // Filter by status if provided
    if (status) {
      submissions = submissions.filter(sub => String(sub.status || 'pending').toLowerCase() === status.toLowerCase());
    }
    
    // Sort by submission date, newest first
    submissions.sort((a, b) => (b.submittedAt || b.createdAt || 0) - (a.submittedAt || a.createdAt || 0));
    
    // Apply limit if provided
    const lim = parseInt(limit, 10);
    if (!Number.isNaN(lim) && lim > 0) {
      submissions = submissions.slice(0, lim);
    }
    
    res.json(submissions);
  } catch (error) {
    handleError(res, error, "Failed to fetch form submissions");
  }
});

// POST /forms/:id/submit - Submit a form response
app.post(`${API_PREFIX}/forms/:id/submit`, async (req, res) => {
  try {
    const { id } = req.params;
    const body = req.body || {};
    
    // Verify form exists
    const form = await dbGet("forms", id);
    if (!form) {
      return res.status(404).json({ success: false, error: "Form not found" });
    }
    
    // Validate required fields
    const formFields = Array.isArray(form.fields) ? form.fields : [];
    const submissionData = body.submissionData || {};
    const missingRequired = [];
    
    for (const field of formFields) {
      if (field.required && (!submissionData[field.name] || String(submissionData[field.name]).trim() === '')) {
        missingRequired.push(field.label || field.name);
      }
    }
    
    if (missingRequired.length > 0) {
      return res.status(400).json({ 
        success: false, 
        error: `Required fields missing: ${missingRequired.join(', ')}` 
      });
    }
    
    // Create submission record
    const submission = {
      id: body.id || uid(),
      formId: id,
      formTitle: form.title,
      submissionData,
      submittedAt: Date.now(),
      submittedBy: body.submittedBy || body.userId || 'anonymous',
      status: 'pending',
      ipAddress: req.ip || req.connection?.remoteAddress || 'unknown',
      userAgent: req.get('User-Agent') || 'unknown'
    };
    
    const saved = await dbInsert("formSubmissions", submission);
    
    // Update form submission count
    try {
      const currentForm = await dbGet("forms", id);
      if (currentForm) {
        await dbUpdate("forms", id, { 
          submissions: (currentForm.submissions || 0) + 1,
          lastSubmission: Date.now()
        });
      }
    } catch (e) {
      console.warn("Failed to update form submission count:", e.message);
    }
    
    // Create notification for admins
    try {
      const submitterName = body.submitterName || 
        (submissionData.firstName && submissionData.lastName ? 
          `${submissionData.firstName} ${submissionData.lastName}` : 
          submissionData.name || 'Anonymous User');
          
      const notif = {
        id: uid(),
        kind: "form-submission",
        title: "New Form Submission",
        body: `${submitterName} submitted: ${form.title}`,
        at: Date.now(),
        read: false,
        formId: id,
        submissionId: saved.id,
        submittedBy: submission.submittedBy
      };
      
      if (USE_MONGO) {
        await mongoDb.collection("notifications").insertOne(notif);
      } else {
        const db = await ensureDb();
        db.notifications = Array.isArray(db.notifications) ? db.notifications : [];
        db.notifications.unshift(notif);
        db.notifications = db.notifications.slice(0, 200);
        await writeDb(db);
      }
    } catch (e) {
      console.warn("Form submission notification failed:", e.message);
    }
    
    res.status(201).json({ success: true, submission: saved });
  } catch (error) {
    handleError(res, error, "Failed to submit form");
  }
});

// POST /forms - Create a new form
app.post(`${API_PREFIX}/forms`, async (req, res) => {
  try {
    const body = req.body || {};
    
    // Validate required fields
    if (!body.title || String(body.title).trim() === '') {
      return res.status(400).json({ success: false, error: "Form title is required" });
    }
    
    if (!Array.isArray(body.fields) || body.fields.length === 0) {
      return res.status(400).json({ success: false, error: "Form must have at least one field" });
    }
    
    // Create form record
    const form = {
      id: body.id || uid(),
      title: String(body.title).trim(),
      description: body.description || '',
      fields: body.fields,
      status: body.status || 'active',
      submissions: 0,
      createdBy: body.createdBy || body.userId || 'admin',
      isPublic: body.isPublic || false,
      settings: body.settings || {},
      createdAt: Date.now(),
      updatedAt: Date.now()
    };
    
    const saved = await dbInsert("forms", form);
    res.status(201).json(saved);
  } catch (error) {
    handleError(res, error, "Failed to create form");
  }
});

// PUT /forms/:id - Update a form
app.put(`${API_PREFIX}/forms/:id`, async (req, res) => {
  try {
    const { id } = req.params;
    const body = req.body || {};
    
    // Verify form exists
    const existing = await dbGet("forms", id);
    if (!existing) {
      return res.status(404).json({ success: false, error: "Form not found" });
    }
    
    // Update form
    const updates = {
      ...body,
      updatedAt: Date.now()
    };
    
    // Don't allow changing submission count through this endpoint
    delete updates.submissions;
    
    const saved = await dbUpdate("forms", id, updates);
    res.json(saved);
  } catch (error) {
    handleError(res, error, "Failed to update form");
  }
});

// DELETE /forms/:id - Delete a form and its submissions
app.delete(`${API_PREFIX}/forms/:id`, async (req, res) => {
  try {
    const { id } = req.params;
    
    // Verify form exists
    const form = await dbGet("forms", id);
    if (!form) {
      return res.status(404).json({ success: false, error: "Form not found" });
    }
    
    // Delete associated submissions
    if (USE_MONGO) {
      await mongoDb.collection("formSubmissions").deleteMany({ formId: id });
    } else {
      const db = await ensureDb();
      db.formSubmissions = (db.formSubmissions || []).filter(sub => String(sub.formId) !== String(id));
      await writeDb(db);
    }
    
    // Delete form
    const removed = await dbDelete("forms", id);
    
    res.json({ success: true, removed });
  } catch (error) {
    handleError(res, error, "Failed to delete form");
  }
});

// GET /forms/:id/export - Export form submissions as CSV
app.get(`${API_PREFIX}/forms/:id/export`, async (req, res) => {
  try {
    const { id } = req.params;
    const { format = 'csv' } = req.query || {};
    
    // Verify form exists
    const form = await dbGet("forms", id);
    if (!form) {
      return res.status(404).json({ success: false, error: "Form not found" });
    }
    
    // Get submissions
    let submissions = await dbList("formSubmissions");
    submissions = Array.isArray(submissions) ? submissions : [];
    submissions = submissions.filter(sub => String(sub.formId) === String(id));
    submissions.sort((a, b) => (b.submittedAt || 0) - (a.submittedAt || 0));
    
    if (format.toLowerCase() === 'csv') {
      // Build CSV
      const formFields = Array.isArray(form.fields) ? form.fields : [];
      const headers = [
        'Submission ID',
        'Submitted At', 
        'Submitted By',
        'Status',
        ...formFields.map(f => f.label || f.name)
      ];
      
      const esc = (v) => {
        if (v == null) return "";
        const s = String(v);
        return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
      };
      
      const lines = [headers.map(h => esc(h)).join(',')];
      
      for (const sub of submissions) {
        const data = sub.submissionData || {};
        const row = [
          esc(sub.id),
          esc(new Date(sub.submittedAt || 0).toISOString()),
          esc(sub.submittedBy || ''),
          esc(sub.status || 'pending'),
          ...formFields.map(f => esc(data[f.name] || ''))
        ];
        lines.push(row.join(','));
      }
      
      const filename = `${form.title.replace(/[^a-zA-Z0-9]/g, '_')}_submissions.csv`;
      res.setHeader("Content-Type", "text/csv; charset=utf-8");
      res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
      res.send(lines.join('\n'));
    } else {
      // Return JSON
      res.json({ form, submissions });
    }
  } catch (error) {
    handleError(res, error, "Failed to export form submissions");
  }
});

// --- Messages: privacy-filtered routes (must be before the generic `/:store` routes) ---
function idIn(list, uid) {
  if (!uid) return false;
  const u = String(uid);
  const arr = Array.isArray(list) ? list : (list ? [list] : []);
  for (const it of arr) {
    if (typeof it === "string" && String(it) === u) return true;
    if (it && typeof it === "object") {
      const cand = it.id || it.userId || it._id;
      if (cand && String(cand) === u) return true;
    }
  }
  return false;
}

function computeParticipants(body = {}) {
  const s = new Set();
  const add = (v) => {
    if (!v) return;
    if (Array.isArray(v)) {
      for (const x of v) add(x);
    } else if (typeof v === "object") {
      const cand = v.id || v.userId || v._id;
      if (cand) s.add(String(cand));
    } else {
      const cand = String(v).trim();
      if (cand) s.add(cand);
    }
  };
  add(body.participants);
  add(body.to);
  add(body.cc);
  add(body.threadParticipants);
  add(body.by);
  add(body.ownerId);
  return Array.from(s);
}

function messageVisibleTo(m, userId) {
  const uid = String(userId || "");
  if (!uid) return false;
  if (String(m.by || "") === uid) return true;
  if (String(m.ownerId || "") === uid) return true;
  if (idIn(m.participants, uid)) return true;
  if (idIn(m.to, uid)) return true;
  if (idIn(m.cc, uid)) return true;
  if (idIn(m.threadParticipants, uid)) return true;
  return false;
}

// GET /messages?for=<userId> — only return messages visible to that user
app.get(`${API_PREFIX}/messages`, async (req, res) => {
  try {
    const userId = String(req.query.for || req.query.userId || req.query.uid || "").trim();
    if (!userId) return res.json([]); // do not leak all messages when not scoped
    const list = await dbList("messages");
    const out = (Array.isArray(list) ? list : []).filter((m) => messageVisibleTo(m, userId));
    res.json(out);
  } catch (error) {
    handleError(res, error, "Failed to fetch messages");
  }
});

// GET /notifications?for=<userId> — when provided, only return global or targeted to that user
app.get(`${API_PREFIX}/notifications`, async (req, res) => {
  try {
    const userId = String(req.query.for || req.query.userId || req.query.uid || "").trim();
    const list = await dbList("notifications");
    let out = Array.isArray(list) ? list : [];
    if (userId) {
      out = out.filter((n) => !n.to || String(n.to) === userId);
    }
    out.sort((a, b) => (b.at || 0) - (a.at || 0));
    res.json(out);
  } catch (error) {
    handleError(res, error, "Failed to fetch notifications");
  }
});

// POST /messages — ensure participants are composed correctly
app.post(`${API_PREFIX}/messages`, async (req, res) => {
  try {
    const body = req.body || {};
    const rec = { ...body };
    rec.participants = computeParticipants(rec);

    // If an initial text is provided (e.g., createThread), add it as first message
    if (rec.firstText && !Array.isArray(rec.messages)) {
      rec.messages = [];
    }
    if (rec.firstText) {
      const msg = {
        id: uid(),
        by: rec.by || rec.ownerId || (Array.isArray(rec.participants) ? rec.participants[0] : undefined),
        at: Date.now(),
        text: String(rec.firstText),
      };
      rec.messages.push(msg);
      delete rec.firstText;
    }

    const saved = await dbInsert("messages", rec.id ? rec : { ...rec });

    // Emit @mention notifications for the initial message if present
    try {
      const initialMsg = Array.isArray(saved?.messages) ? saved.messages[0] : null;
      if (initialMsg?.text) {
        const users = await dbList("users");
        const usersArr = Array.isArray(users) ? users : [];
        const findUserById = (uid0) => usersArr.find((u) => String(u.id) === String(uid0));
        const matchTokenToUser = (token) => {
          const t = String(token || "").trim().toLowerCase();
          if (!t) return null;
          for (const u of usersArr) {
            const name = String(u.name || "").trim();
            if (!name) continue;
            const first = name.split(/\s+/)[0].toLowerCase();
            const collapsed = name.replace(/\s+/g, "").toLowerCase();
            if (first.startsWith(t) || collapsed.startsWith(t)) return u;
          }
          return null;
        };
        const tokens = Array.from(String(initialMsg.text).matchAll(/@(\w+)/g)).map((m) => m[1]);
        if (tokens.length) {
          const sender = findUserById(initialMsg.by);
          const senderName = sender?.name || (initialMsg.by ? `User ${initialMsg.by}` : "Someone");
          const preview = String(initialMsg.text).replace(/\s+/g, " ").slice(0, 140);
          const seen = new Set();
          for (const tok of tokens) {
            const target = matchTokenToUser(tok);
            if (!target) continue;
            if (String(target.id) === String(initialMsg.by)) continue;
            const key = String(target.id);
            if (seen.has(key)) continue;
            seen.add(key);

            const notif = {
              id: uid(),
              kind: "mention",
              title: "Mention",
              body: `${senderName} mentioned you: "${preview}"`,
              at: Date.now(),
              read: false,
              action: "open:messages",
              to: target.id,
              threadId: saved.id,
              messageId: initialMsg.id,
            };
            if (USE_MONGO) {
              const notifCol = mongoDb.collection("notifications");
              await notifCol.insertOne(notif);
              const excess = (await notifCol.countDocuments()) - 200;
              if (excess > 0) {
                await notifCol
                  .find({})
                  .sort({ at: 1 })
                  .limit(excess)
                  .forEach(async (d) => await notifCol.deleteOne({ id: d.id }));
              }
            } else {
              const db = await ensureDb();
              db.notifications = Array.isArray(db.notifications) ? db.notifications : [];
              db.notifications.unshift(notif);
              db.notifications = db.notifications.slice(0, 200);
              await writeDb(db);
            }
          }
        }
      }
    } catch (e) {
      console.warn("@mention notification (create) failed:", e?.message || e);
    }

    res.json(saved);
  } catch (error) {
    handleError(res, error, "Failed to create message");
  }
});

// PUT /messages/:id — recompute participants on update
app.put(`${API_PREFIX}/messages/:id`, async (req, res) => {
  try {
    const { id } = req.params;
    const patch = req.body || {};
    const cur = await dbGet("messages", id);
    const merged = { ...(cur || {}), ...patch };
    merged.participants = computeParticipants(merged);

    // Detect newly added messages to process @mentions
    const curMsgs = Array.isArray(cur?.messages) ? cur.messages : [];
    const nextMsgs = Array.isArray(merged?.messages) ? merged.messages : [];
    const curIds = new Set(curMsgs.map((m) => m.id));
    const newMsgs = nextMsgs.filter((m) => m && m.id && !curIds.has(m.id));

    const saved = await dbUpdate("messages", id, merged);

    // After saving, emit notifications for any @mentions in the newly added messages
    try {
      if (newMsgs.length) {
        const users = await dbList("users");
        const usersArr = Array.isArray(users) ? users : [];

        const findUserById = (uid) => usersArr.find((u) => String(u.id) === String(uid));

        // helper to map token -> user by first name or collapsed full name prefix
        const matchTokenToUser = (token) => {
          const t = String(token || "").trim().toLowerCase();
          if (!t) return null;
          let match = null;
          for (const u of usersArr) {
            const name = String(u.name || "").trim();
            if (!name) continue;
            const first = name.split(/\s+/)[0].toLowerCase();
            const collapsed = name.replace(/\s+/g, "").toLowerCase();
            if (first.startsWith(t) || collapsed.startsWith(t)) {
              match = u;
              break; // first hit wins
            }
          }
          return match;
        };

        for (const msg of newMsgs) {
          const text = String(msg?.text || "");
          if (!text) continue;
          const tokens = Array.from(text.matchAll(/@(\w+)/g)).map((m) => m[1]);
          if (!tokens.length) continue;

          const sender = findUserById(msg.by);
          const senderName = sender?.name || (msg.by ? `User ${msg.by}` : "Someone");
          const preview = text.replace(/\s+/g, " ").slice(0, 140);

          const processedTargets = new Set();
          for (const tok of tokens) {
            const target = matchTokenToUser(tok);
            if (!target) continue;
            // avoid notifying the sender about themselves
            if (String(target.id) === String(msg.by)) continue;
            if (processedTargets.has(String(target.id))) continue;
            processedTargets.add(String(target.id));

            const notif = {
              id: uid(),
              kind: "mention",
              title: "Mention",
              body: `${senderName} mentioned you: "${preview}"`,
              at: Date.now(),
              read: false,
              action: "open:messages",
              to: target.id,
              threadId: id,
              messageId: msg.id,
            };

            if (USE_MONGO) {
              const notifCol = mongoDb.collection("notifications");
              await notifCol.insertOne(notif);
              // Cap to last 200 notifications
              const excess = (await notifCol.countDocuments()) - 200;
              if (excess > 0) {
                await notifCol
                  .find({})
                  .sort({ at: 1 })
                  .limit(excess)
                  .forEach(async (d) => await notifCol.deleteOne({ id: d.id }));
              }
            } else {
              const db = await ensureDb();
              db.notifications = Array.isArray(db.notifications) ? db.notifications : [];
              db.notifications.unshift(notif);
              db.notifications = db.notifications.slice(0, 200);
              await writeDb(db);
            }
          }
        }
      }
    } catch (e) {
      console.warn("@mention notification failed:", e?.message || e);
    }

    res.json(saved);
  } catch (error) {
    handleError(res, error, "Failed to update message");
  }
});

// List store
app.get(`${API_PREFIX}/:store`, async (req, res) => {
  try {
    const store = req.params.store;
    // Defensive: prevent unscoped listing of messages via the generic route
    if (store === "messages") {
      const userId = String(req.query.for || req.query.userId || req.query.uid || "").trim();
      if (!userId) return res.status(400).json({ error: "Use /messages?for=<userId> to fetch scoped messages" });
      const list = await dbList("messages");
      const out = (Array.isArray(list) ? list : []).filter((m) => messageVisibleTo(m, userId));
      return res.json(out);
    }
    if (!isValidStore(store)) return res.status(404).json({ error: "Unknown store" });
    if (store === "settings") {
      const s = await dbGetSettings();
      return res.json(s || createDefaultSettings());
    }
    if (store === "users") {
      const users = await dbList("users");
      const safe = (Array.isArray(users) ? users : []).map((u) => sanitizeUser(u));
      return res.json(safe);
    }
    if (store === "notifications") {
      const userId = String(req.query.for || req.query.userId || req.query.uid || "").trim();
      const list = await dbList("notifications");
      let out = Array.isArray(list) ? list : [];
      if (userId) out = out.filter((n) => !n.to || String(n.to) === userId);
      out.sort((a, b) => (b.at || 0) - (a.at || 0));
      return res.json(out);
    }
    const list = await dbList(store);
    return res.json(Array.isArray(list) ? list : []);
  } catch (error) {
    handleError(res, error, "Failed to fetch data");
  }
});

// Get by id
app.get(`${API_PREFIX}/:store/:id`, async (req, res) => {
  try {
    const { store, id } = req.params;
    // Special case: messages are privacy-scoped; only return if requester is a participant
    if (store === "messages") {
      const item = await dbGet("messages", id);
      if (!item) return res.status(404).json({ error: "Not found" });
      const forId = String(req.query.for || req.query.userId || req.query.uid || "").trim();
      if (!forId || !messageVisibleTo(item, forId)) {
        return res.status(403).json({ error: "Forbidden" });
      }
      return res.json(item);
    }
    if (!isValidStore(store)) return res.status(404).json({ error: "Unknown store" });
    if (store === "settings") {
      return res.json(await dbGetSettings());
    }
    if (store === "users") {
      const item = await dbGet("users", id);
      if (!item) return res.status(404).json({ error: "Not found" });
      return res.json(sanitizeUser(item));
    }
    const item = await dbGet(store, id);
    if (!item) return res.status(404).json({ error: "Not found" });
    return res.json(item);
  } catch (error) {
    handleError(res, error, "Failed to fetch item");
  }
});

// Create
app.post(`${API_PREFIX}/:store`, async (req, res) => {
  try {
    const store = req.params.store;
    const body = req.body || {};
    
    if (!isValidStore(store)) return res.status(404).json({ error: "Unknown store" });
    if (store === "settings") {
      const next = await dbUpdate("settings", "settings", body);
      return res.json(next);
    }

    const rec = await dbInsert(store, body.id ? body : { ...body });

    // Auto notification on document upload
    if (store === "documents" && rec.studentId) {
      const students = USE_MONGO ? await dbList("students") : (await ensureDb()).students || [];
      const st = Array.isArray(students) ? students.find((s) => s.id === rec.studentId) : null;
      const studentName = st ? `${st.firstName || ""} ${st.lastName || ""}`.trim() || "Student" : "Student";
      const kind = String(rec.kind || "").toLowerCase();
      let uploader = rec.by || "Admin";
      try {
        const users = await dbList("users");
        const match = Array.isArray(users) ? users.find((u) => u.id === (rec.by || "")) : null;
        if (match?.name) uploader = match.name;
      } catch {}

      let notif = null;
      if (kind === "photo" || kind === "file") {
        const isPhoto = kind === "photo";
        notif = {
          id: uid(),
          kind: isPhoto ? "photo" : "doc",
          title: isPhoto ? "Photo Uploaded" : "Document Uploaded",
          body: `${studentName} — Uploaded by ${uploader}`,
          at: Date.now(),
          read: false,
          link: `/students/${rec.studentId}?tab=${isPhoto ? "photos" : "documents"}`,
          studentId: rec.studentId,
          docId: rec.id,
        };
      }
      if (notif) {
        if (USE_MONGO) {
          const notifCol = mongoDb.collection("notifications");
          await notifCol.insertOne(notif);
          const excess = await notifCol.countDocuments() - 200;
          if (excess > 0) {
            await notifCol
              .find({})
              .sort({ at: 1 })
              .limit(excess)
              .forEach(async (d) => await notifCol.deleteOne({ id: d.id }));
          }
        } else {
          const db = await ensureDb();
          db.notifications = Array.isArray(db.notifications) ? db.notifications : [];
          db.notifications.unshift(notif);
          db.notifications = db.notifications.slice(0, 200);
          await writeDb(db);
        }
      }
    }
    res.json(rec);
  } catch (error) {
    handleError(res, error, "Failed to create item");
  }
});

// Update
app.put(`${API_PREFIX}/:store/:id`, async (req, res) => {
  try {
    const { store, id } = req.params;
    const body = req.body || {};
    
    if (!isValidStore(store)) return res.status(404).json({ error: "Unknown store" });
    if (store === "settings") {
      const next = await dbUpdate("settings", "settings", body);
      return res.json(next);
    }
    const rec = await dbUpdate(store, id, body);
    res.json(rec);
  } catch (error) {
    handleError(res, error, "Failed to update item");
  }
});

// Delete item
app.delete(`${API_PREFIX}/:store/:id`, async (req, res, next) => {
  // Documents handled by explicit route
  if (req.params.store === "documents") return next();
  try {
    const { store, id } = req.params;
    
    if (!isValidStore(store)) return res.status(404).json({ error: "Unknown store" });
    if (store === "settings") return res.status(400).json({ error: "Cannot delete settings" });
    const removed = await dbDelete(store, id);
    res.json({ success: true, removed });
  } catch (error) {
    handleError(res, error, "Failed to delete item");
  }
});

// Notifications helpers
// Create notification explicitly (used by client api.addNotification)
app.post(`${API_PREFIX}/notifications`, async (req, res) => {
  try {
    const body = req.body || {};
    const rec = {
      id: body.id || uid(),
      kind: body.kind || "info",
      title: body.title || "Notification",
      body: body.body || "",
      at: body.at || Date.now(),
      read: !!body.read,
      link: body.link || undefined,
      action: body.action || undefined,
      studentId: body.studentId || undefined,
      docId: body.docId || undefined,
      to: body.to || undefined, // user id for targeted notifications
      threadId: body.threadId || undefined,
      messageId: body.messageId || undefined,
    };

    if (USE_MONGO) {
      await mongoDb.collection("notifications").insertOne(rec);
      // Cap to last 200
      const notifCol = mongoDb.collection("notifications");
      const excess = (await notifCol.countDocuments()) - 200;
      if (excess > 0) {
        await notifCol
          .find({})
          .sort({ at: 1 })
          .limit(excess)
          .forEach(async (d) => await notifCol.deleteOne({ id: d.id }));
      }
    } else {
      const db = await ensureDb();
      db.notifications = Array.isArray(db.notifications) ? db.notifications : [];
      db.notifications.unshift(rec);
      db.notifications = db.notifications.slice(0, 200);
      await writeDb(db);
    }
    res.status(201).json(rec);
  } catch (error) {
    handleError(res, error, "Failed to create notification");
  }
});

app.delete(`${API_PREFIX}/notifications`, async (req, res) => {
  try {
    if (USE_MONGO) {
      await mongoDb.collection("notifications").deleteMany({});
    } else {
      const db = await ensureDb();
      db.notifications = [];
      await writeDb(db);
    }
    res.json({ success: true });
  } catch (error) {
    handleError(res, error, "Failed to clear notifications");
  }
});

app.post(`${API_PREFIX}/notifications/:id/read`, async (req, res) => {
  try {
    const { id } = req.params;
    if (USE_MONGO) {
      const resu = await mongoDb.collection("notifications").updateOne({ id }, { $set: { read: true } });
      if (!resu.matchedCount) return res.status(404).json({ error: "Notification not found" });
    } else {
      const db = await ensureDb();
      const list = Array.isArray(db.notifications) ? db.notifications : [];
      const idx = list.findIndex((n) => n.id === id);
      if (idx < 0) return res.status(404).json({ error: "Notification not found" });
      list[idx] = { ...list[idx], read: true };
      db.notifications = list;
      await writeDb(db);
    }
    res.json({ success: true });
  } catch (error) {
    handleError(res, error, "Failed to mark notification as read");
  }
});

app.post(`${API_PREFIX}/notifications/read-all`, async (req, res) => {
  try {
    if (USE_MONGO) {
      await mongoDb.collection("notifications").updateMany({}, { $set: { read: true } });
    } else {
      const db = await ensureDb();
      db.notifications = (Array.isArray(db.notifications) ? db.notifications : []).map((n) => ({ ...n, read: true }));
      await writeDb(db);
    }
    res.json({ success: true });
  } catch (error) {
    handleError(res, error, "Failed to mark all notifications as read");
  }
});

// Audit endpoint
app.post(`${API_PREFIX}/audit`, async (req, res) => {
  try {
    const body = req.body || {};
    const rec = { id: uid(), at: Date.now(), ...body };
    if (USE_MONGO) {
      const col = mongoDb.collection("audit");
      await col.insertOne(rec);
      // keep last 1000 by trimming oldest
      const count = await col.countDocuments();
      if (count > 1000) {
        const toTrim = count - 1000;
        await col
          .find({})
          .sort({ at: 1 })
          .limit(toTrim)
          .forEach(async (d) => await col.deleteOne({ id: d.id }));
      }
      res.json(rec);
    } else {
      const db = await ensureDb();
      const list = Array.isArray(db.audit) ? db.audit : [];
      list.unshift(rec);
      db.audit = list.slice(0, 1000);
      await writeDb(db);
      res.json(rec);
    }
  } catch (error) {
    handleError(res, error, "Failed to create audit entry");
  }
});

// Export students CSV
app.get(`${API_PREFIX}/export/students`, async (req, res) => {
  try {
    const includePHI = String(req.query.includePHI || "0") === "1";
  const students = USE_MONGO ? await dbList("students") : (await ensureDb()).students || [];
    
    const cols = [
      "id",
      "firstName",
      "lastName",
      "status",
      "phase",
      "recordType",
      "dormId",
      "squad",
      "intakeDate",
      "exitDate",
    ];
    const extra = includePHI ? ["createdAt", "updatedAt", "archived"] : [];
    const headers = [...cols, ...extra];
    
    const esc = (v) => {
      if (v == null) return "";
      const s = String(v);
      return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    
    const lines = [headers.join(",")];
    for (const s of students) {
      const row = headers.map((h) => esc(s[h] ?? ""));
      lines.push(row.join(","));
    }
    
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", "attachment; filename=students.csv");
    res.send(lines.join("\n"));
  } catch (error) {
    handleError(res, error, "Failed to export students");
  }
});

// Import students pack
app.post(`${API_PREFIX}/import/students-pack`, async (req, res) => {
  try {
    const body = req.body || {};
    const replace = body.replace !== false; // default true
    const clearDocuments = body.clearDocuments !== false; // default true
    const payload = body.payload || body.students || [];

    const inList = Array.isArray(payload)
      ? payload
      : Array.isArray(payload.students)
      ? payload.students
      : [];

    if (!Array.isArray(inList)) {
      return res.status(400).json({ success: false, error: "Invalid payload" });
    }

    const now = Date.now();
    const nextStudents = inList.map((s) => ({
      id: s.id || uid(),
      firstName: s.firstName || "",
      lastName: s.lastName || "",
      status: s.status || "Current",
      phase: s.phase ?? "1",
      recordType: s.recordType || (s.status === "Waitlist" ? "Applicant" : "Resident"),
      dormId: s.dormId || s.dorm || "",
      squad: s.squad || "",
      intakeDate: s.intakeDate || s.createdAt || null,
      exitDate: s.exitDate || null,
      archived: !!s.archived,
      createdAt: s.createdAt ?? now,
      updatedAt: now,
    }));

    if (USE_MONGO) {
      const col = mongoDb.collection("students");
      if (replace) await col.deleteMany({});
      if (nextStudents.length) await col.insertMany(nextStudents);
      if (clearDocuments) await mongoDb.collection("documents").deleteMany({});
    } else {
      const db = await ensureDb();
      if (replace) {
        db.students = nextStudents;
      } else {
        db.students = [...(Array.isArray(db.students) ? db.students : []), ...nextStudents];
      }
      if (clearDocuments) db.documents = [];
      await writeDb(db);
    }
    res.json({ success: true, count: nextStudents.length });
  } catch (error) {
    handleError(res, error, "Failed to import students");
  }
});

// --- Socket.IO presence (admins) ---
function wireSockets(io) {
  io.on("connection", (socket) => {
    // Accept userId via auth payload or query string
    const initialUserId =
      (socket.handshake && socket.handshake.auth && socket.handshake.auth.userId) ||
      (socket.handshake && socket.handshake.query && socket.handshake.query.userId) ||
      null;

    async function attach(userId) {
      try {
        if (!userId) return;
        socket.data.userId = String(userId);
        addUserSocket(socket.data.userId, socket.id);

        // Cache role, set online, and send initial admin presence list to this client
        const u = await dbGet("users", socket.data.userId);
        if (u) userRoleById.set(socket.data.userId, String(u.role || "").toLowerCase());
        await setPresenceAndBroadcast(socket.data.userId, "online");

        const admins = await getAdminPresenceList();
        socket.emit("presence:init", { admins });
      } catch {}
    }

    if (initialUserId) attach(initialUserId);

    socket.on("auth", (payload = {}) => {
      const userId = payload && (payload.userId || payload.id);
      if (userId) attach(userId);
    });

    socket.on("presence:set", async (payload = {}) => {
      const userId = socket.data.userId;
      if (!userId) return;
      const next = (payload.presence || payload.status || "online");
      await setPresenceAndBroadcast(userId, next);
    });

    socket.on("presence:ping", async () => {
      const userId = socket.data.userId;
      if (!userId) return;
      // keep them online & refresh lastSeen without extra broadcast noise
      try {
        await dbUpdate("users", userId, { lastSeen: Date.now(), presence: "online" });
      } catch {}
    });

    socket.on("disconnect", async () => {
      const userId = socket.data.userId;
      if (!userId) return;
      const remaining = removeUserSocket(userId, socket.id);
      if (remaining === 0) {
        await setPresenceAndBroadcast(userId, "offline");
      }
    });
  });
}

// Serve static files from React build in production
if (process.env.NODE_ENV === 'production') {
  app.use(express.static(path.join(__dirname, '../client/build')));
  
  // Handle React Router - send all non-API requests to index.html
  app.use((req, res, next) => {
    // Skip API routes
    if (req.path.startsWith(API_PREFIX)) {
      return res.status(404).json({ error: "Not found" });
    }
    // Send all other requests to React app
    res.sendFile(path.join(__dirname, '../client/build', 'index.html'));
  });
} else {
  // 404 for unknown API routes in development
  app.use(API_PREFIX, (req, res) => {
    res.status(404).json({ error: "Not found" });
  });
}

// Global error handler
app.use((err, req, res, next) => {
  console.error('Global error handler:', err);
  res.status(500).json({ 
    error: 'Internal server error',
    details: process.env.NODE_ENV === 'development' ? err.message : undefined
  });
});

// Start server (HTTP + Socket.IO)
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: corsOrigin, credentials: true },
});
ioRef = io;
wireSockets(io);

initGCS();
initMailer();

server.listen(PORT, async () => {
  try {
    const connected = await connectMongo();
    if (connected) {
      await ensureMongoSeed();
      console.log(`DSM API connected to MongoDB db=${MONGODB_DB}`);
    } else {
      try { await ensureDb(); } catch (e) { console.warn("ensureDb failed:", e?.message || e); }
      console.log("DSM API using file database (data.json)");
    }
    initGCS();
    console.log(`DSM API listening on http://localhost:${PORT}${API_PREFIX}`);
    console.log(`Socket.IO ready on ws://localhost:${PORT}/socket.io`);
    console.log(`CORS enabled for: ${corsOrigin === true ? 'all origins' : corsOrigin}`);
  } catch (error) {
    console.error('Failed to initialize database:', error?.message || error);
    // Do not exit; continue serving with empty in-memory DB fallback
  }
});

// Safety: never let unhandled rejections kill the process (log and continue)
process.on('unhandledRejection', (reason) => {
  try {
    const msg = (reason && (reason.message || reason.code)) || String(reason || '');
    if (/ECONNRESET|ECONNREFUSED|MongoNetworkError|client was closed/i.test(msg)) {
      console.warn('[warn] Unhandled rejection (non-fatal):', msg);
      return;
    }
    console.error('[error] Unhandled rejection:', reason);
  } catch {}
});
process.on('uncaughtException', (err) => {
  try {
    const msg = (err && (err.message || err.code)) || String(err || '');
    if (/ECONNRESET|MongoNetworkError|client was closed/i.test(msg)) {
      console.warn('[warn] Uncaught exception (non-fatal):', msg);
      return;
    }
    console.error('[error] Uncaught exception:', err);
  } catch {}
});
