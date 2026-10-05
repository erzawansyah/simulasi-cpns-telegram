'use strict';
/**
 * akun.js — /start, /daftar, /bantuan, /saya, /hapus, /privasi.
 */
const bot = require('../bot');
const db = require('../db');
const { esc, escOr } = require('../util');

const NAMA_BOT = 'Simulasi CPNS 2027';

const TEKS_CONSENT =
  '<b>Izin riset</b>\n\n' +
  'Jawaban latihanmu dipakai untuk <b>riset pengembangan soal CPNS</b> — ' +
  'selalu dalam bentuk <b>anonim</b> (tanpa nama/username). ' +
  'Data demografis (kalau kamu isi) hanya dipakai agregat.\n\n' +
  'Lanjut mendaftar berarti kamu <b>setuju</b>. ' +
  'Kamu bisa tarik persetujuan kapan aja lewat /privasi.';

const TEKS_BANTUAN =
  `<b>${NAMA_BOT}</b>\n\n` +
  '<b>Akun</b>\n' +
  '/daftar — Mendaftar sebagai peserta\n' +
  '/saya — Info akun &amp; statistikmu\n' +
  '/privasi — Info pemakaian datamu\n' +
  '/hapus — Hapus akunmu\n\n' +
  '<b>Latihan</b> (1 soal, ada pembahasan)\n' +
  '/latihan — Soal acak semua kategori\n' +
  '/latihan twk|tiu|tkp — Soal per kategori\n' +
  '/latihan twk mudah — Filter level: mudah|sedang|sukar\n\n' +
  '<b>Latihan harian</b> (1 soal otomatis tiap hari)\n' +
  '/harian — Info program harian\n' +
  '/subscribe [jam] — Aktifkan (default jam 7 pagi)\n' +
  '/unsubscribe — Hentikan\n\n' +
  '<b>Simulasi</b> (paket soal + timer, skor ala SKD)\n' +
  '/simulasi — Paket 10 soal, 12 menit (gratis, 1x/minggu)\n' +
  '/simulasi_full — Paket 110 soal ala SKD (premium)\n' +
  '/batal — Batalkan simulasi berjalan\n\n' +
  '<b>Riwayat</b>\n' +
  '/skor — Ringkasan skormu\n' +
  '/riwayat — 5 aktivitas terakhir\n' +
  '/papan — Peringkat skor simulasi\n\n' +
  '<b>Kontribusi</b>\n' +
  '/sumbang — Kirim soal (dikurasi admin)\n\n' +
  'Penilaian: TWK/TIU benar = 5, salah = 0. TKP memakai bobot 1–5 per opsi.\n' +
  'Passing grade SKD: TWK ≥ 65, TIU ≥ 80, TKP ≥ 166.';

bot.start(async (ctx) => {
  const u = db.ensureUser(ctx.from.id, ctx.from.username || null, ctx.from.first_name || null);
  const c = { TWK: db.countItems('TWK'), TIU: db.countItems('TIU'), TKP: db.countItems('TKP') };
  const nama = escOr(ctx.from.first_name, 'kawan');
  if (u.registered) {
    await ctx.replyWithHTML(
      `Halo <b>${nama}</b>! Selamat datang kembali di <b>${NAMA_BOT}</b>.\n\n` +
      `Bank soal: ${c.TWK} TWK + ${c.TIU} TIU + ${c.TKP} TKP.\n` +
      'Ketik /bantuan untuk daftar perintah, atau /latihan untuk langsung mulai.'
    );
  } else {
    await ctx.replyWithHTML(
      `Halo <b>${nama}</b>! Selamat datang di <b>${NAMA_BOT}</b>.\n\n` +
      `Bank soal: ${c.TWK} TWK + ${c.TIU} TIU + ${c.TKP} TKP.\n\n` +
      `${TEKS_CONSENT}`,
      {
        reply_markup: {
          inline_keyboard: [
            [{ text: 'Setuju & Daftar', callback_data: 'daftar:ya' }],
            [{ text: 'Lihat perintah dulu', callback_data: 'daftar:nanti' }],
          ],
        },
      }
    );
  }
});

bot.action('daftar:ya', async (ctx) => {
  await ctx.answerCbQuery();
  db.registerUser(ctx.from.id, true);
  try { await ctx.editMessageReplyMarkup({ inline_keyboard: [] }); } catch { /* abaikan */ }
  await ctx.replyWithHTML(
    'Pendaftaran <b>berhasil</b>! Selamat belajar.\n\n' +
    'Mulai dari sini:\n' +
    '/latihan — 1 soal cepat\n' +
    '/subscribe — dapat 1 soal otomatis tiap hari\n' +
    '/simulasi — uji kemampuan (10 soal)'
  );
  mulaiDemografis(ctx);
});

