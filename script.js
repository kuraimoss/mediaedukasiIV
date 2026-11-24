/*!
 * Kesdig Anemia — Kesehatan Digital Anemia
 * Logika skrining rule-based (ambang Hb WHO 2024) dan antarmuka situs.
 * Semua jawaban diproses di perangkat pengguna: tidak disimpan dan tidak dikirim ke mana pun.
 */

/* ==========================================================================
   1. LOGIKA SKRINING (murni, tanpa DOM — diuji di tests/screening.test.js)
   ========================================================================== */
(function (root, factory) {
  'use strict';
  var api = factory();
  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  }
  if (root) {
    root.KesdigAnemia = api;
  }
}(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  var VERSION = '1.0.0';

  /**
   * Ambang hemoglobin WHO 2024 (g/L) per kelompok.
   * none  = batas bawah "tidak anemia" (Hb >= none)
   * mild  = batas bawah anemia ringan (mild <= Hb < none)
   * severe = di bawah nilai ini termasuk anemia berat; antara severe dan mild = sedang
   * Sumber: WHO. Guideline on haemoglobin cutoffs to define anaemia in individuals
   * and populations. Geneva: WHO; 2024.
   */
  var GROUPS = {
    'child-6-23m': { label: 'Anak usia 6–23 bulan', none: 105, mild: 95, severe: 70 },
    'child-24-59m': { label: 'Anak usia 24–59 bulan', none: 110, mild: 100, severe: 70 },
    'child-5-11y': { label: 'Anak usia 5–11 tahun', none: 115, mild: 110, severe: 80 },
    'adolescent-12-14y': { label: 'Remaja usia 12–14 tahun (perempuan tidak hamil dan laki-laki)', none: 120, mild: 110, severe: 80 },
    'women-15-65y': { label: 'Perempuan tidak hamil usia 15–65 tahun', none: 120, mild: 110, severe: 80 },
    'men-15-65y': { label: 'Laki-laki usia 15–65 tahun', none: 130, mild: 110, severe: 80 },
    'pregnant-t1': { label: 'Ibu hamil trimester 1', none: 110, mild: 100, severe: 70 },
    'pregnant-t2': { label: 'Ibu hamil trimester 2', none: 105, mild: 95, severe: 70 },
    'pregnant-t3': { label: 'Ibu hamil trimester 3', none: 110, mild: 100, severe: 70 }
  };

  var GROUP_ORDER = [
    'child-6-23m', 'child-24-59m', 'child-5-11y', 'adolescent-12-14y',
    'women-15-65y', 'men-15-65y', 'pregnant-t1', 'pregnant-t2', 'pregnant-t3'
  ];

  var CATEGORY_LABELS = {
    none: 'Tidak memenuhi kriteria anemia berdasarkan Hb',
    mild: 'Anemia ringan',
    moderate: 'Anemia sedang',
    severe: 'Anemia berat',
    undetermined: 'Belum dapat ditentukan'
  };

  /** Penyesuaian Hb (g/L) untuk ketinggian tempat tinggal, kelipatan 500 m (WHO 2024). */
  var ELEVATION_ADJ = {
    0: 0, 500: 4, 1000: 8, 1500: 11, 2000: 14, 2500: 18, 3000: 21, 3500: 25, 4000: 29, 4500: 33
  };

  /** Penyesuaian Hb (g/L) untuk kebiasaan merokok (WHO 2024). */
  var SMOKING_ADJ = { no: 0, unknown: 3, lt10: 3, '10to19': 5, gte20: 6 };

  var LABELS = {
    sex: { female: 'Perempuan', male: 'Laki-laki' },
    pregnant: { no: 'Tidak hamil', yes: 'Sedang hamil' },
    trimester: { 1: 'Trimester 1', 2: 'Trimester 2', 3: 'Trimester 3' },
    hbKnown: { yes: 'Ya, saya tahu kadar Hb saya', no: 'Belum tahu kadar Hb' },
    hbTestedWhen: { recent: 'Kurang dari 1 bulan lalu', mid: '1–6 bulan lalu', old: 'Lebih dari 6 bulan lalu' },
    elevation: {
      0: 'Di bawah 500 mdpl atau tidak tahu', 500: '500–999 mdpl', 1000: '1.000–1.499 mdpl',
      1500: '1.500–1.999 mdpl', 2000: '2.000–2.499 mdpl', 2500: '2.500–2.999 mdpl',
      3000: '3.000–3.499 mdpl', 3500: '3.500–3.999 mdpl', 4000: '4.000–4.499 mdpl', 4500: '4.500–4.999 mdpl'
    },
    smoking: {
      no: 'Tidak merokok', unknown: 'Merokok, jumlah tidak tentu', lt10: 'Kurang dari 10 batang per hari',
      '10to19': '10–19 batang per hari', gte20: '20 batang per hari atau lebih'
    },
    menstruationStatus: {
      active: 'Mengalami menstruasi', 'not-yet': 'Belum pernah menstruasi', stopped: 'Sudah tidak menstruasi'
    },
    regularity: { regular: 'Teratur', irregular: 'Tidak teratur', unknown: 'Tidak tahu' },
    duration: { lt3: 'Kurang dari 3 hari', '3to7': '3–7 hari', gt7: 'Lebih dari 7 hari' },
    volume: { normal: 'Normal', heavy: 'Banyak', unknown: 'Tidak tahu' },
    ironFreq: {
      daily: 'Setiap hari', often: '3–6 kali per minggu', sometimes: '1–2 kali per minggu', rarely: 'Jarang atau hampir tidak pernah'
    },
    meals: { '3plus': '3 kali atau lebih', 2: '2 kali', 1: '1 kali atau kurang' },
    breakfast: { daily: 'Setiap hari', sometimes: 'Kadang-kadang', rarely: 'Jarang atau tidak pernah' },
    teaCoffee: { never: 'Tidak pernah atau jarang', sometimes: 'Kadang-kadang', often: 'Sering' },
    ttdUse: { yes: 'Ya', no: 'Tidak', na: 'Tidak berlaku untuk saya' },
    ttdFrequency: { daily: 'Setiap hari', weekly: '1 kali seminggu', irregular: 'Tidak menentu' },
    ttdAdherence: { always: 'Selalu sesuai anjuran', sometimes: 'Kadang terlewat', 'often-missed': 'Sering terlewat' },
    symptoms: {
      lemas: 'Lemas', pusing: 'Pusing', pucat: 'Pucat', lelah: 'Mudah lelah', berdebar: 'Jantung berdebar',
      sesak: 'Sesak napas', 'sakit-kepala': 'Sakit kepala', konsentrasi: 'Sulit konsentrasi', none: 'Tidak ada gejala'
    },
    danger: {
      pingsan: 'Pingsan atau hampir pingsan', 'nyeri-dada': 'Nyeri dada', 'sesak-berat': 'Sesak napas berat',
      'perdarahan-berat': 'Perdarahan berat', none: 'Tidak ada tanda bahaya'
    }
  };

  var REASONS = {
    unknown: 'Kadar Hb belum diketahui. Status anemia hanya dapat ditentukan melalui pemeriksaan darah.',
    invalid: 'Nilai Hb yang dimasukkan tidak valid, sehingga tidak diklasifikasikan.',
    infant: 'Tabel ambang WHO 2024 tidak mencakup bayi di bawah 6 bulan.',
    over65: 'Tabel ambang WHO 2024 hanya mencakup dewasa usia 15–65 tahun, sehingga hasil untuk usia di atas 65 tahun sebaiknya ditafsirkan oleh tenaga kesehatan.',
    trimester: 'Trimester kehamilan belum dipilih.',
    sex: 'Jenis kelamin diperlukan untuk menentukan ambang Hb usia 15 tahun ke atas.',
    months: 'Usia dalam bulan diperlukan dan harus sesuai dengan usia dalam tahun untuk anak di bawah 5 tahun.',
    age: 'Usia tidak valid.'
  };

  var FACTORS = {
    'menstruation-heavy': {
      area: 'Menstruasi', title: 'Darah menstruasi banyak',
      detail: 'Perdarahan menstruasi yang banyak (misalnya ganti pembalut setiap 1–2 jam atau ada gumpalan besar) membuat tubuh kehilangan lebih banyak zat besi.'
    },
    'menstruation-long': {
      area: 'Menstruasi', title: 'Menstruasi lebih dari 7 hari',
      detail: 'Menstruasi yang berlangsung lama menambah jumlah darah dan zat besi yang hilang setiap siklus.'
    },
    'menstruation-irregular': {
      area: 'Menstruasi', title: 'Siklus menstruasi tidak teratur',
      detail: 'Siklus yang terus tidak teratur perlu dipantau dan dikonsultasikan karena dapat berkaitan dengan pola perdarahan yang tidak biasa.'
    },
    'iron-low': {
      area: 'Pola makan', title: 'Jarang makan makanan sumber zat besi',
      detail: 'Kurangnya asupan zat besi dari makanan adalah penyebab kekurangan gizi yang paling sering berujung pada anemia.'
    },
    'meals-low': {
      area: 'Pola makan', title: 'Makan utama kurang dari 3 kali sehari',
      detail: 'Frekuensi makan yang kurang memperkecil peluang memenuhi kebutuhan zat besi, protein, dan vitamin harian.'
    },
    'breakfast-skip': {
      area: 'Pola makan', title: 'Sering melewatkan sarapan',
      detail: 'Melewatkan sarapan mengurangi asupan gizi harian dan dapat membuat tubuh lebih cepat lemas.'
    },
    'tea-coffee': {
      area: 'Pola makan', title: 'Sering minum teh atau kopi saat makan',
      detail: 'Teh dan kopi dapat menghambat penyerapan zat besi bila diminum bersamaan dengan makanan sumber zat besi.'
    },
    'ttd-none': {
      area: 'Tablet Tambah Darah', title: 'Belum minum TTD sesuai anjuran',
      detail: 'Anda termasuk kelompok sasaran program Tablet Tambah Darah (remaja putri, wanita usia subur, atau ibu hamil).'
    },
    'ttd-below': {
      area: 'Tablet Tambah Darah', title: 'Frekuensi TTD/MMS di bawah anjuran ibu hamil',
      detail: 'Ibu hamil dianjurkan minum suplemen (TTD atau MMS) setiap hari selama kehamilan sesuai anjuran tenaga kesehatan.'
    },
    'ttd-irregular': {
      area: 'Tablet Tambah Darah', title: 'Konsumsi TTD belum rutin',
      detail: 'Manfaat TTD paling optimal bila diminum teratur sesuai jadwal yang dianjurkan.'
    },
    pregnancy: {
      area: 'Kondisi', title: 'Sedang hamil',
      detail: 'Kebutuhan zat besi meningkat selama kehamilan untuk ibu dan pertumbuhan janin.'
    },
    'vulnerable-child': {
      area: 'Kondisi', title: 'Anak balita termasuk kelompok rentan',
      detail: 'WHO menyebut anak di bawah 5 tahun, terutama di bawah 2 tahun, sebagai kelompok yang paling rentan mengalami anemia.'
    },
    'vulnerable-menstruating': {
      area: 'Kondisi', title: 'Perempuan yang menstruasi termasuk kelompok rentan',
      detail: 'WHO menyebut remaja putri dan perempuan yang menstruasi sebagai salah satu kelompok paling rentan mengalami anemia.'
    },
    symptoms: {
      area: 'Gejala', title: 'Mengalami beberapa gejala yang sering dikaitkan dengan anemia',
      detail: 'Gejala anemia tidak khas dan bisa disebabkan kondisi lain, sehingga tetap perlu dipastikan dengan pemeriksaan Hb.'
    }
  };

  /* ----- Utilitas ------------------------------------------------------ */

  function has(obj, key) {
    return Object.prototype.hasOwnProperty.call(obj, key);
  }

  function toInt(value) {
    if (value === null || value === undefined || value === '') {
      return Number.NaN;
    }
    var n = Number(value);
    return Number.isInteger(n) ? n : Number.NaN;
  }

  /** Format angka g/dL ala Indonesia: 11.5 → "11,5", 11.65 → "11,65", 12 → "12,0". */
  function formatHb(value) {
    if (typeof value !== 'number' || !isFinite(value)) {
      return '–';
    }
    var tenths = Math.round(value * 100) / 10;
    var text = Number.isInteger(tenths) ? value.toFixed(1) : value.toFixed(2);
    return text.replace('.', ',');
  }

  function fmtGL(gL) {
    return (gL / 10).toFixed(1).replace('.', ',');
  }

  /* ----- Input Hb ------------------------------------------------------ */

  function parseHb(raw) {
    var text = raw === null || raw === undefined ? '' : String(raw).trim().replace(',', '.');
    if (text === '') {
      return { ok: false, reason: 'empty' };
    }
    if (!/^\d{1,3}(\.\d{1,2})?$/.test(text)) {
      return { ok: false, reason: 'format' };
    }
    var value = Number(text);
    if (value >= 30 && value <= 250) {
      return { ok: false, reason: 'gl' };
    }
    if (value < 3 || value > 25) {
      return { ok: false, reason: 'range' };
    }
    return { ok: true, value: value };
  }

  /** g/dL → g/L, dibulatkan ke 0,01 g/L agar bebas galat floating point. */
  function toGL(gdl) {
    return Math.round(gdl * 1000) / 100;
  }

  /* ----- Kelompok acuan ------------------------------------------------ */

  function ageOf(profile) {
    return toInt(profile && profile.ageYears);
  }

  function isPregnancyRelevant(profile) {
    var years = ageOf(profile);
    return !!profile && profile.sex === 'female' && years >= 10 && years <= 55;
  }

  function isEffectivelyPregnant(profile) {
    return !!profile && profile.pregnant === 'yes' && isPregnancyRelevant(profile);
  }

  function isMenstruationRelevant(profile) {
    var years = ageOf(profile);
    return !!profile && profile.sex === 'female' && !isEffectivelyPregnant(profile) && years >= 9 && years <= 55;
  }

  /** 'daily' untuk ibu hamil, 'weekly' untuk remaja putri dan WUS 12–49 tahun, selain itu null. */
  function ttdTarget(profile) {
    if (isEffectivelyPregnant(profile)) {
      return 'daily';
    }
    var years = ageOf(profile);
    if (profile && profile.sex === 'female' && years >= 12 && years <= 49) {
      return 'weekly';
    }
    return null;
  }

  function groupRef(id) {
    return { id: id, label: GROUPS[id].label, reason: null };
  }

  function noGroup(reason) {
    return { id: null, label: null, reason: reason };
  }

  function getReferenceGroup(profile) {
    var p = profile || {};
    var years = toInt(p.ageYears);
    if (!Number.isInteger(years) || years < 0 || years > 120) {
      return noGroup('age');
    }
    if (isEffectivelyPregnant(p)) {
      var trimester = toInt(p.trimester);
      if (trimester === 1 || trimester === 2 || trimester === 3) {
        return groupRef('pregnant-t' + trimester);
      }
      return noGroup('trimester');
    }
    if (years < 5) {
      var months = toInt(p.ageMonths);
      if (!Number.isInteger(months) || months < 0 || Math.floor(months / 12) !== years) {
        return noGroup('months');
      }
      if (months < 6) {
        return noGroup('infant');
      }
      return groupRef(months < 24 ? 'child-6-23m' : 'child-24-59m');
    }
    if (years <= 11) {
      return groupRef('child-5-11y');
    }
    if (years <= 14) {
      return groupRef('adolescent-12-14y');
    }
    if (years > 65) {
      return noGroup('over65');
    }
    if (p.sex === 'female') {
      return groupRef('women-15-65y');
    }
    if (p.sex === 'male') {
      return groupRef('men-15-65y');
    }
    return noGroup('sex');
  }

  /* ----- Klasifikasi Hb ------------------------------------------------ */

  function classifyHb(gL, groupId) {
    var g = GROUPS[groupId];
    if (!g || typeof gL !== 'number' || !isFinite(gL)) {
      return 'undetermined';
    }
    if (gL >= g.none) {
      return 'none';
    }
    if (gL >= g.mild) {
      return 'mild';
    }
    if (gL >= g.severe) {
      return 'moderate';
    }
    return 'severe';
  }

  function rangeLabels(groupId) {
    var g = GROUPS[groupId];
    if (!g) {
      return null;
    }
    return {
      none: '≥ ' + fmtGL(g.none),
      mild: fmtGL(g.mild) + '–' + fmtGL(g.none - 1),
      moderate: fmtGL(g.severe) + '–' + fmtGL(g.mild - 1),
      severe: '< ' + fmtGL(g.severe)
    };
  }

  /** Skala indikator (g/dL) untuk visualisasi hasil. */
  function scaleFor(groupId) {
    var g = GROUPS[groupId];
    if (!g) {
      return null;
    }
    var min = (g.severe - 20) / 10;
    var max = (g.none + 40) / 10;
    return {
      min: min,
      max: max,
      zones: [
        { key: 'severe', from: min, to: g.severe / 10 },
        { key: 'moderate', from: g.severe / 10, to: g.mild / 10 },
        { key: 'mild', from: g.mild / 10, to: g.none / 10 },
        { key: 'none', from: g.none / 10, to: max }
      ]
    };
  }

  function hbAdjustment(options) {
    var o = options || {};
    var elevationKey = String(o.elevation);
    var smokingKey = String(o.smoking);
    var elevation = has(ELEVATION_ADJ, elevationKey) ? ELEVATION_ADJ[elevationKey] : 0;
    var smoking = has(SMOKING_ADJ, smokingKey) ? SMOKING_ADJ[smokingKey] : 0;
    return { elevation: elevation, smoking: smoking, total: elevation + smoking };
  }

  /* ----- Evaluasi lengkap --------------------------------------------- */

  function cleanName(name) {
    var text = String(name === null || name === undefined ? '' : name).replace(/\s+/g, ' ').trim();
    text = text.slice(0, 40).trim();
    return text || 'Pengguna';
  }

  function ageText(profile) {
    var years = toInt(profile.ageYears);
    var months = toInt(profile.ageMonths);
    if (!Number.isInteger(years)) {
      return '–';
    }
    if (years < 5 && Number.isInteger(months)) {
      return months < 12 ? months + ' bulan' : years + ' tahun (' + months + ' bulan)';
    }
    return years + ' tahun';
  }

  function pick(map, key) {
    return key !== null && key !== undefined && has(map, String(key)) ? map[String(key)] : '–';
  }

  function factor(id, extraDetail) {
    var f = FACTORS[id];
    return {
      id: id,
      area: f.area,
      title: f.title,
      detail: extraDetail ? f.detail + ' ' + extraDetail : f.detail
    };
  }

  function evaluateHb(answers, group) {
    var adjustment = hbAdjustment({ elevation: answers.elevation, smoking: answers.smoking });
    var hb = {
      known: false,
      measured: null,
      adjusted: null,
      adjustment: adjustment,
      testedWhen: has(LABELS.hbTestedWhen, String(answers.hbTestedWhen)) ? answers.hbTestedWhen : null,
      category: 'undetermined',
      label: CATEGORY_LABELS.undetermined,
      reason: null,
      reasonText: '',
      groupId: group.id,
      thresholds: group.id ? rangeLabels(group.id) : null,
      scale: group.id ? scaleFor(group.id) : null
    };
    if (answers.hbKnown !== 'yes') {
      hb.reason = 'unknown';
      hb.reasonText = REASONS.unknown;
      return hb;
    }
    var parsed = parseHb(answers.hbValue);
    if (!parsed.ok) {
      hb.reason = 'invalid';
      hb.reasonText = REASONS.invalid;
      return hb;
    }
    hb.known = true;
    hb.measured = parsed.value;
    var adjustedGL = Math.max(0, toGL(parsed.value) - adjustment.total);
    hb.adjusted = Math.round(adjustedGL * 10) / 100;
    if (!group.id) {
      hb.reason = group.reason;
      hb.reasonText = REASONS[group.reason] || '';
      return hb;
    }
    hb.category = classifyHb(adjustedGL, group.id);
    hb.label = CATEGORY_LABELS[hb.category];
    return hb;
  }

  function buildRecommendations(ctx) {
    var recs = [];
    function add(id, priority, title, text) {
      recs.push({ id: id, priority: priority, title: title, text: text });
    }
    var hb = ctx.hb;
    var ids = ctx.factorIds;

    if (ctx.danger.present) {
      add('danger', 'urgent', 'Segera cari pertolongan medis',
        'Anda menandai tanda bahaya: ' + ctx.danger.list.join(', ').toLowerCase() +
        '. Segera ke IGD atau fasilitas kesehatan terdekat, atau hubungi layanan gawat darurat 119. Jangan menunggu hasil skrining ini.');
    }
    if (hb.category === 'severe') {
      add('severe', 'urgent', 'Periksakan diri ke dokter hari ini',
        'Kadar Hb Anda berada pada kategori anemia berat menurut ambang WHO 2024. Kondisi ini perlu segera diperiksa dan ditangani dokter.');
    } else if (hb.category === 'moderate') {
      add('moderate', 'high', 'Jadwalkan pemeriksaan dalam waktu dekat',
        'Kadar Hb Anda berada pada kategori anemia sedang. Periksakan diri ke dokter atau Puskesmas untuk mencari penyebabnya dan mendapatkan penanganan yang tepat.');
    } else if (hb.category === 'mild') {
      add('mild', 'high', 'Konsultasikan hasil Hb Anda',
        'Kadar Hb Anda berada pada kategori anemia ringan. Tunjukkan hasil ini kepada tenaga kesehatan agar penyebabnya dapat diperiksa lebih lanjut.');
    } else if (hb.category === 'none') {
      add('maintain', 'normal', 'Pertahankan kebiasaan sehat',
        'Kadar Hb Anda tidak memenuhi kriteria anemia. Tetap jaga pola makan bergizi seimbang dan periksa Hb secara berkala, misalnya saat skrining di sekolah, Posyandu, atau pemeriksaan kehamilan.');
    } else if (hb.reason === 'unknown' || hb.reason === 'invalid') {
      add('test-hb', 'high', 'Periksa kadar Hb Anda',
        'Status anemia hanya dapat ditentukan dari pemeriksaan darah. Lakukan pemeriksaan Hb di Puskesmas, klinik, atau laboratorium' +
        (ids.indexOf('symptoms') !== -1 ? ', terutama karena Anda mengalami beberapa gejala.' : '.'));
    } else {
      add('interpret', 'high', 'Minta tenaga kesehatan menafsirkan hasil Hb',
        hb.reasonText + ' Bawa hasil pemeriksaan Anda saat berkonsultasi.');
    }
    if (hb.known && hb.testedWhen === 'old') {
      add('recheck', 'normal', 'Pertimbangkan pemeriksaan ulang',
        'Hasil Hb Anda sudah lebih dari 6 bulan. Pemeriksaan ulang membantu menggambarkan kondisi Anda saat ini.');
    }
    if (ids.indexOf('menstruation-heavy') !== -1 || ids.indexOf('menstruation-long') !== -1) {
      add('menstruation', 'high', 'Konsultasikan pola menstruasi',
        'Menstruasi yang banyak atau lebih dari 7 hari sebaiknya diperiksakan ke tenaga kesehatan karena dapat menyebabkan tubuh kehilangan banyak zat besi.');
    } else if (ids.indexOf('menstruation-irregular') !== -1) {
      add('cycle', 'normal', 'Catat siklus menstruasi',
        'Catat tanggal menstruasi setiap bulan dan konsultasikan bila siklus terus tidak teratur.');
    }
    if (ids.indexOf('pregnancy') !== -1) {
      add('anc', 'high', 'Rutin periksa kehamilan',
        'Lakukan pemeriksaan kehamilan minimal 6 kali selama kehamilan sesuai standar Kemenkes, termasuk pemeriksaan Hb.');
    }
    if (ctx.ttd.target === 'daily' && (ids.indexOf('ttd-none') !== -1 || ids.indexOf('ttd-below') !== -1 || ids.indexOf('ttd-irregular') !== -1)) {
      add('ttd-daily', 'high', 'Minum TTD atau MMS setiap hari',
        'Ibu hamil dianjurkan minum suplemen yang diberikan tenaga kesehatan (TTD atau MMS) 1 tablet setiap hari. Program MMS Kemenkes memberikan 180 tablet untuk diminum selama 6 bulan kehamilan.');
    } else if (ctx.ttd.target === 'weekly' && (ids.indexOf('ttd-none') !== -1 || ids.indexOf('ttd-irregular') !== -1)) {
      add('ttd-weekly', 'normal', 'Minum TTD 1 tablet setiap minggu',
        'Remaja putri dan wanita usia subur dianjurkan minum 1 tablet TTD setiap minggu. TTD dapat diperoleh melalui sekolah atau Puskesmas.');
    }
    if (ctx.ttd.use === 'yes' || ids.indexOf('ttd-none') !== -1) {
      add('ttd-tips', 'normal', 'Cara minum TTD yang tepat',
        'Minum TTD dengan air putih atau bersama buah, bukan dengan teh, kopi, atau susu. Mual ringan atau tinja berwarna gelap dapat terjadi; konsultasikan bila keluhan mengganggu.');
    }
    if (ids.indexOf('iron-low') !== -1) {
      add('iron-food', 'normal', 'Perbanyak makanan sumber zat besi',
        'Pilih hati, daging merah, ikan, ayam, dan telur, serta kacang-kacangan dan sayuran hijau tua. Padukan dengan buah atau sayur kaya vitamin C seperti jeruk, jambu biji, atau pepaya agar zat besi lebih mudah diserap.');
    }
    if (ids.indexOf('meals-low') !== -1 || ids.indexOf('breakfast-skip') !== -1) {
      add('meals', 'normal', 'Atur jadwal makan',
        'Usahakan makan utama 3 kali sehari dengan menu bergizi seimbang dan biasakan sarapan sebelum beraktivitas.');
    }
    if (ids.indexOf('tea-coffee') !== -1) {
      add('tea', 'normal', 'Beri jeda minum teh atau kopi',
        'Hindari minum teh atau kopi bersamaan dengan makan atau saat minum TTD karena dapat menghambat penyerapan zat besi.');
    }
    add('hygiene', 'normal', 'Cegah infeksi',
      'Cuci tangan pakai sabun dan jaga kebersihan lingkungan. Infeksi seperti kecacingan dapat menyebabkan anemia.');

    var order = { urgent: 0, high: 1, normal: 2 };
    return recs
      .map(function (r, i) { return { r: r, i: i }; })
      .sort(function (a, b) { return (order[a.r.priority] - order[b.r.priority]) || (a.i - b.i); })
      .map(function (x) { return x.r; });
  }

  function evaluate(answers) {
    var a = answers || {};
    var profileInput = {
      ageYears: a.ageYears,
      ageMonths: a.ageMonths,
      sex: a.sex === 'female' || a.sex === 'male' ? a.sex : null,
      pregnant: a.pregnant === 'yes' ? 'yes' : 'no',
      trimester: a.trimester
    };
    var pregnant = isEffectivelyPregnant(profileInput);
    var group = getReferenceGroup(profileInput);
    var factors = [];

    var hb = evaluateHb(a, group);

    /* Menstruasi */
    var menstruation = { relevant: isMenstruationRelevant(profileInput), status: null, items: [] };
    if (menstruation.relevant) {
      var m = a.menstruation || {};
      menstruation.status = has(LABELS.menstruationStatus, String(m.status)) ? m.status : null;
      menstruation.items.push(['Status', pick(LABELS.menstruationStatus, m.status)]);
      if (m.status === 'active') {
        menstruation.items.push(['Keteraturan siklus', pick(LABELS.regularity, m.regularity)]);
        menstruation.items.push(['Lama menstruasi', pick(LABELS.duration, m.duration)]);
        menstruation.items.push(['Jumlah darah', pick(LABELS.volume, m.volume)]);
        if (m.volume === 'heavy') {
          factors.push(factor('menstruation-heavy'));
        }
        if (m.duration === 'gt7') {
          factors.push(factor('menstruation-long'));
        }
        if (m.regularity === 'irregular') {
          factors.push(factor('menstruation-irregular'));
        }
      }
    }

    /* Pola makan */
    var d = a.diet || {};
    var diet = {
      items: [
        ['Makanan sumber zat besi', pick(LABELS.ironFreq, d.ironFreq)],
        ['Makan utama per hari', pick(LABELS.meals, d.meals)],
        ['Sarapan', pick(LABELS.breakfast, d.breakfast)],
        ['Teh atau kopi saat makan', pick(LABELS.teaCoffee, d.teaCoffee)]
      ]
    };
    if (d.ironFreq === 'sometimes' || d.ironFreq === 'rarely') {
      factors.push(factor('iron-low'));
    }
    if (String(d.meals) === '2' || String(d.meals) === '1') {
      factors.push(factor('meals-low'));
    }
    if (d.breakfast === 'rarely') {
      factors.push(factor('breakfast-skip'));
    }
    if (d.teaCoffee === 'often') {
      factors.push(factor('tea-coffee'));
    }

    /* Tablet Tambah Darah */
    var t = a.ttd || {};
    var target = ttdTarget(profileInput);
    var ttd = {
      target: target,
      use: has(LABELS.ttdUse, String(t.use)) ? t.use : null,
      items: [['Konsumsi TTD', pick(LABELS.ttdUse, t.use)]]
    };
    if (t.use === 'yes') {
      ttd.items.push(['Frekuensi', pick(LABELS.ttdFrequency, t.frequency)]);
      ttd.items.push(['Kepatuhan', pick(LABELS.ttdAdherence, t.adherence)]);
    }
    ttd.items.push(['Anjuran untuk kelompok Anda',
      target === 'daily' ? '1 tablet TTD atau MMS setiap hari selama kehamilan'
        : target === 'weekly' ? '1 tablet TTD setiap minggu'
          : 'Bukan sasaran rutin program TTD; ikuti anjuran tenaga kesehatan']);
    if (target) {
      if (t.use === 'no') {
        factors.push(factor('ttd-none'));
      } else if (t.use === 'yes') {
        if (target === 'daily' && t.frequency !== 'daily') {
          factors.push(factor('ttd-below'));
        } else if (t.frequency === 'irregular' || t.adherence === 'often-missed') {
          factors.push(factor('ttd-irregular'));
        }
      }
    }

    /* Kondisi */
    var years = toInt(profileInput.ageYears);
    if (pregnant) {
      factors.push(factor('pregnancy'));
    } else if (years < 5 && group.id) {
      factors.push(factor('vulnerable-child'));
    } else if (menstruation.relevant && menstruation.status === 'active') {
      factors.push(factor('vulnerable-menstruating'));
    }

    /* Gejala dan tanda bahaya */
    var symptomKeys = (Array.isArray(a.symptoms) ? a.symptoms : []).filter(function (s) {
      return s !== 'none' && has(LABELS.symptoms, s);
    });
    var symptoms = {
      list: symptomKeys.map(function (s) { return LABELS.symptoms[s]; }),
      count: symptomKeys.length
    };
    if (symptomKeys.length >= 2) {
      factors.push(factor('symptoms', 'Gejala yang Anda tandai: ' + symptoms.list.join(', ').toLowerCase() + '.'));
    }
    var dangerKeys = (Array.isArray(a.danger) ? a.danger : []).filter(function (s) {
      return s !== 'none' && has(LABELS.danger, s);
    });
    var danger = {
      present: dangerKeys.length > 0,
      list: dangerKeys.map(function (s) { return LABELS.danger[s]; })
    };

    var factorIds = factors.map(function (f) { return f.id; });
    var recommendations = buildRecommendations({
      hb: hb, danger: danger, ttd: ttd, factorIds: factorIds
    });

    return {
      version: VERSION,
      profile: {
        name: cleanName(a.name),
        ageText: ageText(profileInput),
        sexLabel: pick(LABELS.sex, profileInput.sex),
        pregnancyLabel: isPregnancyRelevant(profileInput)
          ? (pregnant ? 'Hamil, ' + pick(LABELS.trimester, profileInput.trimester).toLowerCase() : 'Tidak hamil')
          : null,
        group: group.id ? { id: group.id, label: group.label } : null,
        groupReason: group.reason
      },
      hb: hb,
      menstruation: menstruation,
      diet: diet,
      ttd: ttd,
      symptoms: symptoms,
      danger: danger,
      riskFactors: factors,
      recommendations: recommendations,
      urgent: danger.present || hb.category === 'severe'
    };
  }

  /* ----- Data statistik (bersumber resmi; jangan menambah data tanpa sumber) ----- */

  var DATA = {
    sources: {
      whoGho: {
        publisher: 'WHO',
        title: 'Global Health Observatory: Anaemia in women and children',
        url: 'https://www.who.int/data/gho/data/themes/topics/anaemia_in_women_and_children',
        note: 'Estimasi WHO; data perempuan 15–49 tahun hingga 2023, data anak 6–59 bulan hingga 2019. Diakses 23 November 2026.'
      },
      whoFactSheet: {
        publisher: 'WHO',
        title: 'Fact sheet: Anaemia',
        url: 'https://www.who.int/news-room/fact-sheets/detail/anaemia',
        note: 'Diakses 23 November 2026.'
      },
      whoGuideline: {
        publisher: 'WHO',
        title: 'Guideline on haemoglobin cutoffs to define anaemia in individuals and populations (2024)',
        url: 'https://www.who.int/publications/i/item/9789240088542',
        note: 'Terbit 5 Maret 2024. ISBN 978-92-4-008854-2.'
      },
      kemenkesSki: {
        publisher: 'BKPK Kemenkes RI',
        title: 'FAQ Hasil Utama Survei Kesehatan Indonesia (SKI) 2023',
        url: 'https://www.badankebijakan.kemkes.go.id/hasil-utama-ski-2023/',
        note: 'Perbandingan Riskesdas 2018 dan SKI 2023.'
      },
      kemenkesTtd: {
        publisher: 'BKPK Kemenkes RI',
        title: 'Anemia pada Remaja Putri: Tantangan Pencegahan melalui Konsumsi Tablet Tambah Darah',
        url: 'https://www.badankebijakan.kemkes.go.id/anemia-pada-remaja-putri-tantangan-pencegahan-melalui-konsumsi-tablet-tambah-darah/',
        note: 'Berdasarkan hasil SKI 2023.'
      },
      kemenkesMms: {
        publisher: 'Kemenkes RI',
        title: 'Menkes Tekankan Pentingnya Ragam Mikronutrien bagi Ibu Hamil',
        url: 'https://www.kemkes.go.id/id/menkes-tekankan-pentingnya-ragam-mikronutrien-bagi-ibu-hamil',
        note: 'Rilis 18 Oktober 2024.'
      }
    },
    comparison: {
      title: 'Prevalensi anemia: Indonesia dan global',
      unit: '%',
      source: 'whoGho',
      rows: [
        { label: 'Anak 6–59 bulan', year: 2019, indonesia: 38.4, indonesiaRange: [27.1, 51.1], global: 39.8, globalRange: [36.0, 43.8] },
        { label: 'Perempuan 15–49 tahun', year: 2023, indonesia: 26.7, indonesiaRange: [12.9, 46.8], global: 30.7, globalRange: [26.6, 34.9] },
        { label: 'Ibu hamil 15–49 tahun', year: 2023, indonesia: 27.1, indonesiaRange: [11.9, 42.2], global: 35.5, globalRange: [32.1, 39.1] },
        { label: 'Perempuan tidak hamil 15–49 tahun', year: 2023, indonesia: 26.7, indonesiaRange: [12.5, 47.3], global: 30.5, globalRange: [26.2, 34.8] }
      ]
    },
    trend: {
      title: 'Tren prevalensi anemia perempuan 15–49 tahun, 2000–2023',
      unit: '%',
      source: 'whoGho',
      years: [2000, 2001, 2002, 2003, 2004, 2005, 2006, 2007, 2008, 2009, 2010, 2011,
        2012, 2013, 2014, 2015, 2016, 2017, 2018, 2019, 2020, 2021, 2022, 2023],
      indonesia: {
        value: [31.7, 31.5, 31.4, 31.2, 31.1, 30.9, 30.7, 30.5, 30.2, 29.9, 29.6, 29.3,
          29.1, 28.9, 28.7, 28.5, 28.2, 27.9, 27.5, 27.2, 26.9, 26.7, 26.6, 26.7],
        low: [24, 23.8, 23.5, 23, 22.8, 22.4, 21.9, 21.4, 21.1, 20.8, 20.3, 19.8,
          19.6, 19.5, 19.4, 19.2, 18.9, 18.4, 17.7, 16.9, 16, 14.9, 13.7, 12.9],
        high: [41.5, 41.3, 41.6, 41.9, 42.4, 42.6, 42.6, 42.9, 42.9, 42.6, 42.2, 41.5,
          41.6, 41.2, 41, 40.7, 40.2, 40.1, 40.6, 41.2, 41.9, 42.9, 44.5, 46.8]
      },
      global: {
        value: [29.3, 29, 28.8, 28.7, 28.5, 28.4, 28.2, 28.1, 27.9, 27.7, 27.6, 27.5,
          27.6, 27.6, 27.8, 28, 28.2, 28.4, 28.6, 28.9, 29.2, 29.6, 30.1, 30.7],
        low: [26.4, 26.4, 26.3, 26.2, 26.1, 26, 25.9, 25.8, 25.7, 25.5, 25.4, 25.3,
          25.3, 25.5, 25.6, 25.7, 25.9, 26.1, 26.2, 26.3, 26.3, 26.4, 26.5, 26.6],
        high: [32.4, 31.9, 31.4, 31.1, 30.9, 30.7, 30.6, 30.4, 30.2, 30, 29.8, 29.7,
          29.7, 29.8, 30, 30.2, 30.5, 30.8, 31, 31.5, 32.1, 32.8, 33.7, 34.9]
      }
    },
    pregnantIndonesia: {
      title: 'Anemia pada ibu hamil di Indonesia',
      unit: '%',
      source: 'kemenkesSki',
      rows: [
        { label: 'Riskesdas 2018', year: 2018, value: 48.9 },
        { label: 'SKI 2023', year: 2023, value: 27.7 }
      ],
      note: 'Pada SKI 2023, prevalensi tertinggi ditemukan pada ibu hamil usia 35–44 tahun.'
    },
    ttdRemaja: {
      title: 'Tablet Tambah Darah pada remaja putri (SKI 2023)',
      unit: '%',
      year: 2023,
      source: 'kemenkesTtd',
      items: [
        { value: 54.8, text: 'remaja putri belum pernah mendapatkan TTD' },
        { value: 51.4, text: 'remaja putri tidak mengonsumsi TTD karena tidak mengetahui manfaatnya' }
      ]
    }
  };

  return {
    VERSION: VERSION,
    GROUPS: GROUPS,
    GROUP_ORDER: GROUP_ORDER,
    CATEGORY_LABELS: CATEGORY_LABELS,
    LABELS: LABELS,
    ELEVATION_ADJ: ELEVATION_ADJ,
    SMOKING_ADJ: SMOKING_ADJ,
    REASONS: REASONS,
    DATA: DATA,
    formatHb: formatHb,
    parseHb: parseHb,
    toGL: toGL,
    getReferenceGroup: getReferenceGroup,
    classifyHb: classifyHb,
    rangeLabels: rangeLabels,
    scaleFor: scaleFor,
    hbAdjustment: hbAdjustment,
    isPregnancyRelevant: isPregnancyRelevant,
    isMenstruationRelevant: isMenstruationRelevant,
    ttdTarget: ttdTarget,
    evaluate: evaluate
  };
}));

