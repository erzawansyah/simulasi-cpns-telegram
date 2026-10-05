'use strict';
/**
 * db.js — lapisan SQLite (better-sqlite3) untuk Simulasi CPNS 2027.
 *
 * Skema (PRD §4): users, items, sessions, responses, simulation_results,
 * events, subscriptions, submissions. Seluruh state = 1 file data.db.
 * WAL mode aktif; semua query tulis memakai prepared statement.
 */
const path = require('path');
const fs = require('fs');
const Database = require('better-sqlite3');
const { newSessionId } = require('./util');

const DB_PATH = process.env.DB_PATH || path.join(__dirname, 'data', 'data.db');

const SCHEMA = `
PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS users(
  user_id     INTEGER PRIMARY KEY,
  username    TEXT,
  first_name  TEXT,
  registered  INTEGER NOT NULL DEFAULT 0,
  consent_at  INTEGER,
  premium     INTEGER NOT NULL DEFAULT 0,
  meta        TEXT,
  created_at  INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS items(
  item_id     TEXT PRIMARY KEY,
  category    TEXT NOT NULL CHECK(category IN ('TWK','TIU','TKP')),
  subcategory TEXT,
  difficulty  INTEGER CHECK(difficulty IS NULL OR difficulty BETWEEN 1 AND 3),
  question    TEXT NOT NULL,
  options     TEXT NOT NULL,
  answer_idx  INTEGER NOT NULL,
  scores      TEXT,
  explanation TEXT,
  active      INTEGER NOT NULL DEFAULT 1,
  version     INTEGER NOT NULL DEFAULT 1,
  created_by  INTEGER,
  created_at  INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS sessions(
  session_id  TEXT PRIMARY KEY,
  user_id     INTEGER NOT NULL REFERENCES users(user_id),
  kind        TEXT NOT NULL CHECK(kind IN ('latihan','simulasi','simulasi_full','harian')),
  started_at  INTEGER NOT NULL,
  finished_at INTEGER
);

CREATE TABLE IF NOT EXISTS responses(
  response_id      INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id       TEXT REFERENCES sessions(session_id),
  user_id          INTEGER NOT NULL REFERENCES users(user_id),
  item_id          TEXT NOT NULL REFERENCES items(item_id),
  item_version     INTEGER NOT NULL DEFAULT 1,
  chosen_idx       INTEGER,
  correct          INTEGER CHECK(correct IS NULL OR correct IN (0,1)),
  score            INTEGER,
  response_time_ms INTEGER,
  created_at       INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS simulation_results(
  session_id TEXT PRIMARY KEY REFERENCES sessions(session_id) ON DELETE CASCADE,
  twk_score  INTEGER NOT NULL DEFAULT 0,
  tiu_score  INTEGER NOT NULL DEFAULT 0,
  tkp_score  INTEGER NOT NULL DEFAULT 0,
  total      INTEGER NOT NULL DEFAULT 0,
  pass_twk   INTEGER NOT NULL DEFAULT 0,
  pass_tiu   INTEGER NOT NULL DEFAULT 0,
  pass_tkp   INTEGER NOT NULL DEFAULT 0,
  lulus      INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS events(
  event_id   INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id    INTEGER,
  chat_id    INTEGER,
  type       TEXT NOT NULL,
  detail     TEXT,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS subscriptions(
  user_id    INTEGER PRIMARY KEY REFERENCES users(user_id),
  active     INTEGER NOT NULL DEFAULT 1,
  hour       INTEGER NOT NULL DEFAULT 7 CHECK(hour BETWEEN 0 AND 23),
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS submissions(
  submission_id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id       INTEGER NOT NULL REFERENCES users(user_id),
  category      TEXT NOT NULL CHECK(category IN ('TWK','TIU','TKP')),
  subcategory   TEXT,
  difficulty    INTEGER CHECK(difficulty IS NULL OR difficulty BETWEEN 1 AND 3),
  question      TEXT NOT NULL,
  options       TEXT NOT NULL,
  answer_idx    INTEGER NOT NULL,
  scores        TEXT,
  explanation   TEXT,
  status        TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','approved','rejected')),
  reviewer_note TEXT,
  reviewed_by   INTEGER,
  reviewed_at   INTEGER,
  created_at    INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_responses_user_item ON responses(user_id, item_id);
CREATE INDEX IF NOT EXISTS idx_responses_item ON responses(item_id);
CREATE INDEX IF NOT EXISTS idx_responses_user ON responses(user_id);
CREATE INDEX IF NOT EXISTS idx_events_user_time ON events(user_id, created_at);
CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_items_cat_active ON items(category, active);
CREATE INDEX IF NOT EXISTS idx_subs_active_hour ON subscriptions(active, hour);
`;

