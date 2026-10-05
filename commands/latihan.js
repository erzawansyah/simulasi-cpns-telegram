'use strict';
/**
 * latihan.js — /latihan [kategori] [level].
 * 1 soal acak via native quiz Telegram (ada pembahasan otomatis).
 * Aturan anti-ulang: butir yang sudah dijawab user tidak dipilih lagi.
 */
const bot = require('../bot');
const db = require('../db');
const { needRegister } = require('./_shared');
const { kirimQuiz, registerPollHandler } = require('../polls');
const { esc } = require('../util');

const LEVELS = { mudah: 1, sedang: 2, sukar: 3 };

registerPollHandler(bot);

bot.command('latihan', async (ctx) => {
  if (!needRegister(ctx)) return;
  const parts = ctx.message.text.split(/\s+/).slice(1).map((s) => s.toLowerCase());
  const catArg = parts.find((p) => ['twk', 'tiu', 'tkp'].includes(p));
  const lvlArg = parts.find((p) => LEVELS[p]);
  const category = catArg ? catArg.toUpperCase() : null;
  const difficulty = lvlArg ? LEVELS[lvlArg] : null;

  const items = db.pickItems({ userId: ctx.from.id, category, difficulty, n: 1 });
  if (!items.length) {
    const filter = [category, lvlArg].filter(Boolean).join(' ');
    return ctx.reply(
      filter
        ? `Soal ${filter} sudah habis kamu jawab semua — keren! Tunggu bank soal baru ya.`
        : 'Semua soal di bank sudah kamu jawab — keren! Tunggu bank soal baru ya.'
    );
  }
  const item = items[0];
  try {
    await kirimQuiz(
      {
        quiz: (q, opts, extra) => ctx.replyWithQuiz(q, opts, extra),
        text: (html, extra) => ctx.replyWithHTML(html, extra),
      },
      ctx.from.id, ctx.chat.id, item, 'latihan'
    );
  } catch (e) {
    ctx.reply('Gagal mengirim soal: ' + e.message);
  }
});
