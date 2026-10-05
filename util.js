'use strict';
/**
 * util.js — helper bersama.
 *
 * Keputusan desain: semua pesan bot memakai parse_mode HTML.
 * Alasan: escaping HTML hanya butuh & < > " — jauh lebih aman untuk teks
 * statis panjang dibanding MarkdownV2 (yang wajib escape belasan karakter
 * di setiap teks, rawan bug seperti di v2).
 * ATURAN: SEMUA interpolasi data user (nama, username, teks bebas, soal)
 * WAJIB lewat esc() sebelum dikirim. Tanpa kecuali.
 */

const HURUF = ['A', 'B', 'C', 'D', 'E'];

/** Escape untuk Telegram HTML parse_mode. */
function esc(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** Escape + fallback bila kosong. */
function escOr(s, fallback = '-') {
  const v = String(s ?? '').trim();
  return v ? esc(v) : esc(fallback);
}

function fmtSisa(det) {
  const m = Math.floor(det / 60), s = det % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

function fmtTanggal(ms) {
  return new Date(ms).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' });
}

/** ID sesi unik. */
function newSessionId(prefix) {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

/** ID butir baru: <cat>-<epoch36>-<rand>. */
function newItemId(category) {
  return `${category.toLowerCase()}-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

/** Hash anonim untuk ekspor riset (bukan kriptografi serius, cukup untuk de-identifikasi). */
function anonHash(userId, salt = '') {
  const crypto = require('crypto');
  return crypto.createHash('sha256').update(`${salt}:${userId}`).digest('hex').slice(0, 16);
}

/** Cek apakah chat id termasuk admin. */
function isAdmin(chatId) {
  const list = (process.env.ADMIN_CHAT_IDS || '').split(',').map((s) => s.trim()).filter(Boolean);
  return list.includes(String(chatId));
}

/** Kirim notifikasi ke semua admin + grup log (LOG_CHAT_ID). Teks sudah HTML. */
async function notifyAdmin(bot, html) {
  const targets = (process.env.ADMIN_CHAT_IDS || '').split(',').map((s) => s.trim()).filter(Boolean);
  const logChat = (process.env.LOG_CHAT_ID || '').trim();
  if (logChat) targets.push(logChat);
  for (const id of [...new Set(targets)]) {
    try { await bot.telegram.sendMessage(id, html, { parse_mode: 'HTML' }); }
    catch { /* abaikan: mis. bot diblokir */ }
  }
}

module.exports = { HURUF, esc, escOr, fmtSisa, fmtTanggal, newSessionId, newItemId, anonHash, isAdmin, notifyAdmin };
