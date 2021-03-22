const low = require("lowdb");
const FileSync = require("lowdb/adapters/FileSync");

const adapter = new FileSync("db.json");
const db = low(adapter);

// Set some defaults (required if your JSON file is empty)
db.defaults({
  questions: [],
  users: [],
  sessions: [],
}).write();

/**
 * =========================
 * USERS (array of objects)
 * =========================
 * default structure for users
 * id: number (telegram id)
 * username: string
 * status: boolean
 * history: array of object{date, question_id, result}
 * stats: object{total_questions, correct, incorrect, register_at}
 */

/**
 * [GET]
 * Mengambil semua 10 users terbaru dengan opsi tertentu
 */

const users = (total) => {
  return db.get("users").take(total).filter({ status: true }).value();
};

/**
 * [GET]
 * Mengambil user berdasarkan ID
 */

const user = (id) => {
  let stats = {
    total_questions: 0,
    correct: 0,
    incorrect: 0,
    register_at: Date.now(),
  };
  const me = db.get("users").find({ id: id });
  const start = (username) => {
    db.get("users")
      .push({
        id: id,
        username: username,
        status: false,
        history: [],
        stats: {},
      })
      .write();
  };
  const register = () => {
    me.assign({ status: true }).write();
    me.assign({ stats: stats }).write();
  };
  const unregister = () => me.assign({ status: false, history: [] }).write();
  const history = (qid, result) => {
    let current = me.value().history;
    me.assign({
      history: [
        { date: Date.now(), question_id: qid, result: result },
        ...current,
      ],
    }).write();
  };
  const clear = () => me.assign({ history: [] }).write();
  return { me, register, unregister, history, clear, start };
};

/* 
QUESTIONS (array of objects)
{
    statement: string,
    options: [
        {key: "A", choice: string},
        {key: "B", choice: string},
        {key: "C", choice: string},
        {key: "D", choice: string}
    ],
    answer: string, // Merujuk pada options[i].key,
    explanation: "string <HTML/Markdown/MarkdownV2>"
}
*/

const question = () => {
  let questions = db.get('questions')

  const random =() => {
    let max = questions.value().length
    let rnd = getRandomInt(0, max - 1)
    let question = questions.value()
    return question[rnd]
  }
  const check = (id) => db.get('questions').find({id: id}).value().answer
  
  return {check, random}
}

/*
SESSIONS(array of objects)
{
    user_id: number,
    session_id: generate sesuatu berdasarkan id dan tanggal
    data: ...object
}
*/

module.exports = { users, user, question};

function getRandomInt(min, max) {
  min = Math.ceil(min);
  max = Math.floor(max);
  return Math.floor(Math.random() * (max - min + 1)) + min;
}