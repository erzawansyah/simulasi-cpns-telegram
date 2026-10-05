'use strict';
/**
 * itemFlow.js — alur percakapan terpandu untuk membuat butir soal.
 * Dipakai /sumbang (user -> submissions pending) dan /tambah (admin -> items langsung).
 *
 * Langkah: kategori -> soal -> opsi -> kunci/bobot -> pembahasan -> konfirmasi.
 * /batal membatalkan alur yang sedang berjalan.
 */
const db = require('./db');
const { validateItem } = require('./import');
const { newItemId, esc, HURUF } = require('./util');

// userId -> { step, data, mode }
const flows = new Map();

function hasFlow(userId) { return flows.has(userId); }

function batalkan(userId) {
  if (!flows.has(userId)) return false;
  flows.delete(userId);
  return true;
}

function startFlow(ctx, mode) {
  const userId = ctx.from.id;
  if (flows.has(userId)) return ctx.reply('Kamu masih dalam alur pengisian soal. Selesaikan atau /batal dulu.');
  flows.set(userId, { step: 'kategori', data: {}, mode });
  ctx.replyWithHTML(
    '<b>Buat Soal Baru</b> (langkah 1/5)\n\n' +
    'Kategori soal: ketik <b>TWK</b>, <b>TIU</b>, atau <b>TKP</b>.\n' +
    'Ketik /batal kapan aja untuk berhenti.'
  );
}

function previewSoal(d) {
  const lines = d.options.map((o, i) => `${HURUF[i]}. ${esc(o)}`).join('\n');
  const kunci = d.category === 'TKP'
    ? `Bobot: ${d.scores.join(', ')}`
    : `Kunci: ${HURUF[d.answer_idx]}`;
  return `<b>[${d.category}]</b> ${esc(d.question)}\n\n${lines}\n\n${esc(kunci)}\nPembahasan: ${esc(d.explanation || '-')}`;
}

async function handleText(ctx, next) {
  const text = ctx.message.text || '';
  if (text.startsWith('/')) return next(); // perintah ditangani handler lain
  const userId = ctx.from.id;
  const f = flows.get(userId);
  if (!f) return next();
  const d = f.data;

  try {
    if (f.step === 'kategori') {
      const cat = text.trim().toUpperCase();
      if (!['TWK', 'TIU', 'TKP'].includes(cat)) return ctx.reply('Ketik TWK, TIU, atau TKP ya.');
      d.category = cat;
      f.step = 'soal';
      return ctx.reply('Langkah 2/5 — Ketik teks soal (maks 300 karakter).');
    }
    if (f.step === 'soal') {
      if (!text.trim()) return ctx.reply('Soal tidak boleh kosong.');
      if (text.length > 1000) return ctx.reply(`Soal kepanjangan (${text.length}/1000). Persingkat ya.`);
      d.question = text.trim();
      f.step = 'opsi';
      return ctx.replyWithHTML(
        'Langkah 3/5 — Kirim <b>4–5 opsi jawaban</b>, satu opsi per baris (maks 300 karakter per opsi).\n' +
        'Contoh:\nPancasila\nUUD 1945\nBhinneka Tunggal Ika\nNKRI'
      );
    }
    if (f.step === 'opsi') {
      const opts = text.split('\n').map((s) => s.trim()).filter(Boolean);
      if (opts.length < 4 || opts.length > 5) return ctx.reply(`Harus 4–5 opsi, kamu mengirim ${opts.length}. Coba lagi.`);
      if (opts.some((o) => o.length > 300)) return ctx.reply('Ada opsi >300 karakter. Persingkat ya.');
      d.options = opts;
      f.step = 'kunci';
      if (d.category === 'TKP') {
        return ctx.replyWithHTML(
          `Langkah 4/5 — Kirim <b>bobot tiap opsi</b> berurutan (A–${HURUF[opts.length - 1]}), pisahkan koma.\n` +
          'Contoh: <code>5,3,1,2,4</code> (A=5, B=3, dst.)'
        );
      }
      return ctx.reply(`Langkah 4/5 — Opsi mana yang benar? Ketik nomornya (1–${opts.length}).`);
    }
    if (f.step === 'kunci') {
      if (d.category === 'TKP') {
        const scores = text.split(',').map((s) => Number(s.trim()));
        if (scores.length !== d.options.length || scores.some((s) => !Number.isInteger(s) || s < 1 || s > 5)) {
          return ctx.reply(`Bobot harus ${d.options.length} angka 1–5 dipisah koma. Contoh: 5,3,1,2,4`);
        }
        d.scores = scores;
        d.answer_idx = scores.indexOf(Math.max(...scores));
      } else {
        const n = Number(text.trim());
        if (!Number.isInteger(n) || n < 1 || n > d.options.length) {
          return ctx.reply(`Ketik angka 1–${d.options.length}.`);
        }
        d.answer_idx = n - 1;
      }
      f.step = 'pembahasan';
      return ctx.reply('Langkah 5/5 — Ketik pembahasan (maks 200 karakter), atau /lewati.');
    }
    if (f.step === 'pembahasan') {
      if (text.trim().toLowerCase() === '/lewati') d.explanation = '';
      else {
        if (text.length > 500) return ctx.reply(`Pembahasan kepanjangan (${text.length}/500).`);
        d.explanation = text.trim();
      }
      const errs = validateItem({ ...d, difficulty: null }, 'soal');
      if (errs.length) {
        flows.delete(userId);
        return ctx.reply('Validasi gagal:\n' + errs.join('\n') + '\n\nAlur dibatalkan, silakan mulai lagi.');
      }
      f.step = 'konfirmasi';
      const tujuan = f.mode === 'tambah' ? 'langsung masuk bank soal.' : 'masuk antrean moderasi admin.';
      return ctx.replyWithHTML(
        '<b>Pratinjau soal:</b>\n\n' + previewSoal(d) +
        `\n\nSoal ini akan ${tujuan}`,
        { reply_markup: { inline_keyboard: [[{ text: 'Kirim', callback_data: 'flow:ok' }, { text: 'Batal', callback_data: 'flow:batal' }]] } }
      );
    }
  } catch (e) {
    console.error('[itemFlow] error:', e.message);
    ctx.reply('Terjadi kesalahan, alur dibatalkan.');
    flows.delete(userId);
  }
}

