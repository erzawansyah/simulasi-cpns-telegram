'use strict';
/** sumbang.js — /sumbang: alur kirim soal user -> antrean moderasi. */
const bot = require('../bot');
const { needRegister } = require('./_shared');
const { startFlow, registerFlowHandler } = require('../itemFlow');

registerFlowHandler(bot);

bot.command('sumbang', (ctx) => {
  if (!needRegister(ctx)) return;
  ctx.replyWithHTML(
    '<b>Sumbang Soal</b>\n\n' +
    'Soalmu akan dikurasi admin sebelum masuk bank soal. ' +
    'Pastikan soal original (parafrase dengan bahasamu sendiri) dan kunci jawaban benar ya.'
  ).then(() => startFlow(ctx, 'sumbang')).catch((e) => console.error(e));
});

const { batalkan } = require('../itemFlow');
module.exports = { batalkan };
