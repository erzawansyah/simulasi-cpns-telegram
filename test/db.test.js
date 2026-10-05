'use strict';
/**
 * test/db.test.js — skema, CRUD, anti-ulang, paket simulasi, subscriptions, submissions, events.
 */
const test = require('node:test');
const assert = require('node:assert/strict');

process.env.DB_PATH = ':memory:';
const db = require('../db');
const { esc } = require('../util');

db.open();

function mkItem(id, cat, nOpt = 4) {
  return {
    item_id: id, category: cat,
    question: `Soal ${id}?`, options: Array.from({ length: nOpt }, (_, i) => `Opsi ${i + 1}`),
    answer_idx: 1, scores: cat === 'TKP' ? [1, 2, 5, 3].slice(0, nOpt) : null,
    explanation: 'Bahasan', active: 1, version: 1,
  };
}

test('skema: semua tabel & indeks terbentuk', () => {
  const tables = db.getDb().prepare(
    `SELECT name FROM sqlite_master WHERE type='table' ORDER BY name`).all().map((r) => r.name);
  for (const t of ['users', 'items', 'sessions', 'responses', 'simulation_results', 'events', 'subscriptions', 'submissions']) {
    assert.ok(tables.includes(t), `tabel ${t} hilang`);
  }
  const idx = db.getDb().prepare(`SELECT name FROM sqlite_master WHERE type='index'`).all().map((r) => r.name);
  assert.ok(idx.includes('idx_responses_user_item'));
});

test('WAL mode aktif (file DB)', () => {
  // :memory: tidak mendukung WAL — verifikasi dilakukan pada file DB di migrate.test.js
  const mode = db.getDb().prepare('PRAGMA journal_mode').get().journal_mode;
  assert.ok(['wal', 'memory'].includes(mode.toLowerCase()));
});

test('users: ensure + register', () => {
  const u = db.ensureUser(1001, 'tester', 'Test');
  assert.equal(u.registered, 0);
  db.registerUser(1001, true);
  const u2 = db.getUser(1001);
  assert.equal(u2.registered, 1);
  assert.ok(u2.consent_at > 0);
});

test('items: tambah + baca + skorSoal', () => {
  db.addItem(mkItem('twk-t1', 'TWK'));
  db.addItem(mkItem('tkp-t1', 'TKP'));
  const q = db.getItem('twk-t1');
  assert.deepEqual(q.options, ['Opsi 1', 'Opsi 2', 'Opsi 3', 'Opsi 4']);
  assert.equal(db.skorSoal(q, 1), 5);
  assert.equal(db.skorSoal(q, 0), 0);
  const tkp = db.getItem('tkp-t1');
  assert.equal(db.skorSoal(tkp, 2), 5); // bobot max
  assert.equal(db.countItems('TWK'), 1);
});

test('anti-ulang: pickItems tidak mengembalikan butir yang sudah dijawab', () => {
  for (let i = 1; i <= 5; i++) db.addItem(mkItem(`twk-a${i}`, 'TWK'));
  const sid = db.createSession(1001, 'latihan');
  // user jawab 4 dari 6 butir TWK (twk-t1 + a1..a3)
  for (const id of ['twk-t1', 'twk-a1', 'twk-a2', 'twk-a3']) {
    db.recordResponse({ sessionId: sid, userId: 1001, itemId: id, chosenIdx: 1, correct: 1, score: 5 });
  }
  const pool = db.pickItems({ userId: 1001, category: 'TWK', n: 10 });
  const ids = pool.map((q) => q.item_id).sort();
  assert.deepEqual(ids, ['twk-a4', 'twk-a5']);
  // user lain tidak terpengaruh
  const pool2 = db.pickItems({ userId: 9999, category: 'TWK', n: 10 });
  assert.equal(pool2.length, 6);
});

test('paketSimulasi: proporsi 30/35/35', () => {
  for (let i = 1; i <= 10; i++) {
    db.addItem(mkItem(`tiu-p${i}`, 'TIU'));
    db.addItem(mkItem(`tkp-p${i}`, 'TKP'));
  }
  const qs = db.paketSimulasi(10, 4242);
  const c = { TWK: 0, TIU: 0, TKP: 0 };
  for (const q of qs) c[q.category]++;
  assert.equal(qs.length, 10);
  assert.equal(c.TWK, 3);
  assert.equal(c.TIU, 4);
  assert.equal(c.TKP, 3);
});

test('subscriptions: set + list per jam + deactivate', () => {
  db.ensureUser(2001);
  db.setSubscription(2001, 7);
  db.ensureUser(2002);
  db.setSubscription(2002, 8);
  assert.equal(db.activeSubscriptionsForHour(7).length, 1);
  db.deactivateSubscription(2001);
  assert.equal(db.activeSubscriptionsForHour(7).length, 0);
  assert.equal(db.getSubscription(2001).active, 0);
});

test('submissions: tambah -> setujui -> jadi item', () => {
  db.ensureUser(3001);
  const sid = db.addSubmission({
    user_id: 3001, category: 'TWK', question: 'Sumbangan?', options: ['a', 'b', 'c', 'd'],
    answer_idx: 0, explanation: 'ya',
  });
  assert.equal(db.countPendingSubmissions(), 1);
  const itemId = db.reviewSubmission(sid, true, null, 1);
  assert.ok(itemId);
  assert.equal(db.getSubmission(sid).status, 'approved');
  assert.ok(db.getItem(itemId));
  assert.equal(db.countPendingSubmissions(), 0);
});

