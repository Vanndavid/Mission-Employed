import express, { type Express, type Request, type Response } from "express";
import { rateLimit } from "express-rate-limit";
import { requireBearerAuth } from "@modelcontextprotocol/sdk/server/auth/middleware/bearerAuth.js";
import { getOAuthProtectedResourceMetadataUrl, mcpAuthRouter } from "@modelcontextprotocol/sdk/server/auth/router.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";

import type { Config } from "./config.js";
import { LOGIN_PATH, MissionEmployedOAuthProvider, Sealer, messagePage } from "./oauth.js";
import { createServer } from "./server.js";

export type HostedOptions = {
  /** Where the site is reached from outside, e.g. https://mission-employed.vanndavidteng.com. */
  publicUrl: URL;
  /** Seals every client id, code and token. Rotating it signs every connector out. */
  secret: string;
  /** Password attempts per address per 15 minutes. Laravel's own login is not throttled. */
  loginAttemptsPerWindow?: number;
};

/**
 * The server as a remote connector: OAuth (with dynamic client registration,
 * which is how Claude and Cowork add a connector by URL) in front of a
 * stateless Streamable HTTP endpoint at /mcp.
 */
export function createHostedApp(config: Config, options: HostedOptions): Express {
  const app = express();
  const provider = new MissionEmployedOAuthProvider(config, new Sealer(options.secret));
  const mcpUrl = new URL("/mcp", options.publicUrl);

  // Behind nginx and Traefik; the rate limiters need the real client address.
  app.set("trust proxy", 2);

  app.get("/mcp-health", (_req, res) => {
    res.json({ status: "ok" });
  });

  app.use(
    mcpAuthRouter({
      provider,
      issuerUrl: options.publicUrl,
      resourceServerUrl: mcpUrl,
      resourceName: "Mission-Employed",
    }),
  );

  app.post(
    LOGIN_PATH,
    rateLimit({
      windowMs: 15 * 60 * 1000,
      limit: options.loginAttemptsPerWindow ?? 10,
      skipSuccessfulRequests: true,
      standardHeaders: "draft-7",
      legacyHeaders: false,
      handler: (_req, res) => {
        res
          .status(429)
          .type("html")
          .send(messagePage("Too many sign-in attempts. Wait a few minutes and try again."));
      },
    }),
    express.urlencoded({ extended: false, limit: "16kb" }),
    async (req: Request, res: Response) => {
      const body = (req.body ?? {}) as Record<string, unknown>;
      const field = (name: string) => (typeof body[name] === "string" ? (body[name] as string) : "");
      const outcome = await provider.completeLogin(field("request"), field("email"), field("password"));

      res.set("Cache-Control", "no-store");

      if ("redirect" in outcome) {
        res.redirect(302, outcome.redirect);

        return;
      }

      res.status(outcome.status).type("html").send(outcome.page);
    },
  );

  const bearer = requireBearerAuth({
    verifier: provider,
    resourceMetadataUrl: getOAuthProtectedResourceMetadataUrl(mcpUrl),
  });

  // Mock interview turns carry long answers; match nginx's body limit.
  app.post("/mcp", bearer, express.json({ limit: "10mb" }), async (req: Request, res: Response) => {
    const apiToken = req.auth?.extra?.apiToken;

    if (typeof apiToken !== "string") {
      res.status(401).end();

      return;
    }

    // Stateless: a fresh server per request, built around this caller's token.
    const server = createServer({ ...config, token: apiToken }, undefined, { hosted: true });
    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });

    res.on("close", () => {
      void transport.close();
      void server.close();
    });

    try {
      await server.connect(transport);
      await transport.handleRequest(req, res, req.body);
    } catch (error) {
      console.error("MCP request failed:", error);

      if (!res.headersSent) {
        res.status(500).json({ jsonrpc: "2.0", error: { code: -32603, message: "Internal error" }, id: null });
      }
    }
  });

  // No sessions, so there is no stream to open and nothing to end.
  app.all("/mcp", bearer, (_req, res) => {
    res
      .status(405)
      .set("Allow", "POST")
      .json({ jsonrpc: "2.0", error: { code: -32000, message: "Method not allowed." }, id: null });
  });

  return app;
}
