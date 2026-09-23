import assert from "node:assert/strict";
import { createHash, randomBytes } from "node:crypto";
import { createServer, type Server } from "node:http";
import { after, before, describe, it } from "node:test";

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

import { loadConfig } from "./config.js";
import { createHostedApp } from "./http.js";
import { FakeApi } from "./test/fakeApi.js";

const REDIRECT = "https://claude.ai/api/mcp/auth_callback";
const UPSTREAM = "sanctum-abc";

type Hosted = { url: string; stop: () => Promise<void> };

/** Serve the hosted app on a random port, with its public URL pointing at itself. */
async function host(api: FakeApi, overrides: { loginAttemptsPerWindow?: number } = {}): Promise<Hosted> {
  const server: Server = createServer();

  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));

  const address = server.address();
  const port = typeof address === "object" && address ? address.port : 0;
  const url = `http://localhost:${port}`;
  const config = { ...loadConfig({}), baseUrl: api.url, timeoutMs: 5_000 };

  server.on(
    "request",
    createHostedApp(config, { publicUrl: new URL(url), secret: "x".repeat(32), ...overrides }),
  );

  return { url, stop: () => new Promise((resolve) => server.close(() => resolve())) };
}

function pkce(): { verifier: string; challenge: string } {
  const verifier = randomBytes(32).toString("base64url");

  return { verifier, challenge: createHash("sha256").update(verifier).digest("base64url") };
}

function form(fields: Record<string, string>): { method: "POST"; headers: HeadersInit; body: string; redirect: "manual" } {
  return {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(fields).toString(),
    redirect: "manual",
  };
}

