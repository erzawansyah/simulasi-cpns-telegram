'use strict';
/**
 * simulasi.js — /simulasi, /simulasi_full, /batal, /skor, /riwayat.
 *
 * v1.1:
 * - /simulasi: paket 10 soal, GRATIS, MAKS 1x/minggu (rolling 7 hari).
 *   Rekap TANPA badge passing grade.
 * - /simulasi_full: paket 110 soal (30/35/45), PREMIUM (payment menyusul).
 *   Rekap DENGAN badge LULUS/TIDAK vs passing grade 65/80/166.
 * Jawab via inline keyboard; timer proporsional 72 detik/soal.
 */
const bot = require('../bot');
const db = require('../db');
const quiz = require('../quiz');
const { needRegister } = require('./_shared');
const { HURUF, esc, fmtSisa, fmtTanggal } = require('../util');

const MINGGU_MS = 7 * 24 * 3600 * 1000;

function soalKeyboard(item) {
  return {
    reply_markup: {
      inline_keyboard: item.options.map((opt, i) => [
        { text: `${HURUF[i]}. ${String(opt).slice(0, 40)}`, callback_data: `sim:${i}` },
      ]),
    },
  };
}

function teksSoal(item, idx, total, sisaDetik) {
  return (
    `<b>Soal ${idx + 1}/${total}</b> [${item.category}]  |  Sisa waktu: ${fmtSisa(sisaDetik)}\n\n` +
    `${esc(item.question)}`
  );
}

async function kirimSoalBerikut(ctx, userId) {
  const s = quiz.get(userId);
  if (!s) return;
  if (quiz.habis(s)) return akhiri(ctx, userId, null, 'Waktu Habis!');
  const item = s.questions[s.idx];
  await ctx.replyWithHTML(teksSoal(item, s.idx, s.questions.length, quiz.sisaDetik(s)), soalKeyboard(item));
}

/** Simpan jawaban sesi ke DB (dipakai saat selesai & batal). */
function simpanJawaban(s) {
  for (const a of s.answers) {
    db.recordResponse({
      sessionId: s.dbSessionId, userId: s.userId,
      itemId: a.item.item_id, itemVersion: a.item.version,
      chosenIdx: a.chosenIdx,
      correct: a.benar == null ? null : (a.benar ? 1 : 0),
      score: a.skor, responseTimeMs: a.responseTimeMs,
    });
  }
}

async function akhiri(ctxOrBot, userId, chatId, judul = 'Hasil Simulasi', withBadges = false) {
  const s = quiz.get(userId);
  if (!s) return;
  const r = quiz.rekap(s);
  simpanJawaban(s);
  db.saveSimulationResult(s.dbSessionId, {
    twk: r.per.TWK.skor, tiu: r.per.TIU.skor, tkp: r.per.TKP.skor, total: r.total,
    passTwk: r.passTwk, passTiu: r.passTiu, passTkp: r.passTkp,
  });
  db.finishSession(s.dbSessionId);
  quiz.selesai(userId);

  const kirim = chatId
    ? (t, o) => ctxOrBot.telegram.sendMessage(chatId, t, o)
    : (t, o) => ctxOrBot.replyWithHTML(t, o);
  const p = r.per;
  let teks =
    `<b>${esc(judul)}</b>\n` +
    `Dijawab: ${r.dijawab}/${r.dari} soal\n\n`;
  if (withBadges) {
    const badge = (lulus, pg) => (lulus ? `LULUS (≥${pg})` : `BELUM (≥${pg})`);
    teks +=
      `TWK: <b>${p.TWK.skor}</b> (${p.TWK.benar}/${p.TWK.total} benar) — ${badge(r.passTwk, r.passGrade.TWK)}\n` +
      `TIU: <b>${p.TIU.skor}</b> (${p.TIU.benar}/${p.TIU.total} benar) — ${badge(r.passTiu, r.passGrade.TIU)}\n` +
      `TKP: <b>${p.TKP.skor}</b> — ${badge(r.passTkp, r.passGrade.TKP)}\n\n` +
      `<b>TOTAL: ${r.total}/${r.maks} (${r.persen}%)</b>\n` +
      (r.lulus ? 'Selamat! Kamu <b>LULUS</b> passing grade SKD.' : 'Belum lulus passing grade. Terus berlatih!');
  } else {
    teks +=
      `TWK: <b>${p.TWK.skor}</b> (${p.TWK.benar}/${p.TWK.total} benar)\n` +
      `TIU: <b>${p.TIU.skor}</b> (${p.TIU.benar}/${p.TIU.total} benar)\n` +
      `TKP: <b>${p.TKP.skor}</b>\n\n` +
      `<b>TOTAL: ${r.total}/${r.maks} (${r.persen}%)</b>\n` +
      'Mau uji passing grade SKD beneran? Coba /simulasi_full (110 soal).';
  }
  await kirim(teks, {});
  db.logEvent('simulasi_selesai', userId, chatId || userId, { total: r.total, lulus: r.lulus, kind: s.kind });
}

