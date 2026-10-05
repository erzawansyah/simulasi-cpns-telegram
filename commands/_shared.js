'use strict';
/** Helper bersama: guard registrasi, format waktu, kirim soal. */
const store = require('../store');
const quiz = require('../quiz');

function needRegister(ctx) {
  const u = store.get(ctx.from.id);
  if (!u || !u.registered) {
    ctx.reply('Kamu belum terdaftar. Ketik /daftar dulu ya.');
    return null;
  }
  return u;
}

function fmtSisa(det) {
  const m = Math.floor(det / 60), s = det % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

const HURUF = ['A', 'B', 'C', 'D', 'E'];

function soalKeyboard(q) {
  return {
    reply_markup: {
      inline_keyboard: q.options.map((opt, i) => [{ text: `${HURUF[i]}. ${opt}`, callback_data: `sim:${i}` }]),
    },
  };
}

function teksSoal(q, idx, total, sisa) {
  return `Soal ${idx + 1}/${total} [${q.category}]  |  Sisa waktu: ${fmtSisa(sisa)}\n\n${q.question}`;
}

module.exports = { needRegister, fmtSisa, HURUF, soalKeyboard, teksSoal };
