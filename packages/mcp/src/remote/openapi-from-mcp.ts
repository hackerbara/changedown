import type { Tool } from '@modelcontextprotocol/sdk/types.js';

export interface OpenApiOptions {
  title: string;
  version: string;
  basePath?: string;
}

function titleForTool(tool: Tool): string {
  return tool.annotations?.title ?? tool.name.replace(/_/g, ' ');
}

export function openApiFromMcpTools(tools: Tool[], options: OpenApiOptions): Record<string, unknown> {
  const basePath = options.basePath ?? '/tools';
  const paths: Record<string, unknown> = {};

  for (const tool of tools) {
    paths[`${basePath}/${encodeURIComponent(tool.name)}`] = {
      post: {
        operationId: tool.name,
        summary: titleForTool(tool),
        description: tool.description ?? '',
        'x-mcp-annotations': tool.annotations ?? {},
        requestBody: {
          required: true,
          content: { 'application/json': { schema: tool.inputSchema } },
        },
        responses: {
          '200': {
            description: 'MCP-shaped tool result',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    tool: { type: 'string' },
                    isError: { type: 'boolean' },
                    content: { type: 'array', items: { type: 'object' } },
                    structuredContent: { type: ['object', 'null'] },
                  },
                  required: ['tool', 'content'],
                },
              },
            },
          },
        },
      },
    };
  }

  return { openapi: '3.1.0', info: { title: options.title, version: options.version }, paths };
}
