import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import type { CallToolResult, Tool } from "@modelcontextprotocol/sdk/types.js";

import { ApiClient } from "./client.js";
import { loadConfig } from "./config.js";
import { createServer as createMcpServer } from "./server.js";
import { FakeApi } from "./test/fakeApi.js";

/**
 * The practice modes over MCP: a quiz, code review and system design. The
 * API scores everything and keeps every answer key; these tests prove each
 * tool calls the right route with the user's answer, relays a plan's refusal
 * word for word, and never puts a key in front of the model before the user
 * has answered.
 */

function text(result: CallToolResult): string {
  return result.content
    .filter((part): part is { type: "text"; text: string } => part.type === "text")
    .map((part) => part.text)
    .join("\n");
}

/**
 * Planted in the fake API's "before answering" responses where a key would
 * be if the API ever sent one. The real API never does; the tools pass on only
 * the fields a question is served with, so it could not reach the model even
 * then.
 */
const KEY = "ANSWER-KEY-SENTINEL";

async function connect(api: FakeApi, options: { hosted?: boolean } = {}): Promise<Client> {
  const config = { ...loadConfig({}), baseUrl: api.url, token: "test-token", tokenFile: "/nonexistent", timeoutMs: 5_000 };
  const server = createMcpServer(config, new ApiClient(config), options);
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: "test", version: "0" });

  await Promise.all([client.connect(clientTransport), server.connect(serverTransport)]);

  return client;
}

async function call(client: Client, name: string, args: Record<string, unknown> = {}): Promise<CallToolResult> {
  return (await client.callTool({ name, arguments: args })) as CallToolResult;
}

const SNIPPET_CODE = [
  "def average(xs):",
  "    total = 0",
  "    for x in xs:",
  "        total += x",
  "    return total / len(xs)",
  "",
].join("\n");

const CODE_REVIEW_RESULT = {
  id: 41,
  snippet: { id: 12, language: "python", title: "Average", difficulty: "easy", prompt: "Averages a list.", code: SNIPPET_CODE },
  score: 62,
  maxScore: 100,
  rubricVersion: "cr-1",
  breakdown: {
    detection: { points: 47, max: 70, found: 1, total: 2, severityFound: 2, severityTotal: 3 },
    fixes: { points: 10, max: 20 },
    precision: { points: 5, max: 10, useful: 1, comments: 2 },
  },
  issues: [
    { id: "empty-list", lines: [5, 5], category: "bug", severity: 2, summary: "Divides by zero on an empty list.", fix: "Guard len(xs) == 0.", found: true, comments: [0], fixVerdict: "partial" },
    { id: "builtin", lines: [2, 4], category: "readability", severity: 1, summary: "Reimplements sum().", fix: "Use sum(xs).", found: false, comments: [], fixVerdict: null },
  ],
  bonus: [],
  comments: [
    { line: 5, body: "Crashes on []", issues: ["empty-list"], bonus: false, note: null },
    { line: 1, body: "Needs a docstring", issues: [], bonus: false, note: null },
  ],
  summary: "Mostly fine.",
  takeaway: "Edge cases first.",
  createdAt: "2026-11-26T10:00:00.000Z",
};

const RUBRIC = {
  version: "sd-1",
  traitMax: 4,
  maxScore: 100,
  minWords: 15,
  sections: [{ key: "requirements", label: "Requirements", hint: "What it must do." }],
  traits: [{ key: "requirements", label: "Requirements and scope", weight: 12, sections: ["requirements"], descriptors: ["0", "1", "2", "3", "4"] }],
};

