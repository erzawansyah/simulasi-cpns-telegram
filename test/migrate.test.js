'use strict';
/**
 * test/migrate.test.js — migrasi JSON -> SQLite via subprocess.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

const MIGRATE = path.join(__dirname, '..', 'migrate.js');

function makeSrc() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'migsrc-'));
  const item = (id, cat, extra = {}) => ({
    id, category: cat, question: `Q ${id}?`, options: ['a', 'b', 'c', 'd'],
    answer: 0, explanation: 'ok', ...extra,
  });
  fs.writeFileSync(path.join(dir, 'twk.json'), JSON.stringify([item('twk-001', 'TWK'), item('twk-002', 'TWK')]));
  fs.writeFileSync(path.join(dir, 'tiu.json'), JSON.stringify([item('tiu-001', 'TIU')]));
  fs.writeFileSync(path.join(dir, 'tkp.json'), JSON.stringify([
    item('tkp-001', 'TKP', { answer: 2, scores: [1, 3, 5, 2] }),
  ]));
  fs.writeFileSync(path.join(dir, 'users.json'), JSON.stringify({
    777: { id: 777, username: 'u1', registered: true, stats: { registeredAt: 1700000000000 }, history: [{ jenis: 'latihan' }] },
    778: { id: 778, username: 'u2', registered: false, stats: {} },
  }));
  return dir;
}

function runMigrate(srcDir, dbFile, extraArgs = []) {
  return execFileSync('node', [MIGRATE, '--src', srcDir, ...extraArgs], {
    env: { ...process.env, DB_PATH: dbFile },
    encoding: 'utf8',
  });
}

test('migrasi sukses + verifikasi hitung baris', () => {
  const src = makeSrc();
  const dbFile = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'migdb-')), 'data.db');
  const out = runMigrate(src, dbFile);
  assert.match(out, /SELESAI & TERVERIFIKASI/);
  assert.match(out, /2 users/);
  assert.match(out, /4 items/);

  const Database = require('better-sqlite3');
  const d = new Database(dbFile, { readonly: true });
  // WAL: pada koneksi readonly, PRAGMA mengembalikan mode tersimpan
  assert.equal(d.prepare('PRAGMA journal_mode').get().journal_mode.toLowerCase(), 'wal');
  assert.equal(d.prepare('SELECT COUNT(*) c FROM items').get().c, 4);
  assert.equal(d.prepare('SELECT COUNT(*) c FROM users').get().c, 2);
  const u = d.prepare('SELECT * FROM users WHERE user_id = 777').get();
  assert.equal(u.registered, 1);
  assert.equal(u.created_at, 1700000000000);
  const tkp = d.prepare('SELECT * FROM items WHERE item_id = ?').get('tkp-001');
  assert.deepEqual(JSON.parse(tkp.scores), [1, 3, 5, 2]);
  assert.equal(tkp.difficulty, null); // batch pertama: difficulty NULL
  // arsip tersalin
  assert.ok(fs.existsSync(path.join(path.dirname(dbFile), 'archive', 'twk.json')));
  d.close();
});

test('tanpa --force: batal bila db sudah berisi data', () => {
  const src = makeSrc();
  const dbFile = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'migdb-')), 'data.db');
  runMigrate(src, dbFile);
  assert.throws(() => runMigrate(src, dbFile), /BATAL/);
});

test('--force: timpa database lama', () => {
  const src = makeSrc();
  const dbFile = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'migdb-')), 'data.db');
  runMigrate(src, dbFile);
  const out = runMigrate(src, dbFile, ['--force']);
  assert.match(out, /SELESAI & TERVERIFIKASI/);
});

test('users.json tidak ada -> tetap jalan (0 user)', () => {
  const src = makeSrc();
  fs.unlinkSync(path.join(src, 'users.json'));
  const dbFile = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'migdb-')), 'data.db');
  const out = runMigrate(src, dbFile);
  assert.match(out, /0 users/);
  assert.match(out, /SELESAI & TERVERIFIKASI/);
});
