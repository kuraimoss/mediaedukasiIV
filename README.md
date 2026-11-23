# SIK Anemia · Sistem Informasi Kesehatan Anemia

[![CI/CD GitHub Pages](https://github.com/kuraimoss/mediaedukasiIV/actions/workflows/deploy.yml/badge.svg)](https://github.com/kuraimoss/mediaedukasiIV/actions/workflows/deploy.yml)

Media edukasi kesehatan tentang anemia: materi lengkap, data WHO dan Kementerian Kesehatan RI, serta simulasi skrining multi-langkah yang mengklasifikasikan kadar hemoglobin (Hb) memakai ambang WHO 2024.

**Situs:** https://kuraimoss.github.io/mediaedukasiIV/

> Skrining di situs ini bersifat edukatif, **bukan diagnosis**, dan tidak menggantikan pemeriksaan maupun konsultasi dengan tenaga kesehatan.

## Fitur

- **Beranda**: hero dengan ilustrasi sel darah merah beranimasi, penjelasan singkat anemia, statistik bersumber, ringkasan faktor risiko, gejala, dan pencegahan.
- **Informasi Anemia**: pengertian, fungsi hemoglobin, jenis dan penyebab, tabel tingkat keparahan WHO 2024, faktor risiko, gejala dan dampak, pencegahan (termasuk TTD dan MMS), penanganan umum, serta tanda bahaya.
- **Data Anemia**: grafik Indonesia dan global per kelompok, tren 2000–2023 dengan rentang ketidakpastian, data ibu hamil (Riskesdas 2018 dan SKI 2023), data TTD remaja putri, klasifikasi masalah kesehatan masyarakat WHO, dan daftar sumber. Setiap grafik punya tooltip, label langsung, dan tampilan tabel.
- **Simulasi skrining** 6 langkah: identitas, kadar Hb, menstruasi (hanya bila relevan), kebiasaan makan, Tablet Tambah Darah, serta gejala dan tanda bahaya. Dilengkapi progress bar, transisi antarlangkah, validasi per isian, dan peringatan tanda bahaya seketika.
- **Laporan hasil**: indikator Hb beranimasi (gauge), kategori Hb, ringkasan menstruasi, pola makan, TTD, gejala, faktor risiko, rekomendasi edukatif, referensi medis, tombol **Ulangi Simulasi**, dan **Cetak / Simpan PDF** (`window.print()` dengan stylesheet A4).
- Desain responsif (ponsel, tablet, desktop), navigasi sticky, mode gelap opsional, glassmorphism ringan, animasi reveal dan stagger, serta dukungan `prefers-reduced-motion`.

## Teknologi

HTML5, CSS3, dan JavaScript murni (tanpa framework, tanpa proses build, tanpa backend). Animasi memakai CSS Animations, Intersection Observer API, dan SVG. Situs berjalan langsung dari `index.html`.

## Struktur proyek

```text
mediaedukasiIV/
├── index.html              # Seluruh halaman (router berbasis hash: #/, #/informasi, #/data, #/simulasi, #/hasil)
├── style.css               # Token desain, komponen, animasi, tema gelap, stylesheet cetak A4
├── script.js               # Logika skrining murni (diuji) + antarmuka
├── assets/
│   ├── images/og-image.jpg # Gambar pratinjau tautan
│   └── icons/favicon.svg
├── tests/
│   ├── screening.test.js   # Tes logika skrining (ambang WHO 2024, faktor risiko, tanda bahaya)
│   └── static.test.js      # Pemeriksaan HTML/CSS/JS: tabel WHO, path aset, privasi, CSP
├── .github/workflows/deploy.yml
├── .htmlvalidate.json, .stylelintrc.json, eslint.config.mjs
├── package.json            # Hanya skrip pemeriksaan; situs tidak butuh dependensi
└── README.md
```

## Menjalankan secara lokal

Buka `index.html` langsung di browser, atau jalankan server statis sederhana:

```bash
python -m http.server 8080
# lalu buka http://localhost:8080/
```

## Pemeriksaan dan pengujian

Membutuhkan Node.js 20 atau lebih baru. Linter diunduh otomatis melalui `npx` dengan versi terkunci.

```bash
npm test            # tes logika skrining + pemeriksaan statis (node:test)
npm run lint:html   # html-validate
npm run lint:css    # stylelint
npm run lint:js     # node --check + ESLint
npm run check       # semua pemeriksaan di atas
```

## Logika skrining

Status anemia **hanya** ditentukan dari kadar Hb. Jika Hb belum diketahui, hasilnya "Belum dapat ditentukan". Jawaban menstruasi, pola makan, TTD, dan gejala hanya dipakai sebagai ringkasan indikator risiko, bukan dasar diagnosis atau tingkat keparahan. Jenis anemia tidak pernah ditentukan.

Ambang WHO 2024 (g/dL; WHO menyajikan dalam g/L):

| Kelompok | Tidak anemia | Ringan | Sedang | Berat |
| --- | --- | --- | --- | --- |
| Anak 6–23 bulan | ≥ 10,5 | 9,5–10,4 | 7,0–9,4 | < 7,0 |
| Anak 24–59 bulan | ≥ 11,0 | 10,0–10,9 | 7,0–9,9 | < 7,0 |
| Anak 5–11 tahun | ≥ 11,5 | 11,0–11,4 | 8,0–10,9 | < 8,0 |
| Remaja 12–14 tahun | ≥ 12,0 | 11,0–11,9 | 8,0–10,9 | < 8,0 |
| Perempuan tidak hamil 15–65 tahun | ≥ 12,0 | 11,0–11,9 | 8,0–10,9 | < 8,0 |
| Laki-laki 15–65 tahun | ≥ 13,0 | 11,0–12,9 | 8,0–10,9 | < 8,0 |
| Ibu hamil trimester 1 | ≥ 11,0 | 10,0–10,9 | 7,0–9,9 | < 7,0 |
| Ibu hamil trimester 2 | ≥ 10,5 | 9,5–10,4 | 7,0–9,4 | < 7,0 |
| Ibu hamil trimester 3 | ≥ 11,0 | 10,0–10,9 | 7,0–9,9 | < 7,0 |

Catatan penerapan:

- Penyesuaian opsional WHO 2024 untuk ketinggian tempat tinggal (mulai 500 mdpl) dan kebiasaan merokok dikurangkan dari Hb terukur sebelum dibandingkan dengan ambang.
- Tabel WHO 2024 mencakup usia 6 bulan sampai 65 tahun. Di luar rentang itu (bayi di bawah 6 bulan dan usia di atas 65 tahun) hasilnya "Belum dapat ditentukan" dan pengguna diarahkan ke tenaga kesehatan.
- Tanda bahaya (pingsan, nyeri dada, sesak napas berat, perdarahan berat) dan anemia berat memunculkan peringatan untuk segera mencari pertolongan medis (layanan gawat darurat 119).
- Tabel di halaman Informasi diuji otomatis agar selalu sama dengan ambang di `script.js`.

## Sumber

- WHO (2024). *Guideline on haemoglobin cutoffs to define anaemia in individuals and populations.* [Tabel ambang Hb](https://www.ncbi.nlm.nih.gov/books/NBK602183/table/fm-ch1.tab2/) · [halaman publikasi](https://www.who.int/publications/i/item/9789240088542)
- WHO. [Fact sheet: Anaemia](https://www.who.int/news-room/fact-sheets/detail/anaemia)
- WHO Global Health Observatory. [Anaemia in women and children](https://www.who.int/data/gho/data/themes/topics/anaemia_in_women_and_children) (estimasi perempuan 15–49 tahun hingga 2023, anak 6–59 bulan hingga 2019)
- BKPK Kemenkes RI. [FAQ Hasil Utama SKI 2023](https://www.badankebijakan.kemkes.go.id/hasil-utama-ski-2023/)
- BKPK Kemenkes RI. [Anemia pada Remaja Putri: Tantangan Pencegahan melalui Konsumsi TTD](https://www.badankebijakan.kemkes.go.id/anemia-pada-remaja-putri-tantangan-pencegahan-melalui-konsumsi-tablet-tambah-darah/)
- Kemenkes RI (2024). [Menkes Tekankan Pentingnya Ragam Mikronutrien bagi Ibu Hamil](https://www.kemkes.go.id/id/menkes-tekankan-pentingnya-ragam-mikronutrien-bagi-ibu-hamil)

Statistik tidak dibuat-buat: setiap angka di situs berasal dari sumber di atas dan diuji agar sesuai dengan data di `script.js`.

## Privasi dan keamanan

- Jawaban simulasi diproses sepenuhnya di browser. Tidak ada server, analytics, cookie, `localStorage`, `sessionStorage`, maupun IndexedDB; hasil hilang saat halaman ditutup atau dimuat ulang.
- Content-Security-Policy melarang skrip pihak ketiga dan koneksi keluar (`connect-src 'none'`). Satu-satunya sumber eksternal adalah huruf dari Google Fonts.
- Data yang dimasukkan pengguna ditampilkan dengan `textContent`, bukan `innerHTML`.

## Deployment

Workflow `.github/workflows/deploy.yml` berjalan pada setiap push ke `main` dan dapat dijalankan manual (`workflow_dispatch`):

1. **check**: validasi HTML, lint CSS, pemeriksaan JavaScript, tes logika skrining, lalu menyusun artefak `_site` yang hanya berisi `index.html`, `style.css`, `script.js`, dan `assets/` (tanpa `.git`, `.github`, maupun file konfigurasi).
2. **deploy**: hanya berjalan bila pemeriksaan berhasil, memakai action resmi `actions/deploy-pages` dengan environment `github-pages`, lalu menguji situs online.

GitHub Pages harus memakai sumber **GitHub Actions**: *Settings → Pages → Build and deployment → Source: GitHub Actions*.

## Disclaimer

Konten disusun untuk edukasi. Kategori anemia hanya ditentukan dari kadar Hb yang dimasukkan pengguna, dan hasil simulasi tidak menggantikan pemeriksaan laboratorium maupun konsultasi dengan dokter, bidan, atau tenaga kesehatan lainnya.
