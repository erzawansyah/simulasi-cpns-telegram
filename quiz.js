'use strict';
/**
 * quiz.js — state simulasi PER USER (perbaikan bug fatal kode lama:
 * state soal disimpan di 1 variabel global sehingga jawaban user A
 * bisa dinilai pakai soal user B).
 */
const bank = require('./bank');

const sessions = new Map(); // userId -> session

const DURASI_PER_SOAL_DETIK = 72; // 12 menit utk 10 soal (ala SKD: ~1 mnt/soal)

function mulai(userId, jumlah = 10) {
  const questions = bank.paket(jumlah);
  if (!questions.length) return null;
  const s = {
    mode: 'simulasi',
    questions,
    idx: 0,
    answers: [], // {qid, category, chosen, skor}
    deadline: Date.now() + questions.length * DURASI_PER_SOAL_DETIK * 1000,
    startedAt: Date.now(),
    tambah: null, // state utk alur /tambah (admin)
  };
  sessions.set(String(userId), s);
  return s;
}
function get(userId) { return sessions.get(String(userId)) || null; }
function selesai(userId) { sessions.delete(String(userId)); }
function sisaDetik(s) { return Math.max(0, Math.round((s.deadline - Date.now()) / 1000)); }
function habis(s) { return Date.now() > s.deadline; }

function jawab(userId, chosenIdx) {
  const s = get(userId);
  if (!s || s.mode !== 'simulasi') return null;
  const q = s.questions[s.idx];
  const skor = bank.skorSoal(q, chosenIdx);
  s.answers.push({ qid: q.id, category: q.category, chosen: chosenIdx, benar: chosenIdx === q.answer, skor });
  s.idx += 1;
  return { q, skor, selesai: s.idx >= s.questions.length || habis(s) };
}

function rekap(s) {
  const per = { TWK: { benar: 0, total: 0, skor: 0 }, TIU: { benar: 0, total: 0, skor: 0 }, TKP: { benar: 0, total: 0, skor: 0 } };
  for (const a of s.answers) {
    const p = per[a.category];
    p.total += 1; p.skor += a.skor;
    if (a.benar) p.benar += 1;
  }
  const total = s.answers.reduce((x, a) => x + a.skor, 0);
  const maks = s.questions.length * 5;
  return { per, total, maks, persen: Math.round((total / maks) * 100), dijawab: s.answers.length, dari: s.questions.length };
}

module.exports = { mulai, get, selesai, jawab, rekap, sisaDetik, habis, DURASI_PER_SOAL_DETIK };
