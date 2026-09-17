# Dashboard Momentum Pelayanan WCD

Dashboard static untuk monitoring 7 September - 10 Oktober 2026.

## Menjalankan

Buka `index.html` langsung di browser. Tidak membutuhkan Node.js atau instalasi package.

## Sumber data

Dashboard membaca Google Sheets melalui URL CSV publik:

- `NASIONAL`: target dan realisasi per provinsi
- `FASKES`: transaksi layanan per faskes (kabupaten, kecamatan, kelurahan)
- `TARGET_KECAMATAN`: target per kecamatan

Spreadsheet harus dapat diakses tanpa login, minimal sebagai `Anyone with the link - Viewer`. Klik tombol muat ulang di kanan atas setelah data diperbarui.

## Header yang dikenali

| Sheet | Kolom |
|---|---|
| `NASIONAL` | `tanggal`, `PROVINSI`, `TARGET_PB_TOTAL`, `TARGET_PB_KBPP`, `TARGET_PB_MKJP`, `PB_TOTAL`, `PB_KBPP`, `PB_MKJP` |
| `FASKES` | `tanggal`, `Kabupaten`, `Kecamatan`, `Kelurahan`, `PB_TOTAL`, `PB_KBPP`, `PB_MKJP` |
| `TARGET_KECAMATAN` | `KABUPATEN`, `KECAMATAN`, `TARGET_PB_TOTAL`, `TARGET_PB_MKJP`, `TARGET_PB_KBPP` |

## Aturan hitung persentase

| Skala | Rumus |
|---|---|
| Nasional / Provinsi | `PB_<indikator>` ÷ `TARGET_PB_<indikator>` pada sheet `NASIONAL` |
| Kabupaten / Kota | Total `PB_<indikator>` Faskes per kabupaten ÷ total `TARGET_PB_<indikator>` kabupaten tersebut di `TARGET_KECAMATAN` |
| Kecamatan | Total `PB_<indikator>` Faskes per kecamatan ÷ total `TARGET_PB_<indikator>` kecamatan tersebut di `TARGET_KECAMATAN` |

Catatan:

- Data ditampilkan **per tanggal** (harian). Filter periode berisi daftar tanggal dengan default **tanggal terakhir**; tidak ada lagi opsi kumulatif.
- Target kampanye bersifat tetap, sehingga bila beberapa tanggal lolos filter realisasi dijumlahkan sedangkan target tidak diulang.
- Sheet `TARGET_KECAMATAN` tidak punya dimensi tanggal, sehingga filter periode hanya memengaruhi realisasi.
- Nama `KOTA DENPASAR` (Faskes) disamakan dengan `DENPASAR` (TARGET_KECAMATAN) saat penggabungan.

## Fitur

- **Ketiga indikator (PB Total, KBPP, MKJP) selalu tampil bersamaan** — tidak ada lagi combo box indikator
- Filter **Periode** (daftar tanggal, default tanggal terakhir), **Kabupaten / Kota**, dan **Kecamatan** berupa combo box berjenjang
- Memilih kecamatan saat filter kabupaten masih **Semua Kabupaten / Kota** otomatis mengunci kabupaten induknya, sehingga judul dan agregasi tetap konsisten
- Kartu KPI menampilkan capaian nasional dan capaian wilayah untuk ketiga indikator sekaligus, plus cakupan wilayah terpantau
- Grafik nasional selalu tampil sebagai tiga grafik (satu per indikator), dengan baris **Nasional** dipin di atas sebagai pembanding dan **Bali** ditandai warna oranye
- Grafik wilayah default menampilkan capaian **kabupaten / kota**; setelah kabupaten dipilih otomatis berganti ke capaian **kecamatan** — tetap tiga grafik, satu per indikator
- Judul kartu capaian wilayah mengikuti filter: **Capaian Provinsi** (semua kabupaten), **Capaian Kabupaten/Kota {nama}**, atau **Capaian Kecamatan {nama}**
- Tabel rekap menampilkan realisasi, target, dan persentase ketiga indikator sekaligus (diurutkan berdasarkan capaian PB Total)
- Unduh tabel rekap sebagai CSV
- Fallback data demo jika koneksi spreadsheet gagal

