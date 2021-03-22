const bot = require("../bot");
const db = require("../db");

bot.command('riwayat', (ctx) => {
    ctx.reply(`
Anda menginput perintah /${__filename.split("\\")[4].split(".")[0]}

Mohon maaf, kami sedang dalam pengembangan.
Tunggu waktu launching kami ya
    `)
})