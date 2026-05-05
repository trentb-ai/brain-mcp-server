/**
 * Brain MCP Server — Cloudflare Worker
 * MCP over HTTP+SSE transport with OAuth 2.0 for Perplexity connector
 */

const CLIENT_ID = 'brain-mcp-public';
const CLIENT_SECRET = 'brain-mcp-secret-2026';

export default {
  async fetch(request: Request, env: { BRAIN_URL: string }): Promise<Response> {
    const url = new URL(request.url);
    const BRAIN = env.BRAIN_URL;
    const BASE = url.origin;

    const cors = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Accept, Authorization',
    };

    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: cors });
    }

    // ── OAuth discovery ──────────────────────────────────────────────────────
    if (url.pathname === '/.well-known/oauth-authorization-server' ||
        url.pathname === '/.well-known/openid-configuration') {
      return Response.json({
        issuer: BASE,
        authorization_endpoint: `${BASE}/oauth/authorize`,
        token_endpoint: `${BASE}/oauth/token`,
        registration_endpoint: `${BASE}/oauth/register`,
        response_types_supported: ['code'],
        grant_types_supported: ['authorization_code', 'client_credentials'],
        token_endpoint_auth_methods_supported: ['none', 'client_secret_post'],
      }, { headers: cors });
    }

    // ── Dynamic client registration (RFC 7591) ───────────────────────────────
    if (url.pathname === '/oauth/register' && request.method === 'POST') {
      // Echo back whatever redirect_uris Perplexity sent, or use a default
      let redirect_uris = ['https://www.perplexity.ai/oauth/callback'];
      try {
        const body = await request.json() as { redirect_uris?: string[] };
        if (body.redirect_uris?.length) redirect_uris = body.redirect_uris;
      } catch {}
      return Response.json({
        client_id: CLIENT_ID,
        client_secret: CLIENT_SECRET,
        client_id_issued_at: Math.floor(Date.now() / 1000),
        redirect_uris,
        grant_types: ['authorization_code', 'client_credentials'],
        response_types: ['code'],
        token_endpoint_auth_method: 'none',
      }, { headers: cors });
    }

    // ── Auth code flow ─────────────────────────────────────────────────────────
    if (url.pathname === '/oauth/authorize') {
      const redirectUri = url.searchParams.get('redirect_uri');
      const state = url.searchParams.get('state') || '';
      const code = 'brain-auth-code-2026';
      if (!redirectUri) return new Response('Missing redirect_uri', { status: 400 });
      const dest = new URL(redirectUri);
      dest.searchParams.set('code', code);
      dest.searchParams.set('state', state);
      return Response.redirect(dest.toString(), 302);
    }

    // ── Token exchange ───────────────────────────────────────────────────────
    if (url.pathname === '/oauth/token' && request.method === 'POST') {
      return Response.json({
        access_token: 'brain-access-token-2026',
        token_type: 'bearer',
        expires_in: 31536000,
        scope: 'brain:read brain:write',
      }, { headers: cors });
    }

    // ── MCP manifest ─────────────────────────────────────────────────────────
    if (url.pathname === '/' || url.pathname === '/mcp') {
      return Response.json({
        name: 'Shared Brain',
        version: '1.0.0',
        description: "Direct read/write access to Trent's Shared Brain (D1 + R2)",
        tools: getToolManifest()
      }, { headers: cors });
    }

    // ── Tool call ─────────────────────────────────────────────────────────────
    if (url.pathname === '/call' && request.method === 'POST') {
      const body = await request.json() as { tool: string; arguments: Record<string, unknown> };
      const result = await callTool(body.tool, body.arguments, BRAIN);
      return Response.json(result, { headers: cors });
    }

    // ── SSE ───────────────────────────────────────────────────────────────────
    if (url.pathname === '/sse') {
      const { readable, writable } = new TransformStream();
      const writer = writable.getWriter();
      const encoder = new TextEncoder();
      writer.write(encoder.encode(`data: ${JSON.stringify({ type: 'manifest', tools: getToolManifest() })}\n\n`));
      return new Response(readable, {
        headers: { ...cors, 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache' }
      });
    }

    return new Response('Brain MCP Server running.', { headers: { ...cors, 'Content-Type': 'text/plain' } });
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
        return await brainGet(brain, '/read', { table: args.table as string, limit: String(args.limit || 20) });
      case 'brain_write':
        return await brainPost(brain, '/write', { table: args.table, data: args.data });
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
    { name: 'brain_search', description: 'Search the Brain by keyword across all tables', inputSchema: { type: 'object', properties: { term: { type: 'string' } }, required: ['term'] } },
    { name: 'brain_query', description: 'Run a raw SELECT SQL query against Brain D1', inputSchema: { type: 'object', properties: { sql: { type: 'string' } }, required: ['sql'] } },
    { name: 'brain_browse', description: 'Browse any Brain table', inputSchema: { type: 'object', properties: { table: { type: 'string' }, limit: { type: 'number', default: 20 } }, required: ['table'] } },
    { name: 'brain_write', description: 'Upsert a row into any Brain table (auto-backup)', inputSchema: { type: 'object', properties: { table: { type: 'string' }, data: { type: 'object' } }, required: ['table', 'data'] } },
    { name: 'brain_destructive', description: 'Run DELETE or UPDATE on Brain (auto-backup)', inputSchema: { type: 'object', properties: { sql: { type: 'string' } }, required: ['sql'] } },
    { name: 'brain_r2_list', description: 'List files in Brain R2 storage', inputSchema: { type: 'object', properties: { prefix: { type: 'string', default: '' } } } },
    { name: 'brain_r2_read', description: 'Read a file from Brain R2 by key', inputSchema: { type: 'object', properties: { key: { type: 'string' } }, required: ['key'] } },
    { name: 'brain_r2_write', description: 'Write a file to Brain R2 (auto-backup)', inputSchema: { type: 'object', properties: { key: { type: 'string' }, content: { type: 'string' } }, required: ['key', 'content'] } },
    { name: 'brain_backups', description: 'List all Brain backups', inputSchema: { type: 'object', properties: {} } },
    { name: 'brain_rollback', description: 'Restore a Brain backup by ID', inputSchema: { type: 'object', properties: { id: { type: 'string' } }, required: ['id'] } },
  ];
}
