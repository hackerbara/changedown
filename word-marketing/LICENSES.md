<!-- changedown.com/v1: tracked -->
# Third-party licenses

Self-hosted assets shipped with this site.

## Fonts

All three font families are licensed under the **SIL Open Font License v1.1**
(OFL-1.1). Full license text: <https://scripts.sil.org/OFL>.

### Source Serif 4 (display, headings)

- **Family:** Source Serif 4 — variable woff2 (Roman, single file, full weight axis)
- **Author / publisher:** Adobe
- **Source:** [adobe-fonts/source-serif @ 4.005R](https://github.com/adobe-fonts/source-serif/releases/tag/4.005R)
- **Asset URL:** `source-serif-4.005_WOFF2.zip` → `VAR/SourceSerif4Variable-Roman.ttf.woff2`
- **License:** OFL-1.1
- **Installed at:** `word-marketing/public/fonts/source-serif-4.woff2`

### Source Sans 3 (body, UI)

- **Family:** Source Sans 3 — variable woff2 (Upright, single file, full weight axis)
- **Author / publisher:** Adobe
- **Source:** [adobe-fonts/source-sans @ 3.052R](https://github.com/adobe-fonts/source-sans/releases/tag/3.052R)
- **Asset URL:** `WOFF2-source-sans-3.052R.zip` → `WOFF2/VF/SourceSans3VF-Upright.ttf.woff2`
- **License:** OFL-1.1
- **Installed at:** `word-marketing/public/fonts/source-sans-3.woff2`

### IBM Plex Mono (code samples)

- **Family:** IBM Plex Mono — static woff2, Regular (400) only, Latin subset
- **Author / publisher:** IBM
- **Source:** `@fontsource/ibm-plex-mono` via jsDelivr (the npm package
  redistributes IBM's official woff2 builds with subsetting per character set)
- **Asset URL:** `https://cdn.jsdelivr.net/npm/@fontsource/ibm-plex-mono@latest/files/ibm-plex-mono-latin-400-normal.woff2`
- **License:** OFL-1.1
- **Installed at:** `word-marketing/public/fonts/ibm-plex-mono.woff2`
- **Note:** IBM does not publish a variable version of Plex Mono — only
  static weights. Our use is limited to `code, pre`, where one weight
  suffices. If emphasis becomes necessary, fetch the Medium (500) static.

## Mascot

The capybara illustrations in `public/illustrations/` are **temporary
placeholders** authored by the project team. They will be replaced by
commissioned artwork from the illustrator brief at
`word-marketing/docs/illustrator-brief.md`. The commissioned art will be
work-for-hire under copyright of the ChangeDown project; we'll update this
file when artwork lands.

## Icons

The 9-icon set in `src/components/Icon.astro` is hand-drawn for this site.
Path data is inline; no external icon library is imported.

## Notice file at deployment

Cloudflare Pages serves `LICENSES.md` automatically at
`https://changedown.com/LICENSES.md` if we choose to expose it. Decision
deferred — most users won't look. Linking from the footer's "Privacy /
Terms" cluster is an option if there's space.


[^cn-1]: ai:claude-opus-4.6 | 2026-05-11 | creation | proposed
    ai:claude-opus-4.6 2026-05-11T02:06:55Z: File created