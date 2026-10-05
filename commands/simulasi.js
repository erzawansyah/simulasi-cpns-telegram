'use strict';
/**
 * /simulasi — paket 10 soal (3 TWK + 3 TIU + 4 TKP), timer 12 menit,
 * jawaban via inline keyboard, nilai otomatis + rekap ala SKD.
 */
const bot = require('../bot');
const store = require('../store');
const quiz = require('../quiz');
const { needRegister, fmtSisa, HURUF, soalKeyboard, teksSoal } = require('./_shared');

const JUMLAH_SOAL = 10;

async function kirimSoal(ctx, userId) {
  const s = quiz.get(userId);
  if (!s) return;
  if (quiz.habis(s)) return akhiri(ctx, userId, null, 'Waktu Habis!');
  const q = s.questions[s.idx];
  await ctx.reply(teksSoal(q, s.idx, s.questions.length, quiz.sisaDetik(s)), soalKeyboard(q));
}

async function akhiri(ctxOrTelegram, userId, chatId, judul = 'Hasil Simulasi') {
  const s = quiz.get(userId);
  if (!s) return;
  const r = quiz.rekap(s);
  quiz.selesai(userId);
  const kirim = chatId
    ? (t, o) => ctxOrTelegram.telegram.sendMessage(chatId, t, o)
    : (t, o) => ctxOrTelegram.reply(t, o);
  const p = r.per;
  const teks =
    `*${judul}*\nDijawab: ${r.dijawab}/${r.dari} soal\n\n` +
    `TWK: ${p.TWK.skor} poin (${p.TWK.benar}/${p.TWK.total} benar)\n` +
    `TIU: ${p.TIU.skor} poin (${p.TIU.benar}/${p.TIU.total} benar)\n` +
    `TKP: ${p.TKP.skor} poin\n\n` +
    `*TOTAL: ${r.total}/${r.maks} (${r.persen}%)*`;
  await kirim(teks, { parse_mode: 'Markdown' });
  store.update(userId, (u) => {
    u.stats.simulasi += 1;
    u.stats.simulasiSkor.push(r.total);
    for (const a of s.answers) {
      const kl = a.category.toLowerCase() + 'Total', kb = a.category.toLowerCase() + 'Benar';
      if (a.category === 'TKP') { u.stats.tkpPoin += a.skor; u.stats.tkpTotal += 1; }
      else { u.stats[kl] += 1; if (a.benar) u.stats[kb] += 1; }
    }
  });
  store.pushHistory(userId, { jenis: 'simulasi', total: r.total, maks: r.maks, persen: r.persen, dijawab: r.dijawab });
}

bot.command('simulasi', async (ctx) => {
  if (!needRegister(ctx)) return;
  if (quiz.get(ctx.from.id)) return ctx.reply('Simulasi sedang berjalan. Selesaikan atau /batal dulu.');
  const s = quiz.mulai(ctx.from.id, JUMLAH_SOAL);
  if (!s) return ctx.reply('Bank soal kosong.');
  await ctx.reply(`Simulasi dimulai: ${JUMLAH_SOAL} soal, waktu ${JUMLAH_SOAL * quiz.DURASI_PER_SOAL_DETIK / 60} menit.\nJawab dengan menekan tombol A-E.`);
  await kirimSoal(ctx, ctx.from.id);
});

bot.command('batal', (ctx) => {
  if (!quiz.get(ctx.from.id)) return ctx.reply('Tidak ada simulasi berjalan.');
  quiz.selesai(ctx.from.id);
  ctx.reply('Simulasi dibatalkan.');
});

bot.action(/^sim:(\d)$/, async (ctx) => {
  const userId = ctx.from.id;
  const s = quiz.get(userId);
  if (!s) { await ctx.answerCbQuery('Simulasi tidak aktif.'); return; }
  await ctx.answerCbQuery();
  const chosen = Number(ctx.match[1]);
  const hasil = quiz.jawab(userId, chosen);
  if (!hasil) return;
  const { q, skor } = hasil;
  const benar = chosen === q.answer;
  // tandai jawaban di pesan soal yg baru saja dijawab
  try {
    await ctx.editMessageReplyMarkup({ inline_keyboard: [] });
  } catch { /* abaikan */ }
  await ctx.reply(benar ? `Benar! +${skor}` : `Kurang tepat. Jawaban: ${HURUF[q.answer]}${q.category === 'TKP' ? ` (bobot ${q.scores[q.answer]})` : ''}\n${q.explanation || ''}`);
  if (hasil.selesai) {
    await akhiri(ctx, userId);
  } else {
    await kirimSoal(ctx, userId);
  }
});

bot.command('skor', (ctx) => {
  const u = store.get(ctx.from.id);
  if (!u) return ctx.reply('Ketik /start dulu ya.');
  const s = u.stats;
  const avg = s.simulasiSkor.length
    ? (s.simulasiSkor.reduce((a, b) => a + b, 0) / s.simulasiSkor.length).toFixed(1) : '-';
  ctx.replyWithMarkdown(
    `*Skor Kamu*\n\nLatihan: ${s.latihanBenar}/${s.latihan} benar\n` +
    `TWK: ${s.twkBenar}/${s.twkTotal} | TIU: ${s.tiuBenar}/${s.tiuTotal} | TKP: ${s.tkpPoin} poin\n` +
    `Simulasi: ${s.simulasi}x, rata-rata skor: ${avg}`
  );
});

bot.command('riwayat', (ctx) => {
  const u = store.get(ctx.from.id);
  if (!u || !u.history.length) return ctx.reply('Belum ada riwayat.');
  const lines = u.history.slice(0, 5).map((h, i) => {
    const t = new Date(h.at).toLocaleDateString('id-ID');
    return h.jenis === 'simulasi'
      ? `${i + 1}. [${t}] Simulasi: ${h.total}/${h.maks} (${h.persen}%)`
      : `${i + 1}. [${t}] Latihan ${h.category}: ${h.benar ? 'benar' : 'salah'} (+${h.skor})`;
  });
  ctx.reply('Riwayat terakhir:\n' + lines.join('\n'));
});
