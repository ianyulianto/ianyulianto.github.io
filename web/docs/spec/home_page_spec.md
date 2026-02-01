## Layout guideline untuk Astro (Samya Studio)

### Tujuan

* Layout konsisten untuk: **Home, Services, Case Study, Insights, About, Contact**
* Typography-led, 1 kolom utama, max width jelas
* Konten dikelola via **Astro Content Collections** (MD/MDX)

---

# 1) Struktur proyek yang direkomendasikan

```
src/
  layouts/
    BaseLayout.astro
    PageLayout.astro
    PostLayout.astro
    CaseStudyLayout.astro
  components/
    Nav.astro
    Footer.astro
    Container.astro
    Section.astro
    Hero.astro
    Card.astro
    CTA.astro
    Prose.astro
    PostList.astro
    CaseStudyTeaser.astro
  pages/
    index.astro
    services/
      index.astro
      website.astro
      custom-app.astro
      erp.astro
    case-studies/
      index.astro
      [slug].astro
    insights/
      index.astro
      [slug].astro
    about.astro
    contact.astro
  content/
    insights/
      *.mdx
    case-studies/
      *.mdx
  styles/
    tokens.css
    global.css
```

---

# 2) Design tokens → CSS variables (Astro-friendly)

Buat `src/styles/tokens.css`:

```css
:root{
  /* colors */
  --bg: #FFFFFF;
  --bg-muted: #F9FAFB;
  --text: #111111;
  --text-2: #555555;
  --text-muted: #6B7280;
  --border: #E5E7EB;

  /* accent (Muted Indigo) */
  --accent: #3730A3;
  --accent-hover: #312E81;
  --accent-soft: #EEF2FF;

  /* typography */
  --font-sans: Inter, system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif;
  --font-mono: "JetBrains Mono", ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", monospace;

  /* type scale */
  --h1: 48px;
  --h2: 36px;
  --h3: 24px;
  --body: 18px;
  --small: 16px;

  /* line height */
  --lh-tight: 1.2;
  --lh-normal: 1.5;
  --lh-relaxed: 1.7;

  /* spacing (8pt) */
  --s-1: 8px;
  --s-2: 16px;
  --s-3: 24px;
  --s-4: 40px;
  --s-5: 64px;
  --s-6: 96px;

  /* radius */
  --r-sm: 4px;
  --r-md: 6px;
  --r-lg: 8px;

  /* layout */
  --max-page: 1200px;
  --max-content: 720px;
}
```

`src/styles/global.css` (baseline):

```css
@import "./tokens.css";

html, body { background: var(--bg); color: var(--text); font-family: var(--font-sans); }
a { color: var(--accent); text-decoration: none; }
a:hover { text-decoration: underline; color: var(--accent-hover); }

hr { border: 0; border-top: 1px solid var(--border); margin: var(--s-4) 0; }

:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
```

Import global di `src/layouts/BaseLayout.astro`.

---

# 3) Layout contract (aturan wajib)

### 3.1 Container rules

* **Page width**: max `--max-page` (1200px)
* **Content width**: max `--max-content` (720px)
* Home sections boleh 1200px untuk grid cards, tapi teks utama tetap 720px.

### 3.2 Spacing rules

* Jarak antar section: `--s-5` (64px) default
* Hero: top/bottom `--s-6` (96px)
* Dalam card: padding `--s-3` (24px)

### 3.3 Typography rules

* H1 hanya sekali di page (Hero)
* Body text default 18px, line-height 1.7 untuk prose/blog

---

# 4) Layout components (building blocks)

## 4.1 `Container.astro`

```astro
---
const { variant = "page" } = Astro.props;
// variant: "page" (1200) | "content" (720)
const max = variant === "content" ? "var(--max-content)" : "var(--max-page)";
---
<div class="container" style={`max-width:${max};`}>
  <slot />
</div>

<style>
  .container{
    margin: 0 auto;
    padding-left: var(--s-2);
    padding-right: var(--s-2);
  }
</style>
```

