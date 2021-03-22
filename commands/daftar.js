const bot = require("../bot");
const db = require("../db");

bot.command("daftar", (ctx) => {
  const user = db.user(ctx.from.id)
  if (!user.me.value()) {
    ctx.reply(
      "Ada sebuah kesalahan. Kami tidak bisa menemukan Anda dalam database. Silahkan ketk /start sebelum melakukan pendaftaran"
    );
  } else {
    if (user.me.value().status) {
      ctx.reply("Kamu sudah terdaftar sebagai pengguna");
    } else {
      ctx.replyWithChatAction("typing");
      ctx.reply("Melakukan pendaftaran...");
      user.register();
      setTimeout(() => {
        ctx.reply("Selamat, kamu sudah terdaftar sebagai pengguna");
      }, 2000);
    }
  }
});
