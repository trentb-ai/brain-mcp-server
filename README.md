# brain-mcp-server

Cloudflare Worker MCP server for `brain-public.trentbelasco.workers.dev`.

## Deploy

```bash
npm install
npm run deploy
```

Then paste the deployed URL into Perplexity → Account → Connectors → Add custom connector.

## Endpoints

| Path | Method | Purpose |
|---|---|---|
| `/` | GET | MCP manifest |
| `/call` | POST | Call a tool: `{tool, arguments}` |
| `/sse` | GET | SSE stream |

## Tools

| Tool | What it does |
|---|---|
| `brain_search` | Keyword search |
| `brain_query` | Raw SELECT |
| `brain_browse` | Browse any table |
| `brain_write` | Upsert row |
| `brain_destructive` | DELETE/UPDATE |
| `brain_r2_list` | List R2 files |
| `brain_r2_read` | Read R2 file |
| `brain_r2_write` | Write R2 file |
| `brain_backups` | List backups |
| `brain_rollback` | Restore backup |
