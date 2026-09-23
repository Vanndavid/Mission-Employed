import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes } from "node:crypto";

import type { Response } from "express";
import type { OAuthRegisteredClientsStore } from "@modelcontextprotocol/sdk/server/auth/clients.js";
import { InvalidGrantError, InvalidTokenError, ServerError } from "@modelcontextprotocol/sdk/server/auth/errors.js";
import type { AuthorizationParams, OAuthServerProvider } from "@modelcontextprotocol/sdk/server/auth/provider.js";
import type { AuthInfo } from "@modelcontextprotocol/sdk/server/auth/types.js";
import type {
  OAuthClientInformationFull,
  OAuthTokenRevocationRequest,
  OAuthTokens,
} from "@modelcontextprotocol/sdk/shared/auth.js";

import { ApiClient, ApiError } from "./client.js";
import type { Config } from "./config.js";

/** Sanctum tokens do not expire; these bound how long a sealed copy of one is usable. */
const ACCESS_TTL = 60 * 60;
const REFRESH_TTL = 90 * 24 * 60 * 60;
const CODE_TTL = 5 * 60;
const LOGIN_TTL = 30 * 60;

export const LOGIN_PATH = "/oauth/login";

type Kind = "client" | "login" | "code" | "access" | "refresh";

/**
 * Authenticated encryption for everything this server hands out. Clients,
 * codes and tokens are sealed blobs rather than rows, so the server keeps no
 * state and a redeploy logs nobody out. The kind is bound in as associated
 * data, so a refresh token can never be replayed as an access token.
 */
export class Sealer {
  private readonly key: Buffer;

  constructor(secret: string) {
    if (secret.length < 32) {
      throw new Error("MCP_OAUTH_SECRET must be at least 32 characters.");
    }

    this.key = createHash("sha256").update(secret).digest();
  }

  seal(kind: Kind, payload: object, ttlSeconds?: number): string {
    const iv = randomBytes(12);
    const cipher = createCipheriv("aes-256-gcm", this.key, iv);
    const exp = ttlSeconds === undefined ? undefined : now() + ttlSeconds;

    cipher.setAAD(Buffer.from(kind));

    const body = Buffer.concat([cipher.update(JSON.stringify({ exp, p: payload })), cipher.final()]);

    return Buffer.concat([iv, cipher.getAuthTag(), body]).toString("base64url");
  }

  /** The payload and its expiry, or null for anything forged, of another kind, or expired. */
  open<T>(kind: Kind, token: string): { payload: T; exp: number | undefined } | null {
    try {
      const raw = Buffer.from(token, "base64url");
      const decipher = createDecipheriv("aes-256-gcm", this.key, raw.subarray(0, 12));

      decipher.setAAD(Buffer.from(kind));
      decipher.setAuthTag(raw.subarray(12, 28));

      const { exp, p } = JSON.parse(
        Buffer.concat([decipher.update(raw.subarray(28)), decipher.final()]).toString(),
      ) as { exp?: number; p: T };

      if (exp !== undefined && exp < now()) {
        return null;
      }

      return { payload: p, exp };
    } catch {
      return null;
    }
  }

  /** A client secret derived from the client id, so it never has to be stored or embedded. */
  secretFor(clientId: string): string {
    return createHmac("sha256", this.key).update(`client-secret:${clientId}`).digest("base64url");
  }
}

type PendingLogin = {
  clientId: string;
  clientName: string | undefined;
  redirectUri: string;
  codeChallenge: string;
  state: string | undefined;
  resource: string | undefined;
};

type Grant = { apiToken: string; clientId: string };

type Code = Grant & { redirectUri: string; codeChallenge: string; resource: string | undefined };

type ClientMetadata = Omit<
  OAuthClientInformationFull,
  "client_id" | "client_id_issued_at" | "client_secret" | "client_secret_expires_at"
>;

export type LoginOutcome =
  | { redirect: string }
  | { status: number; page: string };

/**
 * OAuth 2.1 in front of the Laravel API, for MCP clients that connect by URL —
 * a custom connector in Claude or Cowork. The user signs in with their
 * Mission-Employed password; the Sanctum token that login returns is what the
 * sealed access token carries, so every rule stays enforced in Laravel.
 */
export class MissionEmployedOAuthProvider implements OAuthServerProvider {
  /** Codes are stateless, so single use needs a memory of which ones were spent. */
  private readonly spentCodes = new Map<string, number>();

  constructor(
    private readonly config: Config,
    private readonly sealer: Sealer,
  ) {}