bot.action('daftar:nanti', async (ctx) => {
  await ctx.answerCbQuery();
  try { await ctx.editMessageReplyMarkup({ inline_keyboard: [] }); } catch { /* abaikan */ }
  await ctx.replyWithHTML(TEKS_BANTUAN + '\n\nKetik /daftar kalau sudah siap.');
});

bot.command('daftar', async (ctx) => {
  const u = db.ensureUser(ctx.from.id, ctx.from.username || null, ctx.from.first_name || null);
  if (u.registered) return ctx.reply('Kamu sudah terdaftar. Ketik /bantuan untuk mulai.');
  const arg = (ctx.message.text.split(/\s+/)[1] || '').toLowerCase();
  if (arg === 'ya') {
    db.registerUser(ctx.from.id, true);
    await ctx.replyWithHTML('Pendaftaran <b>berhasil</b>! Ketik /bantuan untuk mulai latihan.');
    return mulaiDemografis(ctx);
  }
  if (arg === 'tidak') return ctx.reply('Oke, pendaftaran dibatalkan. Ketik /start kapan aja kalau berubah pikiran.');
  await ctx.replyWithHTML(TEKS_CONSENT + '\n\nKetik <b>/daftar ya</b> untuk menyetujui & mendaftar, atau /daftar tidak untuk batal.');
});

bot.command(['bantuan', 'help'], (ctx) => ctx.replyWithHTML(TEKS_BANTUAN));

bot.command('saya', (ctx) => {
  const u = db.getUser(ctx.from.id);
  if (!u) return ctx.reply('Ketik /start dulu ya.');
  const s = db.getUserStats(ctx.from.id);
  const sub = db.getSubscription(ctx.from.id);
  ctx.replyWithHTML(
    '<b>Info Akun</b>\n' +
    `Nama: <b>${escOr(ctx.from.first_name)}</b>\n` +
    `Username: @${escOr(ctx.from.username)}\n` +
    `Status: ${u.registered ? 'Terdaftar' : 'Belum daftar'}\n` +
    `Izin riset: ${u.consent_at ? 'Ya' : 'Belum'}\n` +
    `Harian: ${sub && sub.active ? `Aktif (jam ${sub.hour}:00 WIB)` : 'Nonaktif'}\n\n` +
    `<b>Statistik</b>\n` +
    `Latihan: ${s.latihanBenar}/${s.latihan} benar\n` +
    `Soal harian dijawab: ${s.harian}\n` +
    `Simulasi: ${s.simulasi}x (rata-rata ${Math.round(s.simulasiRata)}, lulus ${s.simulasiLulus}x)`
  );
});

bot.command('hapus', async (ctx) => {
  const u = db.getUser(ctx.from.id);
  if (!u || !u.registered) return ctx.reply('Kamu belum punya akun terdaftar.');
  await ctx.reply('Yakin hapus akun? Data personal (nama, riwayat latihan) akan dihapus.\nRespons yang sudah terkumpul tetap dipakai riset dalam bentuk anonim.', {
    reply_markup: {
      inline_keyboard: [
        [{ text: 'Ya, hapus akunku', callback_data: 'hapus:ya' }],
        [{ text: 'Batal', callback_data: 'hapus:batal' }],
      ],
    },
  });
});

bot.action('hapus:ya', async (ctx) => {
  await ctx.answerCbQuery();
  db.deactivateUser(ctx.from.id);
  try { await ctx.editMessageReplyMarkup({ inline_keyboard: [] }); } catch { /* abaikan */ }
  await ctx.reply('Akun dinonaktifkan dan data personal dihapus. Terima kasih sudah ikut berlatih!');
});

bot.action('hapus:batal', async (ctx) => {
  await ctx.answerCbQuery('Dibatalkan');
  try { await ctx.editMessageReplyMarkup({ inline_keyboard: [] }); } catch { /* abaikan */ }
});

