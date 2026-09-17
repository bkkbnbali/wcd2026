/* ==========================================================================
   Dashboard Momentum Pelayanan WCD 2026
   Sumber data : Google Sheets (NASIONAL, FASKES, TARGET_KECAMATAN)

   ATURAN HITUNG PERSENTASE
   - NASIONAL       : PB_<indikator> / TARGET_PB_<indikator>  (sheet NASIONAL)
   - Kabupaten/Kota : SUM(PB_<indikator> di FASKES per kabupaten)
                      / SUM(TARGET_PB_<indikator> di TARGET_KECAMATAN per kabupaten)
   - Kecamatan      : SUM(PB_<indikator> di FASKES per kecamatan)
                      / SUM(TARGET_PB_<indikator> di TARGET_KECAMATAN per kecamatan)
   ========================================================================== */

const SHEET_ID = '1bcKCFnjmBDh6R2d3tpc7EKQ_ZVCYs8HnvyptOTx65Dw';
const SHEETS = { nasional: 'NASIONAL', faskes: 'FASKES', target: 'TARGET_KECAMATAN' };

const INDICATORS = [
  { key: 'PB_TOTAL', label: 'PB Total' },
  { key: 'PB_KBPP', label: 'KBPP' },
  { key: 'PB_MKJP', label: 'MKJP' }
];

/** Rincian jenis alat kontrasepsi (alkon) yang tersedia di sheet FASKES. */
const ALKON = [
  { key: 'suntikan', label: 'Suntikan' },
  { key: 'pil', label: 'Pil' },
  { key: 'kondom', label: 'Kondom' },
  { key: 'implan', label: 'Implan' },
  { key: 'iud', label: 'IUD' },
  { key: 'vasektomi', label: 'Vasektomi' },
  { key: 'tubektomi', label: 'Tubektomi' }
];

/* --------------------------------------------------------------------------
   DATA DEMO (dipakai bila spreadsheet tidak bisa diakses)
   -------------------------------------------------------------------------- */
const DEMO = {
  nasional: [
    ['tanggal', 'PROVINSI', 'TARGET_PB_MKJP', 'TARGET_PB_KBPP', 'TARGET_PB_TOTAL', 'PB_MKJP', 'PB_KBPP', 'PB_TOTAL'],
    ['08/09/2026', 'BALI', '6.844', '5.387', '29.821', '26', '39', '48'],
    ['08/09/2026', 'JAWA BARAT', '25.869', '44.757', '131.676', '579', '1.269', '2.527'],
    ['08/09/2026', 'JAWA TENGAH', '96.452', '38.778', '194.483', '1.090', '2.488', '4.978'],
    ['08/09/2026', 'NASIONAL', '334.598', '298.605', '1.228.004', '3.143', '4.050', '13.285']
  ],
  faskes: [
    ['tanggal', 'Tempat Pelayanan KBID', 'NamaTempatPelayananKB', 'Kabupaten', 'Kecamatan', 'Kelurahan', 'Suntikan', 'Pil', 'Kondom', 'Implan', 'Iud', 'Vasektomi', 'Tubektomi', 'PB_TOTAL', 'PB_MKJP', 'PB_KBPP'],
    ['8-9-2026', '5103101', 'RSUD Mangusada', 'BADUNG', 'MENGWI', 'KAPAL', '30', '12', '6', '14', '18', '4', '4', '88', '83', '80'],
    ['8-9-2026', '5103102', 'Puskesmas Kuta Selatan', 'BADUNG', 'KUTA SELATAN', 'BENOA', '28', '11', '6', '13', '17', '4', '3', '82', '78', '75'],
    ['8-9-2026', '5104101', 'RSUD Gianyar', 'GIANYAR', 'UBUD', 'PELIATAN', '32', '13', '7', '14', '18', '4', '3', '91', '88', '85'],
    ['8-9-2026', '5171101', 'RSUP Sanglah', 'KOTA DENPASAR', 'DENPASAR SELATAN', 'PANJER', '33', '13', '8', '15', '18', '4', '3', '94', '90', '87']
  ],
  target: [
    ['KABUPATEN', 'KECAMATAN', 'TARGET_PB_TOTAL', 'TARGET_PB_MKJP', 'TARGET_PB_KBPP'],
    ['BADUNG', 'MENGWI', '1,121', '232', '209'],
    ['BADUNG', 'KUTA SELATAN', '639', '131', '96'],
    ['GIANYAR', 'UBUD', '900', '180', '140'],
    ['DENPASAR', 'DENPASAR SELATAN', '900', '200', '120']
  ]
};

/* --------------------------------------------------------------------------
   STATE
   Catatan: indikator tidak lagi dipilih satu-satu.
   Ketiga indikator (PB Total, KBPP, MKJP) selalu ditampilkan bersamaan.
   -------------------------------------------------------------------------- */
const state = {
  date: '',
  scope: 'NASIONAL', // 'NASIONAL' | 'BALI'
  kabupaten: 'ALL',
  kecamatan: 'ALL',
  live: false
};
const model = { nasional: [], faskes: [], target: [], dates: [] };
const kabNames = new Map(); // key kabupaten -> nama tampil
const kecNames = new Map(); // key kabupaten|kecamatan -> nama tampil
let datePinned = false; // true bila pengguna sudah memilih periode sendiri

/* --------------------------------------------------------------------------
   UTILITAS
   -------------------------------------------------------------------------- */
const $ = (id) => document.getElementById(id);

const ZERO = () => ({ PB_TOTAL: 0, PB_KBPP: 0, PB_MKJP: 0 });
const ZERO_ALKON = () => ALKON.reduce((o, a) => { o[a.key] = 0; return o; }, {});

/** Normalisasi nama kolom: huruf besar, pemisah seragam. */
const normalize = (v) => String(v ?? '').trim().toUpperCase().replace(/[_.\-/]+/g, ' ').replace(/\s+/g, ' ');

/** Normalisasi nama wilayah: huruf besar, spasi rapat. */
const keyName = (v) => String(v ?? '').trim().toUpperCase().replace(/\s+/g, ' ');

/** Key kabupaten tanpa awalan KOTA/KABUPATEN (menyatukan "KOTA DENPASAR" dengan "DENPASAR"). */
const kabKey = (v) => keyName(v).replace(/^(KOTA|KABUPATEN|KAB)\s+/, '');

/** Konversi angka: mendukung "1,034" (pemisah ribuan koma) dan "8.463" (pemisah ribuan titik). */
function num(v) {
  if (typeof v === 'number') return Number.isFinite(v) ? v : 0;
  let s = String(v ?? '').trim().replace(/[^0-9.,-]/g, '');
  if (!s) return 0;
  const hasComma = s.includes(',');
  const hasDot = s.includes('.');
  if (hasComma && hasDot) {
    s = s.lastIndexOf(',') > s.lastIndexOf('.')
      ? s.replace(/\./g, '').replace(',', '.')
      : s.replace(/,/g, '');
  } else if (hasComma) {
    s = /^-?\d{1,3}(,\d{3})+$/.test(s) ? s.replace(/,/g, '') : s.replace(',', '.');
  } else if (hasDot) {
    s = /^-?\d{1,3}(\.\d{3})+$/.test(s) ? s.replace(/\./g, '') : s;
  }
  const n = Number(s);
  return Number.isFinite(n) ? n : 0;
}

