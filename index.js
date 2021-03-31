const bot = require("./bot");
const express = require("express");
const expressApp = express();

const PORT = process.env.PORT;
const URL = process.env.URL;
const BOT_TOKEN = process.env.BOT_TOKEN;

// Menangkap error dan mengirimnya ke grup telegram
bot.catch((err, ctx) => {
  if (err) throw new Error(err);
  console.log(ctx);
  console.log(`Ooops, encountered an error for ${ctx.updateType}`, err);
});

bot.on("message", (ctx, next) => {
  bot.telegram.sendMessage(
    "-539939971",
    `
${ctx.from.username} mengirim pesan berisi:
${ctx.message.text}
    `
  );
  next();
});

[
  // Membaca semua file yang berada di folder Commands
  "start",
  "tanya",
  "help",
  "penjelasan",
  "saya",
  "riwayat",
  "daftar",
  "tanya_twk",
  "hapus",
  "tanya_tiu",
  "tanya_tkp",
  "referensi",
  "berita",
  "masukan",
  "tambah",
  "test",
].forEach((command) => {
  require(`./commands/${command}`);
});

/*
 your bot commands and all the other stuff on here ....
*/
// and at the end just start server on PORT

bot.telegram.setWebhook(`${URL}/bot${BOT_TOKEN}`);
expressApp.use(bot.webhookCallback(`/bot${BOT_TOKEN}`));
expressApp.get("/", (req, res) => {
  res.send("Eh buset");
});
expressApp.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

bot.launch();

// Enable graceful stop
process.once("SIGINT", () => bot.stop("SIGINT"));
process.once("SIGTERM", () => bot.stop("SIGTERM"));
