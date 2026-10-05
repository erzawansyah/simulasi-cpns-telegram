'use strict';
/**
 * test/quiz.test.js — sesi simulasi, penilaian, passing grade.
 */
const test = require('node:test');
const assert = require('node:assert/strict');

const quiz = require('../quiz');

function fakeItem(id, cat, answer = 1, scores = null) {
  return {
    item_id: id, category: cat, version: 1,
    options: ['a', 'b', 'c', 'd'], answer_idx: answer,
    scores: cat === 'TKP' ? (scores || [1, 2, 5, 3]) : null,
  };
}
const skorFn = (item, chosen) => (item.category === 'TKP' ? item.scores[chosen] : (chosen === item.answer_idx ? 5 : 0));

test('rekap: skor benar & passing grade default 65/80/166', () => {
  const qs = [
    ...Array.from({ length: 3 }, (_, i) => fakeItem(`twk-${i}`, 'TWK')),
    ...Array.from({ length: 4 }, (_, i) => fakeItem(`tiu-${i}`, 'TIU')),
    ...Array.from({ length: 3 }, (_, i) => fakeItem(`tkp-${i}`, 'TKP')),
  ];
  const s = quiz.mulai(1, qs, 'sess-1');
  // jawab semua benar: TWK 15, TIU 20, TKP 15
  for (let i = 0; i < qs.length; i++) {
    const r = quiz.jawab(1, qs[i].category === 'TKP' ? 2 : 1, skorFn);
    assert.ok(r);
  }
  assert.equal(quiz.get(1).idx, 10);
  const r = quiz.rekap(s);
  assert.equal(r.per.TWK.skor, 15);
  assert.equal(r.per.TIU.skor, 20);
  assert.equal(r.per.TKP.skor, 15);
  assert.equal(r.total, 50);
  assert.equal(r.maks, 50);
  assert.equal(r.persen, 100);
  // passing grade SKD tidak lulus untuk paket 10 (by design)
  assert.equal(r.passTwk, false);
  assert.equal(r.passGrade.TWK, 65);
  assert.equal(r.passGrade.TIU, 80);
  assert.equal(r.passGrade.TKP, 166);
  assert.equal(r.lulus, false);
  quiz.selesai(1);
  assert.equal(quiz.get(1), null);
});

test('jawab: salah TWK = 0, TKP pakai bobot', () => {
  const qs = [fakeItem('twk-x', 'TWK'), fakeItem('tkp-x', 'TKP', 0, [3, 1, 4, 2])];
  quiz.mulai(2, qs, 'sess-2');
  const r1 = quiz.jawab(2, 0, skorFn); // salah
  assert.equal(r1.skor, 0);
  assert.equal(r1.benar, false);
  assert.equal(r1.selesai, false);
  const r2 = quiz.jawab(2, 2, skorFn); // TKP bobot 4
  assert.equal(r2.skor, 4);
  assert.equal(r2.benar, null);
  assert.equal(r2.selesai, true);
  const r = quiz.rekap(quiz.get(2));
  assert.equal(r.dijawab, 2);
  assert.equal(r.total, 4);
  quiz.selesai(2);
});

test('mulai dengan pool kosong -> null', () => {
  assert.equal(quiz.mulai(3, [], 'sess-3'), null);
});

test('sisaDetik & habis', () => {
  const qs = [fakeItem('twk-z', 'TWK')];
  const s = quiz.mulai(4, qs, 'sess-4');
  assert.ok(quiz.sisaDetik(s) > 0);
  assert.equal(quiz.habis(s), false);
  s.deadline = Date.now() - 1000;
  assert.equal(quiz.habis(s), true);
  assert.equal(quiz.jawab(4, 1, skorFn), null); // tidak bisa jawab setelah habis
  quiz.selesai(4);
});