/** Tanggal d/m/yyyy atau dd/mm/yyyy -> ISO yyyy-mm-dd. */
function parseDate(v) {
  const s = String(v ?? '').trim();
  if (!s) return null;
  let m = s.match(/^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{2,4})$/);
  if (m) {
    let [, a, b, yr] = m;
    let numA = +a, numB = +b;
    if (yr.length === 4 && (+yr > 2100 || yr.startsWith('02') || yr.startsWith('3'))) yr = '2026';
    if (yr.length === 2) yr = '20' + yr;
    let day, month;
    if (numA === 9 && numB <= 31) {
      month = 9; day = numB;
    } else if (numB === 9 && numA <= 31) {
      month = 9; day = numA;
    } else if (numA > 12) {
      day = numA; month = numB;
    } else {
      month = numA; day = numB;
    }
    return `${yr}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  }
  m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m) {
    let yr = m[1];
    if (+yr > 2100) yr = '2026';
    return `${yr}-${String(+m[2]).padStart(2, '0')}-${String(+m[3]).padStart(2, '0')}`;
  }
  return null;
}

function fmtDate(iso) {
  if (!iso) return '-';
  const d = new Date(iso + 'T00:00:00');
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' });
}

const KEEP_UPPER = new Set(['DKI', 'DIY', 'NTB', 'NTT', 'KBPP', 'MKJP', 'PB', 'WCD', 'RI', 'BKKBN']);
function titleCase(v) {
  return String(v ?? '').trim().toUpperCase().split(/\s+/).filter(Boolean)
    .map((w) => (KEEP_UPPER.has(w) ? w : w.charAt(0) + w.slice(1).toLowerCase()))
    .join(' ');
}

const fmtNum = (v) => (Number.isFinite(v) ? Math.round(v).toLocaleString('id-ID') : '0');
function fmtPct(v, digits = 2) {
  if (v === null || v === undefined || !Number.isFinite(v)) return '—';
  return v.toLocaleString('id-ID', { minimumFractionDigits: digits, maximumFractionDigits: digits }) + '%';
}
const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

/* --------------------------------------------------------------------------
   PARSER CSV
   -------------------------------------------------------------------------- */
function parseCsv(text) {
  const rows = [];
  let row = [];
  let cell = '';
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    const n = text[i + 1];
    if (c === '"' && quoted && n === '"') { cell += '"'; i++; }
    else if (c === '"') quoted = !quoted;
    else if (c === ',' && !quoted) { row.push(cell); cell = ''; }
    else if ((c === '\n' || c === '\r') && !quoted) {
      if (c === '\r' && n === '\n') i++;
      row.push(cell);
      if (row.some((x) => String(x).trim() !== '')) rows.push(row);
      row = []; cell = '';
    } else cell += c;
  }
  if (cell !== '' || row.length) {
    row.push(cell);
    if (row.some((x) => String(x).trim() !== '')) rows.push(row);
  }
  return rows;
}

/** Ubah matriks CSV menjadi array objek berdasarkan alias nama kolom. */
function mapper(rows, spec) {
  if (!rows || !rows.length) return [];
  const headers = rows[0].map(normalize);
  const idx = {};
  for (const key of Object.keys(spec)) {
    const wanted = spec[key].map(normalize);
    idx[key] = headers.findIndex((h) => h && wanted.includes(h));
  }
  return rows.slice(1)
    .filter((r) => r.some((c) => String(c).trim() !== ''))
    .map((r) => {
      const o = {};
      for (const key of Object.keys(idx)) o[key] = idx[key] < 0 ? '' : (r[idx[key]] ?? '');
      return o;
    });
}

/* --------------------------------------------------------------------------
   PEMBENTUKAN MODEL DATA
   -------------------------------------------------------------------------- */
function buildModel(data) {
  const nas = mapper(data.nasional, {
    date: ['TANGGAL', 'DATE'],
    provinsi: ['PROVINSI', 'PROVINCE'],
    tTotal: ['TARGET_PB_TOTAL'], tKbpp: ['TARGET_PB_KBPP'], tMkjp: ['TARGET_PB_MKJP'],
    rTotal: ['PB_TOTAL'], rKbpp: ['PB_KBPP'], rMkjp: ['PB_MKJP']
  });
  const fas = mapper(data.faskes, {
    date: ['TANGGAL', 'DATE'],
    kbId: ['TEMPAT PELAYANAN KBID', 'KBID', 'KODE FASKES', 'KODE FASYANKES'],
    faskesName: ['NAMATEMPATPELAYANANKB', 'NAMA TEMPAT PELAYANAN KB', 'NAMA FASKES', 'NAMA FASYANKES'],
    kabupaten: ['KABUPATEN', 'KABUPATEN KOTA', 'KAB KOTA', 'KABUPATEN/KOTA'],
    kecamatan: ['KECAMATAN', 'NAMA KECAMATAN'],
    kelurahan: ['KELURAHAN', 'DESA', 'DESA KELURAHAN', 'DESA/KELURAHAN'],
    suntikan: ['SUNTIKAN'],
    pil: ['PIL'],
    kondom: ['KONDOM'],
    implan: ['IMPLAN'],
    iud: ['IUD'],
    vasektomi: ['VASEKTOMI'],
    tubektomi: ['TUBEKTOMI'],
    rTotal: ['PB_TOTAL'], rKbpp: ['PB_KBPP'], rMkjp: ['PB_MKJP']
  });
  const tar = mapper(data.target, {
    kabupaten: ['KABUPATEN', 'KABUPATEN KOTA', 'KAB KOTA', 'KABUPATEN/KOTA'],
    kecamatan: ['KECAMATAN', 'NAMA KECAMATAN'],
    tTotal: ['TARGET_PB_TOTAL', 'TARGET PB TOTAL'],
    tKbpp: ['TARGET_PB_KBPP', 'TARGET PB KBPP'],
    tMkjp: ['TARGET_PB_MKJP', 'TARGET PB MKJP']
  });

  // Target provinsi bersifat tetap (sesuai instruksi: pakai target tanggal 8/paling awal)
  const provTargets = new Map();
  const sortedNas = [...nas].sort((a, b) => (parseDate(a.date) || '').localeCompare(parseDate(b.date) || ''));
  sortedNas.forEach((o) => {
    const p = keyName(o.provinsi);
    if (!provTargets.has(p) && num(o.tTotal) > 0) {
      provTargets.set(p, { PB_TOTAL: num(o.tTotal), PB_KBPP: num(o.tKbpp), PB_MKJP: num(o.tMkjp) });
    }
  });

  model.nasional = nas.map((o) => {
    const p = keyName(o.provinsi);
    const fixedTar = provTargets.get(p) || { PB_TOTAL: num(o.tTotal), PB_KBPP: num(o.tKbpp), PB_MKJP: num(o.tMkjp) };
    return {
      date: parseDate(o.date),
      provinsi: p,
      target: fixedTar,
      real: { PB_TOTAL: num(o.rTotal), PB_KBPP: num(o.rKbpp), PB_MKJP: num(o.rMkjp) }
    };
  }).filter((o) => o.provinsi && o.date);

  model.faskes = fas.map((o) => ({
    date: parseDate(o.date),
    kbId: keyName(o.kbId),
    faskesName: String(o.faskesName ?? '').trim(),
    kabKey: kabKey(o.kabupaten),
    kabName: keyName(o.kabupaten),
    kec: keyName(o.kecamatan),
    kecName: keyName(o.kecamatan),
    kel: keyName(o.kelurahan),
    alkon: ALKON.reduce((acc, a) => { acc[a.key] = num(o[a.key]); return acc; }, {}),
    real: { PB_TOTAL: num(o.rTotal), PB_KBPP: num(o.rKbpp), PB_MKJP: num(o.rMkjp) }
  })).filter((o) => o.kabKey);

  model.target = tar.map((o) => ({
    kabKey: kabKey(o.kabupaten),
    kabName: keyName(o.kabupaten),
    kec: keyName(o.kecamatan),
    kecName: keyName(o.kecamatan),
    target: { PB_TOTAL: num(o.tTotal), PB_KBPP: num(o.tKbpp), PB_MKJP: num(o.tMkjp) }
  })).filter((o) => o.kabKey);

  // Nama tampil: prioritaskan penulisan dari sheet FASKES
  kabNames.clear();
  kecNames.clear();
  model.target.forEach((t) => {
    if (!kabNames.has(t.kabKey)) kabNames.set(t.kabKey, t.kabName);
    kecNames.set(t.kabKey + '|' + t.kec, t.kecName);
  });
  model.faskes.forEach((f) => {
    kabNames.set(f.kabKey, f.kabName);
    kecNames.set(f.kabKey + '|' + f.kec, f.kecName);
  });

  model.dates = [...new Set([...model.nasional.map((n) => n.date), ...model.faskes.map((f) => f.date)].filter(Boolean))].sort();

  // Periode terpilih: default tanggal terakhir, dan selalu direset bila tanggal itu hilang.
  if (!datePinned || !model.dates.includes(state.date)) state.date = model.dates[model.dates.length - 1] || '';
}

const kabDisplay = (key) => titleCase(kabNames.get(key) || key);
const kecDisplay = (kabK, kec) => {
  let lookup = kabK + '|' + kec;
  if (!kecNames.has(lookup)) {
    const found = [...kecNames.keys()].find((k) => k.endsWith('|' + kec));
    if (found) lookup = found;
  }
  return titleCase(kecNames.get(lookup) || kec);
};

/**
 * Cari kabupaten / kota pemilik sebuah kecamatan (untuk kunci filter otomatis).
 * @returns {string|null} key kabupaten atau null bila tidak ditemukan.
 */
function resolveKabOfKec(kec) {
  const fromTarget = model.target.find((t) => t.kec === kec);
  if (fromTarget) return fromTarget.kabKey;
  const fromFaskes = model.faskes.find((f) => f.kec === kec);
  return fromFaskes ? fromFaskes.kabKey : null;
}

/* --------------------------------------------------------------------------
   FILTER & AGREGASI
   -------------------------------------------------------------------------- */
/**
 * Filter tanggal kini bersifat harian (bukan kumulatif).
 * Satu tanggal terpilih = data hari itu saja.
 */
const matchDate = (d) => !state.date || d === state.date;

function faskesFiltered() {
  return model.faskes.filter((r) =>
    matchDate(r.date) &&
    (state.kabupaten === 'ALL' || r.kabKey === state.kabupaten) &&
    (state.kecamatan === 'ALL' || r.kec === state.kecamatan)
  );
}

/**
 * Capaian per provinsi + baris NASIONAL sebagai pembanding.
 * Realisasi dijumlahkan bila beberapa tanggal terpilih, target tetap dari target awal kampanye.
 */
function nationalRows() {
  const map = new Map();
  model.nasional.forEach((n) => {
    if (!matchDate(n.date)) return;
    if (!map.has(n.provinsi)) {
      map.set(n.provinsi, {
        name: n.provinsi,
        real: ZERO(),
        target: { ...n.target }
      });
    }
    const g = map.get(n.provinsi);
    INDICATORS.forEach((i) => { g.real[i.key] += n.real[i.key]; });
  });
  const list = [...map.values()];
  list.forEach((g) => {
    g.pct = {};
    INDICATORS.forEach((i) => { g.pct[i.key] = g.target[i.key] > 0 ? (g.real[i.key] / g.target[i.key]) * 100 : null; });
    g.isNasional = g.name === 'NASIONAL';
    g.isBali = g.name === 'BALI';
  });
  return list;
}

function nationalTotals() {
  const rows = model.nasional.filter((n) => matchDate(n.date));
  const nasionalRows = rows.filter((n) => n.provinsi === 'NASIONAL');
  const totals = { real: ZERO(), target: ZERO() };
  if (nasionalRows.length) {
    nasionalRows.forEach((n) => {
      INDICATORS.forEach((i) => { totals.real[i.key] += n.real[i.key]; });
    });
    INDICATORS.forEach((i) => { totals.target[i.key] = nasionalRows[0].target[i.key]; });
  } else {
    // Jumlahkan semua provinsi (bukan row NASIONAL)
    const nonNas = rows.filter((n) => n.provinsi !== 'NASIONAL');
    const provs = new Set();
    nonNas.forEach((n) => {
      INDICATORS.forEach((i) => { totals.real[i.key] += n.real[i.key]; });
      if (!provs.has(n.provinsi)) {
        provs.add(n.provinsi);
        INDICATORS.forEach((i) => { totals.target[i.key] += n.target[i.key]; });
      }
    });
  }
  totals.pct = {};
  INDICATORS.forEach((i) => { totals.pct[i.key] = totals.target[i.key] > 0 ? (totals.real[i.key] / totals.target[i.key]) * 100 : null; });
  return totals;
}

function baliTotals() {
  const rows = model.nasional.filter((n) => matchDate(n.date) && n.provinsi === 'BALI');
  if (rows.length) {
    const totals = { real: ZERO(), target: { ...rows[0].target } };
    rows.forEach((r) => {
      INDICATORS.forEach((i) => { totals.real[i.key] += r.real[i.key]; });
    });
    totals.pct = {};
    INDICATORS.forEach((i) => { totals.pct[i.key] = totals.target[i.key] > 0 ? (totals.real[i.key] / totals.target[i.key]) * 100 : null; });
    return totals;
  }
  // Fallback agregasi dari FASKES & TARGET_KECAMATAN
  const wil = aggregate('kabupaten');
  const totals = { real: ZERO(), target: ZERO(), pct: {} };
  INDICATORS.forEach((i) => {
    totals.real[i.key] = wil.reduce((s, g) => s + g.real[i.key], 0);
    totals.target[i.key] = wil.reduce((s, g) => s + g.target[i.key], 0);
    totals.pct[i.key] = totals.target[i.key] > 0 ? (totals.real[i.key] / totals.target[i.key]) * 100 : null;
  });
  return totals;
}

/**
 * Agregat total capaian satu kabupaten (seluruh kecamatan & faskes di dalamnya).
 * Tidak terpengaruh filter kecamatan terpilih.
 */
function kabupatenTotals(kabKey) {
  const totals = { real: ZERO(), target: ZERO(), pct: {} };
  model.target.forEach((t) => {
    if (t.kabKey === kabKey) {
      INDICATORS.forEach((i) => { totals.target[i.key] += t.target[i.key]; });
    }
  });
  model.faskes.forEach((f) => {
    if (matchDate(f.date) && f.kabKey === kabKey) {
      INDICATORS.forEach((i) => { totals.real[i.key] += f.real[i.key]; });
    }
  });
  INDICATORS.forEach((i) => {
    totals.pct[i.key] = totals.target[i.key] > 0 ? (totals.real[i.key] / totals.target[i.key]) * 100 : null;
  });
  return totals;
}

/**
 * Agregasi capaian per kabupaten atau per kecamatan.
 * @param {'kabupaten'|'kecamatan'} level
 */
function aggregate(level) {
  const byKec = level === 'kecamatan';
  const groups = new Map();
  const touch = (key, kabK, kec) => {
    if (!groups.has(key)) {
      groups.set(key, {
        key, kabK, kec,
        name: byKec ? kecDisplay(kabK, kec) : kabDisplay(kabK),
        sub: byKec ? kabDisplay(kabK) : '',
        real: ZERO(), target: ZERO()
      });
    }
    return groups.get(key);
  };

  // Target (sheet TARGET_KECAMATAN tidak punya dimensi tanggal)
  model.target.forEach((t) => {
    if (state.kabupaten !== 'ALL' && t.kabKey !== state.kabupaten) return;
    if (byKec && state.kecamatan !== 'ALL' && t.kec !== state.kecamatan) return;
    const g = touch(byKec ? t.kabKey + '|' + t.kec : t.kabKey, t.kabKey, t.kec);
    INDICATORS.forEach((i) => { g.target[i.key] += t.target[i.key]; });
  });

  // Realisasi (sheet FASKES, mengikuti filter tanggal & wilayah)
  faskesFiltered().forEach((f) => {
    const g = touch(byKec ? f.kabKey + '|' + f.kec : f.kabKey, f.kabKey, f.kec);
    INDICATORS.forEach((i) => { g.real[i.key] += f.real[i.key]; });
  });

  const list = [...groups.values()];
  list.forEach((g) => {
    g.pct = {};
    INDICATORS.forEach((i) => { g.pct[i.key] = g.target[i.key] > 0 ? (g.real[i.key] / g.target[i.key]) * 100 : null; });
  });
  return list;
}

const sortByPct = (list, indKey) =>
  [...list].sort((a, b) => {
    const x = a.pct[indKey], y = b.pct[indKey];
    if (x === null && y === null) return b.real[indKey] - a.real[indKey];
    if (x === null) return 1;
    if (y === null) return -1;
    return y - x;
  });

/**
 * Sebaran cakupan wilayah pada periode & filter terpilih.
 * - Tanpa filter kabupaten : satu bar per kabupaten, nilainya jumlah kecamatan terpantau.
 * - Kabupaten dipilih      : satu bar per kecamatan, nilainya jumlah Faskes terpantau.
 * @returns {{name:string, sub:string, count:number}[]}
 */
function coverageRows() {
  const byKec = state.kabupaten !== 'ALL';
  const map = new Map();
  faskesFiltered().forEach((f) => {
    const key = byKec ? f.kabKey + '|' + f.kec : f.kabKey;
    if (!map.has(key)) {
      map.set(key, {
        name: byKec ? kecDisplay(f.kabKey, f.kec) : kabDisplay(f.kabKey),
        sub: byKec ? kabDisplay(f.kabKey) : '',
        seen: new Set(),
        count: 0
      });
    }
    const g = map.get(key);
    if (byKec) g.count += 1; // satu baris FASKES = satu tempat pelayanan
    else { g.seen.add(f.kec); g.count = g.seen.size; }
  });
  return [...map.values()]
    .map(({ name, sub, count }) => ({ name, sub, count }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name, 'id'));
}

const pctClass = (v) => (v === null || !Number.isFinite(v) ? 'na' : v >= 100 ? 'good' : v >= 50 ? 'mid' : 'low');

/* --------------------------------------------------------------------------
   RENDER: FILTER
   -------------------------------------------------------------------------- */
function renderFilters() {
  // Periode: daftar tanggal saja, terbaru di paling atas.
  const dates = [...model.dates].reverse();
  $('dateSelect').innerHTML = dates.length
    ? dates.map((d) => `<option value="${d}" ${d === state.date ? 'selected' : ''}>${fmtDate(d)}</option>`).join('')
    : '<option value="">Belum ada data</option>';

  // Dropdown Wilayah / Provinsi
  if ($('scopeSelect')) {
    $('scopeSelect').innerHTML = `
      <option value="NASIONAL" ${state.scope === 'NASIONAL' ? 'selected' : ''}>Skala Nasional (Seluruh RI)</option>
      <option value="BALI" ${state.scope === 'BALI' ? 'selected' : ''}>Provinsi Bali</option>`;
  }

  const isNasional = state.scope === 'NASIONAL';
  const kabs = [...kabNames.entries()].map(([key, name]) => ({ key, name })).sort((a, b) => a.name.localeCompare(b.name, 'id'));

  if (isNasional) {
    $('kabupatenSelect').innerHTML = '<option value="ALL">Semua Kabupaten / Kota (Pilih Bali terlebih dahulu)</option>';
    $('kabupatenSelect').disabled = true;
    $('kecamatanSelect').innerHTML = '<option value="ALL">Semua Kecamatan</option>';
    $('kecamatanSelect').disabled = true;
  } else {
    $('kabupatenSelect').disabled = false;
    $('kabupatenSelect').innerHTML = '<option value="ALL">Semua Kabupaten / Kota (9 Kab/Kota)</option>' +
      kabs.map((k) => `<option value="${esc(k.key)}" ${k.key === state.kabupaten ? 'selected' : ''}>${esc(titleCase(k.name))}</option>`).join('');

    const kecMap = new Map();
    model.target.forEach((t) => {
      if (state.kabupaten !== 'ALL' && t.kabKey !== state.kabupaten) return;
      kecMap.set(t.kabKey + '|' + t.kec, { kabK: t.kabKey, kec: t.kec });
    });
    model.faskes.forEach((f) => {
      if (state.kabupaten !== 'ALL' && f.kabKey !== state.kabupaten) return;
      kecMap.set(f.kabKey + '|' + f.kec, { kabK: f.kabKey, kec: f.kec });
    });
    const kecs = [...kecMap.values()].sort((a, b) => kecDisplay(a.kabK, a.kec).localeCompare(kecDisplay(b.kabK, b.kec), 'id'));

    const kecLabel = state.kabupaten === 'ALL'
      ? 'Pilih Kabupaten / Kota terlebih dahulu'
      : `Semua Kecamatan di ${kabDisplay(state.kabupaten)}`;

    $('kecamatanSelect').innerHTML = `<option value="ALL">${esc(kecLabel)}</option>` +
      kecs.map((k) => `<option value="${esc(k.kec)}" ${k.kec === state.kecamatan ? 'selected' : ''}>${esc(kecDisplay(k.kabK, k.kec))}</option>`).join('');
    $('kecamatanSelect').disabled = state.kabupaten === 'ALL' || kecs.length === 0;
  }
}

/* --------------------------------------------------------------------------
   RENDER: KPI DINAMIS SESUAI TINGKATAN
   Level 1: Nasional (Capaian Nasional + Highlight Bali + Cakupan 38 Prov)
   Level 2: Provinsi Bali (Capaian Bali + Nasional Pembanding + Cakupan 9 Kab)
   Level 3: Kabupaten (Capaian Kab + Provinsi Pembanding + Cakupan Kec & Faskes)
   Level 4: Kecamatan (Capaian Kec + Kab Pembanding + Cakupan Desa & Faskes)
   -------------------------------------------------------------------------- */
function renderKpis() {
  const nat = nationalTotals();
  const bali = baliTotals();
  const level = currentLevel();
  const wilayah = aggregate(level);

  // Total capaian wilayah terpilih
  const wil = { real: ZERO(), target: ZERO(), pct: {} };
  INDICATORS.forEach((i) => {
    wil.real[i.key] = wilayah.reduce((s, g) => s + g.real[i.key], 0);
    wil.target[i.key] = wilayah.reduce((s, g) => s + g.target[i.key], 0);
    wil.pct[i.key] = wil.target[i.key] > 0 ? (wil.real[i.key] / wil.target[i.key]) * 100 : null;
  });

  const scope = faskesFiltered();
  const scopeKab = new Set(scope.map((f) => f.kabKey));
  const scopeKec = new Set(scope.map((f) => f.kabKey + '|' + f.kec));

  const cov = coverageRows();
  const covMax = Math.max(1, ...cov.map((c) => c.count));
  const byKecCov = state.kabupaten !== 'ALL';
  const coverageChart = cov.map((c) => `
    <div class="cov-row">
      <span class="cov-name" title="${esc(c.name)}">${esc(c.name)}</span>
      <span class="cov-track"><i style="width:${Math.max(5, (c.count / covMax) * 100)}%"></i></span>
      <b>${fmtNum(c.count)}</b>
    </div>`).join('') || '<p class="muted">Belum ada data.</p>';

  const rows = (totals) => {
    const max = Math.max(0.000001, ...INDICATORS.map((i) => totals.pct[i.key] ?? 0));
    return INDICATORS.map((i) => `
      <div class="kpi-row">
        <div class="kr-head"><span>${i.label}</span><b>${fmtPct(totals.pct[i.key])}</b></div>
        <div class="kr-bar"><i style="width:${Math.max(1.5, ((totals.pct[i.key] ?? 0) / max) * 100)}%"></i></div>
        <span class="kr-sub">${fmtNum(totals.real[i.key])} dari ${fmtNum(totals.target[i.key])}</span>
      </div>`).join('');
  };

  let card1Title = 'Capaian Nasional';
  let card1Totals = nat;
  let card1Sub = `Periode ${fmtDate(state.date)}`;
  let card1Accent = true;

  let card2Title = 'Capaian Provinsi Bali';
  let card2Totals = bali;
  let card2Sub = 'Realisasi Faskes se-Bali dibanding target provinsi';
  let card2Accent = false;

  let covHead1 = `${scopeKab.size}`;
  let covLabel1 = 'Kabupaten / Kota';
  let covHead2 = `${scopeKec.size}`;
  let covLabel2 = 'Kecamatan';
  let coverageNote = 'Jumlah kecamatan terpantau per kabupaten / kota';

  if (state.scope === 'NASIONAL') {
    card1Accent = true;
    card2Accent = false;
    covHead1 = '38';
    covLabel1 = 'Provinsi';
    covHead2 = '514';
    covLabel2 = 'Kab / Kota se-RI';
    coverageNote = 'Cakupan pemantauan seluruh Indonesia (sheet NASIONAL)';
  } else if (state.scope === 'BALI' && state.kabupaten === 'ALL') {
    card1Title = 'Capaian Provinsi Bali';
    card1Totals = bali;
    card1Sub = 'Realisasi 9 Kab/Kota dibanding target Bali';
    card1Accent = true;

    card2Title = 'Capaian Nasional (Pembanding)';
    card2Totals = nat;
    card2Sub = `Seluruh 38 Provinsi per ${fmtDate(state.date)}`;
    card2Accent = false;

    covHead1 = '9';
    covLabel1 = 'Kabupaten / Kota';
    covHead2 = '57';
    covLabel2 = 'Kecamatan se-Bali';
    coverageNote = 'Jumlah tempat pelayanan terpantau per kabupaten / kota di Bali';
  } else if (state.scope === 'BALI' && state.kabupaten !== 'ALL' && state.kecamatan === 'ALL') {
    card1Title = `Capaian Kab. ${kabDisplay(state.kabupaten)}`;
    card1Totals = wil;
    card1Sub = 'Agregat realisasi Faskes dibanding target kecamatan';
    card1Accent = true;

    card2Title = 'Capaian Prov. Bali (Pembanding)';
    card2Totals = bali;
    card2Sub = 'Capaian agregat 9 Kabupaten/Kota se-Bali';
    card2Accent = false;

    covHead1 = `${scopeKec.size}`;
    covLabel1 = 'Kecamatan';
    covHead2 = `${scope.length}`;
    covLabel2 = 'Faskes Terpantau';
    coverageNote = 'Jumlah Faskes terpantau per kecamatan';
  } else {
    // state.scope === 'BALI' && state.kecamatan !== 'ALL'
    card1Title = `Capaian Kec. ${kecDisplay(state.kabupaten, state.kecamatan)}`;
    card1Totals = wil;
    card1Sub = 'Realisasi Faskes di kecamatan dibanding target';
    card1Accent = true;

    const kabTotals = kabupatenTotals(state.kabupaten);
    card2Title = `Capaian Kab. ${kabDisplay(state.kabupaten)} (Pembanding)`;
    card2Totals = kabTotals;
    card2Sub = 'Agregat realisasi seluruh kecamatan di kabupaten pembanding';
    card2Accent = false;

    const desas = aggregateDesa();
    covHead1 = `${desas.length}`;
    covLabel1 = 'Desa / Kelurahan';
    covHead2 = `${scope.length}`;
    covLabel2 = 'Faskes Terpantau';
    coverageNote = 'Tempat pelayanan (Faskes) terpantau di kecamatan ini';
  }

  $('kpiGrid').innerHTML = `
    <div class="kpi ${card1Accent ? 'accent' : ''}">
      <div class="kpi-label"><span>${card1Title}</span><span>01</span></div>
      <div class="kpi-rows">${rows(card1Totals)}</div>
      <div class="kpi-foot">${card1Sub}</div>
    </div>
    <div class="kpi ${card2Accent ? 'accent' : ''}">
      <div class="kpi-label"><span>${card2Title}</span><span>02</span></div>
      <div class="kpi-rows">${rows(card2Totals)}</div>
      <div class="kpi-foot">${card2Sub}</div>
    </div>
    <div class="kpi">
      <div class="kpi-label"><span>Cakupan Wilayah</span><span>03</span></div>
      <div class="cov-head">
        <div><b>${covHead1}</b><small>${covLabel1}</small></div>
        <div><b>${covHead2}</b><small>${covLabel2}</small></div>
      </div>
      <div class="cov-chart">${coverageChart}</div>
      <div class="kpi-foot">${coverageNote}</div>
    </div>`;
}

/* --------------------------------------------------------------------------
   RENDER: GRAFIK NASIONAL (38 Provinsi, satu grafik per indikator)
   -------------------------------------------------------------------------- */
function renderNational() {
  const rows = nationalRows();
  $('nationalGrid').innerHTML = INDICATORS.map((ind) => {
    const ordered = rows
      .filter((r) => r.pct[ind.key] !== null)
      .sort((a, b) => b.pct[ind.key] - a.pct[ind.key]);
    const max = Math.max(0.000001, ...ordered.map((r) => r.pct[ind.key]));
    const nasionalPos = ordered.findIndex((r) => r.isNasional) + 1;
    const provCount = ordered.filter((r) => !r.isNasional).length;

    const body = ordered.map((r, i) => {
      const cls = r.isNasional ? 'nasional' : r.isBali ? 'bali' : '';
      const label = r.isNasional ? 'Nasional' : titleCase(r.name);
      return `
      <div class="mini-row ${cls}">
        <span class="mini-rank">${String(i + 1).padStart(2, '0')}</span>
        <span class="mini-name" title="${esc(label)}">${esc(label)}</span>
        <span class="mini-track"><i class="${cls}" style="width:${Math.max(0.8, (r.pct[ind.key] / max) * 100)}%"></i></span>
        <b class="mini-value">${fmtPct(r.pct[ind.key])}</b>
      </div>`;
    }).join('');

    return `
      <article class="panel chart-panel">
        <div class="panel-heading">
          <div><h3>${ind.label}</h3><span class="muted">Persentase capaian per provinsi, nasional diurutkan bersama</span></div>
          <span class="badge badge-green">${provCount} provinsi</span>
        </div>
        <div class="chart-legend">
          <span><i class="legend-dot nasional"></i>Nasional${nasionalPos ? ` · peringkat ${nasionalPos}` : ''}</span>
          <span><i class="legend-dot bali"></i>Bali</span>
          <span><i class="legend-dot provinsi"></i>Provinsi lain</span>
        </div>
        <div class="mini-chart">${body || '<p class="muted">Belum ada data.</p>'}</div>
      </article>`;
  }).join('');
}

/* --------------------------------------------------------------------------
   TOP 10 & BOTTOM 10 KECAMATAN SE-BALI (57 KECAMATAN)
   -------------------------------------------------------------------------- */
function topBottomKecamatan() {
  const kecMap = new Map();

  // Load target seluruh 57 kecamatan se-Bali
  model.target.forEach((t) => {
    const key = t.kabKey + '|' + t.kec;
    kecMap.set(key, {
      key, kabK: t.kabKey, kec: t.kec,
      name: kecDisplay(t.kabKey, t.kec),
      sub: kabDisplay(t.kabKey),
      real: ZERO(),
      target: { ...t.target }
    });
  });

  // Tambah realisasi dari faskes untuk tanggal terpilih
  model.faskes.forEach((f) => {
    if (!matchDate(f.date)) return;
    const key = f.kabKey + '|' + f.kec;
    if (!kecMap.has(key)) {
      kecMap.set(key, {
        key, kabK: f.kabKey, kec: f.kec,
        name: kecDisplay(f.kabKey, f.kec),
        sub: kabDisplay(f.kabKey),
        real: ZERO(),
        target: ZERO()
      });
    }
    const g = kecMap.get(key);
    INDICATORS.forEach((i) => { g.real[i.key] += f.real[i.key]; });
  });

  const list = [...kecMap.values()];
  list.forEach((g) => {
    g.pct = {};
    INDICATORS.forEach((i) => {
      g.pct[i.key] = g.target[i.key] > 0 ? (g.real[i.key] / g.target[i.key]) * 100 : 0;
    });
  });

  const sorted = [...list].sort((a, b) => {
    const pDiff = (b.pct.PB_TOTAL ?? 0) - (a.pct.PB_TOTAL ?? 0);
    if (Math.abs(pDiff) > 0.0001) return pDiff;
    return b.real.PB_TOTAL - a.real.PB_TOTAL;
  });

  const top10 = sorted.slice(0, 10);
  const bottom10 = [...sorted].slice(-10).reverse();

  return { top10, bottom10 };
}

function renderTopBottom() {
  if (!$('topBottomGrid')) return;
  const { top10, bottom10 } = topBottomKecamatan();
  const maxTop = Math.max(0.000001, ...top10.map((k) => k.pct.PB_TOTAL ?? 0));
  const maxBot = Math.max(0.000001, ...bottom10.map((k) => k.pct.PB_TOTAL ?? 0));

  const renderList = (list, isTop, max) => list.map((k, i) => `
    <div class="mini-row">
      <span class="mini-rank">${String(i + 1).padStart(2, '0')}</span>
      <div class="mini-name" style="line-height:1.2">
        <span title="${esc(k.name)}">${esc(k.name)}</span>
        <small style="display:block;color:var(--muted);font-size:10px">${esc(k.sub)}</small>
      </div>
      <span class="mini-track"><i class="${isTop ? 'bali' : ''}" style="width:${Math.max(1, ((k.pct.PB_TOTAL ?? 0) / max) * 100)}%; ${!isTop ? 'background:var(--mid);' : ''}"></i></span>
      <b class="mini-value">${fmtPct(k.pct.PB_TOTAL)}</b>
    </div>`).join('');

  $('topBottomGrid').innerHTML = `
    <article class="panel chart-panel">
      <div class="panel-heading">
        <div><h3>Top 10 Kecamatan Tertinggi</h3><span class="muted">Berdasarkan % Capaian PB Total se-Bali</span></div>
        <span class="badge badge-green">Top 10</span>
      </div>
      <div class="mini-chart">${renderList(top10, true, maxTop) || '<p class="muted">Belum ada data</p>'}</div>
    </article>
    <article class="panel chart-panel">
      <div class="panel-heading">
        <div><h3>10 Kecamatan Terbawah</h3><span class="muted">Perlu perhatian &amp; pendampingan khusus</span></div>
        <span class="badge badge-orange">10 Terbawah</span>
      </div>
      <div class="mini-chart">${renderList(bottom10, false, maxBot) || '<p class="muted">Belum ada data</p>'}</div>
    </article>`;
}

/* --------------------------------------------------------------------------
   RENDER: GRAFIK WILAYAH (Kabupaten atau Kecamatan)
   -------------------------------------------------------------------------- */
function renderRegional() {
  const level = currentLevel();
  const byKec = level === 'kecamatan';
  const onlyOneKec = state.kecamatan !== 'ALL';
  const list = aggregate(level);

  const scopeTitle = onlyOneKec
    ? `kecamatan ${kecDisplay(state.kabupaten, state.kecamatan)}`
    : state.kabupaten !== 'ALL'
      ? `kecamatan di ${kabDisplay(state.kabupaten)}`
      : '9 kabupaten / kota di Provinsi Bali';

  $('regionalTitle').textContent = `Capaian ${scopeTitle} per indikator`;
  $('regionalHint').textContent = onlyOneKec
    ? 'Menampilkan kecamatan yang dipilih. Ubah filter untuk membandingkan wilayah lain.'
    : state.kabupaten !== 'ALL'
      ? 'Pilih kecamatan pada filter untuk menyaring satu wilayah desa.'
      : 'Pilih salah satu kabupaten / kota pada filter di atas untuk menelusuri capaian kecamatan.';

  // Siapkan baris pembanding (Provinsi Bali untuk level kab/kota, Kabupaten terkait untuk level kecamatan)
  let benchmarkItem = null;
  let benchmarkLabel = '';
  let wilayahLabel = byKec ? 'Kecamatan' : 'Kabupaten / Kota';

  if (!byKec) {
    const bali = baliTotals();
    benchmarkItem = {
      key: '__BENCHMARK_BALI__',
      name: 'PROVINSI BALI',
      isBenchmark: true,
      real: bali.real,
      target: bali.target,
      pct: bali.pct
    };
    benchmarkLabel = 'Provinsi Bali';
  } else {
    const kabTotals = kabupatenTotals(state.kabupaten);
    const kabName = 'KAB. ' + kabDisplay(state.kabupaten).toUpperCase();
    benchmarkItem = {
      key: '__BENCHMARK_KAB__',
      name: kabName,
      isBenchmark: true,
      real: kabTotals.real,
      target: kabTotals.target,
      pct: kabTotals.pct
    };
    benchmarkLabel = kabName;
  }

  const itemsWithBenchmark = benchmarkItem ? [...list, benchmarkItem] : [...list];

  $('regionalGrid').innerHTML = INDICATORS.map((ind) => {
    const sorted = sortByPct(itemsWithBenchmark, ind.key);
    const max = Math.max(0.000001, ...sorted.map((g) => g.pct[ind.key] ?? 0));
    const benchmarkPos = sorted.findIndex((g) => g.isBenchmark) + 1;

    const body = sorted.map((g, i) => {
      const isB = g.isBenchmark;
      const cls = isB ? 'pembanding' : '';
      const label = isB ? g.name : titleCase(g.name);
      return `
      <div class="mini-row ${cls}">
        <span class="mini-rank">${String(i + 1).padStart(2, '0')}</span>
        <span class="mini-name" title="${esc(label)}">${esc(label)}</span>
        <span class="mini-track"><i class="${cls}" style="width:${Math.max(0.8, ((g.pct[ind.key] ?? 0) / max) * 100)}%"></i></span>
        <b class="mini-value">${fmtPct(g.pct[ind.key])}</b>
      </div>`;
    }).join('');

    return `
      <article class="panel chart-panel">
        <div class="panel-heading">
          <div><h3>${ind.label}</h3><span class="muted">${byKec ? 'Capaian per kecamatan' : 'Capaian per kabupaten / kota'}</span></div>
          <span class="badge badge-green">${list.length} ${byKec ? 'kecamatan' : 'kab/kota'}</span>
        </div>
        <div class="chart-legend">
          <span><i class="legend-dot pembanding"></i>${esc(benchmarkLabel)}${benchmarkPos ? ` · peringkat ${benchmarkPos}` : ''}</span>
          <span><i class="legend-dot wilayah"></i>${esc(wilayahLabel)}</span>
        </div>
        <div class="mini-chart">${body || '<p class="muted">Belum ada data untuk pilihan ini.</p>'}</div>
      </article>`;
  }).join('');
}

/* --------------------------------------------------------------------------
   RENDER: GRAFIK TINGKAT DESA (Realisasi Absolut per Kelurahan / Desa)
   -------------------------------------------------------------------------- */
function aggregateDesa() {
  const groups = new Map();
  faskesFiltered().forEach((f) => {
    const key = (f.kel || '(Tanpa Nama Desa)').trim();
    if (!groups.has(key)) {
      groups.set(key, {
        name: titleCase(key),
        real: ZERO(),
        alkon: ZERO_ALKON(),
        faskesCount: 0
      });
    }
    const g = groups.get(key);
    g.faskesCount += 1;
    INDICATORS.forEach((i) => { g.real[i.key] += f.real[i.key]; });
    ALKON.forEach((a) => { g.alkon[a.key] += f.alkon[a.key]; });
  });
  return [...groups.values()].sort((a, b) => b.real.PB_TOTAL - a.real.PB_TOTAL || a.name.localeCompare(b.name, 'id'));
}

function renderDesa() {
  if (!$('desaGrid')) return;
  const desas = aggregateDesa();
  const kecName = kecDisplay(state.kabupaten, state.kecamatan);
  const kabName = kabDisplay(state.kabupaten);

  $('desaTitle').textContent = `Realisasi Pelayanan per Desa / Kelurahan (${kecName}, ${kabName})`;
  $('desaHint').textContent = `Menampilkan ${desas.length} desa/kelurahan dengan total realisasi pelayanan absolut tempat pelayanan.`;

  $('desaGrid').innerHTML = INDICATORS.map((ind) => {
    const sorted = [...desas].sort((a, b) => b.real[ind.key] - a.real[ind.key]);
    const max = Math.max(1, ...sorted.map((d) => d.real[ind.key]));
    const body = sorted.map((d) => `
      <div class="hbar-row">
        <div class="hbar-label">
          <span class="hbar-name" title="${esc(d.name)}">${esc(d.name)}</span>
          <small>${d.faskesCount} Faskes</small>
        </div>
        <div class="hbar-track"><i class="good" style="width:${Math.max(1, (d.real[ind.key] / max) * 100)}%"></i></div>
        <b class="hbar-value">${fmtNum(d.real[ind.key])}</b>
      </div>`).join('');

    return `
      <article class="panel chart-panel">
        <div class="panel-heading">
          <div><h3>${ind.label} (Absolut)</h3><span class="muted">Realisasi per desa/kelurahan</span></div>
          <span class="badge badge-green">${desas.length} desa</span>
        </div>
        <div class="horizontal-chart">${body || '<p class="muted">Belum ada data desa pada kecamatan ini.</p>'}</div>
      </article>`;
  }).join('');
}

/* --------------------------------------------------------------------------
   RENDER: TABEL REKAP (4 LEVEL)
   -------------------------------------------------------------------------- */
function currentLevel() {
  return state.kabupaten === 'ALL' && state.kecamatan === 'ALL' ? 'kabupaten' : 'kecamatan';
}

function renderTable() {
  if (state.scope === 'NASIONAL') {
    return renderNationalTable();
  }
  if (state.kecamatan !== 'ALL') {
    return renderFaskesTable();
  }

  const level = currentLevel();
  const list = sortByPct(aggregate(level), 'PB_TOTAL');

  const scope = state.kabupaten !== 'ALL'
    ? `Kecamatan di ${kabDisplay(state.kabupaten)}`
    : 'Kabupaten / Kota di Provinsi Bali';

  $('dataTable').className = '';
  $('tableTitle').textContent = `Rekap Capaian ${scope}`;
  $('tableNote').textContent = level === 'kabupaten'
    ? 'Realisasi capaian faskes dibanding target kabupaten (agregat target 57 kecamatan se-Bali)'
    : 'Realisasi capaian faskes dibanding target masing-masing kecamatan';
  $('rowCount').textContent = `${list.length} wilayah`;

  $('dataTableHead').innerHTML = `
    <tr>
      <th rowspan="2" class="col-name">Wilayah</th>
      <th colspan="3">PB Total</th>
      <th colspan="3">KBPP</th>
      <th colspan="3">MKJP</th>
    </tr>
    <tr>
      <th>Capaian</th><th>Target</th><th>%</th>
      <th>Capaian</th><th>Target</th><th>%</th>
      <th>Capaian</th><th>Target</th><th>%</th>
    </tr>`;

  // Hitung akumulasi total / pembanding
  let totalLabel = 'TOTAL PROVINSI BALI';
  let totalReal = ZERO();
  let totalTarget = ZERO();
  let totalPct = {};

  if (level === 'kabupaten') {
    const bali = baliTotals();
    totalReal = bali.real;
    totalTarget = bali.target;
    totalPct = bali.pct;
  } else {
    totalLabel = `TOTAL KAB. ${kabDisplay(state.kabupaten).toUpperCase()}`;
    const kabTotals = kabupatenTotals(state.kabupaten);
    totalReal = kabTotals.real;
    totalTarget = kabTotals.target;
    totalPct = kabTotals.pct;
  }

  const tableRows = list.map((g) => `
    <tr>
      <td class="cell-name">
        <span class="cell-title">${esc(g.name)}</span>
        ${g.sub ? `<small>${esc(g.sub)}</small>` : ''}
      </td>
      ${INDICATORS.map((i) => `
        <td class="num">${fmtNum(g.real[i.key])}</td>
        <td class="num muted-cell">${fmtNum(g.target[i.key])}</td>
        <td class="num"><span class="pct ${pctClass(g.pct[i.key])}">${fmtPct(g.pct[i.key])}</span></td>`).join('')}
    </tr>`).join('');

  const totalRowHtml = `
    <tr class="total-row">
      <td class="cell-name">
        <span class="cell-title">${esc(totalLabel)}</span>
      </td>
      ${INDICATORS.map((i) => `
        <td class="num"><b>${fmtNum(totalReal[i.key])}</b></td>
        <td class="num muted-cell">${fmtNum(totalTarget[i.key])}</td>
        <td class="num"><span class="pct ${pctClass(totalPct[i.key])}"><b>${fmtPct(totalPct[i.key])}</b></span></td>`).join('')}
    </tr>`;

  $('dataTableBody').innerHTML = tableRows ? tableRows + totalRowHtml : '<tr><td colspan="10" class="empty">Belum ada data.</td></tr>';
}

/**
 * Tabel rekap 38 provinsi di level Nasional
 */
function renderNationalTable() {
  const list = nationalRows().slice().sort((a, b) => {
    if (a.isNasional) return -1;
    if (b.isNasional) return 1;
    const x = a.pct.PB_TOTAL, y = b.pct.PB_TOTAL;
    if (x === null && y === null) return 0;
    if (x === null) return 1;
    if (y === null) return -1;
    return y - x;
  });

  $('dataTable').className = '';
  $('tableTitle').textContent = 'Rekap Capaian 38 Provinsi (Nasional)';
  $('tableNote').textContent = `Agregat data harian sheet NASIONAL per ${fmtDate(state.date)}`;
  $('rowCount').textContent = `${list.length} provinsi/baris`;

  $('dataTableHead').innerHTML = `
    <tr>
      <th rowspan="2" class="col-name">Provinsi / Wilayah</th>
      <th colspan="3">PB Total</th>
      <th colspan="3">KBPP</th>
      <th colspan="3">MKJP</th>
    </tr>
    <tr>
      <th>Capaian</th><th>Target</th><th>%</th>
      <th>Capaian</th><th>Target</th><th>%</th>
      <th>Capaian</th><th>Target</th><th>%</th>
    </tr>`;

  $('dataTableBody').innerHTML = list.map((r) => {
    const nameLabel = r.isNasional ? 'INDONESIA (NASIONAL)' : titleCase(r.name);
    return `
    <tr class="${r.isNasional ? 'total-row' : ''}">
      <td class="cell-name">
        <span class="cell-title">${esc(nameLabel)} ${r.isBali ? '<small style="color:var(--green);font-weight:700">(Provinsi Bali)</small>' : ''}</span>
      </td>
      ${INDICATORS.map((i) => `
        <td class="num">${fmtNum(r.real[i.key])}</td>
        <td class="num muted-cell">${fmtNum(r.target[i.key])}</td>
        <td class="num"><span class="pct ${pctClass(r.pct[i.key])}">${fmtPct(r.pct[i.key])}</span></td>`).join('')}
    </tr>`;
  }).join('') || '<tr><td colspan="10" class="empty">Belum ada data nasional.</td></tr>';
}

/**
 * Tabel detail Faskes untuk kecamatan terpilih.
 * Lengkap rincian jenis alkon (mix kontrasepsi).
 */
function renderFaskesTable() {
  const list = faskesFiltered().slice().sort((a, b) =>
    a.kec.localeCompare(b.kec, 'id') || (a.faskesName || '').localeCompare(b.faskesName || '', 'id'));

  $('dataTable').className = 'wide';
  $('tableTitle').textContent = `Daftar Faskes Kecamatan ${kecDisplay(state.kabupaten, state.kecamatan)}`;
  $('tableNote').textContent = 'Seluruh tempat pelayanan KB pada periode & wilayah terpilih, lengkap rincian jenis alkon (tanpa target)';
  $('rowCount').textContent = `${list.length} faskes`;

  $('dataTableHead').innerHTML = `
    <tr>
      <th class="col-name">Nama Faskes</th>
      <th>Kode</th>
      <th class="col-left">Kabupaten</th>
      <th class="col-left">Kecamatan</th>
      <th class="col-left">Kelurahan</th>
      ${ALKON.map((a) => `<th>${a.label}</th>`).join('')}
      <th>PB Total</th>
      <th>MKJP</th>
      <th>KBPP</th>
    </tr>`;

  const totals = { alkon: ZERO_ALKON(), real: ZERO() };
  const body = list.map((f) => {
    ALKON.forEach((a) => { totals.alkon[a.key] += f.alkon[a.key]; });
    INDICATORS.forEach((k) => { totals.real[k.key] += f.real[k.key]; });
    return `
    <tr>
      <td class="cell-name"><span class="cell-title">${esc(f.faskesName || '(tanpa nama)')}</span></td>
      <td class="num muted-cell">${esc(f.kbId || '—')}</td>
      <td class="cell-left">${esc(kabDisplay(f.kabKey))}</td>
      <td class="cell-left">${esc(kecDisplay(f.kabKey, f.kec))}</td>
      <td class="cell-left">${esc(titleCase(f.kel) || '—')}</td>
      ${ALKON.map((a) => `<td class="num">${fmtNum(f.alkon[a.key])}</td>`).join('')}
      <td class="num"><b>${fmtNum(f.real.PB_TOTAL)}</b></td>
      <td class="num">${fmtNum(f.real.PB_MKJP)}</td>
      <td class="num">${fmtNum(f.real.PB_KBPP)}</td>
    </tr>`;
  }).join('');

  const totalRow = list.length ? `
    <tr class="total-row">
      <td class="cell-name"><span class="cell-title">TOTAL</span></td>
      <td colspan="4"></td>
      ${ALKON.map((a) => `<td class="num">${fmtNum(totals.alkon[a.key])}</td>`).join('')}
      <td class="num"><b>${fmtNum(totals.real.PB_TOTAL)}</b></td>
      <td class="num">${fmtNum(totals.real.PB_MKJP)}</td>
      <td class="num">${fmtNum(totals.real.PB_KBPP)}</td>
    </tr>` : '';

  $('dataTableBody').innerHTML = body
    ? body + totalRow
    : '<tr><td colspan="15" class="empty">Belum ada Faskes pada wilayah & periode ini.</td></tr>';
}

/* --------------------------------------------------------------------------
   VISIBILITAS KONTEN BERDASARKAN LEVEL
   -------------------------------------------------------------------------- */
function updateSectionVisibility() {
  const natBlock = $('nationalBlock');
  const topBotBlock = $('topBottomBlock');
  const regBlock = $('regionalBlock');
  const desaBlock = $('desaBlock');

  if (state.scope === 'NASIONAL') {
    if (natBlock) natBlock.style.display = 'block';
    if (topBotBlock) topBotBlock.style.display = 'none';
    if (regBlock) regBlock.style.display = 'none';
    if (desaBlock) desaBlock.style.display = 'none';
  } else if (state.scope === 'BALI' && state.kabupaten === 'ALL') {
    if (natBlock) natBlock.style.display = 'none';
    if (topBotBlock) topBotBlock.style.display = 'block';
    if (regBlock) regBlock.style.display = 'block';
    if (desaBlock) desaBlock.style.display = 'none';
  } else if (state.scope === 'BALI' && state.kabupaten !== 'ALL' && state.kecamatan === 'ALL') {
    if (natBlock) natBlock.style.display = 'none';
    if (topBotBlock) topBotBlock.style.display = 'none';
    if (regBlock) regBlock.style.display = 'block';
    if (desaBlock) desaBlock.style.display = 'none';
  } else {
    // state.scope === 'BALI' && state.kecamatan !== 'ALL'
    if (natBlock) natBlock.style.display = 'none';
    if (topBotBlock) topBotBlock.style.display = 'none';
    if (regBlock) regBlock.style.display = 'none';
    if (desaBlock) desaBlock.style.display = 'block';
  }
}

/* --------------------------------------------------------------------------
   RENDER UTAMA
   -------------------------------------------------------------------------- */
function render() {
  renderFilters();
  renderKpis();
  renderNational();
  renderTopBottom();
  renderRegional();
  renderDesa();
  renderTable();
  updateSectionVisibility();
}

/* --------------------------------------------------------------------------
   PEMUATAN DATA
   -------------------------------------------------------------------------- */
async function loadData() {
  const status = $('syncStatus');
  status.textContent = 'Menyinkronkan data...';
  $('footerStatus').textContent = '● Menyinkronkan data';
  try {
    const keys = Object.keys(SHEETS);
    const results = await Promise.all(keys.map(async (key) => {
      const url = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq?tqx=out:csv&sheet=${encodeURIComponent(SHEETS[key])}`;
      const response = await fetch(url, { cache: 'no-store' });
      if (!response.ok) throw new Error(`HTTP ${response.status} pada sheet ${SHEETS[key]}`);
      return { key, text: await response.text() };
    }));
    const data = {};
    results.forEach((r) => { data[r.key] = parseCsv(r.text); });
    buildModel(data);
    state.live = true;
    status.textContent = 'Data terhubung · ' + new Date().toLocaleString('id-ID', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
    $('footerStatus').textContent = '● Data terhubung';
  } catch (error) {
    buildModel(DEMO);
    state.live = false;
    status.textContent = 'Mode demo · ' + error.message;
    $('footerStatus').textContent = '● Mode demo';
  }
  render();
}

