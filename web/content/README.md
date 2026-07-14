# Konten buku

## Alur kerja

```text
book.txt  ──(AI / manual)──►  book.yaml  ──(AI)──►  illustrations/*.svg  ──►  situs web
  naskah mentah                 data tampilan         gambar per bagian           Astro pages
```

| File | Peran |
|------|--------|
| `book.txt` | Naskah mentah. Boleh diedit bebas. **Tidak** dibaca langsung oleh web. |
| `book.yaml` | **Satu-satunya data source** teks tampilan web (meta, chapter, puisi, prosa) + path ilustrasi. |
| `illustrations/*.svg` | Gambar SVG per bagian (feel & tone). Dirujuk dari field `illustration` di YAML. |
| `book.json` | Legacy — tidak dipakai lagi. Meta ada di `book.yaml`. |

Setelah `book.yaml` di-push ke `master`, GitHub Actions build & deploy ke Pages.

---

## Skema `book.yaml`

```yaml
meta:
  title: Rumah No. 4
  author: Ian Yulianto
  tagline: Satu kalimat singkat di cover
  language: id

parts:
  - slug: pembuka          # URL → /part/pembuka
    label: Pembuka         # teks kecil di atas judul (TOC + reader)
    title: Rumah No. 4     # judul besar
    illustration: illustrations/pembuka.svg   # opsional; SVG feel/tone bagian
    blocks:
      - kind: poetry
        lines:
          - Baris puisi satu
          - Baris puisi dua
          - ""               # string kosong = jarak antar bait
          - Baris bait berikutnya

      - kind: prose
        text: |
          Paragraf prosa. Boleh panjang.
          Baris baru di dalam | digabung jadi spasi.

          Paragraf kedua: pisahkan dengan baris kosong.

      - kind: divider        # ornamen ∗ ∗ ∗ di halaman
```

### Field wajib

**`meta`**
- `title`, `author`, `tagline`, `language`

**Setiap `part`**
- `slug` — unik, URL-safe (`pembuka`, `1`, `2`, …)
- `label` — mis. `Pembuka`, `Chapter 1`
- `title` — judul bab
- `blocks` — daftar blok isi
- `illustration` — (opsional) path relatif ke file SVG di folder `content/`, mis. `illustrations/1.svg`

**Setiap `block`**
- `kind`: `poetry` | `prose` | `divider`

| kind | Isi |
|------|-----|
| `poetry` | `lines:` array string. `""` = jeda bait. |
| `prose` | `text: \|` literal block. Satu paragraf per blok kosong. |
| `divider` | Tidak perlu field lain. |

SVG tampil di halaman bagian dan di **Baca acak** (`/acak`).

---

## Prompt AI: `book.txt` → `book.yaml`

Salin prompt di bawah saat minta AI mengonversi naskah. Hasilnya harus **mengganti / menulis ulang** `web/content/book.yaml`.

```text
Kamu mengonversi naskah book.txt menjadi book.yaml untuk situs booklet.

Aturan struktur naskah book.txt:
- Sebelum "Chapter N" = bagian Pembuka (opsional)
- "Chapter N" diikuti baris judul bab
- Dua baris kosong = batas unit (puisi ↔ prosa)
- Satu baris kosong di dalam puisi = jeda bait
- Baris yang hanya ** atau *** = divider

Aturan output YAML (ikuti skema di content/README.md):
1. Tulis file YAML lengkap: meta + parts.
2. Satu part per chapter (+ pembuka jika ada).
3. slug: "pembuka" atau nomor chapter ("1","2",…).
4. label: "Pembuka" atau "Chapter N".
5. title: judul bab (bukan kata "Chapter").
6. kind poetry → lines[] ("" untuk jeda bait). Jangan gabung jadi satu string.
7. kind prose → text: | (paragraf utuh). Jangan pecah per kata.
8. kind divider → hanya { kind: divider }.
9. Klasifikasi presisi:
   - Baris pendek berirama / patah-patah = poetry
   - Kalimat naratif panjang = prose
   - Jika ragu, utamakan makna: refleksi/narasi = prose; bait = poetry
10. Pertahankan ejaan, tanda baca, dan Unicode (— ‘ ’ “ ” …) apa adanya.
11. Jangan ringkas, jangan parafrase, jangan hilangkan teks.
12. Jika part sudah punya `illustration`, pertahankan path-nya. Jika part baru, siapkan path `illustrations/{slug}.svg` (file SVG dibuat di langkah berikutnya).

Input: isi book.txt terbaru.
Output: seluruh isi book.yaml saja (tanpa markdown fence).
```

