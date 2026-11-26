import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

import type { ApiClient } from "../client.js";
import { guarded, ok, present } from "./shared.js";

/**
 * The practice modes on Mission Control: a language quiz, code review and
 * system design (`/api/practice/*`, TASKS.md 7.1-7.4). The API picks the
 * questions, scores every answer and keeps every key; nothing here compares
 * an answer or knows one.
 *
 * Each mode is a question the user answers, so the tools are written for a
 * client that asks: show the question, wait for the user, send exactly what
 * they said. The "before answering" tools pass on only the fields a question
 * is served with (as whoami picks its fields), so a key could not reach the
 * model through them even if the API ever sent one.
 *
 * The quiz is free on every plan and never metered. Code review and system
 * design are the `code_review` and `system_design` plan features: opening a
 * snippet or scenario needs the feature but uses none of it, and each scored
 * answer is one use. A refusal is the API's own sentence, passed on as is.
 *
 * Progress and history (`/api/practice/progress`, `/api/practice/attempts`,
 * task 7.5) are reads of the user's own attempts: no plan feature, so an
 * account keeps them whatever its plan is now.
 *
 * The admin question bank (`/api/admin/practice/*`) is not exposed.
 */

/** The stored values of App\Enums\PracticeLanguage. Topics come from the catalog. */
export const PRACTICE_LANGUAGES = ["javascript", "python", "java", "sql"] as const;

/** PracticeQuestion::DIFFICULTIES. */
export const PRACTICE_DIFFICULTIES = ["easy", "medium", "hard"] as const;

/** The stored values of App\Enums\PracticeKind. */
export const PRACTICE_KINDS = ["quiz", "code_review", "system_design"] as const;

/** The stored values of App\Enums\CodeReviewCategory. */
export const CODE_REVIEW_CATEGORIES = [
  "bug",
  "security",
  "performance",
  "concurrency",
  "readability",
  "testing",
] as const;

/** SystemDesignRubric::SECTIONS, in the order an answer is written. */
export const SYSTEM_DESIGN_SECTIONS = [
  "requirements",
  "estimates",
  "api",
  "data_model",
  "high_level",
  "deep_dive",
  "tradeoffs",
] as const;

type QuizQuestion = {
  id: number;
  topic: string;
  difficulty: string;
  prompt: string;
  code: string | null;
  options: string[];
};

type QuizRound = { language: string; topic: string; questions: QuizQuestion[] };

type QuizVerdict = { correct: boolean; answer: string; explanation: string };

type Snippet = { id: number; language: string; title: string; difficulty: string; prompt: string; code: string };

type NextSnippet = { snippet: Snippet | null; reviewedBefore: boolean; total: number; unreviewed: number };

type CodeReviewResult = {
  id: number;
  score: number;
  maxScore: number;
  issues: { found: boolean }[];
};

type Scenario = { id: number; title: string; difficulty: string; prompt: string };

type NextScenario = { question: Scenario | null; rubric: unknown };

type SystemDesignResult = { attemptId: number; score: number; maxScore: number };

type ModeProgress = { attempts: number; averageScore: number | null };

type PracticeProgress = {
  windowDays: number;
  quiz: ModeProgress;
  codeReview: ModeProgress;
  systemDesign: ModeProgress;
};

type AttemptPage = {
  attempts: unknown[];
  meta: { page: number; perPage: number; total: number; lastPage: number };
};

/** A question as a round serves it: never its answer or explanation. */
function servedQuizQuestion({ id, topic, difficulty, prompt, code, options }: QuizQuestion): QuizQuestion {
  return { id, topic, difficulty, prompt, code, options };
}

/** A snippet as it is served: never its planted issues or takeaway. */
function servedSnippet({ id, language, title, difficulty, prompt, code }: Snippet): Snippet {
  return { id, language, title, difficulty, prompt, code };
}

/** A scenario as it is served: never its key points or explanation. */
function servedScenario({ id, title, difficulty, prompt }: Scenario): Scenario {
  return { id, title, difficulty, prompt };
}

