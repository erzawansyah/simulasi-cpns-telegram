'use strict';
/**
 * migrate.js — migrasi sekali jalan: JSON lama (v2) -> SQLite (v3).
 *
 * Sumber  : direktori data v2 (default: ../simulator/data)
 *           - users.json            (opsional; boleh tidak ada)
 *           - twk.json, tiu.json, tkp.json  (30 butir batch pertama, difficulty NULL)
 * Target  : data.db (dibuat baru; BATAL bila file sudah ada & berisi data,
 *           kecuali flag --force)
 *
 * Cara pakai: node migrate.js [--src <dir>] [--force]
 */
const fs = require('fs');
const path = require('path');

const args = process.argv.slice(2);
const SRC = args[args.indexOf('--src') + 1] || path.join(__dirname, '..', 'simulator', 'data');
const FORCE = args.includes('--force');

// DB_PATH harus di-resolve SEBELUM db.js dibaca (db.js memakai process.env.DB_PATH saat open)
const DB_FILE = process.env.DB_PATH || path.join(__dirname, 'data', 'data.db');

function readJsonIfExists(file) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return null;
  }
}

function main() {
  console.log('[migrate] sumber :', SRC);
  console.log('[migrate] target :', DB_FILE);

  if (fs.existsSync(DB_FILE) && !FORCE) {
    // Cek apakah db sudah berisi data
    process.env.DB_PATH = DB_FILE;
    const dbm = require('./db');
    dbm.open(DB_FILE);
    const nItems = dbm.countItems(null, false);
    const nUsers = dbm.getDb().prepare('SELECT COUNT(*) c FROM users').get().c;
    dbm.close();
    if (nItems > 0 || nUsers > 0) {
      console.error(`[migrate] BATAL: ${DB_FILE} sudah berisi data (${nUsers} users, ${nItems} items). Pakai --force untuk timpa.`);
      process.exit(2);
    }
  }
  if (FORCE && fs.existsSync(DB_FILE)) {
    fs.unlinkSync(DB_FILE);
    for (const suffix of ['-wal', '-shm']) {
      try { fs.unlinkSync(DB_FILE + suffix); } catch { /* abaikan */ }
    }
    console.log('[migrate] database lama dihapus (--force)');
  }

  process.env.DB_PATH = DB_FILE;
  const db = require('./db');
  db.open(DB_FILE);

  const report = { users: 0, items: { TWK: 0, TIU: 0, TKP: 0 }, skipped: [] };

  // ---- 1. users.json ----
  const usersRaw = readJsonIfExists(path.join(SRC, 'users.json'));
  if (usersRaw && typeof usersRaw === 'object') {
    const entries = Object.entries(usersRaw);
    for (const [key, u] of entries) {
      const userId = Number(u.id ?? key);
      if (!Number.isFinite(userId)) { report.skipped.push(`user key ${key}`); continue; }
      db.ensureUser(userId, u.username || null, null);
      if (u.registered) db.registerUser(userId, false);
      if (u.stats && u.stats.registeredAt) {
        db.getDb().prepare('UPDATE users SET created_at = ? WHERE user_id = ?')
          .run(u.stats.registeredAt, userId);
      }
      // history v2 (ringkas) tidak bisa dipetakan ke responses per-butir — dicatat sebagai event
      if (Array.isArray(u.history) && u.history.length) {
        db.logEvent('migrasi_history', userId, null, { count: u.history.length, note: 'riwayat v2 agregat, bukan per-butir' });
      }
      report.users++;
    }
    console.log(`[migrate] users: ${report.users} dimigrasi`);
  } else {
    console.log('[migrate] users.json tidak ada — lewati (0 user)');
  }

  // ---- 2. bank soal ----
  const { normalizeItem, validateItem } = require('./import');
  let expectedTotal = 0;
  for (const cat of ['twk', 'tiu', 'tkp']) {
    const file = path.join(SRC, `${cat}.json`);
    const arr = readJsonIfExists(file);
    if (!Array.isArray(arr)) {
      console.error(`[migrate] FATAL: ${file} tidak ditemukan / bukan array`);
      process.exit(1);
    }
    expectedTotal += arr.length;
    for (const raw of arr) {
      const q = normalizeItem(raw);
      const errs = validateItem(q, q.id || '?');
      if (errs.length) {
        console.error(`[migrate] FATAL: butir invalid: ${errs.join('; ')}`);
        process.exit(1);
      }
      db.addItem({
        item_id: q.id || `${cat}-${Date.now().toString(36)}`,
        category: q.category,
        subcategory: null,
        difficulty: null, // batch pertama: difficulty diisi saat QC
        question: q.question,
        options: q.options,
        answer_idx: q.answer_idx,
        scores: q.scores || null,
        explanation: q.explanation || null,
        active: 1,
        version: 1,
        created_by: null,
      });
      report.items[q.category]++;
    }
    console.log(`[migrate] ${cat}.json: ${arr.length} butir OK`);
  }

  // ---- 3. verifikasi ----
  const gotItems = db.countItems(null, false);
  const gotUsers = db.getDb().prepare('SELECT COUNT(*) c FROM users').get().c;
  let ok = true;
  if (gotItems !== expectedTotal) {
    console.error(`[migrate] VERIFIKASI GAGAL: items di db=${gotItems}, ekspektasi=${expectedTotal}`);
    ok = false;
  }
  if (gotUsers !== report.users) {
    console.error(`[migrate] VERIFIKASI GAGAL: users di db=${gotUsers}, ekspektasi=${report.users}`);
    ok = false;
  }
  if (!ok) process.exit(1);

  // ---- 4. arsip sumber (COPY, bukan pindah — direktori v2 tidak diubah) ----
  const archiveDir = path.join(path.dirname(DB_FILE), 'archive');
  fs.mkdirSync(archiveDir, { recursive: true });
  for (const f of ['users.json', 'twk.json', 'tiu.json', 'tkp.json']) {
    const src = path.join(SRC, f);
    if (fs.existsSync(src)) fs.copyFileSync(src, path.join(archiveDir, f));
  }
  console.log(`[migrate] arsip sumber disalin ke ${archiveDir}`);

  db.close();
  console.log(`[migrate] SELESAI & TERVERIFIKASI: ${gotUsers} users, ${gotItems} items ` +
    `(TWK ${report.items.TWK}, TIU ${report.items.TIU}, TKP ${report.items.TKP})`);
}

if (require.main === module) main();
module.exports = { main };
