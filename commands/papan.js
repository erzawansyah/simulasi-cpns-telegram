'use strict';
/**
 * papan.js — /papan [minggu|semua]. Leaderboard skor simulasi (top 10).
 * Privasi: hanya first_name yang ditampilkan (tanpa username).
 */
const bot = require('../bot');
const db = require('../db');
const { esc } = require('../util');

bot.command('papan', (ctx) => {
  const arg = (ctx.message.text.split(/\s+/)[1] || 'semua').toLowerCase();
  const mode = arg === 'minggu' ? 'minggu' : 'semua';
  const rows = db.leaderboard(mode, 10);
  if (!rows.length) {
    return ctx.reply(
      mode === 'minggu'
        ? 'Belum ada skor simulasi minggu ini. Jadilah yang pertama!'
        : 'Belum ada skor simulasi. Jalankan /simulasi dulu!'
    );
  }
  const lines = rows.map((r, i) => {
    const medali = ['1.', '2.', '3.'][i] || `${i + 1}.`;
    const nama = esc((r.first_name || 'Peserta').slice(0, 20));
    const lulus = r.lulus ? ' LULUS' : '';
    return `${medali} ${nama} — <b>${r.total}</b>${lulus}`;
  });
  ctx.replyWithHTML(
    `<b>Papan Peringkat</b> (${mode === 'minggu' ? '7 hari terakhir' : 'sepanjang masa'})\n\n` +
    lines.join('\n') +
    '\n\nLihat versi lain: /papan minggu atau /papan semua'
  );
});
