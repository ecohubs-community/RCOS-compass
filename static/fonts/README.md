# Inter

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
