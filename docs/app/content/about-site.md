<!-- changedown.com/v1: tracked -->
# About ChangeDown

ChangeDown is a browser-based document editor with built-in change tracking. It runs entirely in your browser -- no server, no account, no data leaves your machine. All processing happens locally using WebAssembly.

## Features

- **CriticMarkup change tracking** -- insertions, deletions, substitutions, comments, and highlights, all using the open [CriticMarkup](https://criticmarkup.com/) format
- **Multiple view modes** -- Preview (rendered), Simple (settled/clean), Changes (tracked changes visible), and Markup (raw CriticMarkup review)
- **Monaco code editor** with syntax-aware decorations for CriticMarkup
- **DOCX import/export** via Pandoc running as WebAssembly -- convert Word documents without uploading them anywhere
- **LSP-powered change detection** running in a web worker for real-time tracking
- **File management** with a virtual filesystem in your browser

## Built with

- [Preact](https://preactjs.com/) + [Preact Signals](https://preactjs.com/guide/v10/signals/) for reactive UI
- [Monaco Editor](https://microsoft.github.io/monaco-editor/) for the code editing surface
- [Pandoc WASM](https://github.com/nicholasgasior/pandoc-wasm) for document conversion
- [Astro](https://astro.build/) for the website shell and SEO
{++ - [preact-render-to-string](https://github.com/preactjs/preact-render-to-string) for build-time SSR — the native app hydrates a pre-rendered component shell for instant first paint, while the browser build client-renders into an empty container alongside Astro's static SEO article for crawlers++}[^cn-3]
- [CriticMarkup](https://criticmarkup.com/) as the change tracking format

## Privacy

Everything runs locally. Your documents never leave your browser. No analytics, no tracking, no server-side processing.

## Made by

[Hackerbara](https://github.com/hackerbara) -- [GitHub](https://github.com/hackerbara) | [X](https://x.com/hackerbara)


[^ct-1]: ai:claude-opus-4.6 | 2026-03-28 | creation | proposed
    ai:claude-opus-4.6 2026-03-28T19:20:41Z: File created

[^cn-2]: @ai:claude-opus-4.6 | 2026-03-29 | ins | rejected
    superseded-by: cn-3
    @ai:claude-opus-4.6 2026-03-29T21:14:38Z: Documents the hydration architecture just merged in feature/native-hydration
    rejected: @ai:claude-opus-4.6 2026-03-29T21:15:58Z "Cover all three rendering strategies: native SSR+hydrate, browser client-render, Astro SEO content"

[^cn-3]: @ai:claude-opus-4.6 | 2026-03-29 | ins | proposed
    supersedes: cn-2
    @ai:claude-opus-4.6 2026-03-29T21:15:58Z: Cover all three rendering strategies: native SSR+hydrate, browser client-render, Astro SEO content