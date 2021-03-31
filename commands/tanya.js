const { Context } = require("telegraf");
const bot = require("../bot");
const db = require("../db");

const state = new Context().state;
bot.command(["tanya", "quiz"], (ctx) => {
  user = db.user(ctx.from.id);
  status = user.me.value().status
  if(status) {
    state.question = db.question().random();
    ctx.replyWithQuiz(state.question.statement, state.question.choices, {
      correct_option_id: state.question.answer,
      is_anonymous: false,
      is_closed: true
      // explanation: state.question.explanation,
    });
  } else {
    ctx.reply("Kamu belum melakukan pendaftaran. Silahkan ketik /daftar untuk mulai mendapatkan pertanyaan")
  }
});

bot.on("poll_answer", (ctx) => {
  answer = ctx.pollAnswer.option_ids;
  if (answer[0] === state.question.answer)
    ctx.telegram.sendMessage(
      ctx.update.poll_answer.user.id,
      "selamat anda benar"
    );
  else
    ctx.telegram.sendMessage(
      ctx.update.poll_answer.user.id,
      "Sayang sekali, Anda salah"
    );
});
