# Konten buku

Letakkan **satu file** sumber di sini:

```text
web/content/book.docx
```

File itu = keseluruhan isi buku.

## Aturan pemisahan

- **Dua baris kosong** (dua Enter ekstra) = part baru
- Di dalam part bisa ada **prosa** dan **puisi**
- Satu baris kosong = masih part yang sama (paragraf / bait baru)

Setelah `book.docx` di-commit ke `master`, GitHub Actions akan build ulang dan deploy ke GitHub Pages.
