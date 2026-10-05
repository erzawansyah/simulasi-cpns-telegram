'use strict';
/**
 * quiz.js — sesi simulasi in-memory + logika skor & passing grade SKD.
 *
 * Sesi simulasi disimpan di Map (hilang saat restart — batasan yang
 * didokumentasikan; respons per-butir tetap aman karena dicatat ke DB
 * saat sesi selesai/dibatalkan... sebenarnya dicatat saat rekap).
 *
 * Passing grade default SKD 2024 (konfigurabel via env):
 *   TWK >= 65, TIU >= 80, TKP >= 166
 */

const PASS_TWK = Number(process.env.PASS_TWK || 65);
const PASS_TIU = Number(process.env.PASS_TIU || 80);
const PASS_TKP = Number(process.env.PASS_TKP || 166);
const DURASI_PER_SOAL_DETIK = Number(process.env.DURASI_PER_SOAL_DETIK || 72); // 12 mnt / 10 soal

// userId -> sesi
const sessions = new Map();

/**
 * Mulai sesi simulasi. questions: array item (dari db.paketSimulasi).
 * Mengembalikan sesi atau null bila kosong.
 */
function mulai(userId, questions, dbSessionId) {
  if (!questions || !questions.length) return null;
  const s = {
    userId,
    dbSessionId, // session_id di tabel sessions
    questions,
    idx: 0,
    answers: [], // {item, chosenIdx, skor, benar, responseTimeMs}
    mulaiAt: Date.now(),
    deadline: Date.now() + questions.length * DURASI_PER_SOAL_DETIK * 1000,
    timer: null,
    askedAt: Date.now(), // untuk response_time_ms butir berjalan
  };
  sessions.set(userId, s);
  return s;
}

function get(userId) {
  return sessions.get(userId) || null;
}

function selesai(userId) {
  const s = sessions.get(userId);
  if (s && s.timer) clearTimeout(s.timer);
  sessions.delete(userId);
}

function sisaDetik(s) {
  return Math.max(0, Math.ceil((s.deadline - Date.now()) / 1000));
}

function habis(s) {
  return Date.now() >= s.deadline;
}

/**
 * Catat jawaban butir berjalan. Mengembalikan {item, skor, benar, selesai} atau null.
 */
function jawab(userId, chosenIdx, skorFn) {
  const s = sessions.get(userId);
  if (!s || habis(s)) return null;
  const item = s.questions[s.idx];
  if (!item) return null;
  const skor = skorFn(item, chosenIdx);
  const benar = item.category === 'TKP' ? null : chosenIdx === item.answer_idx;
  s.answers.push({
    item, chosenIdx, skor, benar,
    responseTimeMs: Date.now() - s.askedAt,
  });
  s.idx += 1;
  s.askedAt = Date.now();
  return { item, skor, benar, selesai: s.idx >= s.questions.length };
}

/** Rekap hasil sesi. */
function rekap(s) {
  const per = {
    TWK: { skor: 0, benar: 0, total: 0 },
    TIU: { skor: 0, benar: 0, total: 0 },
    TKP: { skor: 0, benar: 0, total: 0 },
  };
  for (const q of s.questions) per[q.category].total += 1;
  for (const a of s.answers) {
    const p = per[a.item.category];
    p.skor += a.skor;
    if (a.benar) p.benar += 1;
  }
  const total = per.TWK.skor + per.TIU.skor + per.TKP.skor;
  const maks = s.questions.length * 5;
  const passTwk = per.TWK.skor >= PASS_TWK;
  const passTiu = per.TIU.skor >= PASS_TIU;
  const passTkp = per.TKP.skor >= PASS_TKP;
  return {
    per, total, maks,
    persen: maks ? Math.round((total / maks) * 100) : 0,
    dijawab: s.answers.length, dari: s.questions.length,
    passTwk, passTiu, passTkp,
    lulus: passTwk && passTiu && passTkp,
    passGrade: { TWK: PASS_TWK, TIU: PASS_TIU, TKP: PASS_TKP },
  };
}

/** Pasang timer deadline; onTimeout dipanggil sekali saat waktu habis. */
function pasangTimer(userId, onTimeout) {
  const s = sessions.get(userId);
  if (!s) return;
  if (s.timer) clearTimeout(s.timer);
  const ms = s.deadline - Date.now();
  s.timer = setTimeout(() => onTimeout(userId), Math.max(0, ms));
  if (s.timer.unref) s.timer.unref();
}

module.exports = {
  mulai, get, selesai, sisaDetik, habis, jawab, rekap, pasangTimer,
  PASS_TWK, PASS_TIU, PASS_TKP, DURASI_PER_SOAL_DETIK,
};
