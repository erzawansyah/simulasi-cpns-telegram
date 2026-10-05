'use strict';
/**
 * harian.js — /harian, /subscribe [jam], /unsubscribe.
 * Program latihan harian: 1 soal otomatis per hari via scheduler.
 */
const bot = require('../bot');
const db = require('../db');
const { needRegister } = require('./_shared');

const JAM_MIN = 5, JAM_MAKS = 21, JAM_DEFAULT = 7;

bot.command('harian', (ctx) => {
  const sub = db.getSubscription(ctx.from.id);
  const status = sub && sub.active
    ? `Aktif — kamu dapat 1 soal tiap hari jam <b>${sub.hour}:00 WIB</b>.`
    : 'Belum aktif.';
  ctx.replyWithHTML(
    '<b>Latihan Harian</b>\n\n' +
    'Dapat <b>1 soal otomatis tiap hari</b> langsung di chat ini — ' +
    'format kuis seperti /latihan, jawabanmu ikut tercatat.\n\n' +
    `Statusmu: ${status}\n\n` +
    `/subscribe [jam] — aktifkan (jam ${JAM_MIN}–${JAM_MAKS}, default ${JAM_DEFAULT})\n` +
    'Contoh: <code>/subscribe 6</code> = tiap jam 6 pagi\n' +
    '/unsubscribe — hentikan'
  );
});

bot.command('subscribe', (ctx) => {
  if (!needRegister(ctx)) return;
  const arg = (ctx.message.text.split(/\s+/)[1] || '').trim();
  let jam = JAM_DEFAULT;
  if (arg) {
    jam = Number(arg);
    if (!Number.isInteger(jam) || jam < JAM_MIN || jam > JAM_MAKS) {
      return ctx.reply(`Jam harus ${JAM_MIN}–${JAM_MAKS} (WIB). Contoh: /subscribe 6`);
    }
  }
  db.setSubscription(ctx.from.id, jam);
  db.logEvent('subscribe', ctx.from.id, ctx.chat.id, { hour: jam });
  ctx.replyWithHTML(
    `Latihan harian <b>aktif</b>! Kamu akan dapat 1 soal tiap hari jam <b>${jam}:00 WIB</b>.\n` +
    'Ganti jam kapan aja dengan /subscribe [jam], atau /unsubscribe untuk berhenti.'
  );
});

bot.command('unsubscribe', (ctx) => {
  const sub = db.getSubscription(ctx.from.id);
  if (!sub || !sub.active) return ctx.reply('Langganan harianmu memang sedang nonaktif.');
  db.deactivateSubscription(ctx.from.id);
  db.logEvent('unsubscribe', ctx.from.id, ctx.chat.id, {});
  ctx.reply('Latihan harian dihentikan. Riwayat jawabanmu tetap tersimpan. Aktifkan lagi kapan aja dengan /subscribe.');
});