/* --------------------------------------------------------------------------
   EVENT
   -------------------------------------------------------------------------- */
$('dateSelect').addEventListener('change', (e) => { datePinned = true; state.date = e.target.value; render(); });

if ($('scopeSelect')) {
  $('scopeSelect').addEventListener('change', (e) => {
    state.scope = e.target.value;
    if (state.scope === 'NASIONAL') {
      state.kabupaten = 'ALL';
      state.kecamatan = 'ALL';
    }
    render();
  });
}

$('kabupatenSelect').addEventListener('change', (e) => {
  state.scope = 'BALI';
  state.kabupaten = e.target.value;
  state.kecamatan = 'ALL';
  render();
});

$('kecamatanSelect').addEventListener('change', (e) => {
  state.scope = 'BALI';
  state.kecamatan = e.target.value;
  if (state.kecamatan !== 'ALL' && state.kabupaten === 'ALL') {
    const owner = resolveKabOfKec(state.kecamatan);
    if (owner) state.kabupaten = owner;
  }
  render();
});

$('refreshButton').addEventListener('click', loadData);

$('downloadButton').addEventListener('click', () => {
  let lines;
  let name;

  if (state.scope === 'NASIONAL') {
    const list = nationalRows();
    const header = ['Provinsi / Wilayah', 'PB Total Realisasi', 'PB Total Target', 'PB Total %', 'KBPP Realisasi', 'KBPP Target', 'KBPP %', 'MKJP Realisasi', 'MKJP Target', 'MKJP %'];
    lines = [header.join(',')].concat(list.map((r) => [
      `"${r.name}"`,
      ...INDICATORS.flatMap((i) => [Math.round(r.real[i.key]), Math.round(r.target[i.key]), r.pct[i.key] === null ? '' : r.pct[i.key].toFixed(2)])
    ].join(',')));
    name = 'nasional-38-provinsi';
  } else if (state.kecamatan !== 'ALL') {
    const list = faskesFiltered().slice().sort((a, b) =>
      a.kec.localeCompare(b.kec, 'id') || (a.faskesName || '').localeCompare(b.faskesName || '', 'id'));
    const header = ['Kode Faskes', 'Nama Faskes', 'Kabupaten', 'Kecamatan', 'Kelurahan',
      ...ALKON.map((a) => a.label), 'PB Total', 'MKJP', 'KBPP'];
    lines = [header.join(',')].concat(list.map((f) => [
      `"${f.kbId}"`, `"${f.faskesName}"`, `"${kabDisplay(f.kabKey)}"`,
      `"${kecDisplay(f.kabKey, f.kec)}"`, `"${titleCase(f.kel)}"`,
      ...ALKON.map((a) => Math.round(f.alkon[a.key])),
      Math.round(f.real.PB_TOTAL), Math.round(f.real.PB_MKJP), Math.round(f.real.PB_KBPP)
    ].join(',')));
    name = `detail-faskes-${state.kecamatan}`;
  } else {
    const level = currentLevel();
    const list = sortByPct(aggregate(level), 'PB_TOTAL');
    const header = ['Wilayah', 'PB Total Realisasi', 'PB Total Target', 'PB Total %', 'KBPP Realisasi', 'KBPP Target', 'KBPP %', 'MKJP Realisasi', 'MKJP Target', 'MKJP %'];
    lines = [header.join(',')].concat(list.map((g) => [
      `"${g.name}"`,
      ...INDICATORS.flatMap((i) => [Math.round(g.real[i.key]), Math.round(g.target[i.key]), g.pct[i.key] === null ? '' : g.pct[i.key].toFixed(2)])
    ].join(',')));
    name = level === 'kabupaten' ? 'bali-kabupaten' : `kecamatan-${state.kabupaten}`;
  }

  const blob = new Blob(['\ufeff' + lines.join('\n')], { type: 'text/csv;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `monitoring-wcd-${name}.csv`;
  a.click();
  URL.revokeObjectURL(a.href);
});

/* Inisialisasi awal dengan data demo agar tampilan langsung terisi. */
buildModel(DEMO);
render();
loadData();
