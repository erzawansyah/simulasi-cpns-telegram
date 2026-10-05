'use strict';
/**
 * polls.js — penyajian 1 soal latihan/harian.
 *
 * Mode utama: native quiz Telegram (ada pembahasan otomatis).
 * Fallback (v1.1): bila soal/opsi melebihi batas quiz Telegram
 * (soal 300 / opsi 100 char), kirim sebagai teks + inline button A–E.
 * Kedua mode mencatat respons ke DB (aturan anti-ulang tetap berlaku).
 */
const db = require('./db');
const { QUIZ_QUESTION, QUIZ_OPTION, QUIZ_EXPLANATION } = require('./import');
const { esc, HURUF } = require('./util');

// key -> { userId, itemId, itemVersion, sessionId, kind, askedAt }
// key poll: `poll:<pollId>` ; key fallback: `fb:<chatId>:<messageId>`
const pending = new Map();

function track(key, info) {
  pending.set(key, info);
  const t = setTimeout(() => pending.delete(key), 30 * 60 * 1000);
  if (t.unref) t.unref();
}

function take(key) {
  const p = pending.get(key);
  if (p) pending.delete(key);
  return p || null;
}

function pakaiQuiz(item) {
  return item.question.length <= QUIZ_QUESTION &&
    item.options.every((o) => String(o).length <= QUIZ_OPTION);
}

function teksFallback(item, kind) {
  const label = kind === 'harian' ? 'Soal Harian' : 'Latihan';
  const opts = item.options.map((o, i) => `<b>${HURUF[i]}.</b> ${esc(o)}`).join('\n');
  return `<b>${label} [${item.category}]</b>\n\n${esc(item.question)}\n\n${opts}`;
}

function keyboardFallback(nOpt) {
  const n = Math.min(Math.max(nOpt || 5, 2), 5);
  return {
    reply_markup: {
      inline_keyboard: [Array.from({ length: n }, (_, i) => ({ text: HURUF[i], callback_data: `lat:${i}` }))],
    },
  };
}

/**
 * Kirim 1 soal. sender = { quiz: (q,opts,extra)=>Promise<msg>, text: (html,extra)=>Promise<msg> }.
 * Mengembalikan { mode: 'quiz'|'fallback' }.
 */
async function kirimQuiz(sender, userId, chatId, item, kind) {
  const sessionId = db.createSession(userId, kind);
  const info = {
    userId, itemId: item.item_id, itemVersion: item.version,
    sessionId, kind, askedAt: Date.now(),
  };
  try {
    if (pakaiQuiz(item)) {
      const isTkp = item.category === 'TKP';
      const correctId = isTkp
        ? item.scores.indexOf(Math.max(...item.scores))
        : item.answer_idx;
      const msg = await sender.quiz(item.question, item.options, {
        is_anonymous: false,
        type: 'quiz',
        correct_option_id: correctId,
        explanation: (item.explanation || '').slice(0, QUIZ_EXPLANATION),
      });
      track(`poll:${msg.poll.id}`, info);
      return { mode: 'quiz' };
    }
    // Fallback: teks + tombol
    const msg = await sender.text(teksFallback(item, kind), keyboardFallback(item.options.length));
    track(`fb:${chatId}:${msg.message_id}`, info);
    return { mode: 'fallback' };
  } catch (e) {
    db.finishSession(sessionId);
    throw e;
  }
}

function catatJawaban(p, chosenIdx) {
  const item = db.getItem(p.itemId);
  if (!item) { db.finishSession(p.sessionId); return null; }
  const skor = db.skorSoal(item, chosenIdx);
  const benar = item.category === 'TKP' ? null : (chosenIdx === item.answer_idx ? 1 : 0);
  db.recordResponse({
    sessionId: p.sessionId, userId: p.userId,
    itemId: item.item_id, itemVersion: item.version,
    chosenIdx, correct: benar, score: skor,
    responseTimeMs: Date.now() - p.askedAt,
  });
  db.finishSession(p.sessionId);
  return { item, skor, benar };
}

/** Handler poll_answer (mode quiz) + lat: callback (mode fallback). Didaftarkan sekali. */
function registerPollHandler(bot) {
  bot.on('poll_answer', async (ctx) => {
    const pa = ctx.pollAnswer;
    const p = take(`poll:${pa.poll_id}`);
    if (!p || p.userId !== pa.user.id) return;
    catatJawaban(p, pa.option_ids[0]);
  });

  bot.action(/^lat:(\d)$/, async (ctx) => {
    const key = `fb:${ctx.chat.id}:${ctx.callbackQuery.message.message_id}`;
    const p = take(key);
    if (!p) { await ctx.answerCbQuery('Soal kedaluwarsa.'); return; }
    if (p.userId !== ctx.from.id) { await ctx.answerCbQuery('Bukan soalmu.'); return; }
    await ctx.answerCbQuery();
    const hasil = catatJawaban(p, Number(ctx.match[1]));
    if (!hasil) return;
    try { await ctx.editMessageReplyMarkup({ inline_keyboard: [] }); } catch { /* abaikan */ }
    const { item, skor, benar } = hasil;
    await ctx.replyWithHTML(
      benar
        ? `<b>Benar!</b> +${skor}`
        : `<b>Kurang tepat.</b> Jawaban: <b>${HURUF[item.answer_idx]}</b>\n${esc(item.explanation || '')}`
    );
  });
}

module.exports = { track, take, kirimQuiz, registerPollHandler, pakaiQuiz };