  get clientsStore(): OAuthRegisteredClientsStore {
    return {
      getClient: (clientId) => {
        const opened = clientId.startsWith("mec_")
          ? this.sealer.open<ClientMetadata>("client", clientId.slice(4))
          : null;

        return opened ? this.withCredentials(clientId, opened.payload) : undefined;
      },
      registerClient: (client) => {
        const {
          client_secret: _secret,
          client_secret_expires_at: _expires,
          client_id: _id,
          client_id_issued_at: _issued,
          ...metadata
        } = client as OAuthClientInformationFull;
        const clientId = `mec_${this.sealer.seal("client", metadata)}`;

        return this.withCredentials(clientId, metadata);
      },
    };
  }

  async authorize(
    client: OAuthClientInformationFull,
    params: AuthorizationParams,
    res: Response,
  ): Promise<void> {
    const pending: PendingLogin = {
      clientId: client.client_id,
      clientName: client.client_name,
      redirectUri: params.redirectUri,
      codeChallenge: params.codeChallenge,
      state: params.state,
      resource: params.resource?.href,
    };

    res
      .status(200)
      .type("html")
      .set("Cache-Control", "no-store")
      .send(loginPage(pending, this.sealer.seal("login", pending, LOGIN_TTL)));
  }

  /** The login form's POST: check the password with Laravel, then hand a code back. */
  async completeLogin(request: string, email: string, password: string): Promise<LoginOutcome> {
    const opened = this.sealer.open<PendingLogin>("login", request);

    if (!opened) {
      return {
        status: 400,
        page: messagePage("This sign-in link has expired. Start the connection again from your app."),
      };
    }

    const pending = opened.payload;
    let apiToken: string;

    try {
      ({ token: apiToken } = await new ApiClient({ ...this.config, token: null }).request<{
        token: string;
      }>("/auth/login", { method: "POST", body: { email, password }, anonymous: true }));
    } catch (error) {
      const wrongPassword = error instanceof ApiError && error.status === 422;

      return {
        status: wrongPassword ? 401 : 502,
        page: loginPage(
          pending,
          request,
          wrongPassword
            ? "That email and password do not match."
            : "Could not reach Mission-Employed. Try again in a moment.",
          email,
        ),
      };
    }

    const code: Code = {
      apiToken,
      clientId: pending.clientId,
      redirectUri: pending.redirectUri,
      codeChallenge: pending.codeChallenge,
      resource: pending.resource,
    };
    const target = new URL(pending.redirectUri);

    target.searchParams.set("code", this.sealer.seal("code", code, CODE_TTL));

    if (pending.state !== undefined) {
      target.searchParams.set("state", pending.state);
    }

    return { redirect: target.href };
  }

  async challengeForAuthorizationCode(
    client: OAuthClientInformationFull,
    authorizationCode: string,
  ): Promise<string> {
    return this.openCode(client, authorizationCode).codeChallenge;
  }

  async exchangeAuthorizationCode(
    client: OAuthClientInformationFull,
    authorizationCode: string,
    _codeVerifier?: string,
    redirectUri?: string,
  ): Promise<OAuthTokens> {
    const code = this.openCode(client, authorizationCode);

    if (redirectUri !== undefined && redirectUri !== code.redirectUri) {
      throw new InvalidGrantError("redirect_uri does not match the authorization request.");
    }

    this.spend(authorizationCode);

    return this.issue({ apiToken: code.apiToken, clientId: code.clientId });
  }

  async exchangeRefreshToken(
    client: OAuthClientInformationFull,
    refreshToken: string,
  ): Promise<OAuthTokens> {
    const grant = this.sealer.open<Grant>("refresh", refreshToken)?.payload;

    if (!grant || grant.clientId !== client.client_id) {
      throw new InvalidGrantError("Invalid refresh token.");
    }

    if (!(await this.upstreamAccepts(grant.apiToken))) {
      throw new InvalidGrantError("The Mission-Employed session has been signed out.");
    }

    return this.issue(grant);
  }

  async verifyAccessToken(token: string): Promise<AuthInfo> {
    const opened = this.sealer.open<Grant>("access", token);

    if (!opened) {
      throw new InvalidTokenError("Invalid or expired access token.");
    }

    // Checked against Laravel every time, so signing out in the app (or an
    // admin deleting the token) cuts the connector off at once rather than
    // when the access token happens to expire.
    if (!(await this.upstreamAccepts(opened.payload.apiToken))) {
      throw new InvalidTokenError("The Mission-Employed session has been signed out.");
    }

    return {
      token,
      clientId: opened.payload.clientId,
      scopes: [],
      expiresAt: opened.exp,
      extra: { apiToken: opened.payload.apiToken },
    };
  }

