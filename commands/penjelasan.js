const bot = require("../bot");
const db = require("../db");

bot.command('penjelasan', (ctx) => {
    ctx.reply(`
Anda menginput perintah /tanya

Mohon maaf, kami sedang dalam pengembangan.
Tunggu waktu launching kami ya
    `)
})