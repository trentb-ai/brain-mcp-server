#!/usr/bin/env node
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';

const BRAIN = 'https://brain-public.trentbelasco.workers.dev';

async function get(path, params = {}) {
  const url = new URL(BRAIN + path);
  Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
  const r = await fetch(url);
  return r.json();
}

async function post(path, body) {
  const r = await fetch(BRAIN + path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  return r.json();
}

const server = new Server(
  { name: 'brain-mcp-server', version: '1.0.0' },
  { capabilities: { tools: {} } }
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: 'brain_search',
      description: 'Search the Brain by keyword across all tables',
      inputSchema: { type: 'object', properties: { term: { type: 'string' } }, required: ['term'] }
    },
    {
      name: 'brain_query',
      description: 'Run a raw SELECT query against the Brain D1 database',
      inputSchema: { type: 'object', properties: { sql: { type: 'string' } }, required: ['sql'] }
    },
    {
      name: 'brain_browse',
      description: 'Browse any Brain table with optional limit',
      inputSchema: { type: 'object', properties: { table: { type: 'string' }, limit: { type: 'number', default: 20 } }, required: ['table'] }
    },
    {
      name: 'brain_write',
      description: 'Upsert a row into any Brain table (auto-backup)',
      inputSchema: { type: 'object', properties: { table: { type: 'string' }, data: { type: 'object' } }, required: ['table', 'data'] }
    },
    {
      name: 'brain_destructive',
      description: 'Run a DELETE or UPDATE on the Brain (auto-backup)',
      inputSchema: { type: 'object', properties: { sql: { type: 'string' } }, required: ['sql'] }
    },
    {
      name: 'brain_r2_list',
      description: 'List files in Brain R2 storage, optionally filtered by prefix',
      inputSchema: { type: 'object', properties: { prefix: { type: 'string', default: '' } } }
    },
    {
      name: 'brain_r2_read',
      description: 'Read a file from Brain R2 storage by key',
      inputSchema: { type: 'object', properties: { key: { type: 'string' } }, required: ['key'] }
    },
    {
      name: 'brain_r2_write',
      description: 'Write a file to Brain R2 storage (auto-backup)',
      inputSchema: { type: 'object', properties: { key: { type: 'string' }, content: { type: 'string' } }, required: ['key', 'content'] }
    },
    {
      name: 'brain_backups',
      description: 'List all Brain backups',
      inputSchema: { type: 'object', properties: {} }
    },
    {
      name: 'brain_rollback',
      description: 'Restore a Brain backup by ID',
      inputSchema: { type: 'object', properties: { id: { type: 'string' } }, required: ['id'] }
    }
  ]
}));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;
  let result;

  try {
    if (name === 'brain_search') result = await get('/read', { term: args.term });
    else if (name === 'brain_query') result = await get('/read', { sql: args.sql });
    else if (name === 'brain_browse') result = await get('/read', { table: args.table, limit: String(args.limit || 20) });
    else if (name === 'brain_write') result = await post('/write', { table: args.table, data: args.data });
    else if (name === 'brain_destructive') result = await post('/destructive', { sql: args.sql });
    else if (name === 'brain_r2_list') result = await get('/r2/list', { prefix: args.prefix || '' });
    else if (name === 'brain_r2_read') result = await get('/r2/read', { key: args.key });
    else if (name === 'brain_r2_write') {
      const r = await fetch(BRAIN + '/r2/write?key=' + encodeURIComponent(args.key), {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain' },
        body: args.content
      });
      result = await r.json();
    }
    else if (name === 'brain_backups') result = await get('/backups');
    else if (name === 'brain_rollback') result = await post('/rollback/' + args.id, {});
    else throw new Error('Unknown tool: ' + name);
  } catch (e) {
    return { content: [{ type: 'text', text: 'Error: ' + e.message }], isError: true };
  }

  return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
});

const transport = new StdioServerTransport();
await server.connect(transport);
