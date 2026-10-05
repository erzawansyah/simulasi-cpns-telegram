'use strict';
/**
 * admin.js — command khusus admin (cek ADMIN_CHAT_IDS):
 * /tambah, /impor, /moderasi, /ekspor, /nonaktif, /premium, /stats, /post
 */
const fs = require('fs');
const path = require('path');
const os = require('os');
const bot = require('../bot');
const db = require('../db');
const { needAdmin } = require('./_shared');
const { startFlow } = require('../itemFlow');
const { parseJSON, parseCSV, validateBatch } = require('../import');
const { esc, HURUF, anonHash } = require('../util');

/* ---------- /tambah ---------- */
bot.command('tambah', (ctx) => {
  if (!needAdmin(ctx)) return;
  startFlow(ctx, 'tambah');
});

/* ---------- /impor ---------- */
// adminId -> true (menunggu file)
const menungguFile = new Map();
// adminId -> { items, errors }
const batchSiap = new Map();

bot.command('impor', (ctx) => {
  if (!needAdmin(ctx)) return;
  menungguFile.set(ctx.from.id, true);
  ctx.replyWithHTML(
    '<b>Impor Soal Massal</b>\n\n' +
    'Kirim file <b>.json</b> atau <b>.csv</b> sekarang (lihat template-soal.* untuk format).\n' +
    'File akan divalidasi dulu sebelum disimpan.'
  );
});

bot.on('document', async (ctx) => {
  const userId = ctx.from.id;
  if (!menungguFile.get(userId)) return;
  const { isAdmin } = require('../util');
  if (!isAdmin(userId)) return;
  menungguFile.delete(userId);
  const doc = ctx.message.document;
  const name = (doc.file_name || '').toLowerCase();
  const isJson = name.endsWith('.json'), isCsv = name.endsWith('.csv');
  if (!isJson && !isCsv) return ctx.reply('Format file harus .json atau .csv.');

  await ctx.reply('Mengunduh & memvalidasi file…');
  try {
    const link = await ctx.telegram.getFileLink(doc.file_id);
    const res = await fetch(link.href);
    if (!res.ok) throw new Error(`unduh gagal (HTTP ${res.status})`);
    const text = await res.text();
    const parsed = isJson ? parseJSON(text) : parseCSV(text);
    if (!parsed.ok) return ctx.reply('Gagal parse: ' + parsed.error);

    const existing = db.getDb().prepare('SELECT question FROM items').all().map((r) => r.question);
    const { ok, items, errors } = validateBatch(parsed.raw, () => existing);
    if (!ok) {
      const shown = errors.slice(0, 15).join('\n');
      const more = errors.length > 15 ? `\n…dan ${errors.length - 15} error lain.` : '';
      return ctx.replyWithHTML(`Validasi <b>gagal</b> (${errors.length} error):\n<code>${esc(shown)}${esc(more)}</code>\n\nPerbaiki file lalu kirim ulang via /impor.`);
    }
    batchSiap.set(userId, { items, fileName: doc.file_name });
    const prev = items.slice(0, 3).map((q, i) =>
      `${i + 1}. [${q.category}] ${q.question.slice(0, 80)}${q.question.length > 80 ? '…' : ''}`
    ).join('\n');
    await ctx.replyWithHTML(
      `<b>${items.length} butir valid.</b> Pratinjau:\n${esc(prev)}${items.length > 3 ? `\n…dan ${items.length - 3} lainnya` : ''}\n\nSimpan sebagai apa?`,
      {
        reply_markup: {
          inline_keyboard: [[
            { text: 'Aktifkan langsung', callback_data: 'impor:aktif' },
            { text: 'Simpan sbg draft', callback_data: 'impor:draft' },
          ], [{ text: 'Batal', callback_data: 'impor:batal' }]],
        },
      }
    );
  } catch (e) {
    console.error('[impor]', e);
    ctx.reply('Gagal memproses file: ' + e.message);
  }
});

