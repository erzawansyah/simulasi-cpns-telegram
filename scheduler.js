'use strict';
/**
 * scheduler.js — kiriman latihan harian + backup harian data.db.
 *
 * - Tiap jam (tepat menit 00, zona Asia/Jakarta): kirim 1 soal quiz ke
 *   subscriber yang hour-nya cocok & active=1 (aturan anti-ulang berlaku).
 * - 403 saat kirim (user block bot) -> subscription nonaktif + event 'blocked'.
 *   Error lain -> retry 1x, lalu skip hari itu.
 * - Tiap jam 02:00 WIB: VACUUM INTO backups/data-YYYYMMDD.db (retensi 7 hari).
 */
const cron = require('node-cron');
const fs = require('fs');
const path = require('path');
const db = require('./db');
const { kirimQuiz } = require('./polls');

/** Jam saat ini dalam zona Asia/Jakarta (0-23). */
function jamJakarta(date = new Date()) {
  const fmt = new Intl.DateTimeFormat('id-ID', {
    timeZone: 'Asia/Jakarta', hour: 'numeric', hour12: false,
  });
  return Number(fmt.format(date)) % 24;
}

/** Satu tick pengiriman untuk jam tertentu. Diekspor agar bisa di-test. */
async function tickForHour(bot, hour) {
  const subs = db.activeSubscriptionsForHour(hour);
  const hasil = { jam: hour, target: subs.length, terkirim: 0, gagal: 0, diblokir: 0 };
  for (const s of subs) {
    const items = db.pickItems({ userId: s.user_id, n: 1 });
    if (!items.length) {
      db.logEvent('harian_pool_habis', s.user_id, s.user_id, { hour });
      continue; // pool habis — jangan ganggu user dengan pesan kosong
    }
    const kirim = async () => kirimQuiz(
      {
        quiz: (q, opts, extra) => bot.telegram.sendQuiz(s.user_id, q, opts, extra),
        text: (html, extra) => bot.telegram.sendMessage(s.user_id, html, { parse_mode: 'HTML', ...extra }),
      },
      s.user_id, s.user_id, items[0], 'harian'
    );
    try {
      await kirim();
      hasil.terkirim++;
      db.logEvent('harian_terkirim', s.user_id, s.user_id, { item_id: items[0].item_id });
    } catch (e) {
      const code = e.response?.error_code || e.code;
      if (code === 403) {
        // User memblokir bot
        db.deactivateSubscription(s.user_id);
        db.logEvent('blocked', s.user_id, s.user_id, { via: 'harian_403' });
        hasil.diblokir++;
      } else {
        // Retry 1x
        try {
          await new Promise((r) => setTimeout(r, 2000));
          await kirim();
          hasil.terkirim++;
        } catch (e2) {
          hasil.gagal++;
          db.logEvent('harian_gagal', s.user_id, s.user_id, { error: String(e2.message).slice(0, 200) });
        }
      }
    }
  }
  return hasil;
}

function backupHarian() {
  try {
    const dir = path.join(__dirname, 'backups');
    fs.mkdirSync(dir, { recursive: true });
    const stamp = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    const dest = path.join(dir, `data-${stamp}.db`);
    db.getDb().exec(`VACUUM INTO '${dest.replace(/'/g, "''")}'`);
    console.log(`[scheduler] backup tersimpan: ${dest}`);
    // Retensi 7 hari
    const files = fs.readdirSync(dir).filter((f) => /^data-\d{8}\.db$/.test(f)).sort();
    while (files.length > 7) {
      const old = files.shift();
      fs.unlinkSync(path.join(dir, old));
      console.log(`[scheduler] backup lama dihapus: ${old}`);
    }
  } catch (e) {
    console.error('[scheduler] backup gagal:', e.message);
  }
}

function startScheduler(bot) {
  // Kiriman harian tiap jam tepat
  cron.schedule('0 * * * *', async () => {
    const h = jamJakarta();
    console.log(`[scheduler] tick jam ${h} WIB`);
    try {
      const r = await tickForHour(bot, h);
      console.log(`[scheduler] selesai: ${r.terkirim}/${r.target} terkirim, ${r.diblokir} diblokir, ${r.gagal} gagal`);
    } catch (e) {
      console.error('[scheduler] tick error:', e.message);
    }
  }, { timezone: 'Asia/Jakarta' });

  // Backup harian jam 02:00 WIB
  cron.schedule('0 2 * * *', backupHarian, { timezone: 'Asia/Jakarta' });

  console.log('[scheduler] aktif (zona Asia/Jakarta): kiriman tiap jam, backup 02:00');
}

module.exports = { startScheduler, tickForHour, jamJakarta, backupHarian };