let db = null;

function open(dbPath = DB_PATH) {
  if (db) return db;
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  db = new Database(dbPath);
  db.exec(SCHEMA);
  // Migrasi ringan untuk DB yang dibuat sebelum kolom premium ada
  const cols = db.prepare('PRAGMA table_info(users)').all().map((c) => c.name);
  if (!cols.includes('premium')) {
    db.exec('ALTER TABLE users ADD COLUMN premium INTEGER NOT NULL DEFAULT 0');
  }
  return db;
}

function close() {
  if (db) { db.close(); db = null; }
}

function getDb() {
  if (!db) throw new Error('db belum dibuka — panggil open() dulu');
  return db;
}

const now = () => Date.now();

/* ---------------- users ---------------- */

function getUser(userId) {
  return getDb().prepare('SELECT * FROM users WHERE user_id = ?').get(userId) || null;
}

/** Pastikan baris user ada (dipanggil tiap update masuk). */
function ensureUser(userId, username = null, firstName = null) {
  const d = getDb();
  let u = getUser(userId);
  if (!u) {
    d.prepare(`INSERT INTO users(user_id, username, first_name, registered, created_at)
               VALUES(?, ?, ?, 0, ?)`).run(userId, username, firstName, now());
    u = getUser(userId);
  } else if ((username && username !== u.username) || (firstName && firstName !== u.first_name)) {
    d.prepare('UPDATE users SET username = COALESCE(?, username), first_name = COALESCE(?, first_name) WHERE user_id = ?')
      .run(username || null, firstName || null, userId);
    u = getUser(userId);
  }
  return u;
}

function registerUser(userId, consent = true) {
  const d = getDb();
  ensureUser(userId);
  d.prepare('UPDATE users SET registered = 1, consent_at = ? WHERE user_id = ?')
    .run(consent ? now() : null, userId);
  return getUser(userId);
}

/** Nonaktifkan akun + hapus data personal; respons riset tetap (anonim). */
function deactivateUser(userId) {
  const d = getDb();
  const tx = d.transaction(() => {
    d.prepare('UPDATE users SET registered = 0, username = NULL, first_name = NULL, meta = NULL WHERE user_id = ?').run(userId);
    d.prepare('UPDATE subscriptions SET active = 0, updated_at = ? WHERE user_id = ?').run(now(), userId);
    d.prepare('UPDATE responses SET session_id = NULL WHERE user_id = ?').run(userId);
    // Hapus sesi latihan/harian; sesi simulasi + hasilnya dipertahankan anonim untuk riset
    d.prepare(`DELETE FROM sessions WHERE user_id = ? AND kind IN ('latihan','harian')`).run(userId);
  });
  tx();
}

function setPremium(userId, val) {
  getDb().prepare('UPDATE users SET premium = ? WHERE user_id = ?').run(val ? 1 : 0, userId);
}

/** Demografis (JSON di users.meta). */
function getMeta(userId) {
  const u = getUser(userId);
  if (!u || !u.meta) return {};
  try { return JSON.parse(u.meta); } catch { return {}; }
}
function setMeta(userId, obj) {
  const cur = getMeta(userId);
  getDb().prepare('UPDATE users SET meta = ? WHERE user_id = ?')
    .run(JSON.stringify({ ...cur, ...obj }), userId);
}

/** Waktu mulai simulasi (/simulasi biasa) terakhir user — untuk batas 1x/minggu. */
function lastSimulasiAt(userId) {
  const r = getDb().prepare(`SELECT MAX(started_at) t FROM sessions
    WHERE user_id = ? AND kind = 'simulasi' AND finished_at IS NOT NULL`).get(userId);
  return r && r.t ? r.t : null;
}

/* ---------------- items ---------------- */

function rowToItem(r) {
  if (!r) return null;
  return { ...r, options: JSON.parse(r.options), scores: r.scores ? JSON.parse(r.scores) : null };
}

