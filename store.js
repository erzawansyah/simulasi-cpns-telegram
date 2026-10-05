'use strict';
/**
 * store.js — penyimpanan data user yang simpel & aman.
 * In-memory Map + persist ke JSON (debounced write).
 * Menggantikan lowdb 1.0 yang sudah jadul.
 */
const fs = require('fs');
const path = require('path');

const FILE = path.join(__dirname, 'data', 'users.json');

function blankStats() {
  return {
    latihan: 0, latihanBenar: 0,
    simulasi: 0, simulasiSkor: [],
    twkBenar: 0, twkTotal: 0,
    tiuBenar: 0, tiuTotal: 0,
    tkpPoin: 0, tkpTotal: 0,
    registeredAt: Date.now(),
  };
}

class Store {
  constructor() {
    this.users = new Map();
    this._timer = null;
    this._load();
  }
  _load() {
    try {
      const raw = fs.readFileSync(FILE, 'utf8');
      const obj = JSON.parse(raw);
      for (const [k, v] of Object.entries(obj)) this.users.set(k, v);
    } catch { /* file belum ada = mulai kosong */ }
  }
  _save() {
    clearTimeout(this._timer);
    this._timer = setTimeout(() => {
      try {
        fs.mkdirSync(path.dirname(FILE), { recursive: true });
        const tmp = FILE + '.tmp';
        fs.writeFileSync(tmp, JSON.stringify(Object.fromEntries(this.users), null, 1));
        fs.renameSync(tmp, FILE);
      } catch (e) { console.error('[store] gagal simpan:', e.message); }
    }, 800);
  }
  get(id) { return this.users.get(String(id)) || null; }
  ensure(id, username) {
    const key = String(id);
    let u = this.users.get(key);
    if (!u) {
      u = { id, username: username || '', registered: false, stats: blankStats(), history: [] };
      this.users.set(key, u); this._save();
    }
    return u;
  }
  update(id, fn) {
    const u = this.users.get(String(id));
    if (!u) return null;
    fn(u); this._save(); return u;
  }
  pushHistory(id, entry) {
    this.update(id, (u) => {
      u.history.unshift({ at: Date.now(), ...entry });
      u.history = u.history.slice(0, 50);
    });
  }
}

module.exports = new Store();
