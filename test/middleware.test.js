'use strict';
/**
 * test/middleware.test.js — regresi bug "command tertelan".
 *
 * Bug 2026-10-06: bot.on('text') di akun.js tidak memanggil next(),
 * sehingga semua command yang didaftarkan SETELAH akun.js (/latihan,
 * /simulasi, /subscribe, ...) tidak pernah jalan — bot diam total.
 * Test ini memastikan setiap text handler meneruskan ke next()
 * ketika tidak ada alur percakapan aktif.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');

process.env.DB_PATH = ':memory:';
process.env.BOT_TOKEN = 'dummy';
process.env.ADMIN_CHAT_IDS = '';

function stubBot() {
  const captured = { text: [] };
  return {
    captured,
    on: (ev, fn) => { if (ev === 'text') captured.text.push(fn); },
    command: () => {}, action: () => {}, start: () => {},
    use: () => {}, catch: () => {},
    telegram: { sendMessage: async () => {} },
  };
}

function loadWithStubBot(relPath) {
  const botPath = require.resolve('../bot');
  const stub = stubBot();
  require.cache[botPath] = { id: botPath, filename: botPath, loaded: true, exports: stub };
  const modPath = require.resolve(relPath);
  delete require.cache[modPath];
  require(modPath);
  return stub;
}

function fakeCtx(text, userId = 9001) {
  return {
    from: { id: userId, first_name: 'T' },
    chat: { id: userId, type: 'private' },
    message: { text },
    reply: async () => {}, replyWithHTML: async () => {},
  };
}

test('akun.js: /latihan diteruskan ke next() saat tidak ada flow demografis', async () => {
  const stub = loadWithStubBot('../commands/akun');
  assert.ok(stub.captured.text.length > 0, 'text handler tidak terdaftar');
  let continued = false;
  for (const h of stub.captured.text) {
    await h(fakeCtx('/latihan'), () => { continued = true; });
  }
  assert.ok(continued, 'REGRESI: /latihan tertelan, next() tidak dipanggil');
});

test('akun.js: teks biasa juga diteruskan saat tidak ada flow', async () => {
  const stub = loadWithStubBot('../commands/akun');
  let continued = false;
  for (const h of stub.captured.text) {
    await h(fakeCtx('halo'), () => { continued = true; });
  }
  assert.ok(continued);
});

test('itemFlow.js: command diteruskan ke next()', async () => {
  const botPath = require.resolve('../bot');
  const stub = stubBot();
  require.cache[botPath] = { id: botPath, filename: botPath, loaded: true, exports: stub };
  const flowPath = require.resolve('../itemFlow');
  delete require.cache[flowPath];
  const { registerFlowHandler } = require('../itemFlow');
  registerFlowHandler(stub);
  let continued = false;
  for (const h of stub.captured.text) {
    await h(fakeCtx('/simulasi'), () => { continued = true; });
  }
  assert.ok(continued, 'REGRESI: /simulasi tertelan itemFlow');
});

test('admin.js: command diteruskan ke next()', async () => {
  const stub = loadWithStubBot('../commands/admin');
  let continued = false;
  for (const h of stub.captured.text) {
    await h(fakeCtx('/stats', 1338551789), () => { continued = true; });
  }
  assert.ok(continued, 'REGRESI: /stats tertelan admin text handler');
});
