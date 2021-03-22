const bot = require("./bot");

// Menangkap error dan mengirimnya ke grup telegram
bot.catch((err, ctx) => {
  console.log(`Ooops, encountered an error for ${ctx.updateType}`, err);
});

// Membaca semua file yang berada di folder Commands
[
  "start", "tanya",
  "help", "penjelasan",
  "saya", "riwayat",
  "daftar", "tanya_twk",
  "hapus", "tanya_tiu",
  "tanya_tkp", "referensi",
  "berita", "masukan",
  "tambah", "test"
].forEach((command) => {
  require(`./commands/${command}`);
});

// jalankan @sediksi_bot
bot.launch();

// Enable graceful stop
process.once("SIGINT", () => bot.stop("SIGINT"));
process.once("SIGTERM", () => bot.stop("SIGTERM"));
