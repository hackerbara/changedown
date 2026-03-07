#!/usr/bin/env node
/**
 * LSP Server Entry Point
 *
 * This is the entry point for starting the ChangeTracks Language Server
 * as a standalone Node.js process.
 */

import { createServer } from '../server';

// Create and start the server
const server = createServer();
server.listen();
