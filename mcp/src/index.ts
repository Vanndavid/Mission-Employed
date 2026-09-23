#!/usr/bin/env node
import { createServer as createHttpServer, type IncomingMessage, type ServerResponse } from "node:http";

import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";

import { type Config, loadConfig } from "./config.js";
import { createHostedApp } from "./http.js";
import { createServer } from "./server.js";

/**
 * Two transports. stdio is the normal one — an MCP client spawns this process.
 * `--http` serves the same tools over Streamable HTTP for a client that
 * connects to a URL rather than a command. With MCP_PUBLIC_URL set it is the
 * hosted remote connector, behind OAuth; without it, an unauthenticated
 * endpoint for localhost only.
 */
async function main(): Promise<void> {
  const config = loadConfig();
  const httpFlag = process.argv.includes("--http");

  if (!httpFlag) {
    await createServer(config).connect(new StdioServerTransport());
    // stdout is the protocol channel; anything human-readable goes to stderr.
    console.error(`mission-employed MCP server ready (API: ${config.baseUrl})`);

    return;
  }

  const port = Number(process.env.PORT ?? 8787);
  const publicUrl = process.env.MCP_PUBLIC_URL?.trim();

  if (publicUrl) {
    const secret = process.env.MCP_OAUTH_SECRET?.trim() ?? "";
    const app = createHostedApp(config, { publicUrl: new URL(publicUrl), secret });

    app.listen(port, () => {
      console.error(`mission-employed MCP connector at ${publicUrl}/mcp (API: ${config.baseUrl})`);
    });

    return;
  }

  const http = createHttpServer((req, res) => {
    void handleHttp(req, res, config);
  });

  http.listen(port, () => {
    console.error(`mission-employed MCP server on http://localhost:${port}/mcp (API: ${config.baseUrl})`);
  });
}

/**
 * Stateless: a fresh server and transport per request, so there is no session
 * to lose and no cross-request state to leak between callers.
 */
async function handleHttp(
  req: IncomingMessage,
  res: ServerResponse,
  config: Config,
): Promise<void> {
  if (!req.url?.startsWith("/mcp")) {
    res.writeHead(404).end("Not found");

    return;
  }

  const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });

  res.on("close", () => {
    void transport.close();
  });

  try {
    await createServer(config).connect(transport);
    await transport.handleRequest(req, res);
  } catch (error) {
    console.error("MCP request failed:", error);

    if (!res.headersSent) {
      res.writeHead(500).end("Internal server error");
    }
  }
}

main().catch((error: unknown) => {
  console.error("mission-employed MCP server failed to start:", error);
  process.exit(1);
});
