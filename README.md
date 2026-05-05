# brain-mcp-server

MCP server giving any MCP-connected AI direct read/write access to `brain-public.trentbelasco.workers.dev`.

## Install

```bash
npm install
```

## Add to Perplexity / Claude / Cursor MCP config

```json
{
  "mcpServers": {
    "brain": {
      "command": "node",
      "args": ["/absolute/path/to/brain-mcp-server/index.js"]
    }
  }
}
```

## Tools

| Tool | What it does |
|---|---|
| `brain_search` | Search by keyword |
| `brain_query` | Raw SELECT |
| `brain_browse` | Browse any table |
| `brain_write` | Upsert a row |
| `brain_destructive` | DELETE / UPDATE |
| `brain_r2_list` | List R2 files |
| `brain_r2_read` | Read R2 file |
| `brain_r2_write` | Write R2 file |
| `brain_backups` | List backups |
| `brain_rollback` | Restore backup |
