import OAuthProvider from "@cloudflare/workers-oauth-provider";
import { AuthHandler } from "./auth-handler";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Accept, Authorization",
};

const SERVER_INFO = {
  protocolVersion: "2024-11-05",
  capabilities: { tools: {} },
  serverInfo: { name: "shared-brain-readonly", version: "2.1.0" },
};

const TOOLS = [
  { name: "brain_search", description: "Search Brain D1 by keyword across all tables",
    inputSchema: { type: "object", properties: { term: { type: "string", description: "Search keyword" }, limit: { type: "number", description: "Max results (default 20)" } }, required: ["term"] } },
  { name: "brain_browse", description: "List all D1 tables with row counts, or browse/search a specific table",
    inputSchema: { type: "object", properties: { table: { type: "string", description: "Table name to browse. Omit to list all tables." }, term: { type: "string", description: "Search term within table (default: % = all rows)" }, limit: { type: "number", description: "Max rows (default 20)" } } } },
  { name: "brain_context", description: "Get a document, neuron, or R2 object by key (searches all stores)",
    inputSchema: { type: "object", properties: { key: { type: "string", description: "Document/neuron/R2 key" } }, required: ["key"] } },
  { name: "brain_r2_list", description: "List R2 keys by prefix",
    inputSchema: { type: "object", properties: { prefix: { type: "string", description: "Key prefix filter (default empty = all)" }, limit: { type: "number", description: "Max keys (default 100)" } } } },
  { name: "brain_r2_read", description: "Read an R2 file by key",
    inputSchema: { type: "object", properties: { key: { type: "string", description: "R2 object key" } }, required: ["key"] } },
];

function jsonRpcOk(id: any, result: any): Response {
  return Response.json({ jsonrpc: "2.0", id: id ?? null, result }, { headers: { ...CORS, "Content-Type": "application/json" } });
}
function jsonRpcError(id: any, code: number, message: string): Response {
  return Response.json({ jsonrpc: "2.0", id: id ?? null, error: { code, message } }, { headers: { ...CORS, "Content-Type": "application/json" } });
}

async function brainFetch(env: any, path: string, params: Record<string, any> = {}): Promise<any> {
  const u = new URL(`https://brain-gateway${path}`);
  for (const [k, v] of Object.entries(params)) { if (v !== undefined && v !== "") u.searchParams.set(k, v as string); }
  const res = await env.BRAIN_GATEWAY.fetch(u.toString(), { headers: { "X-Brain-Key": env.BRAIN_GATEWAY_SECRET } });
  return res.json();
}

async function dispatchTool(name: string, args: any, env: any): Promise<any> {
  switch (name) {
    case "brain_search":
      return brainFetch(env, "/search-d1", { term: String(args.term ?? ""), ...(args.limit ? { limit: String(args.limit) } : {}) });
    case "brain_browse":
      if (args.table) return brainFetch(env, "/search-d1", { term: String(args.term ?? "%"), table: String(args.table), ...(args.limit ? { limit: String(args.limit) } : {}) });
      return brainFetch(env, "/scan-d1");
    case "brain_context":
      return brainFetch(env, `/context/${encodeURIComponent(String(args.key))}`);
    case "brain_r2_list":
      return brainFetch(env, "/list-prefix", { prefix: String(args.prefix ?? ""), ...(args.limit ? { limit: String(args.limit) } : {}) });
    case "brain_r2_read":
      return brainFetch(env, "/get-part", { key: String(args.key), store: "r2", offset: "0", chunk_size: "524288" });
    default:
      throw new Error(`Unknown tool: ${name}`);
  }
}

// Bearer check removed — OAuthProvider gates /mcp upstream.
async function handleMcp(request: Request, env: any): Promise<Response> {
  let body: any;
  try { body = await request.json(); } catch { return jsonRpcError(null, -32700, "Parse error"); }
  if (body.jsonrpc !== "2.0") return jsonRpcError(body.id, -32600, 'Invalid Request: jsonrpc must be "2.0"');
  switch (body.method) {
    case "initialize": return jsonRpcOk(body.id, SERVER_INFO);
    case "notifications/initialized": return jsonRpcOk(body.id, {});
    case "tools/list": return jsonRpcOk(body.id, { tools: TOOLS });
    case "tools/call": {
      const params = body.params;
      if (!params?.name) return jsonRpcError(body.id, -32602, "Invalid params: missing tool name");
      try {
        const result = await dispatchTool(params.name, params.arguments ?? {}, env);
        return jsonRpcOk(body.id, { content: [{ type: "text", text: JSON.stringify(result) }] });
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        return jsonRpcOk(body.id, { content: [{ type: "text", text: JSON.stringify({ error: msg }) }], isError: true });
      }
    }
    default: return jsonRpcError(body.id, -32601, `Method not found: ${body.method}`);
  }
}

export const BrainApiHandler = {
  async fetch(request: Request, env: any, _ctx: any): Promise<Response> {
    const url = new URL(request.url);
    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });
    if (url.pathname === "/mcp" && request.method === "POST") return handleMcp(request, env);
    return new Response("Not Found", { status: 404, headers: CORS });
  },
};

export default new OAuthProvider({
  apiRoute: "/mcp",
  apiHandler: BrainApiHandler,
  defaultHandler: AuthHandler as any,
  authorizeEndpoint: "/authorize",
  tokenEndpoint: "/token",
  clientRegistrationEndpoint: "/register",
});
