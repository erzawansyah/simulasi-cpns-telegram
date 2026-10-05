'use strict';
/**
 * index.js — entry point. Polling default; webhook opsional via env.
 */
const bot = require('./bot');

// Daftarkan semua command (setiap file mendaftarkan handler-nya sendiri)
require('./commands/akun');
require('./commands/latihan');
require('./commands/simulasi');
require('./commands/tambah');

// Laporan error: ke admin HANYA jika ADMIN_CHAT_IDS diisi (tidak ada spy-log pesan user)
const admins = (process.env.ADMIN_CHAT_IDS || '').split(',').map((s) => s.trim()).filter(Boolean);
bot.catch((err, ctx) => {
  console.error('[bot] error:', err);
  const info = `Error pada update ${ctx.updateType || '?'} dari user ${ctx.from?.id || '?'}`;
  for (const id of admins) {
    bot.telegram.sendMessage(id, `BOT ERROR\n${info}\n${String(err.message || err).slice(0, 300)}`).catch(() => {});
  }
});

process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));

(async () => {
  const mode = (process.env.BOT_MODE || 'polling').toLowerCase();
  // Validasi token dengan getMe sebelum launch — gagal cepat dengan pesan jelas
  try {
    const me = await bot.telegram.getMe();
    console.log(`[bot] login sebagai @${me.username}`);
  } catch (e) {
    console.error('[bot] FATAL: token tidak valid / tidak bisa hubungi Telegram:', e.message);
    process.exit(1);
  }
  if (mode === 'webhook') {
    const url = (process.env.PUBLIC_URL || '').replace(/\/$/, '');
    const port = Number(process.env.PORT || 3000);
    if (!url) { console.error('[bot] FATAL: BOT_MODE=webhook butuh PUBLIC_URL.'); process.exit(1); }
    const secret = `bot${process.env.BOT_TOKEN.split(':')[0]}`;
    await bot.telegram.setWebhook(`${url}/${secret}`);
    const express = require('express');
    const app = express();
    app.use(bot.webhookCallback(`/${secret}`));
    app.get('/', (_, res) => res.send('Simulasi CPNS Bot aktif (webhook)'));
    app.listen(port, () => console.log(`[bot] webhook di :${port}`));
  } else {
    await bot.launch();
    console.log('[bot] polling jalan. Tekan Ctrl+C untuk berhenti.');
  }
})();
