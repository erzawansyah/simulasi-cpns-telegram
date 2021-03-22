const setenv = require("dotenv");
const { Telegraf } = require("telegraf");

// Panggil .env variable
setenv.config();
const BOT_TOKEN = process.env.BOT_TOKEN;

// Memanggil instance yang diperlukan
const bot = new Telegraf(BOT_TOKEN);
module.exports = bot;
