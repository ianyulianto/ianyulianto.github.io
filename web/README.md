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
