# Booklet

Static booklet site (mobile-first) for a single book source file. Deployed via GitHub Pages.

## Source file

Put the full book here:

```text
web/content/book.docx
```

Optional while drafting:

```text
web/content/book.txt
```

Metadata (title, author, tagline):

```text
web/content/book.json
```

### Part rules

- **Two blank lines** → new part
- Inside a part: prose and poetry blocks (single blank line separates blocks)
- Poetry is detected from short broken lines

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

Output goes to `web/dist`. GitHub Actions deploys that folder to Pages.

## Deploy

Push to `master`. Workflow: `.github/workflows/deploy.yml`
