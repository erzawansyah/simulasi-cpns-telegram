'use strict';
/**
 * parse-md.js — Parse 110-soal-skd-cpns.md (format kumpulin Erza)
 * menjadi JSON format importer v3 (template-soal.json).
 *
 * Format sumber per soal:
 *   ***
 *   <no>. <pertanyaan>
 *   A. <opsi>
 *   B. <opsi>
 *   C. <opsi>
 *   D. <opsi>
 *   ***
 *   Kunci Jawaban: <huruf>
 *
 *   Sumber acuan: <teks>
 *   ***
 *
 * Output: array item { item_id, category, question, options[4],
 *   answer_idx, explanation, scores? }.
 * Untuk TKP: scores = null (bobot selain opsi terbaik belum ditentukan
 * penulis) — diisi terpisah setelah review.
 */
const fs = require('fs');
const path = require('path');

const SRC = path.join(process.env.HOME, 'workspace/user/files/110-soal-skd-cpns.md');
const OUT = path.join(__dirname, 'impor-110-soal.json');

const SECTIONS = [
  { judul: '## Tes Wawasan Kebangsaan', cat: 'TWK' },
  { judul: '## Tes Intelegensia Umum', cat: 'TIU' },
  { judul: '## Tes Karakteristik Pribadi', cat: 'TKP' },
];

function bersihTeks(s) {
  return s
    .replace(/\*\*/g, '')          // bold markdown
    .replace(/\[\^\d+\]/g, '')     // footnote refs [^1]
    .replace(/\s+/g, ' ')
    .trim();
}

function parse() {
  const md = fs.readFileSync(SRC, 'utf8');
  const items = [];
  const masalah = [];

  for (const sec of SECTIONS) {
    const start = md.indexOf(sec.judul);
    if (start < 0) { masalah.push(`section tidak ketemu: ${sec.judul}`); continue; }
    // akhir section = header ## berikutnya atau ## References
    const nextH = md.indexOf('\n## ', start + sec.judul.length);
    const body = md.slice(start, nextH < 0 ? undefined : nextH);

    // blok soal: *** \n <no>. <soal> \n A..D \n *** \n Kunci Jawaban: X [ \n\n Sumber acuan: ... ] \n ***
    const re = /\*\*\*\s*\n(\d+)\.\s+([\s\S]+?)\n([A-D])\.\s+([\s\S]+?)\n([A-D])\.\s+([\s\S]+?)\n([A-D])\.\s+([\s\S]+?)\n([A-D])\.\s+([\s\S]+?)\n\*\*\*\s*\nKunci Jawaban:\s*([A-D])/g;
    let m;
    let n = 0;
    while ((m = re.exec(body)) !== null) {
      n++;
      const no = Number(m[1]);
      const question = bersihTeks(m[2]);
      const huruf = [m[3], m[5], m[7], m[9]];
      const options = [m[4], m[6], m[8], m[10]].map(bersihTeks);
      const kunci = m[11];
      if (huruf.join('') !== 'ABCD') { masalah.push(`${sec.cat} no ${no}: urutan opsi aneh (${huruf.join('')})`); }
      const answer_idx = kunci.charCodeAt(0) - 65;

      // Sumber acuan setelah kunci (opsional) -> explanation
      const tail = body.slice(re.lastIndex, re.lastIndex + 600);
      const sm = tail.match(/^\s*\n?Sumber acuan:\s*([\s\S]+?)\n\s*\*\*\*/);
      const explanation = sm ? bersihTeks(sm[1]).slice(0, 190) : '';

      if (!question || options.some((o) => !o)) {
        masalah.push(`${sec.cat} no ${no}: teks kosong`);
        continue;
      }
      items.push({
        item_id: `skd110-${String(items.length + 1).padStart(3, '0')}`,
        category: sec.cat,
        question,
        options,
        answer_idx,
        explanation,
        scores: null, // TKP diisi terpisah
      });
    }
    console.log(`${sec.cat}: ${n} soal terparse`);
  }
  return { items, masalah };
}

const { items, masalah } = parse();
console.log('total:', items.length);
const perCat = {};
items.forEach((i) => { perCat[i.category] = (perCat[i.category] || 0) + 1; });
console.log('per kategori:', JSON.stringify(perCat));
if (masalah.length) { console.log('MASALAH:'); masalah.forEach((x) => console.log(' -', x)); }

// validasi silang dengan validator importer
const { validateItem } = require('./import');
let errTotal = 0;
for (const it of items) {
  const q = { ...it };
  if (it.category !== 'TKP') delete q.scores;
  else q.scores = [5, 5, 5, 5]; // dummy agar validator jalan; diganti skor asli nanti
  const errs = validateItem(q, it.item_id);
  if (errs.length) { errTotal += errs.length; errs.forEach((e) => console.log('VALID:', e)); }
}
console.log('error validasi (non-TKP):', errTotal);

fs.writeFileSync(OUT, JSON.stringify(items, null, 2));
console.log('ditulis:', OUT);
