# Fonts

## Inter — the app

`inter-v20-latin.woff2` and `inter-v20-latin-ext.woff2` are the Inter variable
web build (weight axis 400–700), subset to Latin and Latin Extended by
unicode-range. Taken from Google Fonts' `css2` delivery for Inter v20.

They are served from our own origin because the content security policy sets
`font-src: 'self'` (`svelte.config.js`), which blocks a font CDN — and because a
family named but not shipped resolves to whatever the reader has installed, or
to nothing.

Licensed under the SIL Open Font License 1.1: https://github.com/rsms/inter

To update, fetch the current CSS, take the `latin` and `latin-ext` faces, and
replace both files plus the `unicode-range` lists in `src/app.css`:

    curl -A 'Mozilla/5.0' 'https://fonts.googleapis.com/css2?family=Inter:wght@400..700&display=swap'

## Hanken Grotesk, Newsreader, JetBrains Mono — the public site

The landing page's text, headings and references
(`design_files/platform/RCOS Compass Landing Page.html`). Same delivery and
subsetting as Inter: variable web builds from Google Fonts' `css2`, `latin` and
`latin-ext` faces only, `unicode-range` lists in `src/app.css`. Nothing inside
the app uses them.

- `hanken-grotesk-v12-*` — weight 400–700
- `newsreader-v26-*` — upright 400–500 and italic 400, fetched **without** the
  optical-size axis (58 kB instead of 132 kB for the Latin face)
- `jetbrains-mono-v24-*` — weight 400–500

All three are SIL Open Font License 1.1 (Hanken Grotesk: Alfredo Marco Pradil;
Newsreader: Production Type; JetBrains Mono: JetBrains). To update:

    curl -A 'Mozilla/5.0' 'https://fonts.googleapis.com/css2?family=Hanken+Grotesk:wght@400..700&family=JetBrains+Mono:wght@400..500&family=Newsreader:ital,wght@0,400..500;1,400&display=swap'
