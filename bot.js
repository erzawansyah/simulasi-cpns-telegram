'use strict';
/**
 * bot.js — instance Telegraf + middleware global.
 *
 * 1. Event log (PRD §3.5): SEMUA update dicatat ke tabel events.
 *    Privasi: isi pesan teks privat TIDAK disimpan — hanya metadata
 *    (tipe update, command, panjang teks). Callback data & poll id dicatat
 *    karena relevan untuk audit alur kuis.
 * 2. my_chat_member: kicked -> event 'blocked' + subscription nonaktif;
 *    member -> event 'unblocked'.
 * 3. ensureUser: setiap update memastikan baris user ada.
 */
require('dotenv').config();
const { Telegraf } = require('telegraf');
const db = require('./db');

const token = process.env.BOT_TOKEN;
if (!token || token.includes('ISI_')) {
  console.error('FATAL: BOT_TOKEN belum diisi. Salin .env.example menjadi .env lalu isi token bot dari @BotFather.');
  process.exit(1);
}

db.open();

const bot = new Telegraf(token);

/** Ringkasan update untuk kolom detail (tanpa isi pesan privat). */
function summarizeUpdate(ctx) {
  const u = ctx.update;
  const d = { update_type: ctx.updateType };
  if (u.message) {
    const m = u.message;
    if (m.text) {
      d.kind = 'text';
      d.text_len = m.text.length;
      if (m.text.startsWith('/')) d.command = m.text.split(/\s+/)[0].split('@')[0];
      if (m.document) d.has_document = true;
    } else if (m.document) d.kind = 'document', d.file_name = m.document.file_name || null;
    else if (m.photo) d.kind = 'photo';
    else d.kind = 'other_message';
  } else if (u.callback_query) {
    d.kind = 'callback';
    d.data = (u.callback_query.data || '').slice(0, 64);
  } else if (u.poll_answer) {
    d.kind = 'poll_answer';
    d.poll_id = u.poll_answer.poll_id;
  } else if (u.my_chat_member) {
    d.kind = 'my_chat_member';
    d.new_status = u.my_chat_member.new_chat_member?.status || null;
    d.old_status = u.my_chat_member.old_chat_member?.status || null;
  }
  return d;
}

// Middleware #1: event log + ensure user (jalan untuk SEMUA update)
bot.use(async (ctx, next) => {
  const from = ctx.from;
  const chatId = ctx.chat ? ctx.chat.id : null;
  try {
    if (from) db.ensureUser(from.id, from.username || null, from.first_name || null);
    db.logEvent(ctx.updateType, from ? from.id : null, chatId, summarizeUpdate(ctx));
  } catch (e) {
    console.error('[bot] middleware event gagal:', e.message);
  }
  return next();
});

// Middleware #2: grup hanya untuk log — command & kuis cuma jalan di private chat.
// (BotFather /setjoingroups = disable hanya mencegah add BARU; grup yang sudah
// ada tetap dihuni bot. Di grup, update tetap dicatat middleware #1, tapi tidak
// diproses lebih lanjut. my_chat_member tetap jalan agar add/remove grup ketahuan.)
bot.use(async (ctx, next) => {
  const chatType = ctx.chat ? ctx.chat.type : null;
  if (chatType && chatType !== 'private' && ctx.updateType !== 'my_chat_member') {
    return; // diam di grup: tidak membalas, tidak menjalankan command
  }
  return next();
});

// Block / unblock detection (PRD §3.5)
bot.on('my_chat_member', async (ctx) => {  const mcm = ctx.myChatMember;
  const userId = mcm.from.id;
  const status = mcm.new_chat_member.status;
  db.ensureUser(userId, mcm.from.username || null, mcm.from.first_name || null);
  if (status === 'kicked') {
    db.logEvent('blocked', userId, mcm.chat.id, { note: 'user memblokir bot' });
    db.deactivateSubscription(userId);
    console.log(`[bot] user ${userId} memblokir bot — subscription dinonaktifkan`);
  } else if (status === 'member') {
    db.logEvent('unblocked', userId, mcm.chat.id, { note: 'user membuka blokir' });
    console.log(`[bot] user ${userId} membuka blokir`);
  }
});

// Error handler global: lapor ke admin + grup log bila diisi
const { notifyAdmin, esc } = require('./util');
bot.catch((err, ctx) => {
  console.error('[bot] error:', err);
  const info = `Error pada update ${ctx.updateType || '?'} dari user ${ctx.from?.id || '?'}`;
  notifyAdmin(bot, `⚠️ <b>BOT ERROR</b>\n${esc(info)}\n${esc(String(err.message || err)).slice(0, 300)}`);
});

module.exports = bot;
