'use strict';
const bot = require('../bot');
const store = require('../store');
const bank = require('../bank');

const TEKS_BANTUAN = `*SIMULASI CPNS BOT* v2.0

*Akun*
/daftar - Mendaftar sebagai peserta
/saya - Info akun & statistikmu
/hapus - Hapus akunmu

*Latihan* (1 soal, langsung ada pembahasan)
/latihan - Soal acak semua kategori
/latihan twk | tiu | tkp - Soal per kategori

*Simulasi* (paket 10 soal + timer 12 menit, skor ala SKD)
/simulasi - Mulai simulasi
/batal - Batalkan simulasi berjalan

*Riwayat*
/skor - Ringkasan skormu
/riwayat - 5 simulasi terakhir

*Admin*
/tambah - Tambah soal ke bank (khusus admin)

Penilaian: TWK/TIU benar = 5, salah = 0. TKP memakai bobot 1-5 per opsi.
`;

bot.start((ctx) => {
  const u = store.ensure(ctx.from.id, ctx.from.username);
  const c = bank.counts();
  ctx.replyWithMarkdown(`Halo ${ctx.from.first_name}! Selamat datang di *Simulasi CPNS Bot*.\n\nBank soal: ${c.twk} TWK + ${c.tiu} TIU + ${c.tkp} TKP.\n${u.registered ? 'Kamu sudah terdaftar. Ketik /bantuan untuk daftar perintah.' : 'Ketik /daftar untuk mulai.'}`);
});

bot.command(['bantuan', 'help'], (ctx) => ctx.replyWithMarkdown(TEKS_BANTUAN));

bot.command('daftar', (ctx) => {
  const u = store.ensure(ctx.from.id, ctx.from.username);
  if (u.registered) return ctx.reply('Kamu sudah terdaftar.');
  store.update(ctx.from.id, (x) => { x.registered = true; x.username = ctx.from.username || x.username; });
  ctx.reply('Pendaftaran berhasil! Ketik /bantuan untuk mulai latihan.');
});

bot.command('hapus', (ctx) => {
  const u = store.get(ctx.from.id);
  if (!u) return ctx.reply('Kamu belum punya akun.');
  store.update(ctx.from.id, (x) => { x.registered = false; x.history = []; });
  ctx.reply('Akun dinonaktifkan dan riwayat dihapus.');
});

bot.command('saya', (ctx) => {
  const u = store.get(ctx.from.id);
  if (!u) return ctx.reply('Ketik /start dulu ya.');
  const s = u.stats;
  ctx.replyWithMarkdown(
    `*Info Akun*\nNama: ${ctx.from.first_name}\nUsername: @${ctx.from.username || '-'}\nStatus: ${u.registered ? 'Terdaftar' : 'Belum daftar'}\n\n` +
    `Latihan: ${s.latihan} soal (${s.latihanBenar} benar)\nSimulasi: ${s.simulasi}x`
  );
});
