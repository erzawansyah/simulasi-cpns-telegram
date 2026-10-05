'use strict';
/**
 * test/import.test.js — parser JSON/CSV + validator batch.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const imp = require('../import');

const VALID_JSON = JSON.stringify([
  { category: 'TWK', question: 'Ibukota Indonesia?', options: ['Jakarta', 'Bandung', 'Surabaya', 'Medan'], answer_idx: 0, explanation: 'Jakarta.' },
  { category: 'TKP', question: 'Sikap saat konflik?', options: ['A', 'B', 'C', 'D', 'E'], answer_idx: 2, scores: [1, 2, 5, 3, 4] },
]);

test('parseJSON valid', () => {
  const r = imp.parseJSON(VALID_JSON);
  assert.equal(r.ok, true);
  assert.equal(r.raw.length, 2);
});

test('parseJSON invalid', () => {
  const r = imp.parseJSON('{bukan json');
  assert.equal(r.ok, false);
});

test('validateBatch: lolos untuk data valid', () => {
  const { ok, items, errors } = imp.validateBatch(imp.parseJSON(VALID_JSON).raw);
  assert.equal(ok, true);
  assert.equal(items.length, 2);
  assert.deepEqual(errors, []);
});

test('validateBatch: tangkap banyak error', () => {
  const raw = [
    { category: 'XXX', question: '', options: ['a', 'b'], answer_idx: 9 },
    { category: 'TKP', question: 'Q?', options: ['a', 'b', 'c', 'd'], answer_idx: 0 }, // tanpa scores
    { category: 'TWK', question: 'Q?'.repeat(600), options: ['a', 'b', 'c', 'd'], answer_idx: 0 }, // >1000 char
  ];
  const { ok, errors } = imp.validateBatch(raw);
  assert.equal(ok, false);
  assert.ok(errors.length >= 4, errors.join(' | '));
});

test('validateBatch: deteksi duplikat dalam file & vs bank', () => {
  const raw = [
    { category: 'TWK', question: 'Sama?', options: ['a', 'b', 'c', 'd'], answer_idx: 0 },
    { category: 'TWK', question: '  sama? ', options: ['a', 'b', 'c', 'd'], answer_idx: 0 },
  ];
  const { errors } = imp.validateBatch(raw, () => ['SAMA?']);
  assert.ok(errors.some((e) => e.includes('duplikat dalam file')));
  assert.ok(errors.some((e) => e.includes('duplikat dengan bank')));
});

test('parseCSV: template-soal.csv valid', () => {
  const text = fs.readFileSync(path.join(__dirname, '..', 'template-soal.csv'), 'utf8');
  const r = imp.parseCSV(text);
  assert.equal(r.ok, true);
  assert.equal(r.raw.length, 3);
  const { ok, items, errors } = imp.validateBatch(r.raw);
  assert.equal(ok, true, errors.join(' | '));
  assert.equal(items.length, 3);
  const tkp = items.find((q) => q.category === 'TKP');
  assert.deepEqual(tkp.scores, [1, 2, 5, 3, 4]);
  assert.equal(tkp.answer_idx, 2);
});

test('parseCSV: header tidak lengkap -> error jelas', () => {
  const r = imp.parseCSV('category,question\na,b');
  assert.equal(r.ok, false);
  assert.match(r.error, /option_a/);
});

test('normalizeItem: alias answer & difficulty teks', () => {
  const q = imp.normalizeItem({ category: 'twk', question: 'Q', options: ['a', 'b', 'c', 'd'], answer: 2, difficulty: 'sukar' });
  assert.equal(q.category, 'TWK');
  assert.equal(q.answer_idx, 2);
  assert.equal(q.difficulty, 3);
});

test('template-soal.json valid penuh', () => {
  const text = fs.readFileSync(path.join(__dirname, '..', 'template-soal.json'), 'utf8');
  const r = imp.parseJSON(text);
  assert.equal(r.ok, true);
  const { ok, errors } = imp.validateBatch(r.raw);
  assert.equal(ok, true, errors.join(' | '));
});
