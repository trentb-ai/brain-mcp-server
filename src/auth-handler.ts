import { Hono } from "hono";

type Env = {
  BRAIN_PASSWORD: string;
  OAUTH_PROVIDER: {
    parseAuthRequest: (request: Request) => Promise<any>;
    completeAuthorization: (opts: any) => Promise<{ redirectTo: string }>;
  };
};

export const AuthHandler = new Hono<{ Bindings: Env }>();

AuthHandler.get("/health", (c) =>
  c.json({ status: "ok", server: "shared-brain-readonly", version: "2.1.0" })
);

function loginPage(params: Record<string, string>, error = ""): string {
  const hidden = Object.entries(params)
    .map(([k, v]) => `<input type="hidden" name="${k}" value="${(v ?? "").replace(/"/g, "&quot;")}"/>`)
    .join("\n      ");
  return `<!doctype html>
<html><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width, initial-scale=1"/>
<title>Connect to Trent's Brain</title>
<style>
  body{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;background:#eef2f9;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0}
  .card{background:#fff;padding:32px;border-radius:12px;box-shadow:0 4px 24px rgba(26,39,68,.12);width:320px}
  h1{font-size:18px;color:#1a2744;margin:0 0 4px}
  p{font-size:13px;color:#555;margin:0 0 20px}
  label{font-size:13px;color:#222;display:block;margin-bottom:6px}
  input[type=password]{width:100%;padding:10px;border:1px solid #c8cdd6;border-radius:8px;font-size:14px;box-sizing:border-box}
  button{width:100%;margin-top:18px;padding:11px;background:#2563eb;color:#fff;border:0;border-radius:8px;font-size:14px;font-weight:600;cursor:pointer}
  .err{color:#b91c1c;font-size:13px;margin:0 0 12px}
</style></head>
<body>
  <form method="POST" action="/authorize" class="card">
    <h1>Trent's Brain</h1>
    <p>Read-only access. Enter the password to connect.</p>
    ${error ? `<p class="err">${error}</p>` : ""}
    <label for="pw">Password</label>
    <input id="pw" type="password" name="password" autofocus autocomplete="current-password"/>
    ${hidden}
    <button type="submit">Connect to Trent's Brain</button>
  </form>
</body></html>`;
}

AuthHandler.get("/authorize", (c) => {
  const q = c.req.query();
  const params: Record<string, string> = {
    response_type: q.response_type ?? "",
    client_id: q.client_id ?? "",
    redirect_uri: q.redirect_uri ?? "",
    scope: q.scope ?? "",
    state: q.state ?? "",
    code_challenge: q.code_challenge ?? "",
    code_challenge_method: q.code_challenge_method ?? "",
  };
  return c.html(loginPage(params));
});

AuthHandler.post("/authorize", async (c) => {
  const body = await c.req.parseBody();
  const params: Record<string, string> = {
    response_type: String(body.response_type ?? ""),
    client_id: String(body.client_id ?? ""),
    redirect_uri: String(body.redirect_uri ?? ""),
    scope: String(body.scope ?? ""),
    state: String(body.state ?? ""),
    code_challenge: String(body.code_challenge ?? ""),
    code_challenge_method: String(body.code_challenge_method ?? ""),
  };
  if (body.password !== c.env.BRAIN_PASSWORD) {
    return c.html(loginPage(params, "Wrong password. Try again."), 401);
  }
  const authRequest = {
    responseType: params.response_type,
    clientId: params.client_id,
    redirectUri: params.redirect_uri,
    scope: params.scope ? params.scope.split(" ") : ["brain:read"],
    state: params.state,
    codeChallenge: params.code_challenge,
    codeChallengeMethod: params.code_challenge_method,
  };
  const { redirectTo } = await c.env.OAUTH_PROVIDER.completeAuthorization({
    request: authRequest,
    userId: "dad",
    metadata: { label: "Dad (read-only)" },
    scope: ["brain:read"],
    props: {},
  });
  return Response.redirect(redirectTo, 302);
});

export default AuthHandler;