test('submissions: tolak + catatan', () => {
  db.ensureUser(3002);
  const sid = db.addSubmission({
    user_id: 3002, category: 'TIU', question: 'Jelek?', options: ['a', 'b', 'c', 'd'],
    answer_idx: 0,
  });
  const r = db.reviewSubmission(sid, false, 'Kunci salah', 1);
  assert.equal(r, null);
  const s = db.getSubmission(sid);
  assert.equal(s.status, 'rejected');
  assert.equal(s.reviewer_note, 'Kunci salah');
});

test('events: logEvent tercatat', () => {
  db.logEvent('command', 1001, 1001, { command: '/start' });
  const e = db.getDb().prepare(`SELECT * FROM events WHERE type='command' ORDER BY event_id DESC LIMIT 1`).get();
  assert.equal(e.user_id, 1001);
  assert.match(e.detail, /\/start/);
});

test('util.esc: HTML escape', () => {
  assert.equal(esc('<b>Tom & "Jerry"</b>'), '&lt;b&gt;Tom &amp; &quot;Jerry&quot;&lt;/b&gt;');
  assert.equal(esc(null), '');
});

test('simulation_results: simpan + baca', () => {
  const sid = db.createSession(1001, 'simulasi');
  db.saveSimulationResult(sid, { twk: 70, tiu: 85, tkp: 170, total: 325, passTwk: true, passTiu: true, passTkp: true });
  const r = db.getSimulationResult(sid);
  assert.equal(r.total, 325);
  assert.equal(r.lulus, 1);
});

test('deactivateUser: personal dihapus, respons tetap', () => {
  db.ensureUser(4001, 'hapusme', 'Hapus');
  db.registerUser(4001, true);
  const sid = db.createSession(4001, 'latihan');
  db.recordResponse({ sessionId: sid, userId: 4001, itemId: 'twk-t1', chosenIdx: 1, correct: 1, score: 5 });
  db.deactivateUser(4001);
  const u = db.getUser(4001);
  assert.equal(u.registered, 0);
  assert.equal(u.username, null);
  const nResp = db.getDb().prepare('SELECT COUNT(*) c FROM responses WHERE user_id = 4001').get().c;
  assert.equal(nResp, 1); // respons riset tetap
});

test('premium: set & baca', () => {
  db.ensureUser(5001);
  assert.equal(db.getUser(5001).premium, 0);
  db.setPremium(5001, 1);
  assert.equal(db.getUser(5001).premium, 1);
  db.setPremium(5001, 0);
  assert.equal(db.getUser(5001).premium, 0);
});

test('meta demografis: set & get (merge)', () => {
  db.ensureUser(5002);
  db.setMeta(5002, { demografis: { jenis_kelamin: 'L', usia: 28 } });
  db.setMeta(5002, { lain: 1 });
  const m = db.getMeta(5002);
  assert.equal(m.demografis.usia, 28);
  assert.equal(m.lain, 1);
});

test('lastSimulasiAt: null bila belum pernah, terisi setelah sesi', () => {
  db.ensureUser(5003);
  assert.equal(db.lastSimulasiAt(5003), null);
  const sid = db.createSession(5003, 'simulasi');
  db.finishSession(sid);
  assert.ok(db.lastSimulasiAt(5003) > 0);
  // simulasi_full tidak dihitung sebagai /simulasi mingguan
  db.ensureUser(5004);
  const sid2 = db.createSession(5004, 'simulasi_full');
  db.finishSession(sid2);
  assert.equal(db.lastSimulasiAt(5004), null);
});

test('paketSimulasi: komposisi eksplisit 30/35/45', () => {
  for (let i = 1; i <= 50; i++) {
    db.addItem(mkItem(`twk-c${i}`, 'TWK'));
    db.addItem(mkItem(`tiu-c${i}`, 'TIU'));
    db.addItem(mkItem(`tkp-c${i}`, 'TKP'));
  }
  const qs = db.paketSimulasi(110, 6001, { TWK: 30, TIU: 35, TKP: 45 });
  const c = { TWK: 0, TIU: 0, TKP: 0 };
  for (const q of qs) c[q.category]++;
  assert.equal(qs.length, 110);
  assert.deepEqual(c, { TWK: 30, TIU: 35, TKP: 45 });
});

test('getGlobalStats: agregat benar', () => {
  db.ensureUser(7001); db.registerUser(7001);
  db.ensureUser(7002);
  db.logEvent('command', 7001, 7001, { command: '/start' });
  db.logEvent('command', 7002, 7002, { command: '/start' });
  db.logEvent('blocked', 7002, 7002, {});
  db.setSubscription(7001, 7);
  const s = db.getGlobalStats();
  assert.ok(s.totalUsers >= 2);
  assert.ok(s.registered >= 1);
  assert.ok(s.active7d >= 2);
  assert.ok(s.blocked >= 1);
  assert.ok(s.subscribers >= 1);
  assert.ok(s.itemsActive >= 150);
  // unblock lalu hitung lagi -> blocked berkurang
  db.logEvent('unblocked', 7002, 7002, {});
  assert.equal(db.getGlobalStats().blocked, s.blocked - 1);
});
