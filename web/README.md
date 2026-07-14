# Booklet

Situs booklet statis (mobile-first). Deploy via GitHub Pages.

## Data source

Tampilan web **hanya** membaca:

```text
web/content/book.yaml
```

Naskah mentah (opsional, untuk dikonversi AI → YAML):

```text
web/content/book.txt
```

Dokumentasi skema & prompt konversi: [`content/README.md`](./content/README.md).

Setelah YAML: AI juga membuat SVG per bagian di `content/illustrations/` (feel & tone) — lihat prompt lanjutan di README konten.

## Develop

```sh
cd web
npm install
npm run dev
```

## Build

```sh
cd web
npm run build
```

Output: `web/dist`. GitHub Actions men-deploy folder itu ke Pages.

## Deploy

1. Update `web/content/book.yaml`
2. Push ke `master`
3. Workflow: `.github/workflows/deploy.yml`

## Section baru

- PR yang mengubah `book.yaml` mendapat komentar otomatis (bagian baru / diubah / dihapus).
- Build menandai bagian baru di situs (±30 hari) dari git history — lihat `content/README.md`.
