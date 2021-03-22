const bot = require("../bot");
const db = require("../db");


bot.command('saya', (ctx) => {
    const user = db.user(ctx.from.id)
    const status = user.me.value().status

    ctx.reply(`
*INFORMASI AKUN*

*Nama Lengkap:* ${ctx.from.first_name + " " + ctx.from.last_name}
*Username:* ${ctx.from.username? ctx.from.username : "_anda belum mendaftarkan username_"}
*Telegram ID:* ${ctx.from.id}    
*Status Pendaftaran:* ${status? "AKTIF" : "TIDAK AKTIF"}
    `, {
        parse_mode: "Markdown"
    })
})