/** Append the filters that were given as a query string. */
function withQuery(path: string, params: Record<string, string | number | undefined>): string {
  const query = new URLSearchParams(
    Object.entries(params)
      .filter((entry): entry is [string, string | number] => entry[1] !== undefined)
      .map(([key, value]): [string, string] => [key, String(value)]),
  ).toString();

  return query === "" ? path : `${path}?${query}`;
}

/**
 * The code with the line numbers a review's comments refer to. Lines are
 * counted as the API counts them (CodeReviewItemValidator::lines): trailing
 * newlines are not a line.
 */
export function numberedLines(code: string): string {
  const lines = code.replace(/\n+$/, "").split("\n");
  const width = String(lines.length).length;

  return lines.map((line, index) => `${String(index + 1).padStart(width)} | ${line}`).join("\n");
}

/**
 * The report without each area's `recent` list: the latest ten results per
 * quiz topic, review category and design trait, which the web app's coach
 * ranks by. The averages beside them say the same to a reader, in a fraction
 * of the text.
 */
function withoutRecent(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(withoutRecent);
  }

  if (value !== null && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value)
        .filter(([key]) => key !== "recent")
        .map(([key, item]) => [key, withoutRecent(item)]),
    );
  }

  return value;
}

function plural(count: number, noun: string): string {
  return `${count} ${noun}${count === 1 ? "" : "s"}`;
}

/** One line per mode: how much was practised in the window, and how well. */
function progressLine(report: PracticeProgress): string {
  const mode = (label: string, noun: string, { attempts, averageScore }: ModeProgress, suffix = "") =>
    attempts === 0 || averageScore === null
      ? `${label} none`
      : `${label} ${plural(attempts, noun)} at ${averageScore}%${suffix}`;

  return (
    `Last ${report.windowDays} days: ` +
    [
      mode("quiz", "answer", report.quiz, " on average"),
      mode("code review", "review", report.codeReview),
      mode("system design", "design", report.systemDesign),
    ].join(", ") +
    "."
  );
}

function scoredReview(result: CodeReviewResult): string {
  const found = result.issues.filter((issue) => issue.found).length;

  return `Scored ${result.score}/${result.maxScore}: found ${found} of ${result.issues.length} planted issues.`;
}