async function register(url: string, extra: Record<string, unknown> = {}): Promise<Record<string, string>> {
  const response = await fetch(`${url}/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      client_name: "Claude",
      redirect_uris: [REDIRECT],
      grant_types: ["authorization_code", "refresh_token"],
      response_types: ["code"],
      token_endpoint_auth_method: "none",
      ...extra,
    }),
  });

  assert.equal(response.status, 201);

  return (await response.json()) as Record<string, string>;
}

/** The hidden field the login page carries its sealed request in. */
function pendingRequest(html: string): string {
  const match = html.match(/name="request" value="([^"]+)"/);

  assert.ok(match, "login page has no request field");

  return match[1]!;
}

/** Walk /authorize and the login form, returning the code the client gets back. */
async function authorize(url: string, clientId: string, challenge: string): Promise<URL> {
  const query = new URLSearchParams({
    response_type: "code",
    client_id: clientId,
    redirect_uri: REDIRECT,
    code_challenge: challenge,
    code_challenge_method: "S256",
    state: "st4te",
  });
  const page = await (await fetch(`${url}/authorize?${query}`)).text();
  const response = await fetch(
    `${url}/oauth/login`,
    form({ request: pendingRequest(page), email: "a@b.test", password: "password123" }),
  );

  assert.equal(response.status, 302);

  return new URL(response.headers.get("location")!);
}

async function token(url: string, fields: Record<string, string>): Promise<{ status: number; body: any }> {
  const response = await fetch(`${url}/token`, form(fields));

  return { status: response.status, body: await response.json() };
}

async function connect(url: string, accessToken: string): Promise<Client> {
  const client = new Client({ name: "test", version: "0" });

  await client.connect(
    new StreamableHTTPClientTransport(new URL(`${url}/mcp`), {
      requestInit: { headers: { Authorization: `Bearer ${accessToken}` } },
    }),
  );

  return client;
}

describe("the hosted server's OAuth flow", () => {
  const api = new FakeApi();
  let hosted: Hosted;
  let revoked = false;

  before(async () => {
    await api.start();

    api
      .route("POST", "/auth/login", (body) =>
        body.password === "password123"
          ? { json: { token: UPSTREAM, user: { id: 1 } } }
          : { status: 422, json: { message: "These credentials do not match.", errors: { email: ["no"] } } },
      )
      .route("GET", "/auth/me", (_body, { auth }) =>
        auth === `Bearer ${UPSTREAM}` && !revoked
          ? { json: { user: { id: 1, email: "a@b.test", plan: "premium" } } }
          : { status: 401, json: { message: "Unauthenticated." } },
      );

    hosted = await host(api);
  });

  after(async () => {
    await hosted.stop();
    await api.stop();
  });

  it("advertises itself as a protected resource with its own authorization server", async () => {
    const response = await fetch(`${hosted.url}/.well-known/oauth-protected-resource/mcp`);
    const metadata = (await response.json()) as { resource: string; authorization_servers: string[] };

    assert.equal(metadata.resource, `${hosted.url}/mcp`);
    assert.ok(metadata.authorization_servers.some((server) => server.startsWith(hosted.url)));
  });

  it("answers an unauthenticated MCP request with 401 and where to authenticate", async () => {
    const response = await fetch(`${hosted.url}/mcp`, { method: "POST" });

    assert.equal(response.status, 401);
    assert.match(
      response.headers.get("www-authenticate") ?? "",
      /resource_metadata=".*\/\.well-known\/oauth-protected-resource\/mcp"/,
    );
  });

  it("shows who is asking and where the answer goes before anyone signs in", async () => {
    const { client_id } = await register(hosted.url);
    const query = new URLSearchParams({
      response_type: "code",
      client_id: client_id!,
      redirect_uri: REDIRECT,
      code_challenge: pkce().challenge,
      code_challenge_method: "S256",
    });
    const page = await (await fetch(`${hosted.url}/authorize?${query}`)).text();

    assert.match(page, /Claude/);
    assert.match(page, /claude\.ai/);
    assert.match(page, /type="password"/);
  });

  it("re-shows the form on a wrong password instead of redirecting", async () => {
    const { client_id } = await register(hosted.url);
    const query = new URLSearchParams({
      response_type: "code",
      client_id: client_id!,
      redirect_uri: REDIRECT,
      code_challenge: pkce().challenge,
      code_challenge_method: "S256",
    });
    const page = await (await fetch(`${hosted.url}/authorize?${query}`)).text();
    const response = await fetch(
      `${hosted.url}/oauth/login`,
      form({ request: pendingRequest(page), email: "a@b.test", password: "wrong-password" }),
    );

    assert.equal(response.status, 401);
    assert.match(await response.text(), /do not match/);
  });

  it("rejects a login form whose sealed request was tampered with", async () => {
    const response = await fetch(
      `${hosted.url}/oauth/login`,
      form({ request: "bm90LXNlYWxlZA", email: "a@b.test", password: "password123" }),
    );

    assert.equal(response.status, 400);
  });

  it("signs in, exchanges the code once, and calls tools as that user", async () => {
    const { client_id } = await register(hosted.url);
    const { verifier, challenge } = pkce();
    const redirect = await authorize(hosted.url, client_id!, challenge);

    assert.equal(`${redirect.origin}${redirect.pathname}`, REDIRECT);
    assert.equal(redirect.searchParams.get("state"), "st4te");

    const code = redirect.searchParams.get("code")!;
    const grant = {
      grant_type: "authorization_code",
      code,
      code_verifier: verifier,
      client_id: client_id!,
      redirect_uri: REDIRECT,
    };
    const issued = await token(hosted.url, grant);

    assert.equal(issued.status, 200);
    assert.equal(issued.body.token_type.toLowerCase(), "bearer");
    assert.ok(issued.body.refresh_token);
    // The access token is sealed: the Laravel token inside it is not readable.
    assert.ok(!issued.body.access_token.includes(UPSTREAM));

    const replay = await token(hosted.url, grant);

    assert.equal(replay.status, 400);
    assert.equal(replay.body.error, "invalid_grant");

    const client = await connect(hosted.url, issued.body.access_token);
    const names = (await client.listTools()).tools.map((tool) => tool.name);

    assert.ok(!names.includes("login"));

    await client.callTool({ name: "whoami", arguments: {} });

    assert.equal(api.requests.at(-1)?.auth, `Bearer ${UPSTREAM}`);

    await client.close();
  });

  it("refuses a code exchanged with the wrong PKCE verifier", async () => {
    const { client_id } = await register(hosted.url);
    const redirect = await authorize(hosted.url, client_id!, pkce().challenge);
    const issued = await token(hosted.url, {
      grant_type: "authorization_code",
      code: redirect.searchParams.get("code")!,
      code_verifier: pkce().verifier,
      client_id: client_id!,
      redirect_uri: REDIRECT,
    });

    assert.equal(issued.status, 400);
  });

  it("refreshes, and stops accepting tokens once the Laravel token is revoked", async () => {
    const { client_id } = await register(hosted.url);
    const { verifier, challenge } = pkce();
    const redirect = await authorize(hosted.url, client_id!, challenge);
    const issued = await token(hosted.url, {
      grant_type: "authorization_code",
      code: redirect.searchParams.get("code")!,
      code_verifier: verifier,
      client_id: client_id!,
      redirect_uri: REDIRECT,
    });
    const refreshed = await token(hosted.url, {
      grant_type: "refresh_token",
      refresh_token: issued.body.refresh_token,
      client_id: client_id!,
    });

    assert.equal(refreshed.status, 200);
    assert.notEqual(refreshed.body.access_token, issued.body.access_token);

    revoked = true;

    try {
      const response = await fetch(`${hosted.url}/mcp`, {
        method: "POST",
        headers: { Authorization: `Bearer ${refreshed.body.access_token}` },
      });

      assert.equal(response.status, 401);

      const again = await token(hosted.url, {
        grant_type: "refresh_token",
        refresh_token: refreshed.body.refresh_token,
        client_id: client_id!,
      });

      assert.equal(again.status, 400);
    } finally {
      revoked = false;
    }
  });

  it("refuses a token sealed for a different client", async () => {
    const first = await register(hosted.url);
    const second = await register(hosted.url);
    const { verifier, challenge } = pkce();
    const redirect = await authorize(hosted.url, first.client_id!, challenge);
    const stolen = await token(hosted.url, {
      grant_type: "authorization_code",
      code: redirect.searchParams.get("code")!,
      code_verifier: verifier,
      client_id: second.client_id!,
      redirect_uri: REDIRECT,
    });

    assert.equal(stolen.status, 400);
  });

  it("supports a confidential client without putting its secret in the client id", async () => {
    const client = await register(hosted.url, { token_endpoint_auth_method: "client_secret_post" });

    assert.ok(client.client_secret);

    const { verifier, challenge } = pkce();
    const redirect = await authorize(hosted.url, client.client_id!, challenge);
    const issued = await token(hosted.url, {
      grant_type: "authorization_code",
      code: redirect.searchParams.get("code")!,
      code_verifier: verifier,
      client_id: client.client_id!,
      client_secret: client.client_secret!,
      redirect_uri: REDIRECT,
    });

    assert.equal(issued.status, 200);
  });

  it("rejects a garbage bearer token", async () => {
    const response = await fetch(`${hosted.url}/mcp`, {
      method: "POST",
      headers: { Authorization: "Bearer not-a-real-token" },
    });

    assert.equal(response.status, 401);
  });
});

describe("the hosted login form", () => {
  it("rate-limits password attempts per address", async () => {
    const api = new FakeApi();

    await api.start();
    api.route("POST", "/auth/login", () => ({ status: 422, json: { errors: { email: ["no"] } } }));

    const hosted = await host(api, { loginAttemptsPerWindow: 2 });
    const statuses: number[] = [];

    for (let attempt = 0; attempt < 3; attempt++) {
      const response = await fetch(
        `${hosted.url}/oauth/login`,
        form({ request: "x", email: "a@b.test", password: "wrong-password" }),
      );

      statuses.push(response.status);
    }

    assert.equal(statuses.at(-1), 429);

    await hosted.stop();
    await api.stop();
  });
});
