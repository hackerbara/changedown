import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { createRemoteRelayServer } from './remote-server-factory.js';
import type { RelayRequestContext } from './relay-context.js';

export async function withRemoteMcpClient<T>(ctx: RelayRequestContext, fn: (client: Client) => Promise<T>): Promise<T> {
  const server = createRemoteRelayServer(ctx);
  const client = new Client({ name: ctx.clientInfo?.name ?? 'changedown-http-facade', version: ctx.clientInfo?.version ?? '0.0.0' });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
  try {
    return await fn(client);
  } finally {
    await Promise.allSettled([clientTransport.close(), serverTransport.close()]);
  }
}

export async function listRemoteToolsViaMcp(ctx: RelayRequestContext) {
  return withRemoteMcpClient(ctx, (client) => client.listTools());
}

export async function callRemoteToolViaMcp(ctx: RelayRequestContext, name: string, args: Record<string, unknown>): Promise<CallToolResult> {
  return withRemoteMcpClient(ctx, (client) => client.callTool({ name, arguments: args }) as Promise<CallToolResult>);
}