  async revokeToken(
    _client: OAuthClientInformationFull,
    request: OAuthTokenRevocationRequest,
  ): Promise<void> {
    const grant =
      this.sealer.open<Grant>("access", request.token)?.payload ??
      this.sealer.open<Grant>("refresh", request.token)?.payload;

    if (grant) {
      await new ApiClient({ ...this.config, token: grant.apiToken })
        .request("/auth/logout", { method: "POST" })
        .catch(() => undefined);
    }
  }

  private withCredentials(clientId: string, metadata: ClientMetadata): OAuthClientInformationFull {
    const confidential = metadata.token_endpoint_auth_method !== "none";

    return {
      ...metadata,
      client_id: clientId,
      ...(confidential
        ? { client_secret: this.sealer.secretFor(clientId), client_secret_expires_at: 0 }
        : {}),
    };
  }

  private openCode(client: OAuthClientInformationFull, authorizationCode: string): Code {
    const code = this.sealer.open<Code>("code", authorizationCode)?.payload;

    if (!code || code.clientId !== client.client_id || this.spentCodes.has(authorizationCode)) {
      throw new InvalidGrantError("Invalid or expired authorization code.");
    }

    return code;
  }

  private spend(authorizationCode: string): void {
    const at = now();

    for (const [spent, expiry] of this.spentCodes) {
      if (expiry < at) {
        this.spentCodes.delete(spent);
      }
    }

    this.spentCodes.set(authorizationCode, at + CODE_TTL);
  }

  private issue(grant: Grant): OAuthTokens {
    return {
      access_token: this.sealer.seal("access", grant, ACCESS_TTL),
      token_type: "bearer",
      expires_in: ACCESS_TTL,
      refresh_token: this.sealer.seal("refresh", grant, REFRESH_TTL),
    };
  }

  private async upstreamAccepts(apiToken: string): Promise<boolean> {
    try {
      await new ApiClient({ ...this.config, token: apiToken }).request("/auth/me");

      return true;
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) {
        return false;
      }

      throw new ServerError("Could not reach the Mission-Employed API.");
    }
  }
}

function now(): number {
  return Math.floor(Date.now() / 1000);
}

function escape(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function shell(body: string): string {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Connect to Mission-Employed</title>
<style>
  :root { color-scheme: light dark; --bg: #f6f7f9; --card: #fff; --fg: #111827; --muted: #6b7280; --line: #d1d5db; --accent: #4f46e5; --bad: #b91c1c; }
  @media (prefers-color-scheme: dark) { :root { --bg: #0b0d12; --card: #151821; --fg: #e5e7eb; --muted: #9ca3af; --line: #2a2f3a; --accent: #818cf8; --bad: #f87171; } }
  body { margin: 0; min-height: 100vh; display: grid; place-items: center; background: var(--bg); color: var(--fg); font: 15px/1.5 system-ui, sans-serif; }
  main { width: min(380px, calc(100vw - 32px)); background: var(--card); border: 1px solid var(--line); border-radius: 12px; padding: 28px; box-sizing: border-box; }
  h1 { font-size: 20px; margin: 0 0 8px; }
  p { color: var(--muted); margin: 0 0 20px; }
  strong { color: var(--fg); }
  label { display: block; font-size: 13px; margin: 0 0 4px; }
  input { width: 100%; box-sizing: border-box; padding: 9px 11px; margin: 0 0 14px; border: 1px solid var(--line); border-radius: 8px; background: transparent; color: inherit; font: inherit; }
  button { width: 100%; padding: 10px; border: 0; border-radius: 8px; background: var(--accent); color: #fff; font: inherit; font-weight: 600; cursor: pointer; }
  .error { color: var(--bad); margin: 0 0 14px; }
</style>
</head>
<body><main>${body}</main></body>
</html>`;
}

function loginPage(pending: PendingLogin, request: string, error?: string, email = ""): string {
  const who = escape(pending.clientName?.trim() || "An app");
  const host = escape(new URL(pending.redirectUri).host);

  return shell(`
<h1>Connect to Mission-Employed</h1>
<p><strong>${who}</strong> wants to read and update your job tracker. You will be sent back to <strong>${host}</strong>.</p>
${error ? `<p class="error">${escape(error)}</p>` : ""}
<form method="post" action="${LOGIN_PATH}">
  <input type="hidden" name="request" value="${escape(request)}">
  <label for="email">Email</label>
  <input id="email" name="email" type="email" autocomplete="username" required value="${escape(email)}">
  <label for="password">Password</label>
  <input id="password" name="password" type="password" autocomplete="current-password" required>
  <button type="submit">Sign in and allow</button>
</form>`);
}

export function messagePage(message: string): string {
  return shell(`<h1>Connect to Mission-Employed</h1><p>${escape(message)}</p>`);
}
