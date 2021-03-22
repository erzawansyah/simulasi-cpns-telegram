const dotenv = require('dotenv');
dotenv.config();
module.exports = {
  token: process.env.BOT_TOKEN,
  name: process.env.BOT_NAME,
  username: process.env.BOT_USERNAME
};