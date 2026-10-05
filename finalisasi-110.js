'use strict';
/**
 * finalisasi-110.js — Terapkan bobot TKP (draf 4-3-2-1 berdasar kualitas
 * opsi; KUNCI dari dokumen = 4) ke impor-110-soal.json, validasi penuh,
 * tulis impor-110-final.json siap /impor.
 *
 * CATATAN: bobot TKP selain opsi terbaik adalah draf Sodik — perlu review
 * Erza sebelum dipakai untuk penilaian resmi.
 */
const fs = require('fs');
const path = require('path');
const { validateBatch } = require('./import');

// scores dalam urutan opsi [A, B, C, D]; kunci (5) sesuai dokumen.
const TKP_SCORES = {
  'skd110-066': [1, 3, 4, 2],
  'skd110-067': [4, 2, 3, 1],
  'skd110-068': [1, 4, 2, 3],
  'skd110-069': [2, 3, 1, 4],
  'skd110-070': [3, 1, 4, 2],
  'skd110-071': [4, 2, 3, 1],
  'skd110-072': [2, 4, 3, 1],
  'skd110-073': [3, 2, 1, 4],
  'skd110-074': [4, 3, 1, 2],
  'skd110-075': [3, 1, 4, 2],
  'skd110-076': [2, 4, 1, 3],
  'skd110-077': [1, 3, 2, 4],
  'skd110-078': [4, 2, 1, 3],
  'skd110-079': [3, 1, 4, 2],
  'skd110-080': [1, 4, 3, 2],
  'skd110-081': [3, 2, 1, 4],
  'skd110-082': [4, 2, 1, 3],
  'skd110-083': [2, 3, 4, 1],
  'skd110-084': [2, 4, 3, 1],
  'skd110-085': [3, 1, 2, 4],
  'skd110-086': [4, 2, 3, 1],
  'skd110-087': [2, 1, 4, 3],
  'skd110-088': [2, 4, 3, 1],
  'skd110-089': [1, 3, 2, 4],
  'skd110-090': [4, 1, 2, 3],
  'skd110-091': [3, 1, 4, 2],
  'skd110-092': [3, 4, 2, 1],
  'skd110-093': [4, 1, 2, 3],
  'skd110-094': [2, 1, 3, 4],
  'skd110-095': [3, 4, 2, 1],
  'skd110-096': [1, 3, 4, 2],
  'skd110-097': [4, 3, 2, 1],
  'skd110-098': [3, 1, 2, 4],
  'skd110-099': [1, 4, 3, 2],
  'skd110-100': [3, 1, 4, 2],
  'skd110-101': [4, 3, 1, 2],
  'skd110-102': [2, 1, 3, 4],
  'skd110-103': [1, 4, 3, 2],
  'skd110-104': [2, 3, 4, 1],
  'skd110-105': [4, 2, 3, 1],
  'skd110-106': [3, 1, 2, 4],
  'skd110-107': [2, 4, 3, 1],
  'skd110-108': [1, 3, 4, 2],
  'skd110-109': [4, 3, 2, 1],
  'skd110-110': [2, 3, 1, 4],
};

const raw = JSON.parse(fs.readFileSync(path.join(__dirname, 'impor-110-soal.json'), 'utf8'));
const masalah = [];
for (const it of raw) {
  if (it.category !== 'TKP') { delete it.scores; continue; }
  const s = TKP_SCORES[it.item_id];
  if (!s) { masalah.push(`${it.item_id}: belum ada bobot`); continue; }
  if (s[it.answer_idx] !== 4) masalah.push(`${it.item_id}: bobot kunci bukan 4!`);
  if (!s.every((x) => Number.isInteger(x) && x >= 1 && x <= 5)) masalah.push(`${it.item_id}: bobot di luar 1-5`);
  it.scores = s;
}

const { ok, items, errors } = validateBatch(raw);
console.log('validasi batch:', ok ? 'OK' : 'GAGAL', '| item:', items.length);
errors.forEach((e) => console.log(' -', e));
if (masalah.length) { console.log('MASALAH BOBOT:'); masalah.forEach((x) => console.log(' -', x)); }

if (ok && !masalah.length) {
  const out = path.join(__dirname, 'impor-110-final.json');
  fs.writeFileSync(out, JSON.stringify(items, null, 2));
  console.log('final ditulis:', out);
  const per = {};
  items.forEach((i) => { per[i.category] = (per[i.category] || 0) + 1; });
  console.log('komposisi:', JSON.stringify(per));
} else {
  process.exitCode = 1;
}