---

## Prompt AI lanjutan: ilustrasi SVG per bagian

Jalankan **setelah** `book.yaml` selesai. Satu SVG per `part`, berdasarkan feel & tone isi bagian (bukan cover buku generik).

```text
Kamu membuat ilustrasi SVG untuk booklet sastra mobile-first.

Konteks visual situs (wajib diikuti):
- Palet kertas: latar #f3efe6 / #ebe4d6, tinta #1c1a17, soft #7a7366, aksen teal #2f5d56
- Hindari: ungu, glow neon, dark mode, emoji, teks panjang di dalam gambar
- Gaya: tenang, literer, metafora visual lembut (bukan kartun ramai, bukan fotoreal)

Untuk SETIAP part di book.yaml:
1. Baca title + cuplikan poetry/prose (cukup untuk tangkap mood).
2. Pilih 1–2 motif kuat dari bagian itu (benda/tempat/perasaan), jangan ilustrasikan seluruh plot.
3. Tulis file SVG ke: web/content/illustrations/{slug}.svg
4. Pastikan part.illustration di YAML = illustrations/{slug}.svg
5. Spesifikasi SVG:
   - viewBox="0 0 480 320" (landscape pendek)
   - Inline <title> deskriptif singkat (bahasa Indonesia)
   - Bentuk vector sederhana, stroke ~1.2–2.4, sedikit gradien halus boleh
   - Tanpa external font/image; tanpa script
   - Cocok tampil kecil di HP

Urutan kerja:
- Part baru / tanpa SVG → buat SVG baru
- Part lama yang mood-nya berubah signifikan → perbarui SVG
- Jangan ubah teks naskah di book.yaml selain field illustration

Output: file SVG + pastikan path illustration di YAML sudah benar.
```

Contoh motif (bukan template wajib): rumah + tanda tanya; balon + pintu tertutup; kelereng di tanah; kupu-kupu + TV sore; panggung + sepatu balet; jalan pulang ke cahaya pintu.

---

## Catatan

- Web membaca `book.yaml` (+ file SVG yang dirujuk). Perubahan di `book.txt` tidak muncul sampai YAML (dan ilustrasi, jika perlu) di-update.
- Draft awal YAML boleh di-generate kasar; koreksi `kind` (poetry vs prose) lewat AI atau manual agar lebih presisi.
- Halaman **Baca acak** (`/acak`) memilih satu bagian secara acak dan menampilkan SVG-nya sebagai splash sebelum dibaca.

---

## Penanda section baru

Saat `book.yaml` berubah:

1. **Pull request** — workflow `book-yaml-updates.yml` membandingkan section (per `slug`) dengan base branch dan menulis komentar berisi daftar bagian baru / diubah / dihapus.
2. **Situs** — saat build, git history `book.yaml` dipakai untuk menandai bagian yang **baru** (±30 hari sejak slug pertama muncul). Di daftar isi ada daftar “Baru” + badge minimalis; di halaman bagian juga muncul badge yang sama.

Override jendela hari lewat env `BOOK_NEW_DAYS` (default `30`).

Cek lokal:

```sh
cd web
npm run book:updates
# atau bandingkan ke commit tertentu:
node scripts/book-updates-report.mjs HEAD~1
```
