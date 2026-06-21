# Ajwa Organics — Homepage

Static, framework-free build (vanilla HTML/CSS/JS) — deploys to Cloudflare
Pages directly from this repo with zero build step.

## Structure

```
ajwa-organics-site/
├── index.html              Homepage. Head + <header>/<footer> are the
│                            shared template for every future page.
└── assets/
    ├── css/
    │   └── style.css       One shared stylesheet, all pages. Design
    │                       tokens in :root (section 1). Bilingual/RTL
    │                       utilities in section 14.
    └── js/
        └── script.js       One shared script, all pages. ES module,
                             one initX() function per behaviour.
```

## Adding a new page

1. Duplicate `index.html`, rename it (`our-story.html`, `blog.html`, etc.).
2. Keep the `<head>` `<link>`/`<script>` tags, announcement bar, `<header>`,
   and `<footer>` identical — they're shared site-wide via the two files
   under `assets/`. Don't fork the CSS/JS per page.
3. Replace only the contents of `<main>...</main>`.
4. Link back to the homepage with `index.html#section`, not a bare
   `#section` — anchors only resolve on the page that defines that id.
5. Publishing a page in Urdu? Set `<html lang="ur" dir="rtl">` on that
   page — `style.css` section 14 already mirrors the shared components
   for RTL. For a short Urdu snippet inside an English page, wrap it in
   `class="urdu-content"` instead.

## Deploying (Cloudflare Pages via GitHub)

- Push this folder's contents to the repo root (or set it as the Pages
  "root directory" if it lives in a subfolder).
- Build command: none. Output directory: `/` (or wherever `index.html`
  sits).
- No environment variables or secrets required — WhatsApp links are
  built client-side from the number in `assets/js/script.js`
  (`SITE_CONFIG.whatsappNumber`).

## Open decision

Header/footer/CTA "Buy Now" links currently jump straight to WhatsApp.
The proposal's `checkout.html` (cart + map pin) would sit before that
step — decide whether "Buy Now" should route there once it exists, or
stay a direct WhatsApp shortcut.
