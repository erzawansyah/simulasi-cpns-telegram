const bot = require("../bot");
const db = require("../db");

// Pengaturan untuk perintah "start"
bot.start((ctx) => {
  const user = db.user(ctx.from.id);

  // CEK APAKAH USER PERNAH MENGETIKKAN /start
  // Kalau sudah, cek apakah pernah melakukan pendaftaran
  if (user.me.value()) {
    // CEK APAKAH SUDAH MELAKUKAN PENDAFTARAN
    // Kalau sudah mendaftar, beritahukan kepada user apa yang selanjutnya dapat dilakukan
    if (user.me.value().status) {
      ctx.reply(`
Kamu sudah terdaftar di @SimulasiCPNS_bot.

Ketikkan perintah /saya untuk melihat detil informasi Anda. 
Ketikkan perintah /help untuk mendapatkan daftar perintah yang dapat digunakan.
`);

      // Jika belum mendaftar, minta user untuk melakukan pendaftaran dengan /daftar
    } else {
      ctx.reply(
        "Silahkan ketikkan perintah /daftar untuk melakukan pendaftaran"
      );
    }

    // Jika belum pernah memulai, sapa user dengan ramah dan masukkan ke database
  } else {
    db.user(ctx.from.id).start(ctx.from.username)
    ctx.reply(`
Selamat datang ${ctx.from.username} 👋
Bot ini merupakan mitra yang dapat digunakan untuk mempermudah kamu membiasakan diri terhadap soal-soal CPNS. 
    `);
  }
});