function registerFlowHandler(bot) {
  bot.on('text', handleText);

  bot.action('flow:ok', async (ctx) => {
    const userId = ctx.from.id;
    const f = flows.get(userId);
    if (!f || f.step !== 'konfirmasi') { await ctx.answerCbQuery('Alur tidak aktif.'); return; }
    await ctx.answerCbQuery();
    flows.delete(userId);
    try { await ctx.editMessageReplyMarkup({ inline_keyboard: [] }); } catch { /* abaikan */ }
    const d = f.data;
    if (f.mode === 'tambah') {
      const item = db.addItem({
        item_id: newItemId(d.category), category: d.category,
        question: d.question, options: d.options, answer_idx: d.answer_idx,
        scores: d.scores || null, explanation: d.explanation || null,
        active: 1, version: 1, created_by: userId,
      });
      db.logEvent('tambah_soal', userId, ctx.chat.id, { item_id: item.item_id });
      await ctx.replyWithHTML(`Soal <code>${esc(item.item_id)}</code> masuk bank soal dan langsung aktif.`);
    } else {
      const sid = db.addSubmission({ user_id: userId, ...d });
      db.logEvent('sumbang_soal', userId, ctx.chat.id, { submission_id: sid });
      await ctx.replyWithHTML(
        'Terima kasih! Sumbangan soalmu masuk <b>antrean moderasi</b> admin.\n' +
        'Kamu akan diberi tahu begitu ada keputusan.'
      );
      // Notifikasi ke admin + grup log
      const { notifyAdmin } = require('./util');
      const uname = ctx.from.username ? '@' + ctx.from.username : (ctx.from.first_name || userId);
      notifyAdmin(bot, `📥 <b>Sumbangan soal baru</b> #${sid}\nDari: ${esc(uname)} (${userId})\nKategori: <b>${esc(d.category)}</b>\nKetik /moderasi untuk kurasi.`);
    }
  });

  bot.action('flow:batal', async (ctx) => {
    await ctx.answerCbQuery('Dibatalkan');
    flows.delete(ctx.from.id);
    try { await ctx.editMessageReplyMarkup({ inline_keyboard: [] }); } catch { /* abaikan */ }
  });
}

module.exports = { startFlow, batalkan, hasFlow, registerFlowHandler };