## 4.2 `Section.astro`

```astro
---
const { pad = "normal" } = Astro.props; // "normal" | "hero" | "tight"
const py = pad === "hero" ? "var(--s-6)" : pad === "tight" ? "var(--s-4)" : "var(--s-5)";
---
<section style={`padding:${py} 0;`}>
  <slot />
</section>
```

## 4.3 `Prose.astro` (untuk blog/case study)

```astro
<div class="prose">
  <slot />
</div>

<style>
  .prose{
    font-size: var(--body);
    line-height: var(--lh-relaxed);
    color: var(--text-2);
  }
  .prose h1, .prose h2, .prose h3{
    color: var(--text);
    line-height: var(--lh-tight);
    margin: var(--s-4) 0 var(--s-2);
  }
  .prose p{ margin: 0 0 var(--s-3); }
  .prose ul{ margin: 0 0 var(--s-3); padding-left: 1.2em; }
  .prose code{ font-family: var(--font-mono); font-size: 0.9em; }
  .prose pre{
    font-family: var(--font-mono);
    background: var(--bg-muted);
    border: 1px solid var(--border);
    border-radius: var(--r-lg);
    padding: var(--s-3);
    overflow-x: auto;
  }
</style>
```

---

# 5) Layout files (Astro Layouts)

## 5.1 `BaseLayout.astro` (shell: html/head/nav/footer)

* Load `global.css`
* Render `<Nav/>` + `<Footer/>`
* Slot untuk page content
* Set SEO meta dari props

Skeleton:

```astro
---
import "../styles/global.css";
import Nav from "../components/Nav.astro";
import Footer from "../components/Footer.astro";

const { title, description } = Astro.props;
---
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width" />
    <title>{title}</title>
    <meta name="description" content={description} />
  </head>
  <body>
    <Nav />
    <main><slot /></main>
    <Footer />
  </body>
</html>
```

## 5.2 `PageLayout.astro` (generic pages)

* Pakai `BaseLayout`
* Atur top padding dan optional page header
* Default content width 720px untuk text-heavy pages

## 5.3 `PostLayout.astro` (insights)

* Content width 720px
* Tampilkan title, date, category
* Body via `<Prose/>`

## 5.4 `CaseStudyLayout.astro`

* Mirip PostLayout, tapi ada blocks: Context, Constraints, Decisions, Results

---

# 6) Home page layout guideline (konkrit)

Home memakai pattern:

1. Hero (content width 720)
2. Audience (content)
3. Services cards (page width 1200, tapi card content rapi)
4. How we work (content)
5. Featured case study (content)
6. Insights preview (page or content)
7. CTA strip (page width)

Aturan Home:

* Jangan taruh 2 grid besar berturut-turut tanpa section “text-only” di antaranya.
* Card grid: 3 kolom desktop, 1 kolom mobile.

---

# 7) Content Collections (Astro)

`src/content/config.ts`:

* `insights` dan `case-studies` schema
* Frontmatter minimal: title, excerpt, publishedAt, category, draft

Guideline:

* Home “Insights preview” ambil 3 post terbaru `draft=false`
* Featured case study pilih via slug di `src/pages/index.astro` atau config sederhana (`src/content/home.json`)

---

# 8) CSS strategy (pilih salah satu)

### CSS variables + component-scoped CSS

* Cepat, konsisten, minim dependencies
* Cocok untuk vibe “studio” yang bersih
---

# 9) Acceptance criteria (biar layout nggak melenceng)

* Semua page: `Container(page)` membungkus shell
* Semua text body: `Container(content)` untuk prose
* Section spacing hanya pakai `--s-*`
* Tidak ada: slider, masonry portfolio, banyak warna, heavy shadows
* Lighthouse LCP: hero text (bukan hero image)