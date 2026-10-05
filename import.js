'use strict';
/**
 * import.js — validator & parser bank soal untuk /impor (admin) dan tooling CLI.
 *
 * Batas bank soal (lebih longgar dari batas quiz Telegram):
 *   question <= 1000 char, tiap opsi <= 300 char, explanation <= 500 char.
 * Saat penyajian, butir yang melebihi batas native quiz Telegram
 * (soal 300 / opsi 100 / penjelasan 200 char) otomatis memakai
 * fallback teks + inline button (lihat polls.js).
 */

const CATS = ['TWK', 'TIU', 'TKP'];
const LEVELS = { mudah: 1, sedang: 2, sukar: 3, '1': 1, '2': 2, '3': 3 };

// Batas bank soal
const LIM_QUESTION = 1000, LIM_OPTION = 300, LIM_EXPLANATION = 500;
// Batas native quiz Telegram — di atas ini pakai fallback teks + tombol
const QUIZ_QUESTION = 300, QUIZ_OPTION = 100, QUIZ_EXPLANATION = 200;

function normText(s) {
  return String(s || '').replace(/\s+/g, ' ').trim().toLowerCase();
}

/** Validasi satu butir. Mengembalikan array error (kosong = valid). */
function validateItem(q, label = '?') {
  const errs = [];
  const cat = String(q.category || '').toUpperCase();
  if (!CATS.includes(cat)) errs.push(`[${label}] category harus TWK/TIU/TKP`);
  if (!q.question || normText(q.question).length === 0) errs.push(`[${label}] question kosong`);
  else if (q.question.length > LIM_QUESTION) errs.push(`[${label}] question >${LIM_QUESTION} char`);
  if (!Array.isArray(q.options) || q.options.length < 4 || q.options.length > 5) {
    errs.push(`[${label}] options harus array 4-5 buah`);
  } else {
    q.options.forEach((o, i) => {
      if (!String(o || '').trim()) errs.push(`[${label}] opsi ${i + 1} kosong`);
      else if (String(o).length > LIM_OPTION) errs.push(`[${label}] opsi ${i + 1} >${LIM_OPTION} char`);
    });
  }
  const nOpt = Array.isArray(q.options) ? q.options.length : 0;
  if (!Number.isInteger(q.answer_idx) || q.answer_idx < 0 || q.answer_idx >= nOpt) {
    errs.push(`[${label}] answer_idx harus 0..${nOpt - 1}`);
  }
  if (q.explanation && String(q.explanation).length > LIM_EXPLANATION) errs.push(`[${label}] explanation >${LIM_EXPLANATION} char`);
  if (q.difficulty != null && ![1, 2, 3].includes(Number(q.difficulty))) {
    errs.push(`[${label}] difficulty harus 1/2/3`);
  }
  if (cat === 'TKP') {
    if (!Array.isArray(q.scores) || q.scores.length !== nOpt) {
      errs.push(`[${label}] TKP wajib punya scores (bobot 1-5) sejumlah opsi`);
    } else if (!q.scores.every((s) => Number.isInteger(s) && s >= 1 && s <= 5)) {
      errs.push(`[${label}] scores TKP harus bilangan 1-5`);
    }
  }
  return errs;
}

/** Normalisasi butir mentah -> bentuk kanonis. */
function normalizeItem(raw) {
  const q = { ...raw };
  q.category = String(q.category || '').toUpperCase();
  if (typeof q.answer === 'number' && q.answer_idx == null) q.answer_idx = q.answer; // alias format lama
  if (q.difficulty != null) {
    const lv = LEVELS[String(q.difficulty).toLowerCase()];
    q.difficulty = lv || null;
  }
  if (typeof q.options === 'string') {
    try { q.options = JSON.parse(q.options); } catch { /* biar validator yang protes */ }
  }
  if (typeof q.scores === 'string') {
    const s = q.scores.trim();
    try { q.scores = JSON.parse(s); }
    catch { q.scores = s.split(/[;|,]/).map((x) => Number(x.trim())); }
  }
  return q;
}