function addItem(it) {
  const d = getDb();
  d.prepare(`INSERT INTO items(item_id, category, subcategory, difficulty, question, options,
             answer_idx, scores, explanation, active, version, created_by, created_at)
             VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .run(it.item_id, it.category, it.subcategory || null, it.difficulty || null,
      it.question, JSON.stringify(it.options), it.answer_idx,
      it.scores ? JSON.stringify(it.scores) : null, it.explanation || null,
      it.active == null ? 1 : it.active, it.version || 1, it.created_by || null, now());
  return getItem(it.item_id);
}

function getItem(itemId) {
  return rowToItem(getDb().prepare('SELECT * FROM items WHERE item_id = ?').get(itemId));
}

function countItems(category = null, onlyActive = true) {
  let sql = 'SELECT COUNT(*) c FROM items WHERE 1=1';
  const p = [];
  if (category) { sql += ' AND category = ?'; p.push(category.toUpperCase()); }
  if (onlyActive) { sql += ' AND active = 1'; }
  return getDb().prepare(sql).get(...p).c;
}

/** Butir yang SUDAH dijawab user (untuk aturan anti-ulang). */
function answeredItemIds(userId) {
  return getDb().prepare('SELECT DISTINCT item_id FROM responses WHERE user_id = ?')
    .all(userId).map((r) => r.item_id);
}

/**
 * Ambil n butir acak dengan filter, TIDAK termasuk yang sudah dijawab user.
 * Mengembalikan array (bisa lebih sedikit dari n bila pool habis).
 */
function pickItems({ userId, category = null, difficulty = null, n = 1, onlyActive = true }) {
  const d = getDb();
  let sql = 'SELECT * FROM items WHERE 1=1';
  const p = [];
  if (category) { sql += ' AND category = ?'; p.push(category.toUpperCase()); }
  if (difficulty) { sql += ' AND difficulty = ?'; p.push(difficulty); }
  if (onlyActive) { sql += ' AND active = 1'; }
  if (userId != null) {
    sql += ' AND item_id NOT IN (SELECT item_id FROM responses WHERE user_id = ?)';
    p.push(userId);
  }
  sql += ' ORDER BY RANDOM() LIMIT ?';
  p.push(n);
  return d.prepare(sql).all(...p).map(rowToItem);
}

/**
 * Paket simulasi proporsional SKD: TWK 30% / TIU 35% / TKP 35%, anti-ulang.
 * comp opsional: { TWK, TIU, TKP } jumlah eksplisit (mis. 30/35/45 untuk paket 110).
 */
function paketSimulasi(n, userId, comp = null) {
  const nTwk = comp ? comp.TWK : Math.round(n * 0.30);
  const nTiu = comp ? comp.TIU : Math.round(n * 0.35);
  const nTkp = comp ? comp.TKP : (n - nTwk - nTiu);
  const qs = [
    ...pickItems({ userId, category: 'TWK', n: nTwk }),
    ...pickItems({ userId, category: 'TIU', n: nTiu }),
    ...pickItems({ userId, category: 'TKP', n: nTkp }),
  ];
  for (let i = qs.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [qs[i], qs[j]] = [qs[j], qs[i]];
  }
  return qs;
}

function setItemActive(itemId, active) {
  getDb().prepare('UPDATE items SET active = ? WHERE item_id = ?').run(active ? 1 : 0, itemId);
}

/** Revisi butir: naikkan version (respons lama tetap terikat versi lama). */
function reviseItem(itemId, patch) {
  const d = getDb();
  const cur = getItem(itemId);
  if (!cur) return null;
  const next = { ...cur, ...patch, version: cur.version + 1 };
  d.prepare(`UPDATE items SET question = ?, options = ?, answer_idx = ?, scores = ?,
             explanation = ?, difficulty = ?, subcategory = ?, version = ? WHERE item_id = ?`)
    .run(next.question, JSON.stringify(next.options), next.answer_idx,
      next.scores ? JSON.stringify(next.scores) : null, next.explanation || null,
      next.difficulty || null, next.subcategory || null, next.version, itemId);
  return getItem(itemId);
}

/* ---------------- sessions & responses ---------------- */

function createSession(userId, kind) {
  const id = newSessionId(kind.slice(0, 3));
  getDb().prepare('INSERT INTO sessions(session_id, user_id, kind, started_at) VALUES(?, ?, ?, ?)')
    .run(id, userId, kind, now());
  return id;
}

function finishSession(sessionId) {
  getDb().prepare('UPDATE sessions SET finished_at = ? WHERE session_id = ?').run(now(), sessionId);
}

function recordResponse({ sessionId = null, userId, itemId, itemVersion = 1, chosenIdx = null, correct = null, score = null, responseTimeMs = null }) {
  const r = getDb().prepare(`INSERT INTO responses(session_id, user_id, item_id, item_version,
    chosen_idx, correct, score, response_time_ms, created_at)
    VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .run(sessionId, userId, itemId, itemVersion, chosenIdx, correct, score, responseTimeMs, now());
  return Number(r.lastInsertRowid);
}

/** Skor satu butir: TWK/TIU benar=5 salah=0; TKP = bobot opsi. */
function skorSoal(item, chosenIdx) {
  if (item.category === 'TKP') return (item.scores && item.scores[chosenIdx]) || 0;
  return chosenIdx === item.answer_idx ? 5 : 0;
}

function saveSimulationResult(sessionId, { twk, tiu, tkp, total, passTwk, passTiu, passTkp }) {
  getDb().prepare(`INSERT OR REPLACE INTO simulation_results
    (session_id, twk_score, tiu_score, tkp_score, total, pass_twk, pass_tiu, pass_tkp, lulus, created_at)
    VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .run(sessionId, twk, tiu, tkp, total,
      passTwk ? 1 : 0, passTiu ? 1 : 0, passTkp ? 1 : 0,
      (passTwk && passTiu && passTkp) ? 1 : 0, now());
}

function getSimulationResult(sessionId) {
  return getDb().prepare('SELECT * FROM simulation_results WHERE session_id = ?').get(sessionId) || null;
}

/* ---------------- statistik user (agregasi SQL) ---------------- */

function getUserStats(userId) {
  const d = getDb();
  const lat = d.prepare(`SELECT COUNT(*) n, SUM(CASE WHEN correct = 1 THEN 1 ELSE 0 END) benar
    FROM responses r JOIN sessions s ON s.session_id = r.session_id
    WHERE r.user_id = ? AND s.kind IN ('latihan','harian') AND r.correct IS NOT NULL`).get(userId);
  const tkp = d.prepare(`SELECT COUNT(*) n, COALESCE(SUM(r.score),0) poin
    FROM responses r JOIN sessions s ON s.session_id = r.session_id
    JOIN items i ON i.item_id = r.item_id
    WHERE r.user_id = ? AND s.kind IN ('latihan','harian') AND i.category = 'TKP'`).get(userId);
  const perCat = d.prepare(`SELECT i.category cat, COUNT(*) n,
      SUM(CASE WHEN r.correct = 1 THEN 1 ELSE 0 END) benar, COALESCE(SUM(r.score),0) poin
    FROM responses r JOIN items i ON i.item_id = r.item_id
    WHERE r.user_id = ? GROUP BY i.category`).all(userId);
  const sim = d.prepare(`SELECT COUNT(*) n, COALESCE(AVG(total),0) rata, COALESCE(MAX(total),0) maks
    FROM simulation_results sr JOIN sessions s ON s.session_id = sr.session_id
    WHERE s.user_id = ?`).get(userId);
  const simLulus = d.prepare(`SELECT COUNT(*) n FROM simulation_results sr
    JOIN sessions s ON s.session_id = sr.session_id
    WHERE s.user_id = ? AND sr.lulus = 1`).get(userId);
  const har = d.prepare(`SELECT COUNT(*) n FROM responses r JOIN sessions s ON s.session_id = r.session_id
    WHERE r.user_id = ? AND s.kind = 'harian'`).get(userId);
  return {
    latihan: lat.n || 0, latihanBenar: lat.benar || 0,
    tkpLatihan: tkp.n || 0, tkpPoin: tkp.poin || 0,
    perCat,
    simulasi: sim.n || 0, simulasiRata: sim.rata || 0, simulasiMaks: sim.maks || 0,
    simulasiLulus: simLulus.n || 0,
    harian: har.n || 0,
  };
}

function getHistory(userId, limit = 5) {
  return getDb().prepare(`SELECT s.kind, s.started_at, sr.total, sr.lulus,
      (SELECT COUNT(*) FROM responses r WHERE r.session_id = s.session_id) n_resp
    FROM sessions s LEFT JOIN simulation_results sr ON sr.session_id = s.session_id
    WHERE s.user_id = ? AND s.finished_at IS NOT NULL
    ORDER BY s.started_at DESC LIMIT ?`).all(userId, limit);
}

/* ---------------- leaderboard ---------------- */

function leaderboard(mode = 'semua', limit = 10) {
  let where = '';
  if (mode === 'minggu') where = 'AND sr.created_at >= ?';
  const weekAgo = now() - 7 * 24 * 3600 * 1000;
  const p = mode === 'minggu' ? [weekAgo] : [];
  return getDb().prepare(`SELECT u.first_name, sr.total, sr.lulus, sr.created_at
    FROM simulation_results sr
    JOIN sessions s ON s.session_id = sr.session_id
    JOIN users u ON u.user_id = s.user_id
    WHERE 1=1 ${where}
    ORDER BY sr.total DESC LIMIT ?`).all(...p, limit);
}

/* ---------------- subscriptions ---------------- */

function getSubscription(userId) {
  return getDb().prepare('SELECT * FROM subscriptions WHERE user_id = ?').get(userId) || null;
}

function setSubscription(userId, hour = 7) {
  const d = getDb();
  ensureUser(userId);
  d.prepare(`INSERT INTO subscriptions(user_id, active, hour, created_at, updated_at)
             VALUES(?, 1, ?, ?, ?)
             ON CONFLICT(user_id) DO UPDATE SET active = 1, hour = excluded.hour, updated_at = excluded.updated_at`)
    .run(userId, hour, now(), now());
  return getSubscription(userId);
}

function deactivateSubscription(userId) {
  getDb().prepare('UPDATE subscriptions SET active = 0, updated_at = ? WHERE user_id = ?').run(now(), userId);
}

function activeSubscriptionsForHour(hour) {
  return getDb().prepare(`SELECT s.*, u.first_name FROM subscriptions s
    JOIN users u ON u.user_id = s.user_id
    WHERE s.active = 1 AND s.hour = ?`).all(hour);
}

/* ---------------- submissions ---------------- */

function addSubmission(sub) {
  const r = getDb().prepare(`INSERT INTO submissions(user_id, category, subcategory, difficulty,
    question, options, answer_idx, scores, explanation, status, created_at)
    VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?)`)
    .run(sub.user_id, sub.category, sub.subcategory || null, sub.difficulty || null,
      sub.question, JSON.stringify(sub.options), sub.answer_idx,
      sub.scores ? JSON.stringify(sub.scores) : null, sub.explanation || null, now());
  return Number(r.lastInsertRowid);
}

function getSubmission(id) {
  const r = getDb().prepare('SELECT * FROM submissions WHERE submission_id = ?').get(id);
  if (!r) return null;
  return { ...r, options: JSON.parse(r.options), scores: r.scores ? JSON.parse(r.scores) : null };
}

function listPendingSubmissions(limit = 20) {
  return getDb().prepare(`SELECT * FROM submissions WHERE status = 'pending' ORDER BY created_at ASC LIMIT ?`)
    .all(limit).map((r) => ({ ...r, options: JSON.parse(r.options), scores: r.scores ? JSON.parse(r.scores) : null }));
}

function countPendingSubmissions() {
  return getDb().prepare(`SELECT COUNT(*) c FROM submissions WHERE status = 'pending'`).get().c;
}

/** Setujui → pindah ke items; Tolak → status rejected + catatan. */
function reviewSubmission(id, approve, reviewerNote, reviewedBy) {
  const d = getDb();
  const sub = getSubmission(id);
  if (!sub || sub.status !== 'pending') return null;
  const tx = d.transaction(() => {
    d.prepare(`UPDATE submissions SET status = ?, reviewer_note = ?, reviewed_by = ?, reviewed_at = ?
               WHERE submission_id = ?`)
      .run(approve ? 'approved' : 'rejected', reviewerNote || null, reviewedBy, now(), id);
    if (approve) {
      const { newItemId } = require('./util');
      const itemId = newItemId(sub.category);
      d.prepare(`INSERT INTO items(item_id, category, subcategory, difficulty, question, options,
                 answer_idx, scores, explanation, active, version, created_by, created_at)
                 VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, 1, 1, ?, ?)`)
        .run(itemId, sub.category, sub.subcategory, sub.difficulty, sub.question,
          JSON.stringify(sub.options), sub.answer_idx,
          sub.scores ? JSON.stringify(sub.scores) : null, sub.explanation,
          sub.user_id, now());
      return itemId;
    }
    return null;
  });
  return tx();
}

/* ---------------- events ---------------- */

function logEvent(type, userId = null, chatId = null, detail = null) {
  try {
    getDb().prepare('INSERT INTO events(user_id, chat_id, type, detail, created_at) VALUES(?, ?, ?, ?, ?)')
      .run(userId, chatId, type, detail ? JSON.stringify(detail) : null, now());
  } catch (e) {
    console.error('[db] gagal catat event:', e.message);
  }
}

/** Statistik global untuk /stats (admin). */
function getGlobalStats() {
  const d = getDb();
  const now = Date.now(), day = 864e5;
  const q = (sql, ...p) => d.prepare(sql).get(...p);
  const totalUsers = q('SELECT COUNT(*) c FROM users').c;
  const registered = q('SELECT COUNT(*) c FROM users WHERE registered = 1').c;
  const active7d = q('SELECT COUNT(DISTINCT user_id) c FROM events WHERE created_at > ?', now - 7 * day).c;
  const active30d = q('SELECT COUNT(DISTINCT user_id) c FROM events WHERE created_at > ?', now - 30 * day).c;
  // net blocked = terakhir 'blocked' tanpa 'unblocked' sesudahnya
  const blocked = q(`SELECT COUNT(*) c FROM (
    SELECT user_id,
      MAX(CASE WHEN type = 'blocked' THEN created_at ELSE 0 END) AS b,
      MAX(CASE WHEN type = 'unblocked' THEN created_at ELSE 0 END) AS u
    FROM events WHERE type IN ('blocked', 'unblocked') GROUP BY user_id
  ) WHERE b > u`).c;
  const subscribers = q('SELECT COUNT(*) c FROM subscriptions WHERE active = 1').c;
  const responsesTotal = q('SELECT COUNT(*) c FROM responses').c;
  const responsesToday = q('SELECT COUNT(*) c FROM responses WHERE created_at > ?', now - day).c;
  const itemsActive = q('SELECT COUNT(*) c FROM items WHERE active = 1').c;
  const itemsTwk = q("SELECT COUNT(*) c FROM items WHERE active = 1 AND category = 'TWK'").c;
  const itemsTiu = q("SELECT COUNT(*) c FROM items WHERE active = 1 AND category = 'TIU'").c;
  const itemsTkp = q("SELECT COUNT(*) c FROM items WHERE active = 1 AND category = 'TKP'").c;
  const simTotal = q("SELECT COUNT(*) c FROM sessions WHERE kind IN ('simulasi', 'simulasi_full') AND finished_at IS NOT NULL").c;
  const simWeek = q("SELECT COUNT(*) c FROM sessions WHERE kind IN ('simulasi', 'simulasi_full') AND finished_at IS NOT NULL AND started_at > ?", now - 7 * day).c;
  const pending = countPendingSubmissions();
  return { totalUsers, registered, active7d, active30d, blocked, subscribers,
    responsesTotal, responsesToday, itemsActive, itemsTwk, itemsTiu, itemsTkp,
    simTotal, simWeek, pending };
}

module.exports = {
  open, close, getDb, DB_PATH,
  getUser, ensureUser, registerUser, deactivateUser,
  setPremium, getMeta, setMeta, lastSimulasiAt,
  addItem, getItem, countItems, answeredItemIds, pickItems, paketSimulasi,
  setItemActive, reviseItem, skorSoal,
  createSession, finishSession, recordResponse,
  saveSimulationResult, getSimulationResult,
  getUserStats, getHistory, leaderboard,
  getSubscription, setSubscription, deactivateSubscription, activeSubscriptionsForHour,
  addSubmission, getSubmission, listPendingSubmissions, countPendingSubmissions, reviewSubmission,
  logEvent, getGlobalStats,
};
