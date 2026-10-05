'use strict';
/**
 * ganti-bank-soal.js — Hapus bank soal lama + respons/sesi terkait,
 * lalu impor bank soal baru dari JSON. Dipakai dengan argumen path JSON.
 *
 * Penggunaan: DB_PATH=/path/ke/data.db node ganti-bank-soal.js impor-110-final.json
 */
const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');

const DB_PATH = process.env.DB_PATH || path.join(__dirname, 'data', 'data.db');
const JSON_PATH = process.argv[2];
if (!JSON_PATH) { console.error('butuh argumen path JSON'); process.exit(1); }

const { validateBatch } = require('./import');
const raw = JSON.parse(fs.readFileSync(JSON_PATH, 'utf8'));
const { ok, items, errors } = validateBatch(raw);
if (!ok) { console.error('VALIDASI GAGAL:'); errors.forEach((e) => console.error(' -', e)); process.exit(1); }

const db = new Database(DB_PATH);
const before = {
  items: db.prepare('SELECT COUNT(*) c FROM items').get().c,
  responses: db.prepare('SELECT COUNT(*) c FROM responses').get().c,
  sessions: db.prepare('SELECT COUNT(*) c FROM sessions').get().c,
};
console.log('sebelum:', JSON.stringify(before));

const swap = db.transaction(() => {
  db.prepare('DELETE FROM responses').run();
  db.prepare('DELETE FROM sessions').run();
  db.prepare('DELETE FROM items').run();
  const ins = db.prepare(`INSERT INTO items(item_id, category, subcategory, difficulty, question, options,
    answer_idx, scores, explanation, active, version, created_by, created_at)
    VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, 1, 1, ?, ?)`);
  const now = Date.now();
  for (const it of items) {
    ins.run(it.item_id, it.category, it.subcategory || null, it.difficulty || null,
      it.question, JSON.stringify(it.options), it.answer_idx,
      it.scores ? JSON.stringify(it.scores) : null, it.explanation || null,
      'import-110', now);
  }
});
swap();

const after = {
  items: db.prepare('SELECT COUNT(*) c FROM items').get().c,
  responses: db.prepare('SELECT COUNT(*) c FROM responses').get().c,
  sessions: db.prepare('SELECT COUNT(*) c FROM sessions').get().c,
};
const perCat = db.prepare('SELECT category, COUNT(*) c FROM items GROUP BY category').all();
console.log('sesudah:', JSON.stringify(after));
console.log('komposisi:', perCat.map((r) => `${r.category}:${r.c}`).join(' '));
db.close();
console.log('SELESAI');
