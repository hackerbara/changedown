# @changedown/mcp

MCP server for ChangeDown.

It exposes durable Markdown/Word change tracking tools to MCP-capable agents and
hosts the local Word task pane bridge on `127.0.0.1:39990`.

```sh
npx @changedown/mcp
```

Most users should start through the ChangeDown CLI:

```sh
npx @changedown/cli word start
```
