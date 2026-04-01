<!-- changedown.com/v1: untracked -->
# About this site

This site implements a minimal browser-based [Changedown](https://github.com/hackerbara/changedown) editor environment, using components of the Changedown Visual Studio Code extension. It is intended as a proof of concept and working lab, **will have bugs**! 

It runs entirely in your browser. No server, no account, no data leaves your machine. Changedown editor enhancements flow through the standard Changedown LSP server, running on a Web Worker process. Pandoc is dynamically loaded from CDN for docx operations.

## Features

- **CriticMarkup change tracking** -- insertions, deletions, substitutions, comments, and highlights, all using the open [CriticMarkup](https://criticmarkup.com/) format
- **Monaco code editor** with syntax-aware decorations for CriticMarkup
- **Markdown-it preview pipeline** with full edit rendering and hiding
- **DOCX import/export** via Pandoc running as WebAssembly -- convert to and from Word documents without uploading them anywhere
- **LSP-powered change detection** running in a web worker for real-time tracking
- **File management** with a virtual filesystem in your browser

## Built with

- [Preact](https://preactjs.com/) + [Preact Signals](https://preactjs.com/guide/v10/signals/) for reactive UI
- [Monaco Editor](https://microsoft.github.io/monaco-editor/) for the code editing surface
- [Pandoc WASM](https://github.com/nicholasgasior/pandoc-wasm) for document conversion
- [Astro](https://astro.build/) for the website shell and SEO
- [preact-render-to-string](https://github.com/preactjs/preact-render-to-string) for build-time SSR, hydrating in over Astro's static SEO article for crawlers
- [CriticMarkup](https://criticmarkup.com/) as the change tracking format
- [Changedown](https://github.com/hackerbara/changedown) core parser, LSP, Monaco and VS code extension, docx processing

## Privacy

Everything runs locally. Your documents never leave your browser. No analytics, no tracking, no server-side processing. Pandoc-wasm is fetched from remote CDN when working with docx files.

## License

MIT

## Made by

[Hackerbara](https://x.com/hackerbara) -- [GitHub](https://github.com/hackerbara)