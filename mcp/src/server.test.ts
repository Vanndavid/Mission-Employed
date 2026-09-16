import assert from "node:assert/strict";
import { createServer, type Server } from "node:http";
import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, before, describe, it } from "node:test";

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";

import { ApiClient } from "./client.js";
import { loadConfig, normalizeBaseUrl } from "./config.js";
import { createServer as createMcpServer } from "./server.js";

/** One recorded request, so a test can assert what reached the API. */
type Recorded = { method: string; path: string; body: unknown; auth: string | undefined };

type Route = (body: any) => { status?: number; json: unknown };

/** A stand-in for the Laravel API. Nothing here talks to a real backend. */
class FakeApi {
  readonly requests: Recorded[] = [];
  private readonly routes = new Map<string, Route>();
  private server?: Server;
  private port = 0;

  route(method: string, path: string, handler: Route): this {
    this.routes.set(`${method} ${path}`, handler);

    return this;
  }

  get url(): string {
    return `http://127.0.0.1:${this.port}/api`;
  }

  async start(): Promise<void> {
    this.server = createServer((req, res) => {
      const chunks: Buffer[] = [];

      req.on("data", (chunk: Buffer) => chunks.push(chunk));
      req.on("end", () => {
        const raw = Buffer.concat(chunks).toString();
        const body = raw === "" ? null : JSON.parse(raw);
        const path = (req.url ?? "").replace(/^\/api/, "");

        this.requests.push({
          method: req.method ?? "",
          path,
          body,
          auth: req.headers.authorization,
        });

        const handler = this.routes.get(`${req.method} ${path}`);

        if (!handler) {
          res.writeHead(404, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ message: `No fake route for ${req.method} ${path}` }));

          return;
        }

        const { status = 200, json } = handler(body);

        res.writeHead(status, { "Content-Type": "application/json" });
        res.end(JSON.stringify(json));
      });
    });

    await new Promise<void>((resolve) => {
      this.server!.listen(0, "127.0.0.1", () => {
        const address = this.server!.address();

        this.port = typeof address === "object" && address ? address.port : 0;
        resolve();
      });
    });
  }

  async stop(): Promise<void> {
    await new Promise<void>((resolve) => this.server?.close(() => resolve()));
  }
}

function text(result: CallToolResult): string {
  return result.content
    .filter((part): part is { type: "text"; text: string } => part.type === "text")
    .map((part) => part.text)
    .join("\n");
}

describe("normalizeBaseUrl", () => {
  it("appends /api when the caller gives the site root", () => {
    assert.equal(normalizeBaseUrl("https://example.test"), "https://example.test/api");
    assert.equal(normalizeBaseUrl("https://example.test/"), "https://example.test/api");
  });

  it("leaves an /api root alone", () => {
    assert.equal(normalizeBaseUrl("http://localhost:8000/api"), "http://localhost:8000/api");
  });
});

describe("the MCP server", () => {
  const api = new FakeApi();
  let client: Client;
  let tokenFile: string;

  before(async () => {
    await api.start();

    api
      .route("POST", "/auth/login", () => ({
        json: { token: "test-token", user: { id: 1, email: "a@b.test", plan: "premium" } },
      }))
      .route("GET", "/auth/me", () => ({
        json: { user: { id: 1, email: "a@b.test", role: "user", plan: "premium" } },
      }))
      .route("GET", "/applications", () => ({
        json: {
          data: [
            { id: 1, company: "Acme", role: "Backend", status: "Applied", dateApplied: "2026-01-02", nextAction: "" },
            { id: 2, company: "Globex", role: "Platform", status: "Saved", dateApplied: "", nextAction: "" },
          ],
        },
      }))
      .route("POST", "/applications", (body) => ({
        status: 201,
        json: { data: { id: 3, ...body } },
      }))
      .route("PATCH", "/applications/1", (body) => ({ json: { data: { id: 1, ...body } } }))
      .route("POST", "/ai/job/parse", () => ({
        json: {
          company: "Initech",
          role: "Staff Engineer",
          location: "Remote",
          url: null,
          notes: null,
          jobDescription: "Build things.",
        },
      }))
      .route("POST", "/ai/coding/problem", () => ({
        status: 403,
        json: { message: "Your plan does not include this." },
      }));

    tokenFile = join(await mkdtemp(join(tmpdir(), "me-mcp-")), "token");

    const config = { ...loadConfig({}), baseUrl: api.url, token: null, tokenFile, timeoutMs: 5_000 };
    const server = createMcpServer(config, new ApiClient(config));
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();

    client = new Client({ name: "test", version: "0" });

    await Promise.all([client.connect(clientTransport), server.connect(serverTransport)]);
  });

  after(async () => {
    await client.close();
    await api.stop();
  });

  it("advertises the tracker and AI tools", async () => {
    const names = (await client.listTools()).tools.map((tool) => tool.name);

    for (const expected of [
      "login",
      "whoami",
      "list_applications",
      "create_application",
      "update_application",
      "delete_application",
      "add_interview_stage",
      "parse_job_description",
      "track_job_from_description",
      "generate_cover_letter",
      "mock_interview_turn",
    ]) {
      assert.ok(names.includes(expected), `missing tool ${expected}`);
    }
  });

  it("refuses to call the API before anyone has signed in", async () => {
    const result = (await client.callTool({ name: "whoami", arguments: {} })) as CallToolResult;

    assert.equal(result.isError, true);
    assert.match(text(result), /Not signed in/);
  });

  it("stores the token from login and sends it as a bearer header", async () => {
    await client.callTool({
      name: "login",
      arguments: { email: "a@b.test", password: "password123" },
    });

    assert.equal((await readFile(tokenFile, "utf8")).trim(), "test-token");

    const result = (await client.callTool({ name: "whoami", arguments: {} })) as CallToolResult;

    assert.notEqual(result.isError, true);
    assert.equal(api.requests.at(-1)?.auth, "Bearer test-token");
  });

  it("filters the application list without asking the API to", async () => {
    const result = (await client.callTool({
      name: "list_applications",
      arguments: { status: "Applied" },
    })) as CallToolResult;

    const body = text(result);

    assert.match(body, /1 of 2 applications/);
    assert.match(body, /Acme/);
    assert.doesNotMatch(body, /Globex/);
  });

  it("omits fields the caller left out so a patch stays partial", async () => {
    await client.callTool({
      name: "update_application",
      arguments: { id: 1, status: "Offer" },
    });

    assert.deepEqual(api.requests.at(-1)?.body, { status: "Offer" });
  });

  it("keeps an explicit null so a field can be cleared", async () => {
    await client.callTool({
      name: "update_application",
      arguments: { id: 1, nextActionDue: null },
    });

    assert.deepEqual(api.requests.at(-1)?.body, { nextActionDue: null });
  });

  it("parses a posting and creates the application in one step", async () => {
    const result = (await client.callTool({
      name: "track_job_from_description",
      arguments: { text: "Staff engineer at Initech" },
    })) as CallToolResult;

    assert.match(text(result), /Tracked Initech — Staff Engineer as #3/);

    const created = api.requests.at(-1);

    assert.equal(created?.path, "/applications");
    assert.deepEqual((created?.body as Record<string, unknown>).company, "Initech");
    // Nulls from the parser are kept: they are meaningful "no value" answers.
    assert.equal((created?.body as Record<string, unknown>).url, null);
  });

  it("reports a premium refusal as a readable tool error", async () => {
    const result = (await client.callTool({
      name: "generate_coding_problem",
      arguments: {},
    })) as CallToolResult;

    assert.equal(result.isError, true);
    assert.match(text(result), /Your plan does not include this/);
  });
});
