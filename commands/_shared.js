'use strict';
/** Helper bersama command: guard registrasi. */
const db = require('../db');

function needRegister(ctx) {
  const u = db.getUser(ctx.from.id);
  if (!u || !u.registered) {
    ctx.reply('Kamu belum terdaftar. Ketik /daftar dulu ya.');
    return null;
  }
  return u;
}

function needAdmin(ctx) {
  const { isAdmin } = require('../util');
  if (!isAdmin(ctx.from.id)) {
    ctx.reply('Perintah ini khusus admin.');
    return false;
  }
  return true;
}

module.exports = { needRegister, needAdmin };
