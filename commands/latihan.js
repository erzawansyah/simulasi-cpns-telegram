'use strict';
/**
 * /latihan [twk|tiu|tkp] — 1 soal acak via native quiz Telegram.
 * Native quiz otomatis menilai + menampilkan pembahasan (explanation).
 */
const bot = require('../bot');
const store = require('../store');
const bank = require('../bank');
const { needRegister } = require('./_shared');

// pollId -> { userId, q }
const pending = new Map();

bot.command('latihan', async (ctx) => {
  if (!needRegister(ctx)) return;
  const arg = (ctx.message.text.split(/\s+/)[1] || '').toLowerCase();
  const cat = ['twk', 'tiu', 'tkp'].includes(arg) ? arg : null;
  const pool = cat ? bank.byCat(cat) : bank.all();
  if (!pool.length) return ctx.reply('Bank soal kosong.');
  const q = pool[Math.floor(Math.random() * pool.length)];
  try {
    const msg = await ctx.replyWithQuiz(q.question, q.options, {
      is_anonymous: false,
      correct_option_id: q.answer,
      explanation: (q.explanation || '').slice(0, 200),
    });
    pending.set(msg.poll.id, { userId: ctx.from.id, q });
    setTimeout(() => pending.delete(msg.poll.id), 10 * 60 * 1000);
  } catch (e) {
    ctx.reply('Gagal mengirim soal: ' + e.message);
  }
});

bot.on('poll_answer', (ctx) => {
  const pa = ctx.pollAnswer;
  const p = pending.get(pa.poll_id);
  if (!p || p.userId !== pa.user.id) return;
  pending.delete(pa.poll_id);
  const chosen = pa.option_ids[0];
  const benar = chosen === p.q.answer;
  const skor = bank.skorSoal(p.q, chosen);
  store.update(pa.user.id, (u) => {
    u.stats.latihan += 1;
    if (benar) u.stats.latihanBenar += 1;
    const k = p.q.category.toLowerCase() + 'Total';
    const kb = p.q.category.toLowerCase() + 'Benar';
    if (p.q.category === 'TKP') { u.stats.tkpPoin += skor; u.stats.tkpTotal += 1; }
    else { u.stats[k] += 1; if (benar) u.stats[kb] += 1; }
  });
  store.pushHistory(pa.user.id, { jenis: 'latihan', category: p.q.category, benar, skor });
});
