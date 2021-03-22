const setenv = require("dotenv");
const { Composer } = require('micro-bot')

// Panggil .env variable
setenv.config();

// Memanggil instance yang diperlukan
const bot = new Composer()
module.exports = bot