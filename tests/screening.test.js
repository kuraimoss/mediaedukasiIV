'use strict';
/**
 * Pengujian logika skrining SIK Anemia (rule-based, pedoman WHO 2024).
 * Jalankan: npm test
 */
const { describe, test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const SIK = require(path.join(__dirname, '..', 'script.js'));

function baseAnswers(overrides) {
  return Object.assign({
    name: 'Sari',
    ageYears: 25,
    ageMonths: null,
    sex: 'female',
    pregnant: 'no',
    trimester: null,
    hbKnown: 'yes',
    hbValue: '12.5',
    hbTestedWhen: 'recent',
    elevation: '0',
    smoking: 'no',
    menstruation: { status: 'active', regularity: 'regular', duration: '3to7', volume: 'normal' },
    diet: { ironFreq: 'daily', meals: '3plus', breakfast: 'daily', teaCoffee: 'never' },
    ttd: { use: 'yes', frequency: 'weekly', adherence: 'always' },
    symptoms: ['none'],
    danger: ['none']
  }, overrides || {});
}

function factorIds(result) {
  return result.riskFactors.map((f) => f.id);
}

describe('parseHb', () => {
  test('menerima titik dan koma sebagai pemisah desimal', () => {
    assert.deepEqual(SIK.parseHb('11.5'), { ok: true, value: 11.5 });
    assert.deepEqual(SIK.parseHb('11,5'), { ok: true, value: 11.5 });
    assert.deepEqual(SIK.parseHb(' 12 '), { ok: true, value: 12 });
  });

  test('menolak input kosong dan format yang salah', () => {
    assert.equal(SIK.parseHb('').reason, 'empty');
    assert.equal(SIK.parseHb(null).reason, 'empty');
    assert.equal(SIK.parseHb('abc').reason, 'format');
    assert.equal(SIK.parseHb('11.5.2').reason, 'format');
    assert.equal(SIK.parseHb('-9').reason, 'format');
  });

  test('menolak nilai di luar rentang 3–25 g/dL', () => {
    assert.equal(SIK.parseHb('2.9').reason, 'range');
    assert.equal(SIK.parseHb('25.1').reason, 'range');
    assert.equal(SIK.parseHb('3').ok, true);
    assert.equal(SIK.parseHb('25').ok, true);
  });

  test('mengenali nilai yang tampaknya ditulis dalam g/L', () => {
    assert.equal(SIK.parseHb('115').reason, 'gl');
    assert.equal(SIK.parseHb('130,5').reason, 'gl');
  });
});

describe('toGL', () => {
  test('mengonversi g/dL ke g/L tanpa galat pembulatan', () => {
    assert.equal(SIK.toGL(11.9), 119);
    assert.equal(SIK.toGL(11.95), 119.5);
    assert.equal(SIK.toGL(10.5), 105);
    assert.equal(SIK.toGL(8.1), 81);
  });
});

describe('getReferenceGroup (kelompok acuan WHO 2024)', () => {
  const cases = [
    [{ ageYears: 0, ageMonths: 6 }, 'child-6-23m'],
    [{ ageYears: 1, ageMonths: 23 }, 'child-6-23m'],
    [{ ageYears: 2, ageMonths: 24 }, 'child-24-59m'],
    [{ ageYears: 4, ageMonths: 59 }, 'child-24-59m'],
    [{ ageYears: 5, sex: 'male' }, 'child-5-11y'],
    [{ ageYears: 11, sex: 'female', pregnant: 'no' }, 'child-5-11y'],
    [{ ageYears: 12, sex: 'female', pregnant: 'no' }, 'adolescent-12-14y'],
    [{ ageYears: 14, sex: 'male' }, 'adolescent-12-14y'],
    [{ ageYears: 15, sex: 'female', pregnant: 'no' }, 'women-15-65y'],
    [{ ageYears: 65, sex: 'female', pregnant: 'no' }, 'women-15-65y'],
    [{ ageYears: 15, sex: 'male' }, 'men-15-65y'],
    [{ ageYears: 65, sex: 'male' }, 'men-15-65y'],
    [{ ageYears: 24, sex: 'female', pregnant: 'yes', trimester: 1 }, 'pregnant-t1'],
    [{ ageYears: 24, sex: 'female', pregnant: 'yes', trimester: 2 }, 'pregnant-t2'],
    [{ ageYears: 24, sex: 'female', pregnant: 'yes', trimester: '3' }, 'pregnant-t3'],
    [{ ageYears: 30, sex: 'male', pregnant: 'yes', trimester: 2 }, 'men-15-65y']
  ];

  for (const [profile, expected] of cases) {
    test(`${JSON.stringify(profile)} → ${expected}`, () => {
      assert.equal(SIK.getReferenceGroup(profile).id, expected);
    });
  }

  test('bayi di bawah 6 bulan tidak memiliki ambang di tabel WHO 2024', () => {
    const group = SIK.getReferenceGroup({ ageYears: 0, ageMonths: 5 });
    assert.equal(group.id, null);
    assert.equal(group.reason, 'infant');
  });

  test('usia di atas 65 tahun berada di luar cakupan tabel WHO 2024', () => {
    const group = SIK.getReferenceGroup({ ageYears: 66, sex: 'female', pregnant: 'no' });
    assert.equal(group.id, null);
    assert.equal(group.reason, 'over65');
  });

  test('ibu hamil tanpa trimester belum dapat ditentukan', () => {
    const group = SIK.getReferenceGroup({ ageYears: 28, sex: 'female', pregnant: 'yes', trimester: null });
    assert.equal(group.id, null);
    assert.equal(group.reason, 'trimester');
  });

  test('usia 15 tahun ke atas wajib memiliki jenis kelamin', () => {
    const group = SIK.getReferenceGroup({ ageYears: 20, sex: null });
    assert.equal(group.id, null);
    assert.equal(group.reason, 'sex');
  });

  test('anak di bawah 5 tahun wajib memiliki usia dalam bulan yang konsisten', () => {
    assert.equal(SIK.getReferenceGroup({ ageYears: 2 }).reason, 'months');
    assert.equal(SIK.getReferenceGroup({ ageYears: 2, ageMonths: 40 }).reason, 'months');
  });

  test('usia tidak valid ditolak', () => {
    assert.equal(SIK.getReferenceGroup({ ageYears: -1, sex: 'male' }).reason, 'age');
    assert.equal(SIK.getReferenceGroup({ ageYears: Number.NaN, sex: 'male' }).reason, 'age');
    assert.equal(SIK.getReferenceGroup({ ageYears: 121, sex: 'male' }).reason, 'age');
  });
});

describe('classifyHb (batas kategori WHO 2024, g/L)', () => {
  const cases = [
    ['women-15-65y', 120, 'none'], ['women-15-65y', 119.9, 'mild'], ['women-15-65y', 110, 'mild'],
    ['women-15-65y', 109.9, 'moderate'], ['women-15-65y', 80, 'moderate'], ['women-15-65y', 79.9, 'severe'],
    ['men-15-65y', 130, 'none'], ['men-15-65y', 129, 'mild'], ['men-15-65y', 110, 'mild'],
    ['men-15-65y', 109, 'moderate'], ['men-15-65y', 80, 'moderate'], ['men-15-65y', 79, 'severe'],
    ['pregnant-t1', 110, 'none'], ['pregnant-t1', 100, 'mild'], ['pregnant-t1', 99, 'moderate'],
    ['pregnant-t1', 70, 'moderate'], ['pregnant-t1', 69, 'severe'],
    ['pregnant-t2', 105, 'none'], ['pregnant-t2', 104, 'mild'], ['pregnant-t2', 95, 'mild'],
    ['pregnant-t2', 94, 'moderate'], ['pregnant-t2', 70, 'moderate'], ['pregnant-t2', 69, 'severe'],
    ['pregnant-t3', 110, 'none'], ['pregnant-t3', 109, 'mild'], ['pregnant-t3', 99, 'moderate'],
    ['child-6-23m', 105, 'none'], ['child-6-23m', 95, 'mild'], ['child-6-23m', 94, 'moderate'],
    ['child-6-23m', 70, 'moderate'], ['child-6-23m', 69, 'severe'],
    ['child-24-59m', 110, 'none'], ['child-24-59m', 100, 'mild'], ['child-24-59m', 99, 'moderate'],
    ['child-24-59m', 69, 'severe'],
    ['child-5-11y', 115, 'none'], ['child-5-11y', 110, 'mild'], ['child-5-11y', 109, 'moderate'],
    ['child-5-11y', 80, 'moderate'], ['child-5-11y', 79, 'severe'],
    ['adolescent-12-14y', 120, 'none'], ['adolescent-12-14y', 110, 'mild'],
    ['adolescent-12-14y', 109, 'moderate'], ['adolescent-12-14y', 79, 'severe']
  ];

  for (const [group, gL, expected] of cases) {
    test(`${group} Hb ${gL} g/L → ${expected}`, () => {
      assert.equal(SIK.classifyHb(gL, group), expected);
    });
  }
});

describe('rangeLabels (teks ambang dalam g/dL)', () => {
  test('perempuan tidak hamil 15–65 tahun', () => {
    assert.deepEqual(SIK.rangeLabels('women-15-65y'), {
      none: '≥ 12,0', mild: '11,0–11,9', moderate: '8,0–10,9', severe: '< 8,0'
    });
  });

  test('ibu hamil trimester 2', () => {
    assert.deepEqual(SIK.rangeLabels('pregnant-t2'), {
      none: '≥ 10,5', mild: '9,5–10,4', moderate: '7,0–9,4', severe: '< 7,0'
    });
  });
});

describe('hbAdjustment (penyesuaian WHO 2024)', () => {
  test('ketinggian tempat tinggal dan kebiasaan merokok dijumlahkan', () => {
    assert.deepEqual(SIK.hbAdjustment({ elevation: '1000', smoking: '10to19' }), { elevation: 8, smoking: 5, total: 13 });
  });

  test('dataran rendah dan tidak merokok tidak disesuaikan', () => {
    assert.deepEqual(SIK.hbAdjustment({ elevation: '0', smoking: 'no' }), { elevation: 0, smoking: 0, total: 0 });
  });

  test('nilai tidak dikenal dianggap tanpa penyesuaian', () => {
    assert.deepEqual(SIK.hbAdjustment({ elevation: 'xyz', smoking: undefined }), { elevation: 0, smoking: 0, total: 0 });
  });

  test('tabel ketinggian sesuai kelipatan 500 m', () => {
    const expected = { 0: 0, 500: 4, 1000: 8, 1500: 11, 2000: 14, 2500: 18, 3000: 21, 3500: 25, 4000: 29, 4500: 33 };
    for (const [key, adj] of Object.entries(expected)) {
      assert.equal(SIK.hbAdjustment({ elevation: key, smoking: 'no' }).elevation, adj, `ketinggian ${key}`);
    }
  });

  test('tabel merokok', () => {
    const expected = { no: 0, unknown: 3, lt10: 3, '10to19': 5, gte20: 6 };
    for (const [key, adj] of Object.entries(expected)) {
      assert.equal(SIK.hbAdjustment({ elevation: '0', smoking: key }).smoking, adj, `merokok ${key}`);
    }
  });
});

describe('relevansi pertanyaan', () => {
  test('pertanyaan menstruasi hanya untuk perempuan tidak hamil usia 9–55 tahun', () => {
    assert.equal(SIK.isMenstruationRelevant({ ageYears: 16, sex: 'female', pregnant: 'no' }), true);
    assert.equal(SIK.isMenstruationRelevant({ ageYears: 9, sex: 'female', pregnant: 'no' }), true);
    assert.equal(SIK.isMenstruationRelevant({ ageYears: 8, sex: 'female', pregnant: 'no' }), false);
    assert.equal(SIK.isMenstruationRelevant({ ageYears: 56, sex: 'female', pregnant: 'no' }), false);
    assert.equal(SIK.isMenstruationRelevant({ ageYears: 25, sex: 'female', pregnant: 'yes' }), false);
    assert.equal(SIK.isMenstruationRelevant({ ageYears: 25, sex: 'male' }), false);
  });

  test('pertanyaan kehamilan hanya untuk perempuan usia 10–55 tahun', () => {
    assert.equal(SIK.isPregnancyRelevant({ ageYears: 10, sex: 'female' }), true);
    assert.equal(SIK.isPregnancyRelevant({ ageYears: 55, sex: 'female' }), true);
    assert.equal(SIK.isPregnancyRelevant({ ageYears: 9, sex: 'female' }), false);
    assert.equal(SIK.isPregnancyRelevant({ ageYears: 30, sex: 'male' }), false);
  });

  test('kelompok sasaran TTD: ibu hamil harian, remaja putri dan WUS mingguan', () => {
    assert.equal(SIK.ttdTarget({ ageYears: 28, sex: 'female', pregnant: 'yes' }), 'daily');
    assert.equal(SIK.ttdTarget({ ageYears: 12, sex: 'female', pregnant: 'no' }), 'weekly');
    assert.equal(SIK.ttdTarget({ ageYears: 49, sex: 'female', pregnant: 'no' }), 'weekly');
    assert.equal(SIK.ttdTarget({ ageYears: 50, sex: 'female', pregnant: 'no' }), null);
    assert.equal(SIK.ttdTarget({ ageYears: 11, sex: 'female', pregnant: 'no' }), null);
    assert.equal(SIK.ttdTarget({ ageYears: 30, sex: 'male' }), null);
  });
});

describe('evaluate (hasil skrining)', () => {
  test('Hb tidak diketahui → Belum dapat ditentukan walau banyak gejala dan faktor risiko', () => {
    const result = SIK.evaluate(baseAnswers({
      hbKnown: 'no',
      hbValue: '',
      symptoms: ['lemas', 'pusing', 'pucat', 'lelah'],
      diet: { ironFreq: 'rarely', meals: '1', breakfast: 'rarely', teaCoffee: 'often' }
    }));
    assert.equal(result.hb.category, 'undetermined');
    assert.equal(result.hb.label, 'Belum dapat ditentukan');
    assert.equal(result.hb.reason, 'unknown');
    assert.ok(result.riskFactors.length >= 4);
  });

  test('label kategori sesuai spesifikasi', () => {
    assert.equal(SIK.evaluate(baseAnswers({ hbValue: '12.0' })).hb.label, 'Tidak memenuhi kriteria anemia berdasarkan Hb');
    assert.equal(SIK.evaluate(baseAnswers({ hbValue: '11.5' })).hb.label, 'Anemia ringan');
    assert.equal(SIK.evaluate(baseAnswers({ hbValue: '9,0' })).hb.label, 'Anemia sedang');
    assert.equal(SIK.evaluate(baseAnswers({ hbValue: '7.9' })).hb.label, 'Anemia berat');
  });

  test('kehamilan trimester 2 memakai ambang 10,5 g/dL, trimester 1 memakai 11,0 g/dL', () => {
    const t2 = SIK.evaluate(baseAnswers({ pregnant: 'yes', trimester: 2, hbValue: '10.5' }));
    const t1 = SIK.evaluate(baseAnswers({ pregnant: 'yes', trimester: 1, hbValue: '10.5' }));
    assert.equal(t2.hb.category, 'none');
    assert.equal(t1.hb.category, 'mild');
    assert.equal(t2.profile.group.id, 'pregnant-t2');
  });

  test('faktor risiko tidak mengubah kategori Hb', () => {
    const healthy = SIK.evaluate(baseAnswers({ hbValue: '11.4' }));
    const risky = SIK.evaluate(baseAnswers({
      hbValue: '11.4',
      menstruation: { status: 'active', regularity: 'irregular', duration: 'gt7', volume: 'heavy' },
      diet: { ironFreq: 'rarely', meals: '1', breakfast: 'rarely', teaCoffee: 'often' },
      ttd: { use: 'no', frequency: null, adherence: null },
      symptoms: ['lemas', 'pusing', 'pucat', 'lelah', 'berdebar', 'sesak', 'sakit-kepala', 'konsentrasi']
    }));
    assert.equal(healthy.hb.category, risky.hb.category);
    assert.ok(risky.riskFactors.length > healthy.riskFactors.length);
  });

  test('tanda bahaya memicu rekomendasi darurat di urutan pertama', () => {
    const result = SIK.evaluate(baseAnswers({ danger: ['pingsan', 'nyeri-dada'] }));
    assert.equal(result.danger.present, true);
    assert.deepEqual(result.danger.list, ['Pingsan atau hampir pingsan', 'Nyeri dada']);
    assert.equal(result.urgent, true);
    assert.equal(result.recommendations[0].id, 'danger');
    assert.equal(result.recommendations[0].priority, 'urgent');
  });

  test('opsi "tidak ada tanda bahaya" tidak dihitung sebagai tanda bahaya', () => {
    const result = SIK.evaluate(baseAnswers({ danger: ['none'] }));
    assert.equal(result.danger.present, false);
    assert.equal(result.urgent, false);
  });

  test('anemia berat memicu rekomendasi darurat', () => {
    const result = SIK.evaluate(baseAnswers({ hbValue: '7.0' }));
    assert.equal(result.hb.category, 'severe');
    assert.equal(result.urgent, true);
    assert.ok(result.recommendations.some((r) => r.id === 'severe' && r.priority === 'urgent'));
  });

  test('penyesuaian ketinggian menurunkan Hb terkoreksi', () => {
    const result = SIK.evaluate(baseAnswers({ hbValue: '12.2', elevation: '500' }));
    assert.equal(result.hb.measured, 12.2);
    assert.equal(result.hb.adjusted, 11.8);
    assert.equal(result.hb.adjustment.total, 4);
    assert.equal(result.hb.category, 'mild');
    assert.equal(SIK.evaluate(baseAnswers({ hbValue: '12.2' })).hb.category, 'none');
  });

  test('penyesuaian merokok diterapkan', () => {
    const result = SIK.evaluate(baseAnswers({
      sex: 'male', ageYears: 30, hbValue: '13.2', smoking: 'gte20', menstruation: null, ttd: { use: 'na' }
    }));
    assert.equal(result.hb.adjusted, 12.6);
    assert.equal(result.hb.category, 'mild');
  });

  test('pertanyaan menstruasi diabaikan untuk laki-laki', () => {
    const result = SIK.evaluate(baseAnswers({
      sex: 'male', ageYears: 30, hbValue: '14',
      menstruation: { status: 'active', regularity: 'irregular', duration: 'gt7', volume: 'heavy' },
      ttd: { use: 'na' }
    }));
    assert.equal(result.menstruation.relevant, false);
    assert.ok(!factorIds(result).some((id) => id.startsWith('menstruation')));
  });

  test('menstruasi banyak, lama, dan tidak teratur menjadi faktor risiko', () => {
    const result = SIK.evaluate(baseAnswers({
      menstruation: { status: 'active', regularity: 'irregular', duration: 'gt7', volume: 'heavy' }
    }));
    const ids = factorIds(result);
    assert.ok(ids.includes('menstruation-heavy'));
    assert.ok(ids.includes('menstruation-long'));
    assert.ok(ids.includes('menstruation-irregular'));
  });

  test('menstruasi tidak dinilai bila belum atau sudah berhenti menstruasi', () => {
    const result = SIK.evaluate(baseAnswers({
      menstruation: { status: 'stopped', regularity: 'irregular', duration: 'gt7', volume: 'heavy' }
    }));
    assert.ok(!factorIds(result).some((id) => id.startsWith('menstruation')));
  });

  test('frekuensi makanan sumber zat besi yang rendah menjadi faktor risiko', () => {
    const low = SIK.evaluate(baseAnswers({ diet: { ironFreq: 'sometimes', meals: '3plus', breakfast: 'daily', teaCoffee: 'never' } }));
    const ok = SIK.evaluate(baseAnswers({ diet: { ironFreq: 'often', meals: '3plus', breakfast: 'daily', teaCoffee: 'never' } }));
    assert.ok(factorIds(low).includes('iron-low'));
    assert.ok(!factorIds(ok).includes('iron-low'));
  });

  test('kebiasaan makan lain dinilai: makan utama, sarapan, teh/kopi', () => {
    const result = SIK.evaluate(baseAnswers({ diet: { ironFreq: 'daily', meals: '2', breakfast: 'rarely', teaCoffee: 'often' } }));
    const ids = factorIds(result);
    assert.ok(ids.includes('meals-low'));
    assert.ok(ids.includes('breakfast-skip'));
    assert.ok(ids.includes('tea-coffee'));
  });

  test('remaja putri yang tidak minum TTD ditandai', () => {
    const result = SIK.evaluate(baseAnswers({ ageYears: 16, ttd: { use: 'no' } }));
    assert.equal(result.ttd.target, 'weekly');
    assert.ok(factorIds(result).includes('ttd-none'));
  });

  test('TTD yang sering terlewat ditandai belum rutin', () => {
    const result = SIK.evaluate(baseAnswers({ ageYears: 16, ttd: { use: 'yes', frequency: 'weekly', adherence: 'often-missed' } }));
    assert.ok(factorIds(result).includes('ttd-irregular'));
  });

  test('laki-laki dengan opsi TTD tidak berlaku tidak ditandai', () => {
    const result = SIK.evaluate(baseAnswers({ sex: 'male', ageYears: 30, hbValue: '14', menstruation: null, ttd: { use: 'na' } }));
    assert.equal(result.ttd.target, null);
    assert.ok(!factorIds(result).some((id) => id.startsWith('ttd')));
  });

  test('ibu hamil yang minum TTD seminggu sekali ditandai di bawah anjuran', () => {
    const result = SIK.evaluate(baseAnswers({
      pregnant: 'yes', trimester: 2, hbValue: '11', ttd: { use: 'yes', frequency: 'weekly', adherence: 'always' }
    }));
    assert.ok(factorIds(result).includes('ttd-below'));
    assert.ok(factorIds(result).includes('pregnancy'));
  });

  test('dua gejala atau lebih dicatat sebagai indikator, bukan diagnosis', () => {
    const result = SIK.evaluate(baseAnswers({ symptoms: ['lemas', 'pucat'] }));
    assert.deepEqual(result.symptoms.list, ['Lemas', 'Pucat']);
    assert.ok(factorIds(result).includes('symptoms'));
    assert.equal(result.hb.category, 'none');
  });

  test('hasil tidak pernah menyebut jenis anemia', () => {
    const result = SIK.evaluate(baseAnswers({
      hbValue: '8.5',
      menstruation: { status: 'active', regularity: 'irregular', duration: 'gt7', volume: 'heavy' },
      diet: { ironFreq: 'rarely', meals: '1', breakfast: 'rarely', teaCoffee: 'often' },
      ttd: { use: 'no' },
      symptoms: ['lemas', 'pusing', 'pucat']
    }));
    const text = JSON.stringify(result);
    assert.doesNotMatch(text, /anemia defisiensi|thalas|aplastik|hemolitik|megaloblastik|sel sabit/i);
  });

  test('Hb lebih dari 6 bulan lalu menambah saran pemeriksaan ulang', () => {
    const result = SIK.evaluate(baseAnswers({ hbTestedWhen: 'old' }));
    assert.ok(result.recommendations.some((r) => r.id === 'recheck'));
  });

  test('usia di atas 65 tahun dengan Hb → belum dapat ditentukan', () => {
    const result = SIK.evaluate(baseAnswers({ ageYears: 70, hbValue: '11', menstruation: null, ttd: { use: 'na' } }));
    assert.equal(result.hb.category, 'undetermined');
    assert.equal(result.hb.reason, 'over65');
    assert.equal(result.hb.measured, 11);
  });

  test('nilai Hb tidak valid tidak diklasifikasikan', () => {
    const result = SIK.evaluate(baseAnswers({ hbValue: '115' }));
    assert.equal(result.hb.category, 'undetermined');
    assert.equal(result.hb.reason, 'invalid');
  });

  test('nama dirapikan, dibatasi 40 karakter, dan diberi nama bawaan', () => {
    assert.equal(SIK.evaluate(baseAnswers({ name: '   Sari   Dewi  ' })).profile.name, 'Sari Dewi');
    assert.equal(SIK.evaluate(baseAnswers({ name: '' })).profile.name, 'Pengguna');
    assert.equal(SIK.evaluate(baseAnswers({ name: 'a'.repeat(80) })).profile.name.length, 40);
  });

  test('skala indikator Hb mencakup zona sesuai ambang kelompok', () => {
    const result = SIK.evaluate(baseAnswers({ hbValue: '11.5' }));
    const zones = result.hb.scale.zones.map((z) => [z.key, z.from, z.to]);
    assert.deepEqual(zones, [['severe', 6, 8], ['moderate', 8, 11], ['mild', 11, 12], ['none', 12, 16]]);
  });
});

describe('DATA statistik', () => {
  test('setiap dataset punya sumber resmi dan tahun', () => {
    const { sources } = SIK.DATA;
    for (const [key, dataset] of Object.entries(SIK.DATA)) {
      if (key === 'sources') continue;
      assert.ok(sources[dataset.source], `sumber ${dataset.source} untuk ${key}`);
      assert.match(sources[dataset.source].url, /^https:\/\/(www\.)?(who\.int|badankebijakan\.kemkes\.go\.id|kemkes\.go\.id)\//);
    }
  });

  test('nilai persentase berada di rentang 0–100 dan seri tren konsisten', () => {
    const { comparison, trend } = SIK.DATA;
    for (const row of comparison.rows) {
      assert.ok(row.year >= 2019 && row.year <= 2023);
      for (const v of [row.indonesia, row.global]) assert.ok(v > 0 && v < 100);
      assert.ok(row.indonesiaRange[0] <= row.indonesia && row.indonesia <= row.indonesiaRange[1], `rentang Indonesia ${row.label}`);
      assert.ok(row.globalRange[0] <= row.global && row.global <= row.globalRange[1], `rentang global ${row.label}`);
    }
    for (const series of [trend.indonesia, trend.global]) {
      assert.equal(series.value.length, trend.years.length);
      series.value.forEach((v, i) => {
        assert.ok(series.low[i] <= v && v <= series.high[i], `tahun ${trend.years[i]}`);
      });
    }
  });
});
