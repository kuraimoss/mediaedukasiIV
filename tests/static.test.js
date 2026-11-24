'use strict';
/**
 * Pemeriksaan statis HTML, CSS, dan JavaScript Kesdig Anemia.
 * Menjaga konsistensi tabel WHO, path aset GitHub Pages, privasi, dan aksesibilitas dasar.
 */
const { describe, test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.join(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(ROOT, file), 'utf8');
const html = read('index.html');
const css = read('style.css');
const js = read('script.js');
const Kesdig = require(path.join(ROOT, 'script.js'));

function decode(text) {
  return text
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, '&')
    .trim();
}

function allIds() {
  return [...html.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]);
}

describe('index.html', () => {
  test('dokumen dasar lengkap dan berbahasa Indonesia', () => {
    assert.match(html, /^<!DOCTYPE html>/);
    assert.match(html, /<html lang="id">/);
    assert.match(html, /<meta name="viewport" content="width=device-width, initial-scale=1">/);
    assert.match(html, /<title>[^<]+<\/title>/);
    assert.match(html, /<meta name="description" content="[^"]{50,}">/);
  });

  test('semua id unik', () => {
    const ids = allIds();
    const duplicates = ids.filter((id, index) => ids.indexOf(id) !== index);
    assert.deepEqual(duplicates, []);
  });

  test('referensi id (href, for, aria-*, url()) mengarah ke elemen yang ada', () => {
    const ids = new Set(allIds());
    const refs = [];
    for (const m of html.matchAll(/\shref="#([^"/][^"]*)"/g)) refs.push(m[1]);
    for (const m of html.matchAll(/\s(?:for|aria-controls|aria-labelledby|aria-describedby)="([^"]+)"/g)) {
      refs.push(...m[1].split(/\s+/));
    }
    for (const m of html.matchAll(/url\(#([^)]+)\)/g)) refs.push(m[1]);
    const missing = [...new Set(refs.filter((ref) => !ids.has(ref)))];
    assert.deepEqual(missing, []);
  });

  test('aset lokal memakai path relatif dan file-nya ada', () => {
    const urls = [...html.matchAll(/\s(?:src|href)="([^"]+)"/g)]
      .map((m) => m[1])
      .filter((url) => !/^(https?:|#|mailto:|tel:|data:)/.test(url));
    assert.ok(urls.length >= 3, 'minimal favicon, CSS, dan JS');
    for (const url of urls) {
      assert.ok(!url.startsWith('/'), `path absolut akan rusak di /mediaedukasiIV/: ${url}`);
      assert.ok(fs.existsSync(path.join(ROOT, url)), `file tidak ditemukan: ${url}`);
    }
  });

  test('gambar Open Graph tersedia di repo', () => {
    const og = html.match(/property="og:image" content="https:\/\/kuraimoss\.github\.io\/mediaedukasiIV\/([^"]+)"/);
    assert.ok(og, 'meta og:image');
    assert.ok(fs.existsSync(path.join(ROOT, og[1])), og[1]);
  });

  test('tautan eksternal membuka tab baru dengan aman', () => {
    const links = [...html.matchAll(/<a\s[^>]*href="https?:[^"]+"[^>]*>/g)].map((m) => m[0]);
    assert.ok(links.length > 5);
    for (const link of links) {
      assert.match(link, /target="_blank"/, link);
      assert.match(link, /rel="noopener noreferrer"/, link);
    }
  });

  test('tidak ada skrip pihak ketiga atau analytics', () => {
    const scripts = [...html.matchAll(/<script\b[^>]*>/g)].map((m) => m[0]);
    assert.deepEqual(scripts, ['<script src="script.js" defer>']);
    assert.doesNotMatch(html, /google-analytics|googletagmanager|gtag\(|facebook\.net|hotjar|clarity\.ms/i);
  });

  test('Content-Security-Policy melarang koneksi keluar dan skrip inline', () => {
    const csp = html.match(/http-equiv="Content-Security-Policy" content="([^"]+)"/);
    assert.ok(csp);
    assert.match(csp[1], /connect-src 'none'/);
    assert.match(csp[1], /script-src 'self'(;|$)/);
    assert.doesNotMatch(html, /\sstyle="/, 'atribut style inline akan diblokir CSP');
    assert.doesNotMatch(html, /\son[a-z]+="/, 'handler event inline akan diblokir CSP');
  });

  test('tabel WHO 2024 di halaman sama persis dengan ambang di logika', () => {
    for (const id of Kesdig.GROUP_ORDER) {
      const row = html.match(new RegExp('<tr data-group="' + id + '">([\\s\\S]*?)</tr>'));
      assert.ok(row, `baris ${id}`);
      const labels = Kesdig.rangeLabels(id);
      for (const col of ['none', 'mild', 'moderate', 'severe']) {
        const cell = row[1].match(new RegExp('<td data-col="' + col + '"[^>]*>([^<]*)</td>'));
        assert.ok(cell, `${id} kolom ${col}`);
        assert.equal(decode(cell[1]), labels[col], `${id} kolom ${col}`);
      }
    }
  });

  test('setiap nilai pilihan formulir dikenali logika skrining', () => {
    const inputs = [...html.matchAll(/<input type="(?:radio|checkbox)" name="([^"]+)" value="([^"]+)"/g)];
    assert.ok(inputs.length > 40);
    for (const [, name, value] of inputs) {
      assert.ok(Kesdig.LABELS[name], `label untuk ${name}`);
      assert.ok(Object.prototype.hasOwnProperty.call(Kesdig.LABELS[name], value), `${name}=${value}`);
    }
    const selects = { elevation: Kesdig.ELEVATION_ADJ, smoking: Kesdig.SMOKING_ADJ };
    for (const [name, table] of Object.entries(selects)) {
      const block = html.match(new RegExp('<select[^>]*name="' + name + '"[^>]*>([\\s\\S]*?)</select>'));
      assert.ok(block, `select ${name}`);
      const values = [...block[1].matchAll(/value="([^"]+)"/g)].map((m) => m[1]);
      assert.deepEqual(values.sort(), Object.keys(table).sort());
    }
  });

  test('setiap sumber data dicantumkan dan ditautkan di halaman', () => {
    for (const source of Object.values(Kesdig.DATA.sources)) {
      assert.ok(html.includes(source.url), source.url);
    }
    assert.ok(html.includes('https://www.ncbi.nlm.nih.gov/books/NBK602183/table/fm-ch1.tab2/'));
  });

  test('angka statistik di halaman berasal dari DATA bersumber', () => {
    const known = new Set();
    for (const row of Kesdig.DATA.comparison.rows) {
      known.add(row.indonesia);
      known.add(row.global);
    }
    for (const row of Kesdig.DATA.pregnantIndonesia.rows) known.add(row.value);
    for (const item of Kesdig.DATA.ttdRemaja.items) known.add(item.value);
    const counts = [...html.matchAll(/data-count="([\d.]+)"/g)].map((m) => Number(m[1]));
    assert.ok(counts.length >= 6);
    for (const value of counts) {
      assert.ok(known.has(value), `angka ${value} tidak ada di DATA`);
    }
  });

  test('disclaimer skrining bukan diagnosis tampil di simulasi dan laporan', () => {
    assert.match(html, /Bukan diagnosis\./);
    assert.match(html, /bukan diagnosis, dan tidak menggantikan pemeriksaan/);
  });

  test('tombol cetak dan ulangi simulasi tersedia', () => {
    assert.ok((html.match(/data-action="print"/g) || []).length >= 1);
    assert.ok((html.match(/data-action="restart"/g) || []).length >= 1);
  });
});

describe('style.css', () => {
  test('kurung kurawal seimbang', () => {
    const stripped = css
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'/g, '""');
    let depth = 0;
    for (const ch of stripped) {
      if (ch === '{') depth += 1;
      if (ch === '}') depth -= 1;
      assert.ok(depth >= 0, 'kurung tutup berlebih');
    }
    assert.equal(depth, 0);
  });

  test('stylesheet cetak A4 tersedia', () => {
    assert.match(css, /@page\s*{[^}]*size:\s*A4/);
    assert.match(css, /@media print/);
  });

  test('mendukung prefers-reduced-motion dan mode gelap', () => {
    assert.match(css, /prefers-reduced-motion:\s*reduce/);
    assert.match(css, /prefers-color-scheme:\s*dark/);
  });

  test('tidak memakai path absolut untuk aset', () => {
    assert.doesNotMatch(css, /url\(\s*["']?\//);
  });
});

describe('script.js', () => {
  test('sintaks valid', () => {
    assert.doesNotThrow(() => new vm.Script(js, { filename: 'script.js' }));
  });

  test('tidak menyimpan atau mengirim data pengguna', () => {
    assert.doesNotMatch(js, /localStorage|sessionStorage|indexedDB|document\.cookie|navigator\.sendBeacon|XMLHttpRequest|\bfetch\s*\(|WebSocket|EventSource/);
  });

  test('tidak memakai innerHTML atau document.write untuk menampilkan data', () => {
    assert.doesNotMatch(js, /\.innerHTML\s*=|insertAdjacentHTML|document\.write/);
  });

  test('tombol cetak memakai window.print()', () => {
    assert.match(js, /window\.print\(\)/);
  });
});

describe('Halaman Kelompok 4', () => {
  const MEMBERS = [
    ['Luerina Sinaga', '241000308', 'luerina-sinaga'],
    ['Rani Ria Delima Ritonga', '241000354', 'rani-ria-delima-ritonga'],
    ['Jesina Noviani Br Tarigan', '241000275', 'jesina-noviani-br-tarigan'],
    ['Rehulina Br Barus', '241000286', 'rehulina-br-barus'],
    ['Rosdiana Hutahaean', '241000352', 'rosdiana-hutahaean'],
    ['Lydia Jessica Simatupang', '241000360', 'lydia-jessica-simatupang'],
    ['Caessya Yunita Nainggolan', '241000307', 'caessya-yunita-nainggolan']
  ];
  const page = (html.match(/<section class="page" id="page-kelompok"[\s\S]*?<\/section>\s*<\/main>/) || [''])[0];

  test('rute #/kelompok terdaftar di router', () => {
    assert.match(js, /var ROUTES = \[[^\]]*'kelompok'[^\]]*\]/);
    assert.ok(page, 'section #page-kelompok');
    assert.match(page, /data-page="kelompok"/);
    assert.match(page, /data-title="Kelompok 4"/);
  });

  test('menu navbar berurutan dan footer memuat Kelompok 4', () => {
    const order = [...html.matchAll(/data-nav="([^"]+)"/g)].map((m) => m[1]);
    assert.deepEqual(order, ['beranda', 'informasi', 'data', 'simulasi', 'kelompok']);
    const footer = html.match(/<footer class="site-footer">[\s\S]*<\/footer>/)[0];
    assert.match(footer, /<a href="#\/kelompok">Kelompok 4<\/a>/);
  });

  test('judul dan deskripsi sesuai permintaan', () => {
    assert.match(page, /<h1[^>]*>Kenali Kelompok 4<\/h1>/);
    assert.ok(page.includes('Tim pengembang media edukasi Kesehatan Digital Anemia yang berkomitmen meningkatkan pengetahuan dan kesadaran masyarakat mengenai anemia melalui teknologi digital.'));
  });

  test('tujuh kartu anggota berisi foto, nama, dan NIM sesuai urutan', () => {
    const cards = [...page.matchAll(/<article class="member-card[^"]*">([\s\S]*?)<\/article>/g)].map((m) => m[1]);
    assert.equal(cards.length, MEMBERS.length);
    cards.forEach((card, index) => {
      const [name, nim, slug] = MEMBERS[index];
      assert.match(card, new RegExp('<img src="assets/team/' + slug + '\\.webp" alt="Foto ' + name + '" width="600" height="800"'), name);
      assert.match(card, new RegExp('<h2 class="member-name">' + name + '</h2>'), name);
      assert.match(card, new RegExp('>' + nim + '<'), nim);
    });
  });

  test('foto profil bulat 1:1 dengan bingkai lingkaran', () => {
    const block = (selector) => {
      const match = css.match(new RegExp('\\n' + selector.replace(/\./g, '\\.') + ' \\{([^}]*)\\}'));
      return match ? match[1] : '';
    };
    assert.equal((page.match(/<div class="member-avatar"><div class="member-photo"><img /g) || []).length, MEMBERS.length);
    assert.match(block('.member-avatar'), /border-radius: 50%;/);
    assert.match(block('.member-photo'), /aspect-ratio: 1;/);
    assert.match(block('.member-photo'), /border-radius: 50%;/);
    assert.match(block('.member-photo img'), /object-fit: cover;/);
  });

  test('foto anggota berupa WebP yang ringan', () => {
    for (const [, , slug] of MEMBERS) {
      const file = path.join(ROOT, 'assets', 'team', slug + '.webp');
      assert.ok(fs.existsSync(file), slug);
      const head = fs.readFileSync(file).subarray(0, 16).toString('latin1');
      assert.ok(head.startsWith('RIFF') && head.includes('WEBP'), slug + ' bukan WebP');
      assert.ok(fs.statSync(file).size < 150 * 1024, slug + ' lebih dari 150 KB');
    }
  });
});
