const bot = require("../bot");
const db = require("../db");

bot.command("hapus", (ctx) => {
  const user = db.user(ctx.from.id)
  if (user.me.value().status) {
    user.unregister()
    ctx.reply(
      "Terhapus. Kamu tidak bisa lagi melakukan simulasi. Klik /daftar untuk memulai"
    );
  } else {
    ctx.reply(
      "Penghapusan akun tidak berhasil. Kamu belum melakukan pendaftaran. Ketik /daftar untuk melakukannya"
    );
  }
});
