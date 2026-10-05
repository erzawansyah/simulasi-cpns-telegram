'use strict';
/**
 * index.js — entry point Simulasi CPNS 2027.
 *
 * BOT_MODE=polling  -> bot.launch()
 * BOT_MODE=webhook  -> express + route /webhook/<token>, GET / = status
 */
require('dotenv').config();
const bot = require('./bot'); // inisialisasi db + middleware + my_chat_member

// Daftarkan semua command
require('./commands/akun');
require('./commands/latihan');
require('./commands/simulasi');
require('./commands/harian');
require('./commands/papan');
require('./commands/sumbang');
require('./commands/admin');

const { startScheduler } = require('./scheduler');

process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));

(async () => {
  const mode = (process.env.BOT_MODE || 'polling').toLowerCase();

  try {
    const me = await bot.telegram.getMe();
    console.log(`[bot] login sebagai @${me.username}`);
  } catch (e) {
    console.error('[bot] FATAL: token tidak valid / tidak bisa hubungi Telegram:', e.message);
    process.exit(1);
  }

  startScheduler(bot);

  if (mode === 'webhook') {
    const url = (process.env.PUBLIC_URL || '').replace(/\/$/, '');
    const port = Number(process.env.PORT || 3000);
    const token = process.env.BOT_TOKEN;
    if (!url) { console.error('[bot] FATAL: BOT_MODE=webhook butuh PUBLIC_URL.'); process.exit(1); }

    await bot.telegram.setWebhook(`${url}/webhook/${token}`);
    const express = require('express');
    const app = express();
    // Route memuat token penuh — path itu sendiri yang menjadi rahasia.
    // webhookCallback memfilter berdasarkan req.url, jadi dipasang di root
    // (bukan app.use(hookPath, ...) yang membuat express memotong prefix).
    const hookPath = `/webhook/${token}`;
    app.get('/', (_, res) => res.send('Simulasi CPNS 2027 aktif (webhook)'));
    app.use(bot.webhookCallback(hookPath));
    app.listen(port, () => console.log(`[bot] webhook di :${port}`));
  } else {
    // Hapus webhook HANYA jika memang terpasang; jangan buang update pending
    // (drop_pending_updates=true bikin command user yang dikirim saat restart hilang).
    try {
      const wh = await bot.telegram.getWebhookInfo();
      if (wh && wh.url) {
        await bot.telegram.deleteWebhook();
        console.log('[bot] webhook dicabut, beralih ke polling');
      }
    } catch (e) {
      console.error('[bot] getWebhookInfo/deleteWebhook gagal:', e.message);
    }
    await bot.launch();
    console.log('[bot] polling jalan. Tekan Ctrl+C untuk berhenti.');
  }
})().catch((e) => {
  console.error('[bot] FATAL:', e);
  process.exit(1);
});
