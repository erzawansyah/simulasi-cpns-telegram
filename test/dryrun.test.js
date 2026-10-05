'use strict';
/**
 * test/dryrun.test.js — simulasi kering end-to-end:
 * init :memory: -> migrasi data JSON ASLI -> user dummy -> jawab soal
 * -> rekap simulasi -> statistik -> scheduler tick. Tanpa exception.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

process.env.DB_PATH = ':memory:';
const db = require('../db');
const quiz = require('../quiz');
const research = require('../research');
const { normalizeItem, validateItem } = require('../import');
const { jamJakarta } = require('../scheduler');
const { take } = require('../polls');

const SRC = path.join(__dirname, '..', '..', 'simulator', 'data');

test('dry-run penuh', async () => {
  db.open();

  // 1. Migrasi 30 soal asli (jalur yang sama dipakai migrate.js)
  let n = 0;
  for (const cat of ['twk', 'tiu', 'tkp']) {
    const arr = JSON.parse(fs.readFileSync(path.join(SRC, `${cat}.json`), 'utf8'));
    for (const raw of arr) {
      const q = normalizeItem(raw);
      assert.deepEqual(validateItem(q, q.id), [], `butir ${q.id} harus valid`);
      db.addItem({
        item_id: q.id, category: q.category, difficulty: null,
        question: q.question, options: q.options, answer_idx: q.answer_idx,
        scores: q.scores || null, explanation: q.explanation || null,
        active: 1, version: 1,
      });
      n++;
    }
  }
  assert.equal(n, 30);
  assert.equal(db.countItems(null, false), 30);

  // 2. User dummy daftar + consent
  const UID = 9001;
  db.ensureUser(UID, 'dummy', 'Dummy <Test>');
  db.registerUser(UID, true);
  assert.equal(db.getUser(UID).registered, 1);

  // 3. Latihan: ambil 1 soal, jawab via polls.track/take (simulasi poll_answer)
  const polls = require('../polls');
  const [soal] = db.pickItems({ userId: UID, n: 1 });
  assert.ok(soal);
  const sessLat = db.createSession(UID, 'latihan');
  polls.track('poll:poll-dry-1', { userId: UID, itemId: soal.item_id, itemVersion: 1, sessionId: sessLat, kind: 'latihan', askedAt: Date.now() - 1500 });
  const p = polls.take('poll:poll-dry-1');
  assert.ok(p);
  const benar = soal.category !== 'TKP';
  db.recordResponse({
    sessionId: p.sessionId, userId: UID, itemId: soal.item_id, itemVersion: 1,
    chosenIdx: soal.answer_idx, correct: soal.category === 'TKP' ? null : 1,
    score: db.skorSoal(soal, soal.answer_idx), responseTimeMs: 1500,
  });
  db.finishSession(sessLat);
  assert.ok(benar || !benar); // smoke

  // 4. Simulasi 10 soal: jawab semua, rekap, simpan
  const qs = db.paketSimulasi(10, UID);
  assert.equal(qs.length, 10);
  const sessSim = db.createSession(UID, 'simulasi');
  const s = quiz.mulai(UID, qs, sessSim);
  assert.ok(s);
  for (const q of qs) {
    const chosen = q.category === 'TKP' ? q.scores.indexOf(Math.max(...q.scores)) : q.answer_idx;
    const r = quiz.jawab(UID, chosen, (it, c) => db.skorSoal(it, c));
    assert.ok(r);
  }
  const rek = quiz.rekap(s);
  assert.equal(rek.dijawab, 10);
  assert.equal(rek.total, 50);
  for (const a of s.answers) {
    db.recordResponse({
      sessionId: sessSim, userId: UID, itemId: a.item.item_id, itemVersion: 1,
      chosenIdx: a.chosenIdx, correct: a.benar == null ? null : 1,
      score: a.skor, responseTimeMs: a.responseTimeMs,
    });
  }
  db.saveSimulationResult(sessSim, {
    twk: rek.per.TWK.skor, tiu: rek.per.TIU.skor, tkp: rek.per.TKP.skor, total: rek.total,
    passTwk: rek.passTwk, passTiu: rek.passTiu, passTkp: rek.passTkp,
  });
  db.finishSession(sessSim);
  quiz.selesai(UID);
  const saved = db.getSimulationResult(sessSim);
  assert.equal(saved.total, 50);

  // 5. Anti-ulang: 30 soal sudah dijawab 11 -> latihan berikutnya tidak mengulang
  const lagi = db.pickItems({ userId: UID, n: 30 });
  assert.ok(lagi.length <= 19, `sisa pool = ${lagi.length}`);

  // 6. Statistik user + riwayat + leaderboard jalan
  const stats = db.getUserStats(UID);
  assert.ok(stats.simulasi >= 1);
  assert.ok(db.getHistory(UID, 5).length >= 1);
  assert.ok(db.leaderboard('semua', 10).length >= 1);

  // 7. Statistik butir jalan untuk soal yang sudah dijawab
  const ist = research.itemStats(db, soal.item_id);
  assert.equal(ist.n, 1);

  // 8. Scheduler tick kering: fake bot
  db.setSubscription(UID, jamJakarta());
  let quizSent = 0;
  const fakeBot = {
    telegram: {
      sendQuiz: async () => { quizSent++; return { poll: { id: 'poll-dry-2' } }; },
    },
  };
  const { tickForHour } = require('../scheduler');
  const res = await tickForHour(fakeBot, jamJakarta());
  assert.equal(res.terkirim, 1);
  assert.equal(quizSent, 1);
  const tracked = take('poll:poll-dry-2');
  assert.ok(tracked && tracked.kind === 'harian');

  // 9. Scheduler: 403 -> subscription nonaktif + event blocked
  const fakeBlocked = {
    telegram: {
      sendQuiz: async () => { const e = new Error('Forbidden'); e.response = { error_code: 403 }; throw e; },
    },
  };
  const res2 = await tickForHour(fakeBlocked, jamJakarta());
  assert.equal(res2.diblokir, 1);
  assert.equal(db.getSubscription(UID).active, 0);
  const ev = db.getDb().prepare(`SELECT * FROM events WHERE type='blocked' AND user_id=?`).get(UID);
  assert.ok(ev);

  db.close();
});
