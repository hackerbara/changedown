# @changetracks/lsp-server

Language Server Protocol (LSP) server implementation for CriticMarkup editing.

## Overview

This package provides an LSP server that wraps the editor-agnostic `@changetracks/core` package. It translates LSP protocol messages into operations on the core Workspace facade and converts core's offset-based POD types back to LSP protocol types.

## Architecture

- **Protocol Layer**: Handles LSP connection lifecycle and message routing
- **Adapter Layer**: Converts between LSP types (Position, Range, etc.) and core's offset-based types
- **Core Integration**: Delegates all parsing and operations to `@changetracks/core`

## Dependencies

- `vscode-languageserver`: LSP protocol implementation
- `vscode-languageserver-textdocument`: Document synchronization utilities
- `@changetracks/core`: Editor-agnostic CriticMarkup core logic

## Development

```bash
# Build
npm run build

# Watch mode
npm run watch

# Test
npm test
```

## API

### Server

```typescript
import { createServer } from '@changetracks/lsp-server';

// Create server with default stdio connection
const server = createServer();

// Start listening for LSP messages
server.listen();
```

### Converters

```typescript
import {
  offsetToPosition,
  positionToOffset,
  offsetRangeToLspRange,
  lspRangeToOffsetRange
} from '@changetracks/lsp-server';

// Convert offset to LSP position (handles LF and CRLF)
const position = offsetToPosition(text, 42);

// Convert LSP position to offset
const offset = positionToOffset(text, { line: 1, character: 5 });

// Convert offset range to LSP range
const range = offsetRangeToLspRange(text, 10, 50);

// Convert LSP range to offset range
const { start, end } = lspRangeToOffsetRange(text, range);
```

## LSP Capabilities

Current capabilities:

- ✅ Text document synchronization (full sync mode)
- ✅ Parse caching (documents parsed on open/change, cached by URI)
- ✅ Diagnostics (Hint-severity markers per change)
- ✅ Code actions (accept/reject per change and bulk)
- ✅ Semantic tokens (CriticMarkup syntax highlighting)
- ✅ Code lens (inline action buttons)
- ✅ Hover (comment/reason display)
- ✅ Custom notifications (decoration data, change count, pending edit flush)
- ✅ Document links (footnote ref/definition navigation)
