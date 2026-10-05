# LAPORAN V3 — Rewrite Total Simulasi CPNS 2027

**Tanggal:** 5 Oktober 2026 · **Status:** selesai dibangun + 45 test hijau · **Belum deploy**

## 1. Struktur file (`~/workspace/revive-cpns/v3/`)

```
index.js, bot.js, db.js, migrate.js, scheduler.js, quiz.js,
polls.js, itemFlow.js, research.js, import.js, util.js
commands/{akun,latihan,simulasi,harian,papan,sumbang,admin,_shared}.js
template-soal.json, template-soal.csv, .env.example, .gitignore,
package.json (+package-lock.json), README.md, LAPORAN-V3.md
test/{db,quiz,research,import,migrate,polls,dryrun}.test.js
data/data.db (hasil migrasi nyata, 30 soal) + data/archive/
```

Stack sesuai spec: Node 22, CommonJS, `telegraf@4`, `better-sqlite3`, `express`, `node-cron`, `dotenv`.

## 2. Cara migrasi (sudah dibuktikan jalan)

```bash
cd ~/workspace/revive-cpns/v3
node migrate.js [--src ../simulator/data] [--force]
```

Hasil aktual: **0 users, 30 items (10 TWK + 10 TIU + 10 TKP)** termigrasi & terverifikasi hitung baris. `users.json` tidak ada di v2 → 0 user (ditangani). Direktori `simulator/` **tidak diubah** (arsip hanya disalin ke `v3/data/archive/`). `data/data.db` sudah jadi dan siap disalin ke VPS apa adanya.

## 3. Cara menjalankan test

```bash
cd ~/workspace/revive-cpns/v3
npm install   # sekali saja
npm test      # node --check semua file + node:test
```

**45 test, semua hijau**, mencakup: skema + WAL + indeks, migrasi (termasuk guard `--force`), anti-ulang, proporsi paket 30/35/35 & 30/35/45, skor + passing grade, statistik butir (p-value, r_pbis, flag), validator JSON/CSV, mode quiz vs fallback, scheduler tick + penanganan 403, dan **dry-run end-to-end** (migrasi 30 soal asli → user dummy → jawab → rekap → ekspor statistik).

## 4. Yang diimplementasikan (cek spec)

- ✅ `db.js`: 8 tabel PRD + kolom `premium` (v1.1), WAL, prepared statements, 7 indeks, versioning butir
- ✅ `migrate.js` sekali jalan + verifikasi
- ✅ Semua command §3.1–3.2 **kecuali /analisis** (dihapus sesuai keputusan v1.1 — analisis via ekspor/dashboard)
- ✅ Middleware `bot.use()` → tabel `events` (isi chat privat TIDAK disimpan, hanya metadata)
- ✅ `my_chat_member`: kicked → `blocked` + subscription off; member → `unblocked`
- ✅ Anti-ulang di latihan, simulasi, harian (cek `responses` per user)
- ✅ `scheduler.js`: cron tiap jam (Asia/Jakarta), 403 → blocked + nonaktif, retry 1x, backup harian `VACUUM INTO` retensi 7 hari
- ✅ `research.js`: n, p-value, r_pbis, sebaran opsi, flag p>.90 / p<.20 / daya beda negatif
- ✅ `import.js`: validator + parser JSON/CSV (duplikat, TKP scores, batas bank: soal 1000/opsi 300/penjelasan 500)
- ✅ Template JSON + CSV (lolos validator sendiri)
- ✅ Webhook `/webhook/<token>` + polling via `.env`; `.env.example` lengkap
- ✅ **Escape di semua interpolasi user** — dipakai parse_mode HTML + `esc()` (keputusan sadar: lebih aman dari MarkdownV2 untuk teks statis panjang; bug v2 tidak terulang)
- ✅ `package.json` **termasuk express**; README lengkap

## 5. Delta PRD v1.1 (diaplikasikan sebagai revision pass)

- ✅ Demografis opsional di `/daftar`: jenis kelamin, usia, pendidikan, pernah ikut tes (+berapa kali) — semua bisa `/lewati`, tersimpan di `users.meta`
- ✅ `/simulasi` 10 soal: **maks 1x/minggu** (rolling 7 hari), rekap **tanpa** badge passing grade
- ✅ `/simulasi_full` 110 soal (30/35/45): **premium-gated** (belum bayar → pesan "segera hadir"); rekap **dengan** badge LULUS/TIDAK 65/80/166; `/premium <user_id>` untuk admin
- ✅ Fallback teks + inline button untuk soal/opsi melebihi batas quiz Telegram (diuji)
- ✅ `response_time_ms` tercatat di semua mode
- ✅ `/analisis` **dihapus**; `research.js` tetap ada untuk dashboard fase 7

## 6. Yang BELUM diimplementasikan / perlu tindak lanjut

1. **Deploy ke VPS** — sesuai batasan task, tidak dilakukan. Yang perlu: salin `v3/` + `data/data.db`, isi `.env` produksi, jalankan via supervise loop yang sudah ada.
2. **Payment gateway** untuk `/simulasi_full` — digate manual via `/premium` sampai sistem bayar ada.
3. **Konfigurasi @BotFather** (nama "Simulasi CPNS 2027", deskripsi, /setcommands) — butuh aksi manusia; daftar command ada di `~/workspace/revive-cpns/botfather-config.md` (mungkin perlu tambah `/simulasi_full`, `/subscribe`, `/sumbang`, dll).
4. **Dashboard admin & dashboard tes asli** — fase 7, belum dibangun.
5. **Sesi simulasi in-memory** — hilang saat bot restart (batasan by design; jawaban yang sudah masuk tetap tersimpan bila sesi sempat direkap/dibatalkan).
6. `data/data.db` ikut terbuat di direktori (hasil migrasi nyata) — **jangan commit** file ini (sudah di `.gitignore`).

## 7. Keputusan desain penting

- **HTML bukan MarkdownV2**: escaping cukup `&<>"`, menghilangkan seluruh kelas bug v2 (nama user merusak format).
- **Batas bank soal dilonggarkan** (1000/300/500) dengan fallback otomatis — Erza bisa mengimpor soal beropsi panjang tanpa ditolak validator.
- **Privasi event log**: isi pesan teks tidak disimpan; hanya tipe update, command, callback data, poll id.
