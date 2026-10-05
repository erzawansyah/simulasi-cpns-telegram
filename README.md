# Simulasi CPNS 2027 — Bot Telegram v3

Bot latihan CPNS (TWK/TIU/TKP) sekaligus **instrumen riset psikometri**: setiap jawaban tercatat per butir (opsi, benar/salah, skor, waktu respons) dalam **satu file SQLite** (`data/data.db`).

## Fitur

- `/latihan [kategori] [level]` — 1 soal via native quiz Telegram (ada pembahasan otomatis); fallback teks+tombol bila soal/opsi panjang
- `/simulasi` — paket 10 soal + timer 12 mnt, **gratis, maks 1x/minggu**
- `/simulasi_full` — paket 110 soal (30/35/45) + passing grade SKD 65/80/166, **premium**
- `/subscribe [jam]` / `/unsubscribe` — 1 soal otomatis tiap hari (scheduler, zona Asia/Jakarta)
- `/sumbang` — kirim soal → antrean moderasi admin
- `/skor`, `/riwayat`, `/papan`, `/saya`, `/privasi`, `/hapus`
- Admin: `/tambah`, `/impor` (JSON/CSV), `/moderasi`, `/ekspor` (CSV anonim), `/nonaktif`, `/premium`
- **Anti-ulang**: 1 user × 1 butir — soal yang sudah dijawab tidak pernah muncul lagi (latihan, simulasi, harian)
- **Event log**: semua update Telegram dicatat; block/unblock terdeteksi via `my_chat_member`
- Backup harian otomatis `data.db` (retensi 7 hari)

## Instalasi

```bash
cd v3
npm install          # Node.js >= 22
cp .env.example .env # isi BOT_TOKEN (dari @BotFather) & ADMIN_CHAT_IDS
```

## Migrasi dari v2 (sekali jalan)

```bash
node migrate.js [--src ../simulator/data] [--force]
```

Memindahkan 30 soal + users (bila ada) ke `data/data.db`, lalu verifikasi hitung baris. Sumber v2 **tidak diubah**; salinan arsip ada di `data/archive/`.

## Menjalankan

```bash
npm start            # BOT_MODE=polling (dev) atau webhook (produksi)
npm test             # 45+ unit test (node:test bawaan)
```

Mode webhook butuh di `.env`:

```
BOT_MODE=webhook
PUBLIC_URL=https://simulasi-cpns-bot.likrea.biz.id
PORT=18743
```

Route webhook: `/webhook/<BOT_TOKEN>` (path = rahasia). `GET /` → status.

## Deploy ke VPS (ringkas)

1. `rsync`/git ke server, `npm install --omit=dev`
2. Salin `.env` produksi (token asli, `ADMIN_CHAT_IDS`, `BOT_MODE=webhook`)
3. Migrasi bila DB belum ada: `node migrate.js` (atau salin `data.db` yang sudah jadi — 1 file!)
4. Jalankan via supervise loop yang sudah ada (`supervise.sh`), port 18743
5. Cloudflare Tunnel route → `localhost:18743` (sudah ada)

Seluruh state = **1 file** `data/data.db`. Migrasi/backup = copy file itu.

## Struktur

```
v3/
├─ index.js        # entry: webhook/polling + scheduler
├─ bot.js          # Telegraf + middleware event-log + my_chat_member
├─ db.js           # skema SQLite (WAL), prepared statements, query helper
├─ migrate.js      # JSON v2 -> SQLite (sekali jalan, terverifikasi)
├─ scheduler.js    # kiriman harian (node-cron, Asia/Jakarta) + backup harian
├─ quiz.js         # sesi simulasi in-memory + skor + passing grade
├─ polls.js        # native quiz / fallback teks + pencatatan jawaban
├─ itemFlow.js     # alur percakapan buat soal (dipakai /sumbang & /tambah)
├─ research.js     # statistik butir: n, p-value, daya beda (r_pbis), flag
├─ import.js       # validator + parser JSON/CSV untuk /impor
├─ util.js         # escape HTML (wajib utk semua data user), helper
├─ commands/       # akun, latihan, simulasi, harian, papan, sumbang, admin
├─ template-soal.json / template-soal.csv
├─ test/           # node:test — db, migrate, quiz, research, import, polls, dryrun
└─ .env.example
```

## Skema data (SQLite)

`users` (termasuk `consent_at`, `premium`, `meta` demografis) · `items` (versioning butir) ·
`sessions` (`latihan|simulasi|simulasi_full|harian`) · `responses` (per butir: opsi, benar/salah, skor, `response_time_ms`) ·
`simulation_results` · `events` · `subscriptions` · `submissions` (moderasi).

## Catatan riset

- TKP berskor politomus (1–5): analisis terpisah (GRM/PCM), jangan dicampur kalibrasi dikotomus.
- `/ekspor respons` menghasilkan CSV **anonim** (user_id di-hash) siap olah di R/Python.
- `research.js` menghitung p-value, korelasi point-biserial, sebaran opsi + flag butir bermasalah (dipakai dashboard fase berikutnya).