describe("the practice tools", () => {
  const api = new FakeApi();
  let client: Client;
  let tools: Tool[];

  before(async () => {
    await api.start();

    api
      .route("GET", "/practice/quiz/catalog", () => ({
        json: {
          languages: [
            {
              key: "python",
              label: "Python",
              questionCount: 37,
              topics: [{ key: "types", label: "Built-in types & mutability", questionCount: 7 }],
            },
          ],
        },
      }))
      .route("POST", "/practice/quiz/rounds", (body) => ({
        json: {
          language: body.language,
          topic: body.topic,
          questions:
            body.topic === "mistakes"
              ? []
              : [
                  {
                    id: 101,
                    topic: "types",
                    difficulty: "easy",
                    prompt: "What does this print?",
                    code: "print([] == [])",
                    options: ["True", "False", "None", "TypeError"],
                    answer: KEY,
                    explanation: KEY,
                  },
                ],
        },
      }))
      .route("POST", "/practice/quiz/answers", (body) => ({
        json: {
          correct: body.choice === "True",
          answer: "True",
          explanation: "Lists compare by value.",
        },
      }))
      .route("GET", "/practice/quiz/progress", () => ({
        json: {
          language: "python",
          answered: 12,
          correct: 9,
          accuracy: 75,
          openMistakes: 3,
          topics: [{ key: "types", label: "Built-in types & mutability", answered: 4, correct: 3, accuracy: 75, openMistakes: 1 }],
        },
      }))
      .route("GET", "/practice/code-review/next", () => ({
        json: {
          snippet: {
            id: 12,
            language: "python",
            title: "Average",
            difficulty: "easy",
            prompt: "Averages a list.",
            code: SNIPPET_CODE,
            issues: [{ summary: KEY }],
            answer: KEY,
            explanation: KEY,
          },
          reviewedBefore: false,
          total: 3,
          unreviewed: 2,
        },
      }))
      .route("GET", "/practice/code-review/next?language=sql", () => ({
        json: { snippet: null, reviewedBefore: false, total: 0, unreviewed: 0 },
      }))
      .route("POST", "/practice/code-review/12/reviews", () => ({ status: 201, json: CODE_REVIEW_RESULT }))
      .route("GET", "/practice/code-review/reviews/41", () => ({ json: CODE_REVIEW_RESULT }))
      .route("GET", "/practice/system-design/next", () => ({
        json: {
          question: {
            id: 4,
            title: "URL shortener",
            difficulty: "easy",
            prompt: "Design a URL shortener for 100M new links a month.",
            keyPoints: KEY,
            answer: KEY,
            explanation: KEY,
          },
          rubric: RUBRIC,
        },
      }))
      .route("GET", "/practice/system-design/next?difficulty=hard", () => ({
        json: { question: null, rubric: RUBRIC },
      }))
      .route("POST", "/practice/system-design/4/answers", () => ({
        json: {
          attemptId: 77,
          questionId: 4,
          score: 58,
          maxScore: 100,
          rubricVersion: "sd-1",
          traits: [],
          explanation: "Tests read-heavy caching.",
        },
      }))
      .route("POST", "/practice/system-design/5/answers", () => ({
        status: 422,
        json: {
          message: "Write at least 15 words before asking for a score.",
          errors: { sections: ["Write at least 15 words before asking for a score."] },
        },
      }))
      .route("POST", "/practice/questions/101/report", () => ({ status: 201, json: { reported: true } }))
      .route("POST", "/practice/questions/102/report", () => ({
        status: 409,
        json: { message: "You have already reported this question. An admin will look at it.", code: "already_reported" },
      }));

    client = await connect(api);
    tools = (await client.listTools()).tools;
  });

  after(async () => {
    await client.close();
    await api.stop();
  });

  function tool(name: string): Tool {
    const found = tools.find((candidate) => candidate.name === name);

    assert.ok(found, `missing tool ${name}`);

    return found;
  }

  it("advertises a tool for each practice route and none for the admin bank", () => {
    for (const name of [
      "quiz_catalog",
      "start_quiz_round",
      "answer_quiz_question",
      "quiz_progress",
      "next_code_review",
      "submit_code_review",
      "get_code_review",
      "next_system_design",
      "submit_system_design",
      "report_practice_question",
    ]) {
      tool(name);
    }

    const names = tools.map((candidate) => candidate.name);

    assert.ok(!names.some((name) => /admin|draft|publish|generate_question/.test(name)), names.join(", "));
  });

  it("tells the client to ask the user and send the user's own answer, never answering for them", () => {
    for (const name of ["answer_quiz_question", "submit_code_review", "submit_system_design"]) {
      const description = tool(name).description ?? "";

      assert.match(description, /the user's own/i, name);
      assert.match(description, /never [a-z, ]+ for them/i, name);
    }

    for (const name of ["start_quiz_round", "next_code_review", "next_system_design"]) {
      const description = tool(name).description ?? "";

      assert.match(description, /ask the user|let the user/i, name);
      assert.match(description, /before they have (answered|submitted)/i, name);
    }

    assert.match(tool("start_quiz_round").description ?? "", /never reveal/i);
  });

  it("says in the server instructions how practice is run", () => {
    const instructions = client.getInstructions() ?? "";

    assert.match(instructions, /quiz \(free, never metered\), code review and system design/);
    assert.match(instructions, /never answer for them/);
    assert.match(instructions, /code review and\s+system design scoring/);
  });

  it("marks the reads as read-only", () => {
    for (const name of ["quiz_catalog", "quiz_progress", "get_code_review"]) {
      assert.equal(tool(name).annotations?.readOnlyHint, true, name);
    }
  });

  it("reads the quiz catalog", async () => {
    const result = await call(client, "quiz_catalog");

    assert.notEqual(result.isError, true);
    assert.equal(api.requests.at(-1)?.method, "GET");
    assert.equal(api.requests.at(-1)?.path, "/practice/quiz/catalog");
    assert.match(text(result), /Built-in types & mutability/);
  });

  it("starts a round on a topic and passes on no answer or explanation", async () => {
    const result = await call(client, "start_quiz_round", { language: "python", topic: "types" });

    assert.notEqual(result.isError, true);
    assert.equal(api.requests.at(-1)?.path, "/practice/quiz/rounds");
    assert.deepEqual(api.requests.at(-1)?.body, { language: "python", topic: "types" });

    const body = text(result);

    assert.match(body, /What does this print\?/);
    assert.match(body, /"options": \[/);
    assert.doesNotMatch(body, new RegExp(KEY));
    assert.doesNotMatch(body, /"answer"|"explanation"/);
  });

  it("asks for a mixed round when no topic is given", async () => {
    await call(client, "start_quiz_round", { language: "python" });

    assert.deepEqual(api.requests.at(-1)?.body, { language: "python", topic: "mixed" });
  });

  it("says so when a round has nothing to ask", async () => {
    const result = await call(client, "start_quiz_round", { language: "python", topic: "mistakes" });

    assert.notEqual(result.isError, true);
    assert.match(text(result), /No questions/);
  });

  it("sends the user's choice and returns the verdict with the key", async () => {
    const result = await call(client, "answer_quiz_question", { questionId: 101, choice: "False" });

    assert.notEqual(result.isError, true);
    assert.equal(api.requests.at(-1)?.path, "/practice/quiz/answers");
    assert.deepEqual(api.requests.at(-1)?.body, { questionId: 101, choice: "False" });

    const verdict = JSON.parse(text(result).split("\n\n").slice(1).join("\n\n"));

    assert.deepEqual(verdict, { correct: false, answer: "True", explanation: "Lists compare by value." });
    assert.match(text(result), /^Wrong\. The answer is "True"\./);
  });

  it("sends a null choice when the user passes", async () => {
    const result = await call(client, "answer_quiz_question", { questionId: 101, choice: null });

    assert.notEqual(result.isError, true);
    assert.deepEqual(api.requests.at(-1)?.body, { questionId: 101, choice: null });
  });

  it("reads quiz progress for a language", async () => {
    const result = await call(client, "quiz_progress", { language: "python" });

    assert.notEqual(result.isError, true);
    assert.equal(api.requests.at(-1)?.path, "/practice/quiz/progress?language=python");
    assert.match(text(result), /"openMistakes": 3/);
  });

  it("opens a snippet with numbered lines and none of its planted issues", async () => {
    const result = await call(client, "next_code_review");

    assert.notEqual(result.isError, true);
    assert.equal(api.requests.at(-1)?.path, "/practice/code-review/next");

    const body = text(result);

    assert.match(body, /Averages a list\./);
    assert.match(body, /^1 \| def average\(xs\):$/m);
    assert.match(body, /^5 \|     return total \/ len\(xs\)$/m);
    // The trailing newline is not a sixth line: the API counts lines the same way.
    assert.doesNotMatch(body, /^6 \|/m);
    assert.doesNotMatch(body, new RegExp(KEY));
    assert.doesNotMatch(body, /"issues"|"answer"|"explanation"/);
  });

  it("passes the snippet filters on as a query", async () => {
    await call(client, "next_code_review", { language: "python", difficulty: "medium", exclude: 12 });

    assert.equal(api.requests.at(-1)?.path, "/practice/code-review/next?language=python&difficulty=medium&exclude=12");
  });

  it("says so when no snippet matches", async () => {
    const result = await call(client, "next_code_review", { language: "sql" });

    assert.notEqual(result.isError, true);
    assert.match(text(result), /No snippet matches/);
  });

  it("submits the user's line comments and summary and returns the scored review", async () => {
    const comments = [
      { line: 5, body: "Crashes on []" },
      { line: 1, body: "Needs a docstring" },
    ];

    const result = await call(client, "submit_code_review", { snippetId: 12, comments, summary: "Mostly fine." });

    assert.notEqual(result.isError, true);
    assert.equal(api.requests.at(-1)?.method, "POST");
    assert.equal(api.requests.at(-1)?.path, "/practice/code-review/12/reviews");
    assert.deepEqual(api.requests.at(-1)?.body, { comments, summary: "Mostly fine." });
    assert.match(text(result), /^Scored 62\/100: found 1 of 2 planted issues\./);
    assert.match(text(result), /Reimplements sum\(\)/);
  });

  it("leaves the summary out when the user wrote none", async () => {
    await call(client, "submit_code_review", { snippetId: 12, comments: [{ line: 5, body: "Crashes on []" }] });

    assert.deepEqual(api.requests.at(-1)?.body, { comments: [{ line: 5, body: "Crashes on []" }] });
  });

  it("reads a stored review back", async () => {
    const result = await call(client, "get_code_review", { reviewId: 41 });

    assert.notEqual(result.isError, true);
    assert.equal(api.requests.at(-1)?.path, "/practice/code-review/reviews/41");
    assert.match(text(result), /Scored 62\/100/);
  });

  it("opens a scenario with its rubric and none of its key points", async () => {
    const result = await call(client, "next_system_design");

    assert.notEqual(result.isError, true);
    assert.equal(api.requests.at(-1)?.path, "/practice/system-design/next");

    const body = text(result);

    assert.match(body, /100M new links a month/);
    assert.match(body, /"minWords": 15/);
    assert.doesNotMatch(body, new RegExp(KEY));
    assert.doesNotMatch(body, /"keyPoints"|"answer"|"explanation"/);
  });

  it("passes the scenario filters on as a query", async () => {
    await call(client, "next_system_design", { difficulty: "medium", skip: 4 });

    assert.equal(api.requests.at(-1)?.path, "/practice/system-design/next?difficulty=medium&skip=4");
  });

  it("says so when no scenario matches", async () => {
    const result = await call(client, "next_system_design", { difficulty: "hard" });

    assert.notEqual(result.isError, true);
    assert.match(text(result), /No scenario matches/);
  });

  it("submits only the sections the user wrote", async () => {
    const sections = {
      requirements: "Shorten a URL, redirect fast, links never expire, 100M writes a month.",
      high_level: "Stateless API behind a load balancer, a key-value store, a cache in front of reads.",
    };

    const result = await call(client, "submit_system_design", { scenarioId: 4, sections });

    assert.notEqual(result.isError, true);
    assert.equal(api.requests.at(-1)?.method, "POST");
    assert.equal(api.requests.at(-1)?.path, "/practice/system-design/4/answers");
    assert.deepEqual(api.requests.at(-1)?.body, { sections });
    assert.match(text(result), /^Scored 58\/100\./);
    assert.match(text(result), /Tests read-heavy caching/);
  });

  it("relays why an answer could not be scored", async () => {
    const result = await call(client, "submit_system_design", { scenarioId: 5, sections: { api: "POST /links" } });

    assert.equal(result.isError, true);
    assert.match(text(result), /Write at least 15 words before asking for a score\./);
  });

  it("reports a question with the user's reason", async () => {
    const result = await call(client, "report_practice_question", { questionId: 101, reason: "Two options are right." });

    assert.notEqual(result.isError, true);
    assert.equal(api.requests.at(-1)?.path, "/practice/questions/101/report");
    assert.deepEqual(api.requests.at(-1)?.body, { reason: "Two options are right." });
    assert.match(text(result), /Reported/);
  });

  it("relays that a question is already reported", async () => {
    const result = await call(client, "report_practice_question", { questionId: 102, reason: "Still wrong." });

    assert.equal(result.isError, true);
    assert.equal(text(result), "You have already reported this question. An admin will look at it.");
  });

  it("is on the hosted connector too", async () => {
    const hosted = await connect(api, { hosted: true });
    const names = (await hosted.listTools()).tools.map((candidate) => candidate.name);

    assert.ok(names.includes("start_quiz_round"));
    assert.ok(names.includes("submit_system_design"));

    await hosted.close();
  });
});

describe("the practice tools on a plan without the feature", () => {
  const api = new FakeApi();
  let client: Client;

  const premium = (feature: string, label: string) => () => ({
    status: 403,
    json: { message: `${label} is a Premium feature.`, code: "premium_required", feature },
  });

  const quota =
    "You have reached your System design practice limit (20 per day). It resets Fri 27 Nov at 00:00 UTC.";

  before(async () => {
    await api.start();

    api
      .route("GET", "/practice/code-review/next", premium("code_review", "Code review practice"))
      .route("POST", "/practice/code-review/12/reviews", premium("code_review", "Code review practice"))
      .route("GET", "/practice/code-review/reviews/41", premium("code_review", "Code review practice"))
      .route("GET", "/practice/system-design/next", premium("system_design", "System design practice"))
      .route("POST", "/practice/system-design/4/answers", () => ({
        status: 429,
        json: { message: quota, code: "quota_exceeded", feature: "system_design", limit: 20, period: "day" },
      }));

    client = await connect(api);
  });

  after(async () => {
    await client.close();
    await api.stop();
  });

  it("relays a Premium refusal word for word", async () => {
    for (const [name, args] of [
      ["next_code_review", {}],
      ["submit_code_review", { snippetId: 12, comments: [{ line: 1, body: "Off by one." }] }],
      ["get_code_review", { reviewId: 41 }],
    ] as const) {
      const result = await call(client, name, args);

      assert.equal(result.isError, true, name);
      assert.equal(text(result), "Code review practice is a Premium feature.", name);
    }

    const result = await call(client, "next_system_design");

    assert.equal(result.isError, true);
    assert.equal(text(result), "System design practice is a Premium feature.");
  });

  it("relays a used-up allowance word for word", async () => {
    const result = await call(client, "submit_system_design", {
      scenarioId: 4,
      sections: { requirements: "Fifteen words or more about what the system must do and how fast it must be." },
    });

    assert.equal(result.isError, true);
    assert.equal(text(result), quota);
  });
});