async function mulaiSimulasi(ctx, { n, kind, comp, withBadges, label }) {
  const userId = ctx.from.id;
  if (quiz.get(userId)) return ctx.reply('Simulasi sedang berjalan. Selesaikan atau /batal dulu.');

  if (kind === 'simulasi') {
    const last = db.lastSimulasiAt(userId);
    if (last && Date.now() - last < MINGGU_MS) {
      const reset = fmtTanggal(last + MINGGU_MS);
      return ctx.replyWithHTML(
        'Jatah <b>/simulasi gratis minggu ini sudah kamu pakai</b>.\n' +
        `Bisa dipakai lagi setelah <b>${esc(reset)}</b>.\n\n` +
        'Mau yang langsung? /simulasi_full — paket 110 soal ala SKD (premium).'
      );
    }
  }

  const questions = db.paketSimulasi(n, userId, comp);
  if (!questions.length) {
    return ctx.reply(
      'Tidak ada soal tersedia untukmu saat ini — ' +
      'semua butir di bank sudah kamu jawab (aturan anti-ulang) atau bank kosong. Tunggu update bank soal ya!'
    );
  }
  if (questions.length < n) {
    await ctx.reply(
      `Catatan: bank soal belum cukup untuk paket ${n} soal penuh ` +
      `(tersedia ${questions.length} soal yang belum kamu jawab). Simulasi jalan dengan soal yang ada.`
    );
  }
  const sessionId = db.createSession(userId, kind);
  const s = quiz.mulai(userId, questions, sessionId);
  s.kind = kind;
  const menit = Math.round((questions.length * quiz.DURASI_PER_SOAL_DETIK) / 60);
  await ctx.replyWithHTML(
    `<b>${esc(label)} dimulai!</b> ${questions.length} soal, waktu ${menit} menit.\n` +
    'Jawab dengan menekan tombol A–E.' +
    (withBadges ? ' Passing grade: TWK ≥ 65, TIU ≥ 80, TKP ≥ 166.' : '')
  );
  quiz.pasangTimer(userId, (uid) => akhiri(bot, uid, ctx.chat.id, 'Waktu Habis! Hasil Simulasi', withBadges));
  await kirimSoalBerikut(ctx, userId);
}

bot.command('simulasi', async (ctx) => {
  if (!needRegister(ctx)) return;
  const arg = (ctx.message.text.split(/\s+/)[1] || '').trim();
  if (arg === '110' || arg === 'full') {
    return ctx.reply('Paket 110 soal sekarang lewat /simulasi_full ya.');
  }
  await mulaiSimulasi(ctx, { n: 10, kind: 'simulasi', comp: null, withBadges: false, label: 'Simulasi (10 soal)' });
});

bot.command('simulasi_full', async (ctx) => {
  if (!needRegister(ctx)) return;
  const u = db.getUser(ctx.from.id);
  if (!u.premium) {
    db.logEvent('simulasi_full_locked', ctx.from.id, ctx.chat.id, {});
    return ctx.replyWithHTML(
      '<b>Simulasi Full</b> — paket 110 soal (30 TWK / 35 TIU / 45 TKP) ala SKD asli.\n\n' +
      'Ini fitur <b>premium</b>. Sistem pembayaran masih disiapkan — ' +
      'hubungi admin kalau mau akses awal.\n\n' +
      'Sementara itu, /simulasi (10 soal, gratis, 1x/minggu) tetap bisa dipakai.'
    );
  }
  await mulaiSimulasi(ctx, {
    n: 110, kind: 'simulasi_full',
    comp: { TWK: 30, TIU: 35, TKP: 45 },
    withBadges: true, label: 'Simulasi Full (110 soal)',
  });
});