bot.command('privasi', (ctx) =>
  ctx.replyWithHTML(
    '<b>Privasi &amp; Data</b>\n\n' +
    'Yang kami simpan:\n' +
    '• ID Telegram + nama (untuk akunmu)\n' +
    '• Setiap jawaban per soal: opsi yang dipilih, benar/salah, skor, waktu jawab\n' +
    '• Data demografis (bila kamu isi) — hanya dipakai agregat\n' +
    '• Data ini dipakai untuk <b>riset pengembangan soal</b> — selalu anonim di publikasi/ekspor\n\n' +
    'Yang TIDAK kami simpan: isi chat privatmu.\n\n' +
    'Mau tarik persetujuan? Ketik /hapus — data personal dihapus, ' +
    'respons historis tetap tersimpan anonim untuk riset.'
  )
);

/* ---------- Demografis opsional (v1.1) ----------
 * Setelah /daftar berhasil: jenis kelamin, usia, pendidikan terakhir,
 * pernah ikut tes (+berapa kali). Semua boleh dilewati (/lewati). */
const demoFlows = new Map(); // userId -> { step, data }

function batalkanDemo(userId) {
  if (!demoFlows.has(userId)) return false;
  demoFlows.delete(userId);
  return true;
}

function mulaiDemografis(ctx) {
  const userId = ctx.from.id;
  if (demoFlows.has(userId)) return;
  const { hasFlow } = require('../itemFlow');
  if (hasFlow(userId)) return;
  demoFlows.set(userId, { step: 'jk', data: {} });
  ctx.replyWithHTML(
    '<b>Data tambahan (opsional)</b>\n' +
    'Bantu riset kami dengan mengisi data singkat ini — dipakai <b>agregat &amp; anonim</b>.\n' +
    'Ketik <b>/lewati</b> untuk melewati tiap pertanyaan, atau <b>/batal</b> untuk berhenti.\n\n' +
    '1/4 — Jenis kelamin? Ketik <b>L</b> atau <b>P</b>.'
  );
}

bot.on('text', async (ctx, next) => {
  const userId = ctx.from.id;
  const f = demoFlows.get(userId);
  if (!f) return next();
  const text = (ctx.message.text || '').trim();
  if (text.startsWith('/') && text.toLowerCase() !== '/lewati') return next();
  const lewati = text.toLowerCase() === '/lewati';
  const d = f.data;

  if (f.step === 'jk') {
    if (!lewati) {
      const v = text.toUpperCase();
      if (!['L', 'P'].includes(v)) return ctx.reply('Ketik L atau P, atau /lewati.');
      d.jenis_kelamin = v;
    }
    f.step = 'usia';
    return ctx.reply('2/4 — Usia? (angka tahun, atau /lewati)');
  }
  if (f.step === 'usia') {
    if (!lewati) {
      const n = Number(text);
      if (!Number.isInteger(n) || n < 10 || n > 100) return ctx.reply('Ketik angka usia yang wajar, atau /lewati.');
      d.usia = n;
    }
    f.step = 'pendidikan';
    return ctx.reply('3/4 — Pendidikan terakhir? (mis. SMA, D3, S1, S2 — atau /lewati)');
  }
  if (f.step === 'pendidikan') {
    if (!lewati) {
      if (text.length > 50) return ctx.reply('Terlalu panjang, singkat aja ya (atau /lewati).');
      d.pendidikan = text;
    }
    f.step = 'pernah';
    return ctx.reply('4/4 — Pernah ikut tes SKD/CPNS? (ya/tidak, atau /lewati)');
  }
  if (f.step === 'pernah') {
    if (!lewati) {
      const v = text.toLowerCase();
      if (!['ya', 'tidak'].includes(v)) return ctx.reply('Ketik ya atau tidak, atau /lewati.');
      d.pernah_tes = v;
      if (v === 'ya') {
        f.step = 'berapa';
        return ctx.reply('Sudah berapa kali ikut? (angka)');
      }
    }
    return selesaiDemo(ctx, d);
  }
  if (f.step === 'berapa') {
    const n = Number(text);
    if (!Number.isInteger(n) || n < 1 || n > 50) return ctx.reply('Ketik angka yang wajar.');
    d.jml_tes = n;
    return selesaiDemo(ctx, d);
  }
});

function selesaiDemo(ctx, d) {
  demoFlows.delete(ctx.from.id);
  if (Object.keys(d).length) {
    db.setMeta(ctx.from.id, { demografis: d });
    db.logEvent('demografis_isi', ctx.from.id, ctx.chat.id, { fields: Object.keys(d) });
  }
  ctx.replyWithHTML(
    'Data tersimpan, terima kasih!\n\n' +
    'Siap berlatih? Coba /latihan untuk 1 soal cepat, atau /subscribe biar dapat soal otomatis tiap hari.'
  );
}

module.exports = { batalkanDemo };
