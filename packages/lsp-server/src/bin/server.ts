#!/usr/bin/env node
/**
 * LSP Server Entry Point — Node
 *
 * Creates a Node-transport LSP connection and supplies platform-specific
 * I/O callbacks (filesystem, git, config parsing).
 */

import { createConnection, ProposedFeatures } from 'vscode-languageserver/node';
import { fileURLToPath } from 'url';
import * as fs from 'fs';
import * as path from 'path';
import { ChangedownServer } from '../server';
import { getWorkspaceRoot, getPreviousVersion } from '../git';
import { parseConfigToml } from 'changedown/config';

const conn = createConnection(ProposedFeatures.all);

const server = new ChangedownServer(conn, {
  loadConfig: (root) => {
    try {
      const content = fs.readFileSync(
        path.join(root, '.changedown', 'config.toml'),
        'utf-8',
      );
      return parseConfigToml(content);
    } catch {
      return undefined;
    }
  },
  readFileByUri: async (uri) => {
    try {
      const url = new URL(uri);
      if (url.protocol !== 'file:') return undefined;
      const filePath = fileURLToPath(url);
      return await fs.promises.readFile(filePath, 'utf-8');
    } catch {
      return undefined;
    }
  },
});

// Inject real git implementations (server defaults to no-ops)
server._gitGetWorkspaceRoot = getWorkspaceRoot;
server._gitGetPreviousVersion = getPreviousVersion;

server.listen();