async function simpanBatch(ctx, aktif) {
  const userId = ctx.from.id;
  const batch = batchSiap.get(userId);
  if (!batch) { await ctx.answerCbQuery('Batch kedaluwarsa.'); return; }
  await ctx.answerCbQuery();
  batchSiap.delete(userId);
  try { await ctx.editMessageReplyMarkup({ inline_keyboard: [] }); } catch { /* abaikan */ }
  const { newItemId } = require('../util');
  let n = 0;
  for (const q of batch.items) {
    db.addItem({
      item_id: newItemId(q.category), category: q.category,
      subcategory: q.subcategory || null, difficulty: q.difficulty || null,
      question: q.question, options: q.options, answer_idx: q.answer_idx,
      scores: q.scores || null, explanation: q.explanation || null,
      active: aktif ? 1 : 0, version: 1, created_by: userId,
    });
    n++;
  }
  db.logEvent('impor_soal', userId, ctx.chat.id, { count: n, aktif, file: batch.fileName });
  await ctx.reply(`${n} butir tersimpan (${aktif ? 'langsung aktif' : 'sebagai draft — aktifkan manual via DB'}).`);
}

bot.action('impor:aktif', (ctx) => simpanBatch(ctx, true));
bot.action('impor:draft', (ctx) => simpanBatch(ctx, false));
bot.action('impor:batal', async (ctx) => {
  await ctx.answerCbQuery('Dibatalkan');
  batchSiap.delete(ctx.from.id);
  try { await ctx.editMessageReplyMarkup({ inline_keyboard: [] }); } catch { /* abaikan */ }
});

/* ---------- /moderasi ---------- */
// adminId -> submissionId (menunggu catatan penolakan)
const menungguCatatan = new Map();

function teksSubmission(s) {
  const opts = s.options.map((o, i) => `${HURUF[i]}. ${o}`).join('\n');
  const kunci = s.category === 'TKP' ? `Bobot: ${s.scores.join(', ')}` : `Kunci: ${HURUF[s.answer_idx]}`;
  return `<b>[${s.category}]</b> dari user <code>${s.user_id}</code>\n${esc(s.question)}\n\n${esc(opts)}\n\n${esc(kunci)}\nPembahasan: ${esc(s.explanation || '-')}`;
}

async function tampilkanAntrean(ctx) {
  const pending = db.listPendingSubmissions(1);
  const sisa = db.countPendingSubmissions();
  if (!pending.length) return ctx.reply('Antrean moderasi kosong. Kerja bagus!');
  const s = pending[0];
  await ctx.replyWithHTML(
    `${teksSubmission(s)}\n\nAntrean: ${sisa} menunggu.`,
    {
      reply_markup: {
        inline_keyboard: [[
          { text: 'Setujui', callback_data: `mod:ok:${s.submission_id}` },
          { text: 'Tolak', callback_data: `mod:no:${s.submission_id}` },
        ], [{ text: 'Selesai', callback_data: 'mod:done' }]],
      },
    }
  );
}

bot.command('moderasi', async (ctx) => {
  if (!needAdmin(ctx)) return;
  await tampilkanAntrean(ctx);
});

bot.action(/^mod:ok:(\d+)$/, async (ctx) => {
  if (!require('../util').isAdmin(ctx.from.id)) { await ctx.answerCbQuery('Khusus admin.'); return; }
  const id = Number(ctx.match[1]);
  await ctx.answerCbQuery();
  const itemId = db.reviewSubmission(id, true, null, ctx.from.id);
  try { await ctx.editMessageReplyMarkup({ inline_keyboard: [] }); } catch { /* abaikan */ }
  if (!itemId) return ctx.reply('Submission tidak ditemukan / sudah diproses.');
  const sub = db.getSubmission(id);
  db.logEvent('moderasi_setuju', ctx.from.id, ctx.chat.id, { submission_id: id, item_id: itemId });
  // Notifikasi pengirim
  try {
    await bot.telegram.sendMessage(sub.user_id,
      `Kabar baik! Sumbangan soalmu <b>disetujui</b> admin dan masuk bank soal. Terima kasih atas kontribusinya!`,
      { parse_mode: 'HTML' });
  } catch { /* user mungkin block bot */ }
  await ctx.reply(`Disetujui → item ${itemId}.`);
  await tampilkanAntrean(ctx);
});

