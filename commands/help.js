const bot = require("../bot");

bot.command(["/help", "/bantuan"], (ctx) =>
  ctx.reply(`Berikut cara untuk menggunakan SimulasiCPNS_bot
====================
Akun dan Pendaftaran
====================
/daftar - Melakukan pendaftaran agar bisa menggunakan bot
/saya - Mengecek informasi mengenai akun Anda dan status pendaftaran
/hapus - Menghapus akun Anda

====================
Simulasi dan Latihan
====================
/tanya - Mendapatkan pertanyaan secara acak
/penjelasan - Mendapatkan penjelasan dari pertanyaan yang sebelumnya Anda jawab
/riwayat - Melihat riwayat tes Anda hari ini
/tanya_twk  - Mendapatkan pertanyaan untuk kategori Tes Wawasan Kebangsaan
/tanya_tiu  - Mendapatkan pertanyaan untuk kategori Tes Intelegensi Umum
/tanya_tkp  - Mendapatkan pertanyaan untuk kategori Tes Karakteristik Pribadi

==========
Lain-Lain
==========
/referensi - Memberikan link menuju referensi bacaan
/berita - Mendapatkan berita terbaru mengenai Tes CPNS 2021
/masukan - Memberikan masukan kepada pengembang
/tambah - Berkontribusi untuk menambah database pertanyaan
`)
);
