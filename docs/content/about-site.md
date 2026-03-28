<!-- ctrcks.com/v1: tracked -->
{~~# About ChangeTracks

ChangeTracks is a browser-based document editor with built-in change tracking. It runs entirely in your browser -- no server, no account, no data leaves your machine. All processing happens locally using WebAssembly.

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
- [CriticMarkup](https://criticmarkup.com/) as the change tracking format

## Privacy

Everything runs locally. Your documents never leave your browser. No analytics, no tracking, no server-side processing.

## Made by

[Hackerbara](https://github.com/hackerbara) -- [GitHub](https://github.com/hackerbara) | [X](https://x.com/hackerbara)~># About This Site

This is a proof-of-concept browser demo for [ChangeTracks](https://github.com/hackerbara) — a change tracking system for plain-text documents built on the [CriticMarkup](https://criticmarkup.com/) format.

The app runs the same LSP (Language Server Protocol) engine that powers the full VS Code extension, compiled to WebAssembly and running in a web worker inside your browser. Everything is local — no server, no account, nothing leaves your machine.

You can switch between view modes, open the editor, import DOCX files, and see tracked changes rendered in real time. It is a demo of the core engine, not the full editing experience.

For the complete feature set — including real-time tracking as you type, change resolution, threaded discussions, and multi-author workflows — install the [VS Code extension](/content/install).

Made by [Hackerbara](https://github.com/hackerbara) · [GitHub](https://github.com/hackerbara) · [X](https://x.com/hackerbara)~~}[^ct-2]


[^ct-1]: ai:claude-opus-4.6 | 2026-03-28 | creation | proposed
    ai:claude-opus-4.6 2026-03-28T19:20:41Z: File created

[^ct-2]: @ai:claude-opus-4.6 | 2026-03-28 | sub | proposed
    @ai:claude-opus-4.6 2026-03-28T19:39:30Z: Rewrite to focus on site as proof-of-concept demo, not product feature list