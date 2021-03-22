const bot = require("./bot");
const express = require('express');
const expressApp = express();

const PORT = process.env.PORT;
const URL = process.env.URL;
const BOT_TOKEN = process.env.BOT_TOKEN;

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


bot.telegram.setWebhook(`${URL}/bot${BOT_TOKEN}`);



/*
 your bot commands and all the other stuff on here ....
*/
// and at the end just start server on PORT


expressApp.use(bot.webhookCallback(`/bot${BOT_TOKEN}`));
expressApp.get("/", (req, res) => {
  res.send("Hello World!");
});
expressApp.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

// Enable graceful stop
process.once("SIGINT", () => bot.stop("SIGINT"));
process.once("SIGTERM", () => bot.stop("SIGTERM"));