bot.command('batal', (ctx) => {
  const userId = ctx.from.id;
  const s = quiz.get(userId);
  if (!s) {
    const sumbang = require('./sumbang');
    if (sumbang.batalkan(userId)) return ctx.reply('Alur pengisian soal dibatalkan.');
    const akun = require('./akun');
    if (akun.batalkanDemo(userId)) return ctx.reply('Pengisian data dibatalkan.');
    return ctx.reply('Tidak ada simulasi berjalan.');
  }
  simpanJawaban(s);
  db.finishSession(s.dbSessionId);
  quiz.selesai(userId);
  db.logEvent('simulasi_batal', userId, ctx.chat.id, { dijawab: s.answers.length });
  ctx.reply(`Simulasi dibatalkan. ${s.answers.length} jawaban yang sudah masuk tetap tercatat.`);
});

bot.action(/^sim:(\d)$/, async (ctx) => {
  const userId = ctx.from.id;
  const s = quiz.get(userId);
  if (!s) { await ctx.answerCbQuery('Simulasi tidak aktif.'); return; }
  if (s.userId !== userId) { await ctx.answerCbQuery('Bukan sesimu.'); return; }
  await ctx.answerCbQuery();
  const withBadges = s.kind === 'simulasi_full';
  if (quiz.habis(s)) return akhiri(ctx, userId, null, 'Waktu Habis! Hasil Simulasi', withBadges);

  const chosen = Number(ctx.match[1]);
  const hasil = quiz.jawab(userId, chosen, (item, c) => db.skorSoal(item, c));
  if (!hasil) return;
  const { item, skor, benar } = hasil;

  try { await ctx.editMessageReplyMarkup({ inline_keyboard: [] }); } catch { /* abaikan */ }
  const kunci = item.category === 'TKP'
    ? ` (bobot max ${Math.max(...item.scores)})`
    : '';
  await ctx.replyWithHTML(
    benar
      ? `<b>Benar!</b> +${skor}`
      : `<b>Kurang tepat.</b> Jawaban: <b>${HURUF[item.answer_idx]}</b>${esc(kunci)}\n${esc(item.explanation || '')}`
  );
  if (hasil.selesai) {
    await akhiri(ctx, userId, null, 'Hasil Simulasi', withBadges);
  } else {
    await kirimSoalBerikut(ctx, userId);
  }
});

bot.command('skor', (ctx) => {
  const u = db.getUser(ctx.from.id);
  if (!u) return ctx.reply('Ketik /start dulu ya.');
  const s = db.getUserStats(ctx.from.id);
  const barisKat = s.perCat.map((c) =>
    c.cat === 'TKP'
      ? `TKP: ${c.poin} poin (${c.n} soal)`
      : `${c.cat}: ${c.benar}/${c.n} benar`
  ).join('\n');
  ctx.replyWithHTML(
    '<b>Skor Kamu</b>\n\n' +
    `Latihan: ${s.latihanBenar}/${s.latihan} benar\n` +
    (barisKat ? barisKat + '\n' : '') +
    `Soal harian: ${s.harian} dijawab\n` +
    `Simulasi: ${s.simulasi}x — rata-rata ${Math.round(s.simulasiRata)}, terbaik ${s.simulasiMaks}, lulus ${s.simulasiLulus}x`
  );
});

bot.command('riwayat', (ctx) => {
  const rows = db.getHistory(ctx.from.id, 5);
  if (!rows.length) return ctx.reply('Belum ada riwayat.');
  const lines = rows.map((r, i) => {
    const t = fmtTanggal(r.started_at);
    if (r.kind === 'simulasi' || r.kind === 'simulasi_full') {
      const label = r.kind === 'simulasi_full' ? 'Simulasi Full' : 'Simulasi';
      return `${i + 1}. [${t}] ${label}: ${r.total} poin ${r.lulus ? '(LULUS)' : ''}`;
    }
    const label = r.kind === 'harian' ? 'Harian' : 'Latihan';
    return `${i + 1}. [${t}] ${label}: ${r.n_resp} soal dijawab`;
  });
  ctx.reply('Riwayat terakhir:\n' + lines.join('\n'));
});
