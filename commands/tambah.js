'use strict';
/**
 * /tambah — alur percakapan untuk admin menambah soal ke bank.
 * Khusus admin (ADMIN_CHAT_IDS). Soal tersimpan ke data/<kategori>.json
 * dan langsung bisa dipakai tanpa restart (bank.reload()).
 */
const fs = require('fs');
const path = require('path');
const bot = require('../bot');
const bank = require('../bank');
const { HURUF } = require('./_shared');

const admins = (process.env.ADMIN_CHAT_IDS || '').split(',').map((s) => s.trim()).filter(Boolean);
const isAdmin = (id) => admins.includes(String(id));

// userId -> { step, draft }
const alur = new Map();

function adminSaja(ctx) {
  if (!isAdmin(ctx.from.id)) {
    ctx.reply('Perintah ini khusus admin.');
    return false;
  }
  return true;
}

bot.command('tambah', (ctx) => {
  if (!adminSaja(ctx)) return;
  alur.set(String(ctx.from.id), { step: 'kategori', draft: {} });
  ctx.reply('Tambah soal baru.\nPilih kategori:', {
    reply_markup: { inline_keyboard: [[{ text: 'TWK', callback_data: 'tambah:twk' }, { text: 'TIU', callback_data: 'tambah:tiu' }, { text: 'TKP', callback_data: 'tambah:tkp' }]] },
  });
});

bot.action(/^tambah:(twk|tiu|tkp)$/, async (ctx) => {
  const st = alur.get(String(ctx.from.id));
  if (!st) return ctx.answerCbQuery();
  await ctx.answerCbQuery();
  st.draft.category = ctx.match[1].toUpperCase();
  st.step = 'soal';
  await ctx.reply(`Kategori: ${st.draft.category}\nKirim teks soalnya (maks 300 karakter):`);
});

bot.on('text', async (ctx, next) => {
  const st = alur.get(String(ctx.from.id));
  if (!st || !isAdmin(ctx.from.id)) return next();
  const t = ctx.message.text.trim();
  const d = st.draft;

  if (t.startsWith('/')) { alur.delete(String(ctx.from.id)); return next(); }

  if (st.step === 'soal') {
    if (t.length > 300) { await ctx.reply('Terlalu panjang (>300 char). Kirim ulang:'); return; }
    d.question = t; st.step = 'opsi';
    await ctx.reply('Kirim 5 opsi jawaban, SATU BARIS per opsi (tanpa huruf A-E):');
  } else if (st.step === 'opsi') {
    const ops = t.split('\n').map((s) => s.trim()).filter(Boolean);
    if (ops.length < 4 || ops.length > 5) { await ctx.reply(`Dapat ${ops.length} opsi — harus 4 atau 5 baris. Kirim ulang:`); return; }
    d.options = ops; st.step = 'jawaban';
    await ctx.reply(`Opsi diterima (${ops.length}). Jawaban benar yang mana? Balas dengan huruf: ${HURUF.slice(0, ops.length).join('/')}`);
  } else if (st.step === 'jawaban') {
    const idx = HURUF.indexOf(t.toUpperCase());
    if (idx < 0 || idx >= d.options.length) { await ctx.reply('Huruf tidak valid. Coba lagi:'); return; }
    d.answer = idx;
    if (d.category === 'TKP') {
      st.step = 'skor';
      await ctx.reply('Ini soal TKP. Kirim bobot tiap opsi (5 angka 1-5, urutan A-E, pisahkan spasi).\nContoh: 5 3 4 2 1');
    } else {
      st.step = 'penjelasan';
      await ctx.reply('Kirim penjelasan/pembahasan (maks 200 karakter, boleh kosong dengan "-"):');
    }
  } else if (st.step === 'skor') {
    const nums = t.split(/[\s,]+/).map(Number);
    if (nums.length !== d.options.length || nums.some((n) => ![1, 2, 3, 4, 5].includes(n))) {
      await ctx.reply('Format salah. Kirim 5 angka 1-5, contoh: 5 3 4 2 1'); return;
    }
    d.scores = nums; st.step = 'penjelasan';
    await ctx.reply('Kirim penjelasan/pembahasan (maks 200 karakter, boleh kosong dengan "-"):');
  } else if (st.step === 'penjelasan') {
    d.explanation = t === '-' ? '' : t.slice(0, 200);
    st.step = 'konfirmasi';
    const ringkas = `*Konfirmasi soal baru*\n[${d.category}] ${d.question}\n` +
      d.options.map((o, i) => `${HURUF[i]}. ${o}${i === d.answer ? ' <-- benar' : ''}`).join('\n') +
      (d.scores ? `\nBobot: ${d.scores.join(' ')}` : '') +
      (d.explanation ? `\n\n_${d.explanation}_` : '');
    await ctx.replyWithMarkdown(ringkas, {
      reply_markup: { inline_keyboard: [[{ text: 'Simpan', callback_data: 'tambah:ok' }, { text: 'Batal', callback_data: 'tambah:no' }]] },
    });
  }
});

bot.action(/^tambah:(ok|no)$/, async (ctx) => {
  const key = String(ctx.from.id);
  const st = alur.get(key);
  await ctx.answerCbQuery();
  if (!st) return;
  alur.delete(key);
  if (ctx.match[1] === 'no') { await ctx.reply('Dibatalkan.'); return; }
  const d = st.draft;
  const file = path.join(__dirname, '..', 'data', `${d.category.toLowerCase()}.json`);
  try {
    const arr = JSON.parse(fs.readFileSync(file, 'utf8'));
    const soal = {
      id: `${d.category.toLowerCase()}-${String(arr.length + 1).padStart(3, '0')}-${Date.now().toString(36)}`,
      category: d.category, question: d.question, options: d.options,
      answer: d.answer, explanation: d.explanation || '',
    };
    if (d.scores) soal.scores = d.scores;
    arr.push(soal);
    fs.writeFileSync(file, JSON.stringify(arr, null, 2) + '\n');
    bank.reload();
    await ctx.reply(`Soal tersimpan (${soal.id}). Bank ${d.category} sekarang ${arr.length} soal.`);
  } catch (e) {
    await ctx.reply('Gagal menyimpan: ' + e.message);
  }
});