/**
 * Parse JSON: array butir, atau {items:[...]}.
 */
function parseJSON(text) {
  let data;
  try { data = JSON.parse(text); }
  catch (e) { return { ok: false, error: 'JSON tidak valid: ' + e.message }; }
  const arr = Array.isArray(data) ? data : data.items;
  if (!Array.isArray(arr)) return { ok: false, error: 'JSON harus array butir atau {items:[...]}' };
  return { ok: true, raw: arr };
}

/** Parser CSV minimal (mendukung quoted field dengan "" escape). */
function parseCSVLine(line) {
  const out = [];
  let cur = '', inQ = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (inQ) {
      if (c === '"') {
        if (line[i + 1] === '"') { cur += '"'; i++; }
        else inQ = false;
      } else cur += c;
    } else if (c === '"') inQ = true;
    else if (c === ',') { out.push(cur); cur = ''; }
    else cur += c;
  }
  out.push(cur);
  return out.map((s) => s.trim());
}

/**
 * Parse CSV dengan header:
 * category,subcategory,difficulty,question,option_a,option_b,option_c,option_d,option_e,answer_idx,scores,explanation
 * scores: "1;2;3;4;5" (khusus TKP)
 */
function parseCSV(text) {
  const lines = text.split(/\r?\n/).filter((l) => l.trim().length);
  if (lines.length < 2) return { ok: false, error: 'CSV kosong / tanpa baris data' };
  const header = parseCSVLine(lines[0]).map((h) => h.toLowerCase());
  const need = ['category', 'question', 'option_a', 'option_b', 'option_c', 'option_d'];
  for (const n of need) {
    if (!header.includes(n)) return { ok: false, error: `Kolom wajib "${n}" tidak ada di header` };
  }
  const idx = (name) => header.indexOf(name);
  const raw = [];
  for (let i = 1; i < lines.length; i++) {
    const c = parseCSVLine(lines[i]);
    const get = (n) => (idx(n) >= 0 ? (c[idx(n)] || '') : '');
    const options = [get('option_a'), get('option_b'), get('option_c'), get('option_d')];
    if (get('option_e')) options.push(get('option_e'));
    raw.push({
      category: get('category'),
      subcategory: get('subcategory') || null,
      difficulty: get('difficulty') || null,
      question: get('question'),
      options,
      answer_idx: get('answer_idx') === '' ? null : Number(get('answer_idx')),
      scores: get('scores') || null,
      explanation: get('explanation') || null,
    });
  }
  return { ok: true, raw };
}

/**
 * Validasi batch: format + duplikasi (antar-file dan vs bank existing).
 * getExistingQuestions: () => array string pertanyaan yang sudah ada (opsional).
 */
function validateBatch(rawItems, getExistingQuestions = null) {
  const items = rawItems.map(normalizeItem);
  const errors = [];
  const seen = new Set();
  const existing = new Set((getExistingQuestions ? getExistingQuestions() : []).map(normText));
  items.forEach((q, i) => {
    const label = `butir ${i + 1}`;
    errors.push(...validateItem(q, label));
    const nq = normText(q.question);
    if (nq) {
      if (seen.has(nq)) errors.push(`[${label}] duplikat dalam file`);
      if (existing.has(nq)) errors.push(`[${label}] duplikat dengan bank soal yang ada`);
      seen.add(nq);
    }
  });
  return { ok: errors.length === 0, items, errors };
}

module.exports = {
  validateItem, normalizeItem, parseJSON, parseCSV, parseCSVLine, validateBatch, CATS,
  LIM_QUESTION, LIM_OPTION, LIM_EXPLANATION, QUIZ_QUESTION, QUIZ_OPTION, QUIZ_EXPLANATION,
};
