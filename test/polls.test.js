'use strict';
/**
 * test/polls.test.js — mode quiz vs fallback teks+button.
 */
const test = require('node:test');
const assert = require('node:assert/strict');

process.env.DB_PATH = ':memory:';
const db = require('../db');
const polls = require('../polls');

db.open();

const pendek = {
  item_id: 'q-pendek', category: 'TWK', version: 1,
  question: 'Ibukota Indonesia?', options: ['Jakarta', 'Bandung', 'Surabaya', 'Medan'],
  answer_idx: 0, scores: null, explanation: 'Jakarta.',
};
const panjang = {
  item_id: 'q-panjang', category: 'TWK', version: 1,
  question: 'Soal dengan opsi panjang?',
  options: ['Opsi A yang sangat panjang melebihi seratus karakter sehingga tidak muat di native quiz Telegram xxxx', 'B', 'C', 'D'],
  answer_idx: 0, scores: null, explanation: '',
};

test('pakaiQuiz: batas 300/100 char', () => {
  assert.equal(polls.pakaiQuiz(pendek), true);
  assert.equal(polls.pakaiQuiz(panjang), false);
  assert.equal(polls.pakaiQuiz({ ...pendek, question: 'x'.repeat(301) }), false);
});

test('kirimQuiz mode quiz: track poll:<id>', async () => {
  db.addItem({ ...pendek, explanation: 'ok' });
  db.ensureUser(7001);
  let quizCalled = false;
  const sender = {
    quiz: async (q, opts, extra) => { quizCalled = true; return { poll: { id: 'p-1' } }; },
    text: async () => { throw new Error('tidak boleh dipanggil'); },
  };
  const r = await polls.kirimQuiz(sender, 7001, 7001, db.getItem('q-pendek'), 'latihan');
  assert.equal(r.mode, 'quiz');
  assert.ok(quizCalled);
  const p = polls.take('poll:p-1');
  assert.ok(p && p.kind === 'latihan');
  db.finishSession(p.sessionId);
});

test('kirimQuiz mode fallback: track fb:<chat>:<msg>', async () => {
  db.addItem({ ...panjang, item_id: 'q-panjang2', explanation: '' });
  db.ensureUser(7002);
  let textCalled = false;
  const sender = {
    quiz: async () => { throw new Error('tidak boleh dipanggil'); },
    text: async (html, extra) => {
      textCalled = true;
      assert.match(html, /Soal dengan opsi panjang/);
      assert.ok(extra.reply_markup.inline_keyboard[0][0].callback_data === 'lat:0');
      return { message_id: 4242 };
    },
  };
  const r = await polls.kirimQuiz(sender, 7002, 7002, db.getItem('q-panjang2'), 'latihan');
  assert.equal(r.mode, 'fallback');
  assert.ok(textCalled);
  const p = polls.take('fb:7002:4242');
  assert.ok(p && p.itemId === 'q-panjang2');
  db.finishSession(p.sessionId);
});
