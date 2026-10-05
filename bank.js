'use strict';
/**
 * bank.js — loader & validator bank soal dari data/*.json
 * Skema per soal:
 *   { id, category: TWK|TIU|TKP, question, options[4..5], answer (index 0-based),
 *     explanation (<=200 char utk quiz Telegram), scores? (utk TKP: bobot 1..5 per opsi) }
 */
const fs = require('fs');
const path = require('path');

const DIR = path.join(__dirname, 'data');
const CATS = ['twk', 'tiu', 'tkp'];

function validate(q, file) {
  const errs = [];
  if (!q.id) errs.push('id kosong');
  if (!['TWK', 'TIU', 'TKP'].includes(q.category)) errs.push(`category invalid: ${q.category}`);
  if (!q.question || q.question.length > 300) errs.push('question kosong/>300 char');
  if (!Array.isArray(q.options) || q.options.length < 4 || q.options.length > 5) errs.push('options harus 4-5');
  if (!Number.isInteger(q.answer) || q.answer < 0 || q.answer >= q.options.length) errs.push('answer index invalid');
  if (q.explanation && q.explanation.length > 200) errs.push('explanation >200 char');
  if (q.category === 'TKP') {
    if (!Array.isArray(q.scores) || q.scores.length !== q.options.length) errs.push('TKP wajib punya scores per opsi');
  }
  if (errs.length) throw new Error(`[${file}] soal ${q.id || '?'}: ${errs.join('; ')}`);
}

const bank = {};
function load() {
  for (const c of CATS) {
    const file = path.join(DIR, `${c}.json`);
    const arr = JSON.parse(fs.readFileSync(file, 'utf8'));
    arr.forEach((q) => validate(q, `${c}.json`));
    bank[c] = arr;
  }
}
load();
/** Muat ulang bank dari disk (dipakai setelah /tambah) */
function reload() { load(); }

function all() { return [...bank.twk, ...bank.tiu, ...bank.tkp]; }
function byCat(cat) { return bank[cat.toLowerCase()] || []; }
function pick(cat, n, exclude = []) {
  const pool = byCat(cat).filter((q) => !exclude.includes(q.id));
  const out = [];
  const copy = [...pool];
  while (out.length < n && copy.length) {
    out.push(copy.splice(Math.floor(Math.random() * copy.length), 1)[0]);
  }
  return out;
}
/** Paket simulasi proporsional ala SKD: TWK 30%, TIU 35%, TKP 35% (dibulatkan) */
function paket(n) {
  const nTwk = Math.round(n * 0.3), nTkp = Math.round(n * 0.35), nTiu = n - nTwk - nTkp;
  const qs = [...pick('twk', nTwk), ...pick('tiu', nTiu), ...pick('tkp', nTkp)];
  // acak urutan akhir
  for (let i = qs.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [qs[i], qs[j]] = [qs[j], qs[i]];
  }
  return qs;
}
/** Skor SKD: TWK/TIU benar=5 salah=0; TKP = bobot opsi yg dipilih (1..5) */
function skorSoal(q, chosenIdx) {
  if (q.category === 'TKP') return q.scores[chosenIdx] || 0;
  return chosenIdx === q.answer ? 5 : 0;
}

module.exports = { all, byCat, pick, paket, skorSoal, reload, counts: () => ({ twk: bank.twk.length, tiu: bank.tiu.length, tkp: bank.tkp.length }) };