export function registerPracticeTools(server: McpServer, api: ApiClient): void {
  server.registerTool(
    "quiz_catalog",
    {
      title: "List the quiz's languages and topics",
      description:
        "The languages the quiz covers, each language's topics (key and label) and how many " +
        "questions each has. The quiz is free on every plan and never counted against it. Start " +
        "a round with `start_quiz_round`, using a topic key from here.",
      inputSchema: {},
      annotations: { readOnlyHint: true },
    },
    guarded(async () => ok(await api.request("/practice/quiz/catalog"))),
  );

  server.registerTool(
    "start_quiz_round",
    {
      title: "Start a quiz round",
      description:
        "Up to ten multiple-choice questions on one language: one topic, `mixed` across every " +
        "topic, or `mistakes` (only questions the user got wrong last time). The questions come " +
        "without answers: the API reveals each one only once it has been answered. Run it as a " +
        "quiz: ask the user one question at a time, with its prompt, any code and the options, " +
        "and wait for their reply. Never answer for them, and never reveal, hint at or reason " +
        "aloud about which option is right before they have answered. Send each reply with " +
        "`answer_quiz_question` before asking the next question.",
      inputSchema: {
        language: z.enum(PRACTICE_LANGUAGES),
        topic: z
          .string()
          .optional()
          .describe(
            "A topic key from `quiz_catalog`, `mixed` for every topic, or `mistakes` to replay the " +
              "questions answered wrong. Defaults to mixed.",
          ),
      },
    },
    guarded(async ({ language, topic = "mixed" }) => {
      const round = await api.request<QuizRound>("/practice/quiz/rounds", {
        method: "POST",
        body: { language, topic },
      });

      const questions = round.questions.map(servedQuizQuestion);

      if (questions.length === 0) {
        return ok(
          { ...round, questions },
          topic === "mistakes"
            ? "No questions to ask: there are no open mistakes in this language."
            : "No questions to ask on that topic yet.",
        );
      }

      return ok(
        { language: round.language, topic: round.topic, questions },
        `${questions.length} ${questions.length === 1 ? "question" : "questions"}. Ask them one at a ` +
          "time and wait for the user's answer to each.",
      );
    }),
  );

  server.registerTool(
    "answer_quiz_question",
    {
      title: "Answer a quiz question",
      description:
        "Send the user's own answer to one quiz question and get the verdict: whether it was " +
        "right, the right option and an explanation, which you then share with them. The answer " +
        "is recorded on the user's account and counts in their quiz progress, so send only the " +
        "option the user chose — never answer for them. `choice` is the exact text of that " +
        "option (options are shuffled each round, so turn a letter or number the user gives into " +
        "the option's text as you showed it), or null when the user passes or does not know, " +
        "which counts as wrong.",
      inputSchema: {
        questionId: z.number().int(),
        choice: z
          .string()
          .nullable()
          .describe("The exact text of the option the user chose, or null if they passed."),
      },
    },
    guarded(async ({ questionId, choice }) => {
      const verdict = await api.request<QuizVerdict>("/practice/quiz/answers", {
        method: "POST",
        body: { questionId, choice },
      });

      return ok(
        verdict,
        verdict.correct ? "Right." : `Wrong. The answer is ${JSON.stringify(verdict.answer)}.`,
      );
    }),
  );

  server.registerTool(
    "quiz_progress",
    {
      title: "Read quiz progress",
      description:
        "The user's quiz accuracy in one language, overall and per topic, with the number of open " +
        "mistakes (questions whose latest answer was wrong). A `mistakes` round from " +
        "`start_quiz_round` replays them.",
      inputSchema: { language: z.enum(PRACTICE_LANGUAGES) },
      annotations: { readOnlyHint: true },
    },
    guarded(async ({ language }) => ok(await api.request(withQuery("/practice/quiz/progress", { language })))),
  );

  server.registerTool(
    "next_code_review",
    {
      title: "Get a snippet to code review",
      description:
        "A 20 to 80 line snippet to review like a pull request: what the code is meant to do, and " +
        "the code with the line numbers comments refer to. Snippets the user has not reviewed " +
        "come first. The issues planted in it are not included: the API reveals them only once a " +
        "review is scored. Show the user the numbered code and ask the user for their review: " +
        "comments on specific lines, and an optional summary. Never point out, hint at or fix the " +
        "problems yourself before they have submitted. Needs the code_review plan feature; " +
        "opening a snippet uses none of its allowance.",
      inputSchema: {
        language: z.enum(PRACTICE_LANGUAGES).optional().describe("Any language when left out."),
        difficulty: z.enum(PRACTICE_DIFFICULTIES).optional().describe("Any difficulty when left out."),
        category: z
          .enum(CODE_REVIEW_CATEGORIES)
          .optional()
          .describe(
            "Only snippets with an issue of this kind planted, to practise a weak category from " +
              "`practice_progress`. Do not tell the user which lines it is on.",
          ),
        exclude: z
          .number()
          .int()
          .optional()
          .describe("The snippet just shown, so another one comes back."),
      },
    },
    guarded(async ({ language, difficulty, category, exclude }) => {
      const next = await api.request<NextSnippet>(
        withQuery("/practice/code-review/next", { language, difficulty, category, exclude }),
      );

      if (next.snippet === null) {
        return ok(
          { ...next, snippet: null },
          "No snippet matches that filter. Try without a language or a difficulty.",
        );
      }

      const snippet = servedSnippet(next.snippet);
      const { code, ...about } = snippet;

      return ok(
        `${JSON.stringify({ ...next, snippet: about }, null, 2)}\n\n` +
          "The code, numbered as comments refer to its lines:\n\n" +
          `\`\`\`${snippet.language}\n${numberedLines(code)}\n\`\`\``,
        `Snippet #${snippet.id}: ${snippet.title}. Show it to the user and ask for their review.`,
      );
    }),
  );

  server.registerTool(
    "submit_code_review",
    {
      title: "Submit a code review",
      description:
        "Score the user's own review of a snippet from `next_code_review`: their comments, each " +
        "on a line number of the snippet, and an optional summary, in their words. Never review " +
        "the code for them, and do not add, sharpen or reword their comments. The API matches " +
        "the comments against the snippet's planted issues and returns the score out of 100 with " +
        "its breakdown, every planted issue (found or missed, with its fix), which comments found " +
        "something and the takeaway; walk the user through it. Each scored review is one use of " +
        "the code_review plan feature.",
      inputSchema: {
        snippetId: z.number().int().describe("The snippet's id from `next_code_review`."),
        comments: z
          .array(
            z.object({
              line: z.number().int().describe("The 1-based line the comment is on."),
              body: z.string().describe("The user's comment, as they wrote it."),
            }),
          )
          .describe("The user's line comments."),
        summary: z.string().optional().describe("The user's overall summary, if they wrote one."),
      },
    },
    guarded(async ({ snippetId, comments, summary }) => {
      const result = await api.request<CodeReviewResult>(`/practice/code-review/${snippetId}/reviews`, {
        method: "POST",
        body: present({ comments, summary }),
      });

      return ok(result, scoredReview(result));
    }),
  );

  server.registerTool(
    "get_code_review",
    {
      title: "Read a scored code review",
      description:
        "A code review the user submitted earlier, as it was scored: the same shape " +
        "`submit_code_review` returns. Needs the code_review plan feature; reading uses none of " +
        "its allowance.",
      inputSchema: { reviewId: z.number().int().describe("The review's id, `id` in a scored review.") },
      annotations: { readOnlyHint: true },
    },
    guarded(async ({ reviewId }) => {
      const result = await api.request<CodeReviewResult>(`/practice/code-review/reviews/${reviewId}`);

      return ok(result, scoredReview(result));
    }),
  );

  server.registerTool(
    "next_system_design",
    {
      title: "Get a system design scenario",
      description:
        "A system design scenario with real scale numbers, and the rubric it is scored against: " +
        "seven sections to write (requirements, estimates, api, data_model, high_level, " +
        "deep_dive, tradeoffs), each with a hint, and the traits rated, with what each rating " +
        "means. Scenarios the user has not answered come first. The expected key points are not " +
        "included: they come back only with a scored answer. Present the scenario and the " +
        "sections and let the user write their design. Never draft it, outline it or suggest " +
        "what to cover before they have submitted. Needs the system_design plan feature; reading " +
        "a scenario uses none of its allowance.",
      inputSchema: {
        difficulty: z.enum(PRACTICE_DIFFICULTIES).optional().describe("Any difficulty when left out."),
        skip: z
          .number()
          .int()
          .optional()
          .describe("The scenario just shown, so another one comes back."),
      },
    },
    guarded(async ({ difficulty, skip }) => {
      const next = await api.request<NextScenario>(withQuery("/practice/system-design/next", { difficulty, skip }));

      if (next.question === null) {
        return ok({ ...next, question: null }, "No scenario matches that difficulty. Try another one.");
      }

      const question = servedScenario(next.question);

      return ok(
        { question, rubric: next.rubric },
        `Scenario #${question.id}: ${question.title}. Present it and let the user write each section.`,
      );
    }),
  );

  server.registerTool(
    "submit_system_design",
    {
      title: "Submit a system design answer",
      description:
        "Score the user's own design for a scenario from `next_system_design`. Put what the user " +
        "wrote into the matching sections in their words; never write, complete or polish a " +
        "section for them, and leave out any they skipped. An answer shorter than the rubric's " +
        "minWords in all is refused. Returns the score out of 100, each trait's rating with a " +
        "quote from the answer and an improvement, the key points covered and missed, and what " +
        "the scenario tests; walk the user through it. Each scored answer is one use of the " +
        "system_design plan feature.",
      inputSchema: {
        scenarioId: z.number().int().describe("The scenario's id from `next_system_design`."),
        sections: z
          .object(
            Object.fromEntries(
              SYSTEM_DESIGN_SECTIONS.map((key) => [
                key,
                z.string().optional().describe("The user's own text for this section."),
              ]),
            ) as Record<(typeof SYSTEM_DESIGN_SECTIONS)[number], z.ZodOptional<z.ZodString>>,
          )
          .describe("The user's answer, section by section."),
      },
    },
    guarded(async ({ scenarioId, sections }) => {
      const result = await api.request<SystemDesignResult>(`/practice/system-design/${scenarioId}/answers`, {
        method: "POST",
        body: { sections: present(sections) },
      });

      return ok(result, `Scored ${result.score}/${result.maxScore}.`);
    }),
  );

  server.registerTool(
    "report_practice_question",
    {
      title: "Report a practice question as wrong",
      description:
        "Report a quiz question, code review snippet or system design scenario the user thinks " +
        "is wrong (a wrong answer, an ambiguous prompt, a broken snippet) so an admin reviews it. " +
        "Only when the user says so, with their reason. One open report per question per user.",
      inputSchema: {
        questionId: z.number().int().describe("The question's, snippet's or scenario's id."),
        reason: z.string().describe("What the user says is wrong with it."),
      },
    },
    guarded(async ({ questionId, reason }) => {
      await api.request(`/practice/questions/${questionId}/report`, { method: "POST", body: { reason } });

      return ok(`Reported question #${questionId}. An admin will look at it.`);
    }),
  );

  server.registerTool(
    "practice_progress",
    {
      title: "Read practice progress across the modes",
      description:
        "How practice is going over the last 30 days, per mode: attempts, the average score and " +
        "when it was last practised; the quiz's accuracy per language and topic and its open " +
        "mistakes; code review's found rate per issue category; system design's average per " +
        "rubric trait. Every topic, category and trait is listed, practised or not. Use it to " +
        "say what to practise next: a quiz round on a weak topic (or a `mistakes` round), a code " +
        "review in a weak category, a system design scenario. Free on every plan.",
      inputSchema: {
        recent: z
          .boolean()
          .optional()
          .describe(
            "Also return each topic's, category's and trait's latest ten results (points of " +
              "maxPoints, newest first), however old. Defaults to false.",
          ),
      },
      annotations: { readOnlyHint: true },
    },
    guarded(async ({ recent = false }) => {
      const report = await api.request<PracticeProgress>("/practice/progress");

      return ok(recent ? report : withoutRecent(report), progressLine(report));
    }),
  );

  server.registerTool(
    "list_practice_attempts",
    {
      title: "List practice attempts",
      description:
        "The user's quiz answers, code reviews and system design answers, newest first, twenty a " +
        "page: the mode, what it was on, the score and when. Never the answers themselves; read " +
        "one in full with `get_practice_attempt`. Problems (the coding tutor) keeps its own " +
        "history in `list_coding_attempts`. Free on every plan.",
      inputSchema: {
        kind: z.enum(PRACTICE_KINDS).optional().describe("One mode only. Every mode when left out."),
        page: z.number().int().optional().describe("Defaults to 1."),
      },
      annotations: { readOnlyHint: true },
    },
    guarded(async ({ kind, page }) => {
      const list = await api.request<AttemptPage>(withQuery("/practice/attempts", { kind, page }));
      const { meta } = list;

      return ok(list, `Page ${meta.page} of ${meta.lastPage}, ${plural(meta.total, "attempt")}.`);
    }),
  );

  server.registerTool(
    "get_practice_attempt",
    {
      title: "Read a practice attempt",
      description:
        "One of the user's attempts as it was scored: for a quiz answer the question, their " +
        "choice, the right answer and the explanation; for a code review what " +
        "`submit_code_review` returned; for a system design the scenario, their sections and the " +
        "report. It shows the answer, so do not read back a question the user is about to " +
        "answer again (a `mistakes` round replays questions they missed). Free on every plan.",
      inputSchema: { attemptId: z.number().int().describe("An attempt's id from `list_practice_attempts`.") },
      annotations: { readOnlyHint: true },
    },
    guarded(async ({ attemptId }) => ok(await api.request(`/practice/attempts/${attemptId}`))),
  );
}
