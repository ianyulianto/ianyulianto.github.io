# Website Specification Document

**Project Name:** Personal DevOps & AWS Portfolio\
**Version:** 1.0\
**Theme:** Clean Black & White with Outline Style

------------------------------------------------------------------------

## 1. Overview

### 1.1 Purpose

Membuat website personal yang minimalis, profesional, dan konten-driven
untuk: - Menampilkan profil pribadi - Mempublikasikan blog DevOps &
AWS - Menjadi hub untuk showcase website & projects

Fokus awal: **Home**, **About**, dan **Contact**.

### 1.2 Visual Style

-   Warna utama: **Hitam (#000)** dan **Putih (#FFF)**
-   Border & outline tipis: **#E5E5E5**
-   Banyak white space
-   Garis horizontal/vertikal tipis sebagai elemen pemisah
-   Semua button & card berbasis **outline**
-   Typography modern sans-serif (Inter / Helvetica / Sans)

### 1.3 Tech Stack (Recommended)

-   Astro (Static Site Generator)
-   Tailwind CSS
-   GitHub Pages (deployment)

------------------------------------------------------------------------

# 2. Pages Specification

------------------------------------------------------------------------

# 2.1 Home Page

**URL:** `/`\
**Goal:** Menjelaskan siapa kamu dan apa fokusmu dalam 5 detik.

------------------------------------------------------------------------

## 2.1.1 Hero Section

**Elements:** - **Heading (H1):**
`DevOps Engineer & AWS Cloud Specialist` - **Subheadline:**
`Building scalable systems, automating everything, and sharing practical cloud cases.` -
**Buttons:** - Outline Button: "See My Work" → `/projects` - Outline
Button: "Contact Me" → `/contact` - Right side optional: outline shapes
/ lines

**Style Notes:** - H1 besar, bold - Subheadline lebih ringan - Button
hover → background hitam, text putih

------------------------------------------------------------------------

## 2.1.2 Section: What I Do

**Title:** `What I Do`

**3--4 Outline Cards:** 1. **DevOps & Infrastructure**\
Automation, CI/CD, IaC, container orchestration. 2. **AWS Cloud
Architecture**\
ECS/Fargate, Lambda, RDS, S3, VPC. 3. **System Optimization**\
Performance tuning, monitoring, cost optimization.

**Card Style:** - `border: 1px solid #E5E5E5` - No fill - Hover: border
warna hitam

------------------------------------------------------------------------

## 2.1.3 Section: Latest Insights (Optional)

-   List 3 posting blog terbaru
-   Outline list style
-   Setiap item:
    -   Judul post (link)
    -   Short summary
    -   Garis pemisah tipis

------------------------------------------------------------------------

## 2.1.4 Section: Featured Projects

**Title:** `Featured Projects`

**2--3 Outline Cards** - Nama project - 2--3 bullet points - Link: "View
Case Study" → `/projects/<slug>`

No screenshot (keep black & white).

------------------------------------------------------------------------

# 2.2 About Page

**URL:** `/about`\
**Goal:** Menunjukkan siapa kamu, background, dan skillset.

------------------------------------------------------------------------

## 2.2.1 Introduction

**Heading:**

    About Me

**Paragraph (4--6 kalimat):** - Cerita singkat background DevOps/AWS -
Filosofi kerja (automation, scalable, measurable) - Experience area -
Values & approach

------------------------------------------------------------------------

## 2.2.2 Profile Outline Box

Isi contoh:

    Role: DevOps Engineer
    Location: Indonesia (GMT+7)
    Experience: 5+ years
    Focus: AWS Cloud, CI/CD, Automation, Observability

**Style:** - Kotak dengan `1px solid #E5E5E5` - Padding medium - No
shadow

------------------------------------------------------------------------

## 2.2.3 Skills Overview (Table)

Outline table:

  -----------------------------------------------------------------------
  Category                                      Skills
  --------------------------------------------- -------------------------
  Cloud                                         AWS (ECS, Fargate, S3,
                                                Lambda, VPC, RDS,
                                                CloudFormation, CDK)

  DevOps                                        Docker, CI/CD, GitHub
                                                Actions, IaC, ArgoCD

  Programming                                   Python, Bash, TypeScript

  Monitoring                                    CloudWatch, X-Ray,
                                                Grafana, Coroot
  -----------------------------------------------------------------------

------------------------------------------------------------------------

## 2.2.4 Timeline

Vertical timeline dengan garis outline.

Contoh format:

    2025 — Present   Freelance DevOps & Cloud Consultant
    2023 — 2024      DevOps Engineer at [Company]
    2021 — 2023      Cloud Engineer at [Company]

------------------------------------------------------------------------

# 2.3 Contact Page

**URL:** `/contact`\
**Goal:** Memberikan cara mudah untuk menghubungi kamu.

------------------------------------------------------------------------

## 2.3.1 Header

**Heading:**

    Get In Touch

**Description:**

    For collaborations, project inquiries, or technical discussions, feel free to reach out.

------------------------------------------------------------------------

## 2.3.2 Contact Options (Outline Boxes)

1.  **Email**
    -   `mailto:<email kamu>`
2.  **LinkedIn**
    -   Link ke profil
3.  **GitHub**
    -   Link portfolio repos
4.  (Optional) WhatsApp / Telegram

**Outline Style** - `border: 1px solid #000` - Hover → background hitam,
text putih

------------------------------------------------------------------------

## 2.3.3 Contact Form (Optional)

Fields: - Name - Email - Message

Backend (opsi): - Formspree - StaticForms - Netlify Forms

Input style: - Outline only - Focus border: hitam tebal

Submit button: outline → hover solid

------------------------------------------------------------------------

# 3. Design System

## 3.1 Typography

-   Font: Inter / Helvetica / Sans-serif
-   H1: 42--56px, bold
-   H2: 28--36px
-   Body: 16--18px
-   Line height: 1.6

------------------------------------------------------------------------

## 3.2 Colors

  Element          Color
  ---------------- ---------
  Background       #FFFFFF
  Text             #000000
  Border/Outline   #E5E5E5
  Hover Accent     #000000

------------------------------------------------------------------------

## 3.3 Buttons (Outline)

-   Border: `1px solid #000`
-   Background: none
-   Text: black
-   Hover:
    -   Background: black\
    -   Text: white

------------------------------------------------------------------------

## 3.4 Cards & Boxes

-   Border: `1px solid #E5E5E5`
-   No background fill
-   Padding: 20--28px
-   No rounding (square)

------------------------------------------------------------------------

# 4. Information Architecture

    /
    ├── Hero
    ├── What I Do
    ├── Latest Blog (optional)
    ├── Featured Projects
    └── Footer

    /about
    ├── Introduction
    ├── Profile Box
    ├── Skills Table
    ├── Timeline
    └── Footer

    /contact
    ├── Header
    ├── Contact Boxes
    ├── Form (optional)
    └── Footer

------------------------------------------------------------------------

# 5. Next Steps

-   Setup Astro project\
-   Implement layout system (PersonalLayout, Outline components)\
-   Build pages: Home → About → Contact\
-   Deploy ke GitHub Pages
