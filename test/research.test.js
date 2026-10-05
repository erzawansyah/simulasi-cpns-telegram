'use strict';
/**
 * test/research.test.js — statistik butir: n, p-value, point-biserial, flag.
 */
const test = require('node:test');
const assert = require('node:assert/strict');

process.env.DB_PATH = ':memory:';
const db = require('../db');
const research = require('../research');

db.open();

function mkItem(id, cat, scores = null) {
  db.addItem({
    item_id: id, category: cat, question: `Q ${id}`,
    options: ['a', 'b', 'c', 'd'], answer_idx: 0,
    scores, explanation: '', active: 1, version: 1,
  });
}

// 4 user: skor total 40, 35 (tinggi) vs 10, 5 (rendah)
function seedTotals() {
  const totals = { 11: 40, 12: 35, 13: 10, 14: 5 };
  for (const [uid, t] of Object.entries(totals)) {
    db.ensureUser(Number(uid));
    const sid = db.createSession(Number(uid), 'latihan');
    // butir dummy untuk membangun skor total
    db.recordResponse({ sessionId: sid, userId: Number(uid), itemId: 'dum', chosenIdx: 0, correct: 1, score: t });
  }
}

test('setup: item dummy total', () => {
  mkItem('dum', 'TWK');
  seedTotals();
  assert.ok(true);
});

test('p-value & daya beda positif', () => {
  mkItem('good', 'TWK');
  // user skor tinggi benar, skor rendah salah
  const ans = { 11: 1, 12: 1, 13: 0, 14: 0 };
  for (const [uid, c] of Object.entries(ans)) {
    const sid = db.createSession(Number(uid), 'latihan');
    db.recordResponse({ sessionId: sid, userId: Number(uid), itemId: 'good', chosenIdx: c ? 0 : 1, correct: c, score: c ? 5 : 0 });
  }
  const s = research.itemStats(db, 'good');
  assert.equal(s.n, 4);
  assert.equal(s.p, 0.5);
  assert.ok(s.r_pbis > 0.9, `r_pbis=${s.r_pbis} harus positif kuat`);
  assert.deepEqual(s.flags, []);
  assert.deepEqual(s.opsi, [2, 2, 0, 0]);
});

test('flag terlalu-mudah (p > .90)', () => {
  mkItem('easy', 'TWK');
  for (const uid of [11, 12, 13, 14, 15, 16, 17, 18, 19, 20]) {
    db.ensureUser(uid);
    const sid = db.createSession(uid, 'latihan');
    db.recordResponse({ sessionId: sid, userId: uid, itemId: 'easy', chosenIdx: 0, correct: 1, score: 5 });
  }
  const s = research.itemStats(db, 'easy');
  assert.equal(s.p, 1);
  assert.ok(s.flags.includes('terlalu-mudah'));
});

test('flag daya-beda-negatif', () => {
  mkItem('bad', 'TWK');
  // kebalik: user skor rendah benar, skor tinggi salah
  const ans = { 11: 0, 12: 0, 13: 1, 14: 1 };
  for (const [uid, c] of Object.entries(ans)) {
    const sid = db.createSession(Number(uid), 'latihan');
    db.recordResponse({ sessionId: sid, userId: Number(uid), itemId: 'bad', chosenIdx: c ? 0 : 1, correct: c, score: c ? 5 : 0 });
  }
  const s = research.itemStats(db, 'bad');
  assert.ok(s.r_pbis < 0, `r_pbis=${s.r_pbis} harus negatif`);
  assert.ok(s.flags.includes('daya-beda-negatif'));
});

test('TKP: mean skor, tanpa p/r_pbis', () => {
  mkItem('tkp1', 'TKP', [1, 2, 5, 3]);
  const scores = [5, 4, 3, 5];
  [11, 12, 13, 14].forEach((uid, i) => {
    const sid = db.createSession(uid, 'latihan');
    db.recordResponse({ sessionId: sid, userId: uid, itemId: 'tkp1', chosenIdx: i, correct: null, score: scores[i] });
  });
  const s = research.itemStats(db, 'tkp1');
  assert.equal(s.n, 4);
  assert.equal(s.mean_score, 4.25);
  assert.equal(s.p, undefined);
  assert.equal(s.r_pbis, undefined);
});

test('item tanpa respons -> n=0', () => {
  mkItem('fresh', 'TIU');
  const s = research.itemStats(db, 'fresh');
  assert.equal(s.n, 0);
});

test('pearson: korelasi sempurna', () => {
  assert.ok(Math.abs(research.pearson([1, 2, 3, 4], [2, 4, 6, 8]) - 1) < 1e-9);
  assert.equal(research.pearson([1, 1, 1], [2, 4, 6]), null); // varians nol
});
