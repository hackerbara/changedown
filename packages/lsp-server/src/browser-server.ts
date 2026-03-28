/**
 * LSP Server Entry Point — Browser (Web Worker)
 *
 * Runs the ChangeDown language server inside a Web Worker.
 * Communicates with the main thread via postMessage (BrowserMessageReader/Writer).
 * No filesystem, no git — config uses defaults.
 */

import {
  createConnection,
  BrowserMessageReader,
  BrowserMessageWriter,
} from 'vscode-languageserver/browser';
import { ChangedownServer } from './server';

declare const self: DedicatedWorkerGlobalScope;

const reader = new BrowserMessageReader(self);
const writer = new BrowserMessageWriter(self);
const conn = createConnection(reader, writer);

const server = new ChangedownServer(conn);
server.listen();
