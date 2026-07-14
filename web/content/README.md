# Konten buku

## Alur kerja

```text
book.txt  ──(AI / manual)──►  book.yaml  ──►  situs web
  naskah mentah                 data tampilan      Astro pages
```

| File | Peran |
|------|--------|
| `book.txt` | Naskah mentah. Boleh diedit bebas. **Tidak** dibaca langsung oleh web. |
| `book.yaml` | **Satu-satunya data source** tampilan web (meta, chapter, puisi, prosa). |
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

**Setiap `block`**
- `kind`: `poetry` | `prose` | `divider`

| kind | Isi |
|------|-----|
| `poetry` | `lines:` array string. `""` = jeda bait. |
| `prose` | `text: \|` literal block. Satu paragraf per blok kosong. |
| `divider` | Tidak perlu field lain. |

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

Input: isi book.txt terbaru.
Output: seluruh isi book.yaml saja (tanpa markdown fence).
```

---

## Catatan

- Web **hanya** membaca `book.yaml`. Perubahan di `book.txt` tidak muncul di situs sampai YAML di-update.
- Draft awal YAML boleh di-generate kasar; koreksi `kind` (poetry vs prose) lewat AI atau manual agar lebih presisi.

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
