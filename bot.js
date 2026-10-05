'use strict';
require('dotenv').config();
const { Telegraf } = require('telegraf');

const token = process.env.BOT_TOKEN;
if (!token || token.includes('ISI_')) {
  console.error('FATAL: BOT_TOKEN belum diisi. Salin .env.example menjadi .env lalu isi token bot dari @BotFather.');
  process.exit(1);
}

const bot = new Telegraf(token);
module.exports = bot;
