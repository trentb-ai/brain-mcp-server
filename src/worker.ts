/**
 * Brain MCP Server — Cloudflare Worker
 * MCP over HTTP+SSE transport
 * Exposes all brain-public.trentbelasco.workers.dev endpoints as MCP tools
 */

export default {
  async fetch(request: Request, env: { BRAIN_URL: string }): Promise<Response> {
    const url = new URL(request.url);
    const BRAIN = env.BRAIN_URL;

    // CORS headers for Perplexity
    const cors = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Accept',
    };

    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: cors });
    }

    // MCP discovery endpoint
    if (url.pathname === '/' || url.pathname === '/mcp') {
      return Response.json({
        name: 'Shared Brain',
        version: '1.0.0',
        description: 'Direct read/write access to Trent\'s Shared Brain (D1 + R2)',
        tools: getToolManifest()
      }, { headers: cors });
    }

    // MCP tools endpoint
    if (url.pathname === '/call' && request.method === 'POST') {
      const body = await request.json() as { tool: string; arguments: Record<string, unknown> };
      const result = await callTool(body.tool, body.arguments, BRAIN);
      return Response.json(result, { headers: cors });
    }

    // SSE endpoint for MCP clients that use streaming
    if (url.pathname === '/sse') {
      const { readable, writable } = new TransformStream();
      const writer = writable.getWriter();
      const encoder = new TextEncoder();

      // Send tool manifest as first SSE event
      writer.write(encoder.encode(`data: ${JSON.stringify({ type: 'manifest', tools: getToolManifest() })}\n\n`));

      return new Response(readable, {
        headers: {
          ...cors,
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache',
        }
      });
    }

    return new Response('Brain MCP Server running. POST /call with {tool, arguments}', {
      headers: { ...cors, 'Content-Type': 'text/plain' }
    });
  }
};

async function brainGet(brain: string, path: string, params: Record<string, string> = {}) {
  const u = new URL(brain + path);
  Object.entries(params).forEach(([k, v]) => u.searchParams.set(k, v));
  const r = await fetch(u.toString());
  return r.json();
}

async function brainPost(brain: string, path: string, body: unknown) {
  const r = await fetch(brain + path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  return r.json();
}

async function callTool(tool: string, args: Record<string, unknown>, brain: string) {
  try {
    switch (tool) {
      case 'brain_search':
        return await brainGet(brain, '/read', { term: args.term as string });

      case 'brain_query':
        return await brainGet(brain, '/read', { sql: args.sql as string });

      case 'brain_browse':
        return await brainGet(brain, '/read', {
          table: args.table as string,
          limit: String(args.limit || 20)
        });

      case 'brain_write':
        return await brainPost(brain, '/write', {
          table: args.table,
          data: args.data
        });

      case 'brain_destructive':
        return await brainPost(brain, '/destructive', { sql: args.sql });

      case 'brain_r2_list':
        return await brainGet(brain, '/r2/list', { prefix: (args.prefix as string) || '' });

      case 'brain_r2_read':
        return await brainGet(brain, '/r2/read', { key: args.key as string });

      case 'brain_r2_write': {
        const r = await fetch(`${brain}/r2/write?key=${encodeURIComponent(args.key as string)}`, {
          method: 'POST',
          headers: { 'Content-Type': 'text/plain' },
          body: args.content as string
        });
        return r.json();
      }

      case 'brain_backups':
        return await brainGet(brain, '/backups');

      case 'brain_rollback':
        return await brainPost(brain, '/rollback/' + args.id, {});

      default:
        return { error: `Unknown tool: ${tool}` };
    }
  } catch (e: unknown) {
    return { error: e instanceof Error ? e.message : String(e) };
  }
}

function getToolManifest() {
  return [
    {
      name: 'brain_search',
      description: 'Search the Brain by keyword across all tables',
      inputSchema: { type: 'object', properties: { term: { type: 'string', description: 'Search term' } }, required: ['term'] }
    },
    {
      name: 'brain_query',
      description: 'Run a raw SELECT SQL query against the Brain D1 database',
      inputSchema: { type: 'object', properties: { sql: { type: 'string', description: 'SELECT statement' } }, required: ['sql'] }
    },
    {
      name: 'brain_browse',
      description: 'Browse any Brain table',
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
      description: 'List files in Brain R2 storage',
      inputSchema: { type: 'object', properties: { prefix: { type: 'string', default: '' } } }
    },
    {
      name: 'brain_r2_read',
      description: 'Read a file from Brain R2 by key',
      inputSchema: { type: 'object', properties: { key: { type: 'string' } }, required: ['key'] }
    },
    {
      name: 'brain_r2_write',
      description: 'Write a file to Brain R2 (auto-backup)',
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
  ];
}