bot.action(/^mod:no:(\d+)$/, async (ctx) => {
  if (!require('../util').isAdmin(ctx.from.id)) { await ctx.answerCbQuery('Khusus admin.'); return; }
  const id = Number(ctx.match[1]);
  await ctx.answerCbQuery();
  menungguCatatan.set(ctx.from.id, id);
  try { await ctx.editMessageReplyMarkup({ inline_keyboard: [] }); } catch { /* abaikan */ }
  await ctx.reply('Ketik catatan penolakan untuk pengirim (atau /batalkan_tolak untuk batal).');
});

bot.command('batalkan_tolak', (ctx) => {
  menungguCatatan.delete(ctx.from.id);
  ctx.reply('Penolakan dibatalkan.');
});

bot.on('text', async (ctx, next) => {
  const userId = ctx.from.id;
  const sid = menungguCatatan.get(userId);
  if (!sid || (ctx.message.text || '').startsWith('/')) return next();
  const { isAdmin } = require('../util');
  if (!isAdmin(userId)) return next();
  menungguCatatan.delete(userId);
  const sub = db.getSubmission(sid);
  db.reviewSubmission(sid, false, ctx.message.text.slice(0, 500), userId);
  db.logEvent('moderasi_tolak', userId, ctx.chat.id, { submission_id: sid });
  try {
    await bot.telegram.sendMessage(sub.user_id,
      `<b>Sumbangan soalmu belum bisa disetujui.</b>\nCatatan admin: ${esc(ctx.message.text.slice(0, 500))}\n\n` +
      'Kamu boleh perbaiki lalu kirim lagi via /sumbang.',
      { parse_mode: 'HTML' });
  } catch { /* abaikan */ }
  await ctx.reply('Ditolak + pengirim diberi tahu.');
  await tampilkanAntrean(ctx);
});

bot.action('mod:done', async (ctx) => {
  await ctx.answerCbQuery();
  try { await ctx.editMessageReplyMarkup({ inline_keyboard: [] }); } catch { /* abaikan */ }
});

