# Simulasi CPNS Bot v2.0

Bot Telegram untuk latihan & simulasi soal CPNS SKD (TWK / TIU / TKP), lengkap dengan timer, penilaian ala SKD, riwayat, dan bank soal JSON yang mudah ditambah.

Revive dari [`simulasi-cpns-telegram`](https://github.com/erzawansyah/simulasi-cpns-telegram) (2021) — ditulis ulang dengan bug kritis diperbaiki (state soal dulunya 1 variabel global untuk semua user!) dan fitur simulasi paket yang lengkap.

## Fitur

| Perintah | Fungsi |
|---|---|
| `/start`, `/daftar`, `/saya`, `/hapus` | Registrasi & info akun |
| `/latihan [twk\|tiu\|tkp]` | 1 soal acak via quiz Telegram + pembahasan otomatis |
| `/simulasi` | Paket 10 soal (3 TWK + 3 TIU + 4 TKP), timer 12 menit, nilai otomatis |
| `/batal` | Batalkan simulasi berjalan |
| `/skor`, `/riwayat` | Statistik & 5 riwayat terakhir |
| `/tambah` | Tambah soal via percakapan (khusus admin) |
| `/bantuan` | Daftar perintah |

**Penilaian ala SKD:** TWK/TIU benar = 5, salah = 0. TKP memakai bobot 1–5 per opsi jawaban.

## Cara jalan (lokal, 3 menit)

```bash
npm install
cp .env.example .env
# isi BOT_TOKEN di .env (dari @BotFather)
npm start
```

Mode default = **polling** (tidak butuh URL publik / port forwarding).

## Deploy di VPS (systemd + polling)

```bash
# di VPS
git clone <repo> && cd simulator
npm install --omit=dev
cp .env.example .env && nano .env   # isi BOT_TOKEN
```

`/etc/systemd/system/cpns-bot.service`:
```ini
[Unit]
Description=Simulasi CPNS Telegram Bot
After=network.target

[Service]
WorkingDirectory=/opt/cpns-bot
ExecStart=/usr/bin/node index.js
Restart=always
Environment=NODE_ENV=production

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl enable --now cpns-bot
```

Alternatif: mode **webhook** — set `BOT_MODE=webhook`, `PUBLIC_URL=https://domainkamu`, `PORT=3000`, lalu jalankan seperti biasa.

## Tambah soal

- **Via bot (admin):** set `ADMIN_CHAT_IDS` di `.env`, lalu `/tambah` dan ikuti alurnya (kategori → soal → opsi → jawaban → bobot TKP → pembahasan).
- **Manual:** edit `data/twk.json` / `tiu.json` / `tkp.json` lalu restart bot. Skema per soal:

```json
{
  "id": "twk-011",
  "category": "TWK",
  "question": "Teks soal (maks 300 karakter)",
  "options": ["Opsi A", "Opsi B", "Opsi C", "Opsi D", "Opsi E"],
  "answer": 1,
  "explanation": "Pembahasan (maks 200 karakter)",
  "scores": [2, 5, 3, 1, 4]
}
```

`scores` wajib untuk TKP (bobot 1–5 sejajar opsi), opsional untuk lainnya. `answer` = index opsi benar (0-based). Bank divalidasi saat bot start — soal rusak bikin bot menolak jalan dengan pesan jelas.

> **Catatan bank soal:** 30 soal bawaan adalah soal **contoh/sintetis** yang ditulis sendiri, bukan soal asli CPNS. Untuk bank soal besar, susun dari sumber resmi / buat sendiri — jangan mencomot soal berhak cipta.

## Struktur

```
simulator/
├── index.js            # entry point: polling/webhook, validasi token, error handling
├── bot.js              # inisialisasi Telegraf (token dari env)
├── bank.js             # loader + validator bank soal
├── quiz.js             # state simulasi PER USER + timer + rekap skor
├── store.js            # penyimpanan user (JSON, ganti lowdb 1.0)
├── data/
│   ├── twk.json        # 10 soal TWK
│   ├── tiu.json        # 10 soal TIU
│   ├── tkp.json        # 10 soal TKP (berbobot)
│   └── users.json      # data user (auto-generated, jangan di-commit)
├── commands/           # akun.js, latihan.js, simulasi.js, tambah.js
└── .env.example
```

## Perbedaan dari versi 2021

- State soal **per user** (dulu 1 variabel global → jawaban user A bisa dinilai pakai soal user B)
- Mode `/simulasi` beneran: paket proporsional + timer + rekap, bukan cuma 1 soal acak
- `/tambah` yang dulu cuma stub sekarang jadi alur percakapan penuh
- Polling default (dulu wajib webhook + URL publik)
- Dihapus: logging semua pesan user ke grup hardcoded (masalah privasi)
- Dependency modern: Telegraf 4.16, tanpa lowdb jadul
