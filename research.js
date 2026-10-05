'use strict';
/**
 * research.js — statistik butir untuk riset psikometri (CTT deskriptif).
 *
 * Per butir (TWK/TIU, dikotomus):
 *   n        = jumlah responden
 *   p        = proporsi benar (tingkat kesukaran; makin besar = makin mudah)
 *   r_pbis   = korelasi point-biserial skor butir (0/1) vs skor total user
 *   opsi     = sebaran pilihan tiap opsi (untuk analisis pengecoh)
 * Untuk TKP (politomus 1-5): mean skor + sebaran opsi (tidak dihitung p/r_pbis).
 *
 * Flag otomatis: p > .90 (terlalu mudah), p < .20 (terlalu sukar),
 * r_pbis < 0 (daya beda negatif — butir bermasalah).
 */

function mean(xs) {
  if (!xs.length) return 0;
  return xs.reduce((a, b) => a + b, 0) / xs.length;
}

function sd(xs, m) {
  if (xs.length < 2) return 0;
  const v = xs.reduce((a, b) => a + (b - m) * (b - m), 0) / (xs.length - 1);
  return Math.sqrt(v);
}

/** Korelasi Pearson. */
function pearson(xs, ys) {
  const n = xs.length;
  if (n < 3) return null;
  const mx = mean(xs), my = mean(ys);
  const sx = sd(xs, mx), sy = sd(ys, my);
  if (sx === 0 || sy === 0) return null;
  let cov = 0;
  for (let i = 0; i < n; i++) cov += (xs[i] - mx) * (ys[i] - my);
  return (cov / (n - 1)) / (sx * sy);
}

/**
 * Hitung statistik untuk satu butir.
 * db: instance better-sqlite3 (atau modul db.js yang sudah open).
 * Mengembalikan objek statistik atau null bila n = 0.
 */
function itemStats(dbOrModule, itemId) {
  const db = dbOrModule.getDb ? dbOrModule.getDb() : dbOrModule;
  const item = db.prepare('SELECT * FROM items WHERE item_id = ?').get(itemId);
  if (!item) return null;

  const rows = db.prepare(`SELECT r.user_id, r.chosen_idx, r.correct, r.score
    FROM responses r WHERE r.item_id = ?`).all(itemId);
  const n = rows.length;
  if (!n) {
    return { item_id: itemId, category: item.category, n: 0, flags: [] };
  }

  // Sebaran opsi
  const options = JSON.parse(item.options);
  const opsi = options.map((_, i) => rows.filter((r) => r.chosen_idx === i).length);

  const flags = [];
  const stat = { item_id: itemId, category: item.category, n, opsi, flags };

  if (item.category === 'TKP') {
    const scores = rows.map((r) => r.score || 0);
    stat.mean_score = round2(mean(scores));
    stat.top_rate = round2(rows.filter((r) => r.score === 5).length / n);
    return stat;
  }

  // Dikotomus: p-value & point-biserial
  const benar = rows.map((r) => (r.correct === 1 ? 1 : 0));
  const p = mean(benar);
  stat.p = round2(p);

  // Skor total tiap user (semua responsnya) untuk korelasi
  const totals = db.prepare(`SELECT user_id, SUM(score) t FROM responses
    WHERE user_id IN (SELECT user_id FROM responses WHERE item_id = ?) GROUP BY user_id`)
    .all(itemId);
  const tmap = new Map(totals.map((t) => [t.user_id, t.t]));
  const xs = [], ys = [];
  for (const r of rows) {
    if (tmap.has(r.user_id)) { xs.push(r.correct === 1 ? 1 : 0); ys.push(tmap.get(r.user_id)); }
  }
  const rpb = pearson(xs, ys);
  stat.r_pbis = rpb == null ? null : round2(rpb);

  if (p > 0.90) flags.push('terlalu-mudah');
  if (p < 0.20) flags.push('terlalu-sukar');
  if (rpb != null && rpb < 0) flags.push('daya-beda-negatif');
  else if (rpb != null && rpb < 0.20) flags.push('daya-beda-rendah');

  return stat;
}

/** Ringkasan semua butir (filter kategori opsional), hanya yang punya respons. */
function allItemStats(dbOrModule, category = null) {
  const db = dbOrModule.getDb ? dbOrModule.getDb() : dbOrModule;
  let sql = 'SELECT item_id FROM items WHERE 1=1';
  const p = [];
  if (category) { sql += ' AND category = ?'; p.push(category.toUpperCase()); }
  const ids = db.prepare(sql).all(...p).map((r) => r.item_id);
  return ids.map((id) => itemStats(db, id)).filter((s) => s && s.n > 0);
}

function round2(x) {
  return Math.round(x * 100) / 100;
}

module.exports = { itemStats, allItemStats, pearson };