/* ==========================================================================
   2. ANTARMUKA (hanya berjalan di browser)
   ========================================================================== */
(function () {
  'use strict';

  if (typeof window === 'undefined' || typeof document === 'undefined') {
    return;
  }

  var Kesdig = window.KesdigAnemia;
  var doc = document;
  var root = doc.documentElement;
  var SVG_NS = 'http://www.w3.org/2000/svg';
  var motionQuery = window.matchMedia ? window.matchMedia('(prefers-reduced-motion: reduce)') : null;

  /* ----- Utilitas DOM -------------------------------------------------- */

  function reducedMotion() {
    return !!(motionQuery && motionQuery.matches);
  }

  function $(selector, context) {
    return (context || doc).querySelector(selector);
  }

  function $$(selector, context) {
    return Array.prototype.slice.call((context || doc).querySelectorAll(selector));
  }

  function el(tag, className, text) {
    var node = doc.createElement(tag);
    if (className) {
      node.className = className;
    }
    if (text !== undefined && text !== null) {
      node.textContent = text;
    }
    return node;
  }

  function svgEl(tag, attrs) {
    var node = doc.createElementNS(SVG_NS, tag);
    Object.keys(attrs || {}).forEach(function (key) {
      node.setAttribute(key, attrs[key]);
    });
    return node;
  }

  function clear(node) {
    while (node && node.firstChild) {
      node.removeChild(node.firstChild);
    }
  }

  function fmtNum(value, decimals) {
    return Number(value).toLocaleString('id-ID', {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals
    });
  }

  function fmtPct(value) {
    return fmtNum(value, 1) + '%';
  }

  function scrollBehavior() {
    return reducedMotion() ? 'auto' : 'smooth';
  }

  function headerHeight() {
    var header = $('.site-header');
    return header ? header.offsetHeight : 0;
  }

  function addKv(dl, label, value) {
    var row = el('div');
    row.appendChild(el('dt', null, label));
    row.appendChild(el('dd', null, value));
    dl.appendChild(row);
  }

  function onVisible(nodes, callback, options) {
    var list = Array.isArray(nodes) ? nodes : [nodes];
    if (!('IntersectionObserver' in window)) {
      list.forEach(callback);
      return;
    }
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) {
          io.unobserve(entry.target);
          callback(entry.target);
        }
      });
    }, options || { rootMargin: '0px 0px -8% 0px', threshold: 0 });
    list.forEach(function (node) {
      if (node) {
        io.observe(node);
      }
    });
  }

  /* ----- Toast --------------------------------------------------------- */

  var toastTimer = null;

  function toast(message) {
    var node = $('#toast');
    if (!node) {
      return;
    }
    node.textContent = message;
    node.classList.add('is-visible');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () {
      node.classList.remove('is-visible');
      setTimeout(function () {
        node.textContent = '';
      }, 400);
    }, 4500);
  }

  /* ----- Tema terang/gelap (tidak disimpan) ----------------------------- */

  function initTheme() {
    var button = $('#theme-toggle');
    if (!button || !window.matchMedia) {
      return;
    }
    var darkQuery = window.matchMedia('(prefers-color-scheme: dark)');
    function current() {
      return root.getAttribute('data-theme') || (darkQuery.matches ? 'dark' : 'light');
    }
    function sync() {
      button.setAttribute('aria-pressed', String(current() === 'dark'));
    }
    button.addEventListener('click', function () {
      root.setAttribute('data-theme', current() === 'dark' ? 'light' : 'dark');
      sync();
    });
    if (darkQuery.addEventListener) {
      darkQuery.addEventListener('change', sync);
    }
    sync();
  }

  /* ----- Header, menu seluler, progres scroll -------------------------- */

  function initHeader() {
    var header = $('.site-header');
    var toggle = $('#nav-toggle');
    var nav = $('#site-nav');
    var bar = $('#scroll-progress-bar');
    if (!header) {
      return;
    }
    function setOpen(open) {
      header.classList.toggle('nav-open', open);
      if (toggle) {
        toggle.setAttribute('aria-expanded', String(open));
        toggle.setAttribute('aria-label', open ? 'Tutup menu' : 'Buka menu');
      }
    }
    if (toggle) {
      toggle.addEventListener('click', function () {
        setOpen(!header.classList.contains('nav-open'));
      });
    }
    if (nav) {
      nav.addEventListener('click', function (event) {
        if (event.target.closest('a')) {
          setOpen(false);
        }
      });
    }
    doc.addEventListener('keydown', function (event) {
      if (event.key === 'Escape' && header.classList.contains('nav-open')) {
        setOpen(false);
        if (toggle) {
          toggle.focus();
        }
      }
    });
    doc.addEventListener('click', function (event) {
      if (header.classList.contains('nav-open') && !header.contains(event.target)) {
        setOpen(false);
      }
    });

    var ticking = false;
    function update() {
      ticking = false;
      var y = window.scrollY || window.pageYOffset || 0;
      header.classList.toggle('is-scrolled', y > 8);
      if (bar) {
        var max = root.scrollHeight - window.innerHeight;
        var progress = max > 0 ? Math.min(1, Math.max(0, y / max)) : 0;
        bar.style.setProperty('--p', progress.toFixed(4));
      }
    }
    window.addEventListener('scroll', function () {
      if (!ticking) {
        ticking = true;
        window.requestAnimationFrame(update);
      }
    }, { passive: true });
    update();
  }

  /* ----- Reveal, stagger, hitung naik, sorotan kartu ------------------- */

  function initReveal() {
    root.classList.add('reveal-ready');
    $$('[data-stagger]').forEach(function (group) {
      Array.prototype.forEach.call(group.children, function (child, index) {
        child.style.setProperty('--i', String(index));
      });
    });
    onVisible($$('.reveal, [data-stagger]'), function (node) {
      node.classList.add('is-visible');
    });
  }

  function runCounter(node) {
    var target = parseFloat(node.getAttribute('data-count'));
    var decimals = parseInt(node.getAttribute('data-decimals') || '0', 10);
    if (!isFinite(target)) {
      return;
    }
    if (reducedMotion()) {
      node.textContent = fmtNum(target, decimals);
      return;
    }
    var start = null;
    var duration = 1400;
    function frame(now) {
      if (start === null) {
        start = now;
      }
      var t = Math.min(1, (now - start) / duration);
      var eased = 1 - Math.pow(1 - t, 3);
      node.textContent = fmtNum(target * eased, decimals);
      if (t < 1) {
        window.requestAnimationFrame(frame);
      }
    }
    node.textContent = fmtNum(0, decimals);
    window.requestAnimationFrame(frame);
  }

  function initCounters() {
    onVisible($$('.count[data-count]'), runCounter, { threshold: 0.4 });
  }

  function initSpotlight() {
    if (!window.matchMedia || !window.matchMedia('(hover: hover) and (pointer: fine)').matches) {
      return;
    }
    var pending = null;
    var lastEvent = null;
    doc.addEventListener('pointermove', function (event) {
      lastEvent = event;
      if (pending) {
        return;
      }
      pending = window.requestAnimationFrame(function () {
        pending = null;
        var card = lastEvent.target.closest && lastEvent.target.closest('.card-spot');
        if (!card) {
          return;
        }
        var rect = card.getBoundingClientRect();
        card.style.setProperty('--mx', Math.round(lastEvent.clientX - rect.left) + 'px');
        card.style.setProperty('--my', Math.round(lastEvent.clientY - rect.top) + 'px');
      });
    }, { passive: true });
  }

  function initHeroPause() {
    var hero = $('.hero');
    if (!hero || !('IntersectionObserver' in window)) {
      return;
    }
    new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        hero.classList.toggle('is-paused', !entry.isIntersecting);
      });
    }).observe(hero);
  }

  function initToc() {
    var links = $$('.toc-list a');
    if (!links.length || !('IntersectionObserver' in window)) {
      return;
    }
    var byId = {};
    links.forEach(function (link) {
      byId[link.getAttribute('href').slice(1)] = link;
    });
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (!entry.isIntersecting) {
          return;
        }
        links.forEach(function (link) {
          link.classList.remove('is-current');
          link.removeAttribute('aria-current');
        });
        var active = byId[entry.target.id];
        if (active) {
          active.classList.add('is-current');
          active.setAttribute('aria-current', 'true');
        }
      });
    }, { rootMargin: '-30% 0px -60% 0px' });
    $$('.info-section').forEach(function (section) {
      io.observe(section);
    });
  }

  /* ----- Router berbasis hash ----------------------------------------- */

  var ROUTES = ['beranda', 'informasi', 'data', 'simulasi', 'hasil'];
  var BASE_TITLE = doc.title;
  var currentRoute = null;
  var lastResult = null;
  var routeHooks = {};

  function routeFromHash() {
    var hash = window.location.hash || '';
    if (hash === '' || hash === '#') {
      return 'beranda';
    }
    if (hash.indexOf('#/') !== 0) {
      return null;
    }
    var name = hash.slice(2).split(/[?#/]/)[0] || 'beranda';
    return ROUTES.indexOf(name) !== -1 ? name : 'beranda';
  }

  function hashFor(name) {
    return name === 'beranda' ? '#/' : '#/' + name;
  }

  function showRoute(name) {
    if (name === 'hasil' && !lastResult) {
      toast('Hasil simulasi tidak disimpan. Silakan isi simulasi terlebih dahulu.');
      window.history.replaceState(null, '', hashFor('simulasi'));
      name = 'simulasi';
    }
    var page = $('#page-' + name);
    if (!page) {
      return;
    }
    $$('.page').forEach(function (section) {
      section.classList.toggle('is-active', section === page);
    });
    $$('[data-nav]').forEach(function (link) {
      if (link.getAttribute('data-nav') === name) {
        link.setAttribute('aria-current', 'page');
      } else {
        link.removeAttribute('aria-current');
      }
    });
    doc.title = name === 'beranda' ? BASE_TITLE : page.getAttribute('data-title') + ' · Kesdig Anemia';
    var firstLoad = currentRoute === null;
    currentRoute = name;
    if (!firstLoad) {
      window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
      var heading = page.querySelector('h1');
      if (heading) {
        heading.focus({ preventScroll: true });
      }
    }
    if (routeHooks[name]) {
      routeHooks[name]();
    }
  }

  function navigate(name) {
    var hash = hashFor(name);
    if (window.location.hash === hash) {
      showRoute(name);
    } else {
      window.location.hash = hash;
    }
  }

  function initRouter() {
    window.addEventListener('hashchange', function () {
      var name = routeFromHash();
      if (name) {
        showRoute(name);
      }
    });
    doc.addEventListener('click', function (event) {
      var link = event.target.closest && event.target.closest('a[href^="#"]');
      if (!link || event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey) {
        return;
      }
      var href = link.getAttribute('href');
      if (href.indexOf('#/') === 0) {
        if (window.location.hash === href || (href === '#/' && routeFromHash() === 'beranda' && currentRoute === 'beranda')) {
          event.preventDefault();
          window.scrollTo({ top: 0, behavior: scrollBehavior() });
        }
        return;
      }
      if (href === '#top') {
        event.preventDefault();
        window.scrollTo({ top: 0, behavior: scrollBehavior() });
        return;
      }
      var target = doc.getElementById(href.slice(1));
      if (!target) {
        return;
      }
      event.preventDefault();
      target.scrollIntoView({ behavior: scrollBehavior(), block: 'start' });
      if (!target.hasAttribute('tabindex')) {
        target.setAttribute('tabindex', '-1');
      }
      target.focus({ preventScroll: true });
    });
    showRoute(routeFromHash() || 'beranda');
  }

  /* ----- Grafik -------------------------------------------------------- */

  var tooltipNode = null;

  function tooltipFor(container) {
    if (!tooltipNode) {
      tooltipNode = el('div', 'chart-tooltip');
      tooltipNode.setAttribute('aria-hidden', 'true');
    }
    if (tooltipNode.parentNode !== container) {
      container.appendChild(tooltipNode);
    }
    return tooltipNode;
  }

  function fillTooltip(tip, title, rows, note) {
    clear(tip);
    tip.appendChild(el('strong', null, title));
    rows.forEach(function (row) {
      var line = el('div', 'tt-row');
      var swatch = el('span', 'tt-swatch');
      swatch.style.setProperty('background', row.color);
      line.appendChild(swatch);
      line.appendChild(el('span', null, row.text));
      tip.appendChild(line);
    });
    if (note) {
      tip.appendChild(el('div', 'tt-muted', note));
    }
  }

  function placeTooltip(tip, container, x, y) {
    var width = container.clientWidth;
    var tipWidth = tip.offsetWidth || 200;
    var left = Math.min(Math.max(8, x + 14), Math.max(8, width - tipWidth - 8));
    tip.style.setProperty('left', left + 'px');
    tip.style.setProperty('top', Math.max(0, y - tip.offsetHeight - 12) + 'px');
    tip.classList.add('is-visible');
  }

  function hideTooltip() {
    if (tooltipNode) {
      tooltipNode.classList.remove('is-visible');
    }
  }

  function seriesColor(key) {
    return getComputedStyle(root).getPropertyValue(key === 'idn' ? '--c-idn' : '--c-glb').trim();
  }

  function buildTable(caption, head, rows) {
    var details = el('details', 'table-view');
    details.appendChild(el('summary', null, 'Lihat data dalam tabel'));
    var wrap = el('div', 'table-scroll');
    var table = el('table', 'data-table');
    table.appendChild(el('caption', 'sr-only', caption));
    var thead = el('thead');
    var headRow = el('tr');
    head.forEach(function (text) {
      var th = el('th', null, text);
      th.setAttribute('scope', 'col');
      headRow.appendChild(th);
    });
    thead.appendChild(headRow);
    table.appendChild(thead);
    var tbody = el('tbody');
    rows.forEach(function (cells) {
      var tr = el('tr');
      cells.forEach(function (text, index) {
        var cell = el(index === 0 ? 'th' : 'td', null, text);
        if (index === 0) {
          cell.setAttribute('scope', 'row');
        }
        tr.appendChild(cell);
      });
      tbody.appendChild(tr);
    });
    table.appendChild(tbody);
    wrap.appendChild(table);
    details.appendChild(wrap);
    return details;
  }

  function renderComparison(container) {
    var data = Kesdig.DATA.comparison;
    var max = 50;
    clear(container);
    var chart = el('div', 'hbar-chart');
    var series = [
      { key: 'idn', field: 'indonesia', range: 'indonesiaRange', name: 'Indonesia', cls: 'hbar--idn' },
      { key: 'glb', field: 'global', range: 'globalRange', name: 'Global', cls: 'hbar--glb' }
    ];
    data.rows.forEach(function (row) {
      var rowNode = el('div', 'hbar-row');
      var label = el('div', 'hbar-label');
      label.appendChild(doc.createTextNode(row.label));
      label.appendChild(el('span', 'year-chip', 'data ' + row.year));
      rowNode.appendChild(label);
      series.forEach(function (s) {
        var value = row[s.field];
        var range = row[s.range];
        var track = el('div', 'hbar-track');
        track.tabIndex = 0;
        track.setAttribute('role', 'img');
        track.setAttribute('aria-label', s.name + ', ' + row.label + ' (' + row.year + '): ' + fmtPct(value));
        var bar = el('span', 'hbar ' + s.cls);
        bar.style.setProperty('--v', String(value / max * 100));
        var valueNode = el('span', 'hbar-value', s.name + ' ' + fmtPct(value));
        valueNode.style.setProperty('--v', String(value / max * 100));
        track.appendChild(bar);
        track.appendChild(valueNode);
        function show(x, y) {
          var tip = tooltipFor(container);
          fillTooltip(tip, row.label + ' · ' + row.year, [
            { color: seriesColor(s.key), text: s.name + ': ' + fmtPct(value) }
          ], 'Rentang ketidakpastian 95%: ' + fmtNum(range[0], 1) + '–' + fmtPct(range[1]));
          placeTooltip(tip, container, x, y);
        }
        track.addEventListener('pointermove', function (event) {
          var box = container.getBoundingClientRect();
          show(event.clientX - box.left, event.clientY - box.top);
        });
        track.addEventListener('pointerleave', hideTooltip);
        track.addEventListener('focus', function () {
          var box = container.getBoundingClientRect();
          var t = track.getBoundingClientRect();
          show(t.left - box.left + t.width * (value / max), t.top - box.top);
        });
        track.addEventListener('blur', hideTooltip);
        rowNode.appendChild(track);
      });
      chart.appendChild(rowNode);
    });
    var axis = el('div', 'hbar-axis');
    axis.setAttribute('aria-hidden', 'true');
    [0, 10, 20, 30, 40, 50].forEach(function (tick) {
      var span = el('span', null, tick + '%');
      span.style.setProperty('left', (tick / max * 100) + '%');
      axis.appendChild(span);
    });
    chart.appendChild(axis);
    container.appendChild(chart);
    container.appendChild(buildTable(data.title, ['Kelompok', 'Tahun data', 'Indonesia', 'Global'],
      data.rows.map(function (row) {
        return [row.label, String(row.year), fmtPct(row.indonesia), fmtPct(row.global)];
      })));
  }

  function renderTrend(container) {
    var d = Kesdig.DATA.trend;
    var width = Math.max(300, Math.round(container.clientWidth || 640));
    var compact = width < 520;
    var height = compact ? 290 : 340;
    var m = { top: 18, right: compact ? 96 : 118, bottom: 34, left: 40 };
    var pw = width - m.left - m.right;
    var ph = height - m.top - m.bottom;
    var n = d.years.length;
    var yMax = 50;
    function x(i) {
      return m.left + (i / (n - 1)) * pw;
    }
    function y(v) {
      return m.top + (1 - v / yMax) * ph;
    }
    function linePath(values) {
      return values.map(function (v, i) {
        return (i === 0 ? 'M' : 'L') + x(i).toFixed(1) + ' ' + y(v).toFixed(1);
      }).join('');
    }
    function bandPath(low, high) {
      var top = high.map(function (v, i) {
        return (i === 0 ? 'M' : 'L') + x(i).toFixed(1) + ' ' + y(v).toFixed(1);
      }).join('');
      var bottom = low.slice().reverse().map(function (v, j) {
        var i = n - 1 - j;
        return 'L' + x(i).toFixed(1) + ' ' + y(v).toFixed(1);
      }).join('');
      return top + bottom + 'Z';
    }

    var drawn = container.classList.contains('is-drawn');
    clear(container);
    var idnFirst = d.indonesia.value[0];
    var idnLast = d.indonesia.value[n - 1];
    var glbFirst = d.global.value[0];
    var glbLast = d.global.value[n - 1];
    var svg = svgEl('svg', {
      viewBox: '0 0 ' + width + ' ' + height,
      width: String(width),
      height: String(height),
      role: 'img',
      'aria-labelledby': 'trend-svg-title'
    });
    var title = svgEl('title', { id: 'trend-svg-title' });
    title.textContent = 'Tren prevalensi anemia perempuan 15–49 tahun ' + d.years[0] + '–' + d.years[n - 1] +
      ': Indonesia dari ' + fmtPct(idnFirst) + ' menjadi ' + fmtPct(idnLast) +
      ', global dari ' + fmtPct(glbFirst) + ' menjadi ' + fmtPct(glbLast) + '.';
    svg.appendChild(title);

    var grid = svgEl('g', { class: 'trend-grid' });
    var axis = svgEl('g', { class: 'trend-axis', 'aria-hidden': 'true' });
    [0, 10, 20, 30, 40, 50].forEach(function (v) {
      grid.appendChild(svgEl('line', { x1: m.left, x2: m.left + pw, y1: y(v), y2: y(v) }));
      var label = svgEl('text', { x: m.left - 8, y: y(v) + 4, 'text-anchor': 'end' });
      label.textContent = v + '%';
      axis.appendChild(label);
    });
    var tickYears = compact ? [2000, 2010, 2023] : [2000, 2005, 2010, 2015, 2020, 2023];
    tickYears.forEach(function (year) {
      var i = d.years.indexOf(year);
      var label = svgEl('text', { x: x(i), y: height - 10, 'text-anchor': i === 0 ? 'start' : i === n - 1 ? 'end' : 'middle' });
      label.textContent = String(year);
      axis.appendChild(label);
    });
    svg.appendChild(grid);
    svg.appendChild(axis);
    svg.appendChild(svgEl('path', { class: 'trend-band-glb', d: bandPath(d.global.low, d.global.high) }));
    svg.appendChild(svgEl('path', { class: 'trend-band-idn', d: bandPath(d.indonesia.low, d.indonesia.high) }));
    svg.appendChild(svgEl('path', { class: 'trend-line trend-line-glb is-dashed', d: linePath(d.global.value) }));
    svg.appendChild(svgEl('path', { class: 'trend-line trend-line-idn', d: linePath(d.indonesia.value), pathLength: '1' }));

    var ends = svgEl('g', { class: 'trend-end', 'aria-hidden': 'true' });
    var idnY = y(idnLast);
    var glbY = y(glbLast);
    if (Math.abs(idnY - glbY) < 16) {
      var mid = (idnY + glbY) / 2;
      idnY = mid + 9;
      glbY = mid - 9;
    }
    [['idn', idnLast, y(idnLast), idnY, 'Indonesia'], ['glb', glbLast, y(glbLast), glbY, 'Global']].forEach(function (e) {
      ends.appendChild(svgEl('circle', { class: 'trend-end-dot trend-dot-' + e[0], cx: x(n - 1), cy: e[2], r: 4.5 }));
      var text = svgEl('text', { x: x(n - 1) + 10, y: e[3] + 4 });
      text.textContent = e[4] + ' ' + fmtPct(e[1]);
      ends.appendChild(text);
    });
    svg.appendChild(ends);

    var cross = svgEl('line', { class: 'trend-crosshair', x1: 0, x2: 0, y1: m.top, y2: m.top + ph });
    var dotIdn = svgEl('circle', { class: 'trend-hover-dot trend-dot-idn', r: 5, cx: 0, cy: 0 });
    var dotGlb = svgEl('rect', { class: 'trend-hover-dot trend-dot-glb', width: 9, height: 9, x: 0, y: 0 });
    svg.appendChild(cross);
    svg.appendChild(dotIdn);
    svg.appendChild(dotGlb);
    var hit = svgEl('rect', { x: m.left, y: m.top, width: pw, height: ph, fill: 'transparent' });
    svg.appendChild(hit);
    container.appendChild(svg);
    if (drawn) {
      container.classList.add('is-drawn');
    }

    var activeIndex = n - 1;
    function showIndex(i) {
      activeIndex = Math.max(0, Math.min(n - 1, i));
      var cx = x(activeIndex);
      cross.setAttribute('x1', cx);
      cross.setAttribute('x2', cx);
      dotIdn.setAttribute('cx', cx);
      dotIdn.setAttribute('cy', y(d.indonesia.value[activeIndex]));
      dotGlb.setAttribute('x', cx - 4.5);
      dotGlb.setAttribute('y', y(d.global.value[activeIndex]) - 4.5);
      container.classList.add('is-hovering');
      var tip = tooltipFor(container);
      fillTooltip(tip, 'Tahun ' + d.years[activeIndex], [
        { color: seriesColor('idn'), text: 'Indonesia: ' + fmtPct(d.indonesia.value[activeIndex]) },
        { color: seriesColor('glb'), text: 'Global: ' + fmtPct(d.global.value[activeIndex]) }
      ], 'Rentang Indonesia ' + fmtNum(d.indonesia.low[activeIndex], 1) + '–' + fmtPct(d.indonesia.high[activeIndex]));
      var scale = container.clientWidth / width;
      placeTooltip(tip, container, cx * scale, Math.min(y(d.indonesia.value[activeIndex]), y(d.global.value[activeIndex])) * scale);
    }
    function hide() {
      container.classList.remove('is-hovering');
      hideTooltip();
    }
    function fromPointer(event) {
      var box = svg.getBoundingClientRect();
      var px = (event.clientX - box.left) * (width / box.width);
      showIndex(Math.round((px - m.left) / pw * (n - 1)));
    }
    hit.addEventListener('pointermove', fromPointer);
    hit.addEventListener('pointerdown', fromPointer);
    hit.addEventListener('pointerleave', hide);
    container.tabIndex = 0;
    container.setAttribute('aria-describedby', 'trend-svg-title');
    container.onkeydown = function (event) {
      var keys = { ArrowLeft: -1, ArrowRight: 1 };
      if (keys[event.key]) {
        event.preventDefault();
        showIndex(activeIndex + keys[event.key]);
      } else if (event.key === 'Home') {
        event.preventDefault();
        showIndex(0);
      } else if (event.key === 'End') {
        event.preventDefault();
        showIndex(n - 1);
      } else if (event.key === 'Escape') {
        hide();
      }
    };
    container.onfocus = function () {
      showIndex(activeIndex);
    };
    container.onblur = hide;

    container.appendChild(buildTable(d.title, ['Tahun', 'Indonesia', 'Rentang Indonesia', 'Global', 'Rentang global'],
      d.years.map(function (year, i) {
        return [
          String(year),
          fmtPct(d.indonesia.value[i]),
          fmtNum(d.indonesia.low[i], 1) + '–' + fmtPct(d.indonesia.high[i]),
          fmtPct(d.global.value[i]),
          fmtNum(d.global.low[i], 1) + '–' + fmtPct(d.global.high[i])
        ];
      })));
  }

  function renderPregnant(container) {
    var data = Kesdig.DATA.pregnantIndonesia;
    var max = 60;
    clear(container);
    var chart = el('div', 'vbar-chart');
    data.rows.forEach(function (row) {
      var bar = el('div', 'vbar');
      var col = el('div', 'vbar-col');
      col.setAttribute('role', 'img');
      col.setAttribute('aria-label', row.label + ': ' + fmtPct(row.value) + ' ibu hamil mengalami anemia');
      var fill = el('span', 'vbar-fill');
      fill.style.setProperty('--v', String(row.value / max * 100));
      var value = el('span', 'vbar-value', fmtPct(row.value));
      value.style.setProperty('--v', String(row.value / max * 100));
      col.appendChild(fill);
      col.appendChild(value);
      bar.appendChild(col);
      bar.appendChild(el('span', 'vbar-label', row.label));
      chart.appendChild(bar);
    });
    container.appendChild(chart);
    container.appendChild(buildTable(data.title, ['Survei', 'Tahun', 'Prevalensi'],
      data.rows.map(function (row) {
        return [row.label, String(row.year), fmtPct(row.value)];
      })));
  }

  var chartsRendered = false;

  function renderCharts() {
    var comparison = $('#chart-comparison');
    var trend = $('#chart-trend');
    var pregnant = $('#chart-pregnant');
    if (!chartsRendered) {
      chartsRendered = true;
      if (comparison) {
        renderComparison(comparison);
      }
      if (pregnant) {
        renderPregnant(pregnant);
      }
      onVisible([comparison, trend, pregnant].filter(Boolean), function (node) {
        node.classList.add('is-drawn');
      }, { threshold: 0.25 });
      if (trend && 'ResizeObserver' in window) {
        var lastWidth = 0;
        var timer = null;
        new ResizeObserver(function () {
          var w = trend.clientWidth;
          if (w > 0 && Math.abs(w - lastWidth) > 12) {
            clearTimeout(timer);
            timer = setTimeout(function () {
              lastWidth = trend.clientWidth;
              renderTrend(trend);
            }, lastWidth === 0 ? 0 : 120);
          }
        }).observe(trend);
      }
    }
    if (trend && !('ResizeObserver' in window)) {
      renderTrend(trend);
    }
  }

  routeHooks.data = renderCharts;

  /* ----- Simulasi (kuis multi-langkah) -------------------------------- */

  var STEP_LABELS = {
    identitas: 'Identitas',
    hb: 'Kadar hemoglobin',
    menstruasi: 'Menstruasi',
    makan: 'Kebiasaan makan',
    ttd: 'Tablet Tambah Darah',
    gejala: 'Gejala'
  };
  var HB_MESSAGES = {
    empty: 'Masukkan kadar Hb Anda, misalnya 11,5.',
    format: 'Gunakan angka dengan paling banyak dua desimal, misalnya 11,5.',
    range: 'Kadar Hb yang diterima antara 3 dan 25 g/dL. Periksa kembali angka pada hasil pemeriksaan.',
    gl: 'Nilai ini tampaknya dalam g/L. Bagi dengan 10, misalnya 115 g/L menjadi 11,5 g/dL.'
  };

  var form = null;
  var stepIndex = 0;
  var animating = false;

  function radioValue(name) {
    var checked = form.querySelector('input[name="' + name + '"]:checked');
    return checked ? checked.value : null;
  }

  function checkedValues(name) {
    return $$('input[name="' + name + '"]:checked', form).map(function (input) {
      return input.value;
    });
  }

  function numberOrNull(value) {
    var text = String(value || '').trim();
    if (text === '') {
      return null;
    }
    var n = Number(text);
    return isFinite(n) ? n : null;
  }

  function readAnswers() {
    return {
      name: $('#f-name').value,
      ageYears: numberOrNull($('#f-age').value),
      ageMonths: numberOrNull($('#f-age-months').value),
      sex: radioValue('sex'),
      pregnant: radioValue('pregnant'),
      trimester: radioValue('trimester'),
      hbKnown: radioValue('hbKnown'),
      hbValue: $('#f-hb').value,
      hbTestedWhen: radioValue('hbTestedWhen'),
      elevation: $('#f-elevation').value,
      smoking: $('#f-smoking').value,
      menstruation: {
        status: radioValue('menstruationStatus'),
        regularity: radioValue('regularity'),
        duration: radioValue('duration'),
        volume: radioValue('volume')
      },
      diet: {
        ironFreq: radioValue('ironFreq'),
        meals: radioValue('meals'),
        breakfast: radioValue('breakfast'),
        teaCoffee: radioValue('teaCoffee')
      },
      ttd: {
        use: radioValue('ttdUse'),
        frequency: radioValue('ttdFrequency'),
        adherence: radioValue('ttdAdherence')
      },
      symptoms: checkedValues('symptoms'),
      danger: checkedValues('danger')
    };
  }

  function profileOf(answers) {
    return {
      ageYears: answers.ageYears,
      ageMonths: answers.ageMonths,
      sex: answers.sex,
      pregnant: answers.pregnant,
      trimester: answers.trimester
    };
  }

  function activeSteps() {
    var answers = readAnswers();
    // Langkah menstruasi baru dilewati setelah umur dan jenis kelamin diketahui.
    var identityKnown = !!answers.sex && Number.isInteger(answers.ageYears);
    return ['identitas', 'hb', 'menstruasi', 'makan', 'ttd', 'gejala'].filter(function (id) {
      return id !== 'menstruasi' || !identityKnown || Kesdig.isMenstruationRelevant(profileOf(answers));
    });
  }

  function uncheck(name) {
    $$('input[name="' + name + '"]', form).forEach(function (input) {
      input.checked = false;
    });
  }

  function setVisible(node, visible) {
    if (node) {
      node.hidden = !visible;
    }
  }

  function updateConditional() {
    var answers = readAnswers();
    var profile = profileOf(answers);
    var age = answers.ageYears;
    var isChild = Number.isInteger(age) && age >= 0 && age < 5;
    setVisible($('#field-age-months'), isChild);
    if (!isChild) {
      $('#f-age-months').value = '';
    }
    var pregnancyRelevant = Kesdig.isPregnancyRelevant(profile);
    setVisible($('#field-pregnant'), pregnancyRelevant);
    if (!pregnancyRelevant) {
      uncheck('pregnant');
      uncheck('trimester');
    }
    var pregnant = pregnancyRelevant && radioValue('pregnant') === 'yes';
    setVisible($('#field-trimester'), pregnant);
    if (!pregnant) {
      uncheck('trimester');
    }
    var hbKnown = radioValue('hbKnown');
    setVisible($('#hb-known-fields'), hbKnown === 'yes');
    setVisible($('#hb-unknown-note'), hbKnown === 'no');
    setVisible($('#mens-active-fields'), radioValue('menstruationStatus') === 'active');
    setVisible($('#ttd-yes-fields'), radioValue('ttdUse') === 'yes');

    var target = Kesdig.ttdTarget(readAnswers());
    var context = $('#ttd-context');
    if (context) {
      context.textContent = target === 'daily'
        ? 'Anda sedang hamil. Ibu hamil dianjurkan minum TTD atau MMS 1 tablet setiap hari sesuai anjuran tenaga kesehatan.'
        : target === 'weekly'
          ? 'Anda termasuk sasaran program TTD. Remaja putri dan wanita usia subur dianjurkan minum 1 tablet TTD setiap minggu.'
          : 'Laki-laki, anak-anak, dan perempuan di luar usia 12–49 tahun bukan sasaran rutin program TTD. Pilih "Tidak berlaku" bila Anda tidak mengonsumsinya.';
    }
    setVisible($('#ttd-mms-hint'), target === 'daily');

    var danger = checkedValues('danger').filter(function (v) {
      return v !== 'none';
    });
    setVisible($('#danger-alert'), danger.length > 0);
    updateProgress();
  }

  function enforceExclusive(input) {
    if (input.type !== 'checkbox') {
      return;
    }
    var name = input.name;
    if (input.value === 'none' && input.checked) {
      $$('input[name="' + name + '"]', form).forEach(function (other) {
        if (other !== input) {
          other.checked = false;
        }
      });
    } else if (input.value !== 'none' && input.checked) {
      var none = form.querySelector('input[name="' + name + '"][value="none"]');
      if (none) {
        none.checked = false;
      }
    }
  }

  function currentStepId() {
    var steps = activeSteps();
    stepIndex = Math.min(stepIndex, steps.length - 1);
    return steps[stepIndex];
  }

  function updateProgress() {
    var steps = activeSteps();
    var index = Math.min(stepIndex, steps.length - 1);
    var total = steps.length;
    var id = steps[index];
    var label = $('#quiz-step-label');
    if (label) {
      label.textContent = 'Langkah ' + (index + 1) + ' dari ' + total + ' · ' + STEP_LABELS[id];
    }
    var ratio = (index + 1) / total;
    var percent = $('#quiz-percent');
    if (percent) {
      percent.textContent = Math.round(ratio * 100) + '%';
    }
    var fill = $('#quiz-progress-fill');
    if (fill) {
      fill.style.setProperty('--p', ratio.toFixed(3));
    }
    $$('#quiz-steps li').forEach(function (item) {
      var stepId = item.getAttribute('data-step');
      var position = steps.indexOf(stepId);
      item.classList.toggle('is-skipped', position === -1);
      item.classList.toggle('is-current', position === index);
      item.classList.toggle('is-done', position !== -1 && position < index);
      var dot = item.querySelector('.qs-dot');
      if (dot) {
        dot.textContent = position === -1 ? '–' : String(position + 1);
      }
    });
    var prev = $('#quiz-prev');
    var next = $('#quiz-next');
    var submit = $('#quiz-submit');
    if (prev) {
      prev.hidden = index === 0;
    }
    if (next) {
      next.hidden = index === total - 1;
    }
    if (submit) {
      submit.hidden = index !== total - 1;
    }
  }

  function clearErrors(scope) {
    $$('.field-error', scope).forEach(function (node) {
      node.hidden = true;
      node.textContent = '';
    });
    $$('[aria-invalid="true"]', scope).forEach(function (node) {
      node.removeAttribute('aria-invalid');
    });
    $$('.has-error', scope).forEach(function (node) {
      node.classList.remove('has-error');
    });
  }

  function showError(errorId, message, focusSelector) {
    var node = doc.getElementById(errorId);
    if (!node) {
      return null;
    }
    node.textContent = message;
    node.hidden = false;
    var field = node.closest('.field');
    if (field) {
      field.classList.add('has-error');
      field.classList.remove('shake');
      void field.offsetWidth;
      if (!reducedMotion()) {
        field.classList.add('shake');
      }
    }
    var inputs = focusSelector ? $$(focusSelector, form) : [];
    inputs.forEach(function (input) {
      input.setAttribute('aria-invalid', 'true');
    });
    return inputs[0] || null;
  }

  function validateStep(id) {
    var stepNode = $('#step-' + id);
    var answers = readAnswers();
    var profile = profileOf(answers);
    var errors = [];
    function fail(errorId, message, selector) {
      errors.push(showError(errorId, message, selector));
    }
    clearErrors(stepNode);

    if (id === 'identitas') {
      var age = answers.ageYears;
      if (!(Number.isInteger(age) && age >= 0 && age <= 120)) {
        fail('err-age', 'Masukkan umur 0–120 tahun dalam angka bulat.', '#f-age');
      } else if (age < 5) {
        var low = age * 12;
        var high = low + 11;
        var months = answers.ageMonths;
        if (!(Number.isInteger(months) && months >= low && months <= high)) {
          fail('err-age-months', 'Untuk usia ' + age + ' tahun, isi antara ' + low + ' dan ' + high + ' bulan.', '#f-age-months');
        }
      }
      if (!answers.sex) {
        fail('err-sex', 'Pilih jenis kelamin.', 'input[name="sex"]');
      }
      if (Kesdig.isPregnancyRelevant(profile) && !answers.pregnant) {
        fail('err-pregnant', 'Pilih status kehamilan.', 'input[name="pregnant"]');
      }
      if (Kesdig.isPregnancyRelevant(profile) && answers.pregnant === 'yes' && !answers.trimester) {
        fail('err-trimester', 'Pilih trimester kehamilan.', 'input[name="trimester"]');
      }
    } else if (id === 'hb') {
      if (!answers.hbKnown) {
        fail('err-hb-known', 'Pilih salah satu jawaban.', 'input[name="hbKnown"]');
      } else if (answers.hbKnown === 'yes') {
        var parsed = Kesdig.parseHb(answers.hbValue);
        if (!parsed.ok) {
          fail('err-hb', HB_MESSAGES[parsed.reason], '#f-hb');
        }
      }
    } else if (id === 'menstruasi') {
      var m = answers.menstruation;
      if (!m.status) {
        fail('err-mens-status', 'Pilih status menstruasi Anda.', 'input[name="menstruationStatus"]');
      } else if (m.status === 'active') {
        if (!m.regularity) {
          fail('err-regularity', 'Pilih keteraturan siklus.', 'input[name="regularity"]');
        }
        if (!m.duration) {
          fail('err-duration', 'Pilih lama menstruasi.', 'input[name="duration"]');
        }
        if (!m.volume) {
          fail('err-volume', 'Pilih jumlah darah menstruasi.', 'input[name="volume"]');
        }
      }
    } else if (id === 'makan') {
      var d = answers.diet;
      if (!d.ironFreq) {
        fail('err-iron', 'Pilih salah satu jawaban.', 'input[name="ironFreq"]');
      }
      if (!d.meals) {
        fail('err-meals', 'Pilih salah satu jawaban.', 'input[name="meals"]');
      }
      if (!d.breakfast) {
        fail('err-breakfast', 'Pilih salah satu jawaban.', 'input[name="breakfast"]');
      }
      if (!d.teaCoffee) {
        fail('err-tea', 'Pilih salah satu jawaban.', 'input[name="teaCoffee"]');
      }
    } else if (id === 'ttd') {
      var t = answers.ttd;
      if (!t.use) {
        fail('err-ttd-use', 'Pilih salah satu jawaban.', 'input[name="ttdUse"]');
      } else if (t.use === 'yes') {
        if (!t.frequency) {
          fail('err-ttd-freq', 'Pilih frekuensi minum TTD.', 'input[name="ttdFrequency"]');
        }
        if (!t.adherence) {
          fail('err-ttd-adh', 'Pilih tingkat kepatuhan.', 'input[name="ttdAdherence"]');
        }
      }
    } else if (id === 'gejala') {
      if (!answers.symptoms.length) {
        fail('err-symptoms', 'Pilih minimal satu gejala atau "Tidak ada gejala".', 'input[name="symptoms"]');
      }
      if (!answers.danger.length) {
        fail('err-danger', 'Pilih tanda bahaya yang dialami atau "Tidak ada tanda bahaya".', 'input[name="danger"]');
      }
    }

    if (errors.length) {
      var first = errors.filter(Boolean)[0];
      if (first) {
        first.focus({ preventScroll: true });
        var top = first.getBoundingClientRect().top;
        if (top < headerHeight() + 20 || top > window.innerHeight - 80) {
          window.scrollTo({ top: window.scrollY + top - headerHeight() - 90, behavior: scrollBehavior() });
        }
      }
      announce('Periksa kembali: ' + errors.length + ' isian perlu dilengkapi.');
      return false;
    }
    return true;
  }

  function announce(message) {
    var live = $('#quiz-live');
    if (live) {
      live.textContent = '';
      setTimeout(function () {
        live.textContent = message;
      }, 30);
    }
  }

  function goToStep(newIndex, direction) {
    var steps = activeSteps();
    newIndex = Math.max(0, Math.min(steps.length - 1, newIndex));
    var oldNode = $('.quiz-step.is-active', form);
    var newNode = $('#step-' + steps[newIndex]);
    if (!newNode || animating) {
      return;
    }
    var animate = !reducedMotion();
    var startHeight = form.offsetHeight;

    function swap() {
      if (oldNode && oldNode !== newNode) {
        oldNode.classList.remove('is-active', 'leave-next', 'leave-prev', 'enter-next', 'enter-prev');
      }
      newNode.classList.remove('enter-next', 'enter-prev', 'leave-next', 'leave-prev');
      newNode.classList.add('is-active');
      if (animate) {
        newNode.classList.add(direction < 0 ? 'enter-prev' : 'enter-next');
      }
      stepIndex = newIndex;
      updateProgress();
      if (animate && form.animate) {
        var endHeight = form.offsetHeight;
        if (Math.abs(endHeight - startHeight) > 4) {
          form.style.setProperty('overflow', 'hidden');
          var anim = form.animate([{ height: startHeight + 'px' }, { height: endHeight + 'px' }], {
            duration: 320,
            easing: 'cubic-bezier(0.22, 1, 0.36, 1)'
          });
          anim.onfinish = function () {
            form.style.removeProperty('overflow');
          };
        }
      }
      var title = newNode.querySelector('.step-title');
      if (title) {
        title.focus({ preventScroll: true });
      }
      var card = $('.quiz-card');
      if (card) {
        var top = card.getBoundingClientRect().top;
        if (top < headerHeight() || top > window.innerHeight * 0.6) {
          window.scrollTo({ top: window.scrollY + top - headerHeight() - 16, behavior: scrollBehavior() });
        }
      }
      announce('Langkah ' + (newIndex + 1) + ' dari ' + steps.length + ': ' + STEP_LABELS[steps[newIndex]]);
      animating = false;
    }

    if (oldNode && oldNode !== newNode && animate) {
      animating = true;
      oldNode.classList.add(direction < 0 ? 'leave-prev' : 'leave-next');
      setTimeout(swap, 160);
    } else {
      swap();
    }
  }

  function nextStep() {
    var id = currentStepId();
    if (!validateStep(id)) {
      return;
    }
    var steps = activeSteps();
    var index = steps.indexOf(id);
    if (index === steps.length - 1) {
      finishQuiz();
    } else {
      goToStep(index + 1, 1);
    }
  }

  function prevStep() {
    var steps = activeSteps();
    var index = steps.indexOf(currentStepId());
    goToStep(index - 1, -1);
  }

  function finishQuiz() {
    var id = currentStepId();
    if (!validateStep(id)) {
      return;
    }
    var answers = readAnswers();
    lastResult = { result: Kesdig.evaluate(answers), createdAt: new Date() };
    renderReport(lastResult);
    var fill = $('#quiz-progress-fill');
    if (fill) {
      fill.style.setProperty('--p', '1');
    }
    navigate('hasil');
  }

  function resetQuiz() {
    form.reset();
    clearErrors(form);
    lastResult = null;
    $$('.quiz-step', form).forEach(function (step) {
      step.classList.remove('is-active', 'enter-next', 'enter-prev', 'leave-next', 'leave-prev');
    });
    $('#step-identitas').classList.add('is-active');
    stepIndex = 0;
    animating = false;
    updateConditional();
  }

  function initQuiz() {
    form = $('#quiz-form');
    if (!form) {
      return;
    }
    form.addEventListener('change', function (event) {
      var target = event.target;
      enforceExclusive(target);
      var errorId = target.getAttribute('aria-describedby');
      if (errorId) {
        errorId.split(/\s+/).forEach(function (idPart) {
          var node = doc.getElementById(idPart);
          if (node && node.classList.contains('field-error') && !node.hidden) {
            node.hidden = true;
            var field = node.closest('.field');
            if (field) {
              field.classList.remove('has-error');
              $$('[aria-invalid="true"]', field).forEach(function (input) {
                input.removeAttribute('aria-invalid');
              });
            }
          }
        });
      }
      updateConditional();
    });
    form.addEventListener('input', function (event) {
      if (event.target.id === 'f-age') {
        updateConditional();
      }
    });
    form.addEventListener('keydown', function (event) {
      var target = event.target;
      if (event.key === 'Enter' && target.tagName === 'INPUT' && target.type !== 'checkbox' && target.type !== 'radio') {
        event.preventDefault();
        nextStep();
      }
    });
    form.addEventListener('submit', function (event) {
      event.preventDefault();
      nextStep();
    });
    $('#quiz-next').addEventListener('click', nextStep);
    $('#quiz-prev').addEventListener('click', prevStep);
    updateConditional();
  }

  /* ----- Laporan hasil ------------------------------------------------- */

  var ZONE_LABELS = { severe: 'Berat', moderate: 'Sedang', mild: 'Ringan', none: 'Tidak anemia' };

  function describeHb(r) {
    var hb = r.hb;
    var group = r.profile.group ? r.profile.group.label.toLowerCase() : '';
    if (hb.category === 'none') {
      return 'Kadar Hb Anda memenuhi batas tidak anemia WHO 2024 (' + hb.thresholds.none + ' g/dL) untuk kelompok ' + group + '.';
    }
    if (hb.category === 'mild' || hb.category === 'moderate' || hb.category === 'severe') {
      return 'Kadar Hb Anda berada pada rentang ' + hb.thresholds[hb.category] + ' g/dL, yaitu kategori ' +
        hb.label.toLowerCase() + ' untuk kelompok ' + group + ' menurut WHO 2024.';
    }
    return hb.reasonText || 'Status anemia belum dapat ditentukan.';
  }

  function polar(cx, cy, radius, angle) {
    var rad = angle * Math.PI / 180;
    return [cx + radius * Math.cos(rad), cy - radius * Math.sin(rad)];
  }

  function arcPath(cx, cy, radius, from, to) {
    var a = polar(cx, cy, radius, from);
    var b = polar(cx, cy, radius, to);
    return 'M' + a[0].toFixed(2) + ' ' + a[1].toFixed(2) + ' A' + radius + ' ' + radius + ' 0 0 1 ' + b[0].toFixed(2) + ' ' + b[1].toFixed(2);
  }

  function renderGauge(hb) {
    var zonesGroup = $('#r-gauge-zones');
    var needle = $('#r-gauge-needle');
    var legend = $('#r-gauge-legend');
    var wrap = $('.gauge-wrap');
    var cx = 160;
    var cy = 170;
    var radius = 128;
    clear(zonesGroup);
    clear(legend);
    wrap.classList.remove('is-drawn');
    zonesGroup.appendChild(svgEl('path', { class: 'gauge-track', d: arcPath(cx, cy, radius, 180, 0) }));
    var scale = hb.scale;
    var angleFor = null;
    if (scale) {
      angleFor = function (value) {
        var v = Math.max(scale.min, Math.min(scale.max, value));
        return 180 - (v - scale.min) / (scale.max - scale.min) * 180;
      };
      scale.zones.forEach(function (zone) {
        var from = angleFor(zone.from) - (zone.key === 'severe' ? 0 : 0.8);
        var to = angleFor(zone.to) + (zone.key === 'none' ? 0 : 0.8);
        zonesGroup.appendChild(svgEl('path', { class: 'gauge-zone gz-' + zone.key, d: arcPath(cx, cy, radius, from, to) }));
        var item = el('li');
        var swatch = el('span', 'gl-swatch');
        swatch.style.setProperty('background', 'var(--st-' + zone.key + ')');
        item.appendChild(swatch);
        item.appendChild(doc.createTextNode(ZONE_LABELS[zone.key] + ' ' + hb.thresholds[zone.key]));
        legend.appendChild(item);
      });
      [scale.zones[1].from, scale.zones[2].from, scale.zones[3].from].forEach(function (value) {
        var p = polar(cx, cy, radius + 22, angleFor(value));
        var tick = svgEl('text', { class: 'gauge-tick', x: p[0].toFixed(1), y: (p[1] + 4).toFixed(1) });
        tick.textContent = Kesdig.formatHb(value);
        zonesGroup.appendChild(tick);
      });
    }
    needle.style.setProperty('transition', 'none');
    needle.style.setProperty('transform', 'rotate(-90deg)');
    needle.classList.toggle('is-hidden', !(hb.known && scale));
    void needle.getBoundingClientRect();
    needle.style.removeProperty('transition');
    needle.setAttribute('data-angle', hb.known && scale ? String(90 - angleFor(hb.adjusted)) : '');
  }

  function animateGauge() {
    if (!lastResult) {
      return;
    }
    var hb = lastResult.result.hb;
    var wrap = $('.gauge-wrap');
    var needle = $('#r-gauge-needle');
    var valueNode = $('#r-hb-value');
    var target = hb.known ? hb.adjusted : null;
    renderGauge(hb);
    window.requestAnimationFrame(function () {
      window.requestAnimationFrame(function () {
        wrap.classList.add('is-drawn');
        var angle = needle.getAttribute('data-angle');
        if (angle) {
          needle.style.setProperty('transform', 'rotate(' + angle + 'deg)');
        }
      });
    });
    if (target === null) {
      valueNode.textContent = '?';
      return;
    }
    if (reducedMotion()) {
      valueNode.textContent = Kesdig.formatHb(target);
      return;
    }
    var from = hb.scale ? hb.scale.min : 0;
    var start = null;
    function frame(now) {
      if (start === null) {
        start = now;
      }
      var t = Math.min(1, (now - start) / 1300);
      var eased = 1 - Math.pow(1 - t, 3);
      valueNode.textContent = fmtNum(from + (target - from) * eased, 1);
      if (t < 1) {
        window.requestAnimationFrame(frame);
      } else {
        valueNode.textContent = Kesdig.formatHb(target);
      }
    }
    window.requestAnimationFrame(frame);
  }

  routeHooks.hasil = animateGauge;

  function renderReport(entry) {
    var r = entry.result;
    $('#r-date').textContent = new Intl.DateTimeFormat('id-ID', { dateStyle: 'long', timeStyle: 'short' }).format(entry.createdAt);

    var urgent = $('#r-urgent');
    urgent.hidden = !r.urgent;
    if (r.urgent) {
      $('#r-urgent-text').textContent = r.danger.present
        ? 'Anda menandai tanda bahaya: ' + r.danger.list.join(', ').toLowerCase() + '. Segera ke IGD atau fasilitas kesehatan terdekat, atau hubungi layanan gawat darurat 119.'
        : 'Kadar Hb Anda termasuk kategori anemia berat. Segera periksakan diri ke dokter atau fasilitas kesehatan hari ini.';
    }

    $('#r-summary').setAttribute('data-category', r.hb.category);
    $('#r-category').textContent = r.hb.label;
    $('#r-category-desc').textContent = describeHb(r);
    $('#r-hb-value').textContent = r.hb.known ? Kesdig.formatHb(r.hb.adjusted) : '?';
    var caption = $('#r-gauge-caption');
    caption.hidden = !(r.hb.known && r.hb.adjustment.total > 0);
    caption.textContent = 'setelah penyesuaian WHO 2024';

    var facts = $('#r-hb-facts');
    clear(facts);
    addKv(facts, 'Kelompok acuan', r.profile.group ? r.profile.group.label : 'Tidak dapat ditentukan');
    if (r.hb.thresholds) {
      addKv(facts, 'Ambang tidak anemia', r.hb.thresholds.none + ' g/dL');
    }
    addKv(facts, 'Hb yang dimasukkan', r.hb.known ? Kesdig.formatHb(r.hb.measured) + ' g/dL' : 'Belum diketahui');
    if (r.hb.known && r.hb.adjustment.total > 0) {
      var parts = [];
      if (r.hb.adjustment.elevation) {
        parts.push('ketinggian −' + Kesdig.formatHb(r.hb.adjustment.elevation / 10));
      }
      if (r.hb.adjustment.smoking) {
        parts.push('merokok −' + Kesdig.formatHb(r.hb.adjustment.smoking / 10));
      }
      addKv(facts, 'Penyesuaian WHO', parts.join(', ') + ' g/dL');
      addKv(facts, 'Hb setelah penyesuaian', Kesdig.formatHb(r.hb.adjusted) + ' g/dL');
    }
    if (r.hb.known && r.hb.testedWhen) {
      addKv(facts, 'Waktu pemeriksaan', Kesdig.LABELS.hbTestedWhen[r.hb.testedWhen]);
    }

    var profile = $('#r-profile');
    clear(profile);
    addKv(profile, 'Nama atau alias', r.profile.name);
    addKv(profile, 'Umur', r.profile.ageText);
    addKv(profile, 'Jenis kelamin', r.profile.sexLabel);
    if (r.profile.pregnancyLabel) {
      addKv(profile, 'Status kehamilan', r.profile.pregnancyLabel);
    }
    addKv(profile, 'Acuan WHO 2024', r.profile.group ? r.profile.group.label : 'Di luar cakupan tabel');

    var mens = $('#r-menstruation');
    clear(mens);
    if (r.menstruation.relevant) {
      r.menstruation.items.forEach(function (item) {
        addKv(mens, item[0], item[1]);
      });
    } else {
      addKv(mens, 'Status', 'Tidak berlaku untuk profil ini');
    }

    var diet = $('#r-diet');
    clear(diet);
    r.diet.items.forEach(function (item) {
      addKv(diet, item[0], item[1]);
    });

    var ttd = $('#r-ttd');
    clear(ttd);
    r.ttd.items.forEach(function (item) {
      addKv(ttd, item[0], item[1]);
    });

    var symptoms = $('#r-symptoms');
    clear(symptoms);
    if (r.symptoms.list.length) {
      r.symptoms.list.forEach(function (name) {
        symptoms.appendChild(el('li', null, name));
      });
    } else {
      symptoms.appendChild(el('li', 'is-empty', 'Tidak ada gejala yang dilaporkan'));
    }
    var dangerLine = $('#r-danger');
    dangerLine.classList.toggle('is-danger', r.danger.present);
    dangerLine.textContent = r.danger.present
      ? 'Tanda bahaya: ' + r.danger.list.join(', ') + '.'
      : 'Tidak ada tanda bahaya yang dilaporkan.';

    var factors = $('#r-factors');
    clear(factors);
    if (r.riskFactors.length) {
      r.riskFactors.forEach(function (f) {
        var li = el('li');
        li.appendChild(el('span', 'factor-area', f.area));
        li.appendChild(el('span', 'factor-title', f.title));
        li.appendChild(el('span', 'factor-detail', f.detail));
        factors.appendChild(li);
      });
    } else {
      factors.appendChild(el('li', 'is-empty', 'Tidak ada faktor risiko menonjol dari jawaban Anda. Tetap jaga pola hidup sehat.'));
    }

    var recs = $('#r-recs');
    clear(recs);
    r.recommendations.forEach(function (rec) {
      var li = el('li', 'rec-' + rec.priority);
      var title = el('span', 'rec-title', rec.title);
      if (rec.priority === 'urgent') {
        title.appendChild(el('span', 'rec-tag', 'Penting'));
      }
      li.appendChild(title);
      li.appendChild(el('span', 'rec-text', rec.text));
      recs.appendChild(li);
    });

    renderGauge(r.hb);
  }

  function initReportActions() {
    doc.addEventListener('click', function (event) {
      var button = event.target.closest && event.target.closest('[data-action]');
      if (!button) {
        return;
      }
      var action = button.getAttribute('data-action');
      if (action === 'print') {
        window.print();
      } else if (action === 'restart') {
        resetQuiz();
        navigate('simulasi');
        toast('Simulasi dimulai ulang. Jawaban sebelumnya sudah dihapus.');
      }
    });
  }

  routeHooks.simulasi = function () {
    if (form) {
      updateProgress();
    }
  };

  /* ----- Mulai --------------------------------------------------------- */

  function start() {
    initTheme();
    initHeader();
    initReveal();
    initCounters();
    initSpotlight();
    initHeroPause();
    initToc();
    initQuiz();
    initReportActions();
    initRouter();
  }

  if (doc.readyState === 'loading') {
    doc.addEventListener('DOMContentLoaded', start);
  } else {
    start();
  }
}());