/* ---------- /ekspor ---------- */
function csvEscape(v) {
  const s = String(v ?? '');
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

bot.command('ekspor', async (ctx) => {
  if (!needAdmin(ctx)) return;
  const parts = ctx.message.text.split(/\s+/).slice(1).map((s) => s.toLowerCase());
  const jenis = parts.includes('butir') ? 'butir' : 'respons';
  const anon = !parts.includes('terbuka'); // default anonim
  const salt = 'cpns2027';
  const stamp = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const file = path.join(os.tmpdir(), `ekspor-${jenis}-${stamp}.csv`);

  let csv;
  if (jenis === 'butir') {
    const rows = db.getDb().prepare('SELECT * FROM items ORDER BY category, item_id').all();
    const head = 'item_id,category,subcategory,difficulty,question,options,answer_idx,scores,explanation,active,version,created_at';
    csv = head + '\n' + rows.map((r) =>
      [r.item_id, r.category, r.subcategory, r.difficulty, r.question, r.options, r.answer_idx, r.scores, r.explanation, r.active, r.version,
        new Date(r.created_at).toISOString()].map(csvEscape).join(',')
    ).join('\n');
  } else {
    const rows = db.getDb().prepare(`SELECT r.*, i.category FROM responses r
      LEFT JOIN items i ON i.item_id = r.item_id ORDER BY r.response_id`).all();
    const head = 'response_id,user_ref,item_id,item_version,category,chosen_idx,correct,score,response_time_ms,created_at';
    csv = head + '\n' + rows.map((r) => {
      const userRef = anon ? anonHash(r.user_id, salt) : r.user_id;
      return [r.response_id, userRef, r.item_id, r.item_version, r.category, r.chosen_idx, r.correct, r.score,
        r.response_time_ms, new Date(r.created_at).toISOString()].map(csvEscape).join(',');
    }).join('\n');
  }
  fs.writeFileSync(file, csv);
  db.logEvent('ekspor', ctx.from.id, ctx.chat.id, { jenis, anon, rows: csv.split('\n').length - 1 });
  await ctx.replyWithDocument(
    { source: file, filename: path.basename(file) },
    { caption: `Ekspor ${jenis} (${anon ? 'anonim' : 'terbuka'}) — siap dianalisis.` }
  );
  fs.unlink(file, () => {});
});

/* ---------- /nonaktif ---------- */
bot.command('nonaktif', (ctx) => {
  if (!needAdmin(ctx)) return;
  const id = (ctx.message.text.split(/\s+/)[1] || '').trim();
  if (!id) return ctx.reply('Pakai: /nonaktif <item_id>');
  const item = db.getItem(id);
  if (!item) return ctx.reply('Butir tidak ditemukan.');
  db.setItemActive(id, false);
  db.logEvent('nonaktif_butir', ctx.from.id, ctx.chat.id, { item_id: id });
  ctx.reply(`Butir ${id} dinonaktifkan. Data respons historis tetap tersimpan.`);
});

/* ---------- /premium ---------- */
bot.command('premium', (ctx) => {
  if (!needAdmin(ctx)) return;
  const parts = ctx.message.text.split(/\s+/).slice(1);
  const target = Number(parts[0]);
  if (!Number.isFinite(target)) return ctx.reply('Pakai: /premium <user_id> [0|1]');
  const val = parts[1] === '0' ? 0 : 1;
  const u = db.getUser(target);
  if (!u) return ctx.reply('User tidak ditemukan.');
  db.setPremium(target, val);
  db.logEvent('premium_set', ctx.from.id, ctx.chat.id, { target, val });
  ctx.reply(`Akses premium user ${target}: ${val ? 'AKTIF' : 'NONAKTIF'}.`);
});

/* ---------- /stats ---------- */
bot.command('stats', (ctx) => {
  if (!needAdmin(ctx)) return;
  const s = db.getGlobalStats();
  ctx.replyWithHTML(
    '📊 <b>Statistik Bot</b>\n\n' +
    `👥 User: <b>${s.totalUsers}</b> (terdaftar: ${s.registered})\n` +
    `⚡ Aktif: 7 hari <b>${s.active7d}</b> · 30 hari <b>${s.active30d}</b>\n` +
    `🚫 Memblokir bot: <b>${s.blocked}</b>\n` +
    `📬 Subscriber harian: <b>${s.subscribers}</b>\n\n` +
    `❓ Soal aktif: <b>${s.itemsActive}</b> (TWK ${s.itemsTwk} · TIU ${s.itemsTiu} · TKP ${s.itemsTkp})\n` +
    `✏️ Respons: <b>${s.responsesTotal}</b> (hari ini: ${s.responsesToday})\n` +
    `🎯 Simulasi selesai: <b>${s.simTotal}</b> (minggu ini: ${s.simWeek})\n` +
    `📥 Antrean moderasi: <b>${s.pending}</b>`
  );
});

/* ---------- /post ---------- */
// Broadcast ke channel (CHANNEL_ID). Pakai: /post <teks>  (HTML didukung)
bot.command('post', async (ctx) => {
  if (!needAdmin(ctx)) return;
  const channelId = (process.env.CHANNEL_ID || '').trim();
  if (!channelId) return ctx.reply('CHANNEL_ID belum diisi di .env.');
  const text = ctx.message.text.replace(/^\/post(@\w+)?\s*/, '');
  if (!text) return ctx.reply('Pakai: /post <teks pengumuman>');
  try {
    await ctx.telegram.sendMessage(channelId, text, { parse_mode: 'HTML' });
    ctx.reply('Terkirim ke channel.');
  } catch (e) {
    ctx.reply(`Gagal kirim: ${e.message}`);
  }
});
