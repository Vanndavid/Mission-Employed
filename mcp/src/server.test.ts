import assert from "node:assert/strict";
import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, before, describe, it } from "node:test";

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";

import { ApiClient } from "./client.js";
import { FakeApi } from "./test/fakeApi.js";
import { loadConfig, normalizeBaseUrl } from "./config.js";
import { createServer as createMcpServer } from "./server.js";

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
  // A stateful record, so a note appended once can be seen on the next read.
  const noted = { id: 5, company: "Hooli", role: "SRE", status: "Applied", notes: "Referred by Sam." };

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
      .route("GET", "/applications/5", () => ({ json: { data: { ...noted } } }))
      .route("PATCH", "/applications/5", (body) => {
        Object.assign(noted, body);

        return { json: { data: { ...noted } } };
      })
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

  it("passes rejection reasons through to the API", async () => {
    const reasons = ["Which of the following statements best describes your right to work in Australia?"];

    await client.callTool({
      name: "update_application",
      arguments: { id: 1, status: "Rejected", rejectionReasons: reasons },
    });

    assert.deepEqual(api.requests.at(-1)?.body, { status: "Rejected", rejectionReasons: reasons });
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

  it("appends a dated note tagged with its source, keeping what was there", async () => {
    const result = (await client.callTool({
      name: "append_application_note",
      arguments: { id: 5, note: "Invited to a phone screen.", ref: "gmail:18c2f", date: "2026-09-20" },
    })) as CallToolResult;

    assert.notEqual(result.isError, true);
    assert.equal(
      noted.notes,
      "Referred by Sam.\n2026-09-20 — Invited to a phone screen. [ref: gmail:18c2f]",
    );
    assert.deepEqual(Object.keys(api.requests.at(-1)?.body as object), ["notes"]);
  });

  it("does nothing when a note with the same ref is already there", async () => {
    const before = api.requests.length;

    const result = (await client.callTool({
      name: "append_application_note",
      arguments: { id: 5, note: "Invited to a phone screen, again.", ref: "gmail:18c2f" },
    })) as CallToolResult;

    assert.match(text(result), /Already recorded/);
    // One read, no write.
    assert.equal(api.requests.length, before + 1);
    assert.equal(api.requests.at(-1)?.method, "GET");
  });

  it("offers a prompt for syncing the tracker from an inbox", async () => {
    const prompts = (await client.listPrompts()).prompts.map((prompt) => prompt.name);

    assert.ok(prompts.includes("sync_job_emails"));

    const prompt = await client.getPrompt({ name: "sync_job_emails", arguments: { since: "14 days" } });
    const body = prompt.messages.map((message) => (message.content as { text: string }).text).join("\n");

    assert.match(body, /14 days/);
    assert.match(body, /append_application_note/);
    assert.match(body, /list_applications/);
    // Seek's rejection email names the screening questions that did not match.
    assert.match(body, /rejectionReasons/);
    assert.match(body, /Application feedback/);
  });
});

describe("a hosted server", () => {
  it("leaves out login and logout, because OAuth owns the token", async () => {
    const config = { ...loadConfig({}), token: "sealed-upstream", tokenFile: "/nonexistent" };
    const server = createMcpServer(config, new ApiClient(config), { hosted: true });
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    const client = new Client({ name: "test", version: "0" });

    await Promise.all([client.connect(clientTransport), server.connect(serverTransport)]);

    const names = (await client.listTools()).tools.map((tool) => tool.name);

    assert.ok(!names.includes("login"));
    assert.ok(!names.includes("logout"));
    assert.ok(names.includes("whoami"));

    await client.close();
  });
});
