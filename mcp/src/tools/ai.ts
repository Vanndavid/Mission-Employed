import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

import type { ApiClient } from "../client.js";
import { fail, guarded, ok, present } from "./shared.js";
import { CODING_DIFFICULTIES, unwrap } from "./tracker.js";

/**
 * The model-backed half of the product. Every route behind these tools is
 * premium-gated by the API, so a free account gets a 403 the tools report as a
 * plain message rather than a crash.
 *
 * Two features are deliberately absent: evaluating a spoken behavioral answer
 * and text-to-speech. Both are audio round trips that only make sense in the
 * browser, and neither has anything useful to say to a text client.
 */

type ParsedJob = {
  company: string | null;
  role: string | null;
  location: string | null;
  url: string | null;
  notes: string | null;
  jobDescription: string | null;
};

type Application = {
  id: number;
  company: string;
  role: string;
  jobDescription: string;
};

type Profile = { baseCV: string; portfolioUrl: string; coverLetterTemplate: string; cvTemplate: string };

/** The document generators take the same four inputs, gathered the same way. */
const documentInput = {
  applicationId: z
    .number()
    .int()
    .optional()
    .describe("Fill company, role and job description from this tracked application."),
  company: z.string().optional().describe("Overrides the application's company."),
  role: z.string().optional().describe("Overrides the application's role."),
  jobDescription: z.string().optional().describe("Overrides the application's job description."),
  cv: z.string().optional().describe("The source CV. Defaults to the profile's base CV."),
  template: z.string().optional().describe("Style notes. Defaults to the profile's template."),
  save: z
    .boolean()
    .optional()
    .describe("Store the result on the application. Requires applicationId. Defaults to false."),
};

export function registerAiTools(server: McpServer, api: ApiClient): void {
  server.registerTool(
    "parse_job_description",
    {
      title: "Parse a job posting",
      description:
        "Turn a pasted job description — or a one-line note like \"applied to Acme as a backend " +
        "engineer\" — into tracker fields: company, role, location, url, notes, jobDescription. " +
        "Nothing is saved; pass the result to `create_application` to track it.",
      inputSchema: { text: z.string().describe("The pasted posting or note.") },
    },
    guarded(async ({ text }) =>
      ok(await api.request<ParsedJob>("/ai/job/parse", { method: "POST", body: { text } })),
    ),
  );

  server.registerTool(
    "track_job_from_description",
    {
      title: "Track a job from a pasted posting",
      description:
        "Parse a job posting and create the application from it in one step. Use this for " +
        "\"track this job\" with a posting pasted in; use `parse_job_description` first instead if " +
        "you want to review the fields before anything is saved.",
      inputSchema: {
        text: z.string().describe("The pasted posting or note."),
        status: z
          .enum(["Saved", "Applied", "Interviewing", "Offer", "Rejected"])
          .optional()
          .describe("Defaults to Saved."),
      },
    },
    guarded(async ({ text, status }) => {
      const parsed = await api.request<ParsedJob>("/ai/job/parse", {
        method: "POST",
        body: { text },
      });

      if (!parsed.company || !parsed.role) {
        return fail(
          "The posting did not yield both a company and a role, which the tracker requires. " +
            `Got company=${JSON.stringify(parsed.company)}, role=${JSON.stringify(parsed.role)}. ` +
            "Call `create_application` directly with the missing field filled in.",
        );
      }

      const created = unwrap<Application>(
        await api.request("/applications", {
          method: "POST",
          body: present({ ...parsed, status }),
        }),
      );

      return ok(created, `Tracked ${created.company} — ${created.role} as #${created.id}.`);
    }),
  );

  server.registerTool(
    "generate_cover_letter",
    {
      title: "Generate a tailored cover letter",
      description:
        "Write a cover letter for one job from the account's base CV. Give an applicationId and " +
        "the company, role and job description are read from the tracker; set save to store the " +
        "letter back on that application.",
      inputSchema: documentInput,
    },
    guarded(async (args) => generateDocument(api, "cover-letter", args)),
  );

  server.registerTool(
    "generate_tailored_cv",
    {
      title: "Generate a tailored CV",
      description:
        "Rewrite the account's base CV for one job. Give an applicationId and the company, role " +
        "and job description are read from the tracker; set save to store the CV back on that " +
        "application.",
      inputSchema: documentInput,
    },
    guarded(async (args) => generateDocument(api, "cv", args)),
  );

  server.registerTool(
    "generate_coding_problem",
    {
      title: "Generate a coding practice problem",
      description:
        "A software engineering problem with worked examples and topic tags. Record an attempt " +
        "afterwards with `log_coding_attempt`.",
      inputSchema: {
        difficulty: z.enum(CODING_DIFFICULTIES).optional().describe("Defaults to easy."),
      },
    },
    guarded(async ({ difficulty }) =>
      ok(await api.request("/ai/coding/problem", { method: "POST", body: present({ difficulty }) })),
    ),
  );

  server.registerTool(
    "start_coding_tutor",
    {
      title: "Open a coding tutor session",
      description:
        "Start a tutoring conversation about one problem. No model call happens here — send the " +
        "first question with `send_session_message` using the returned session id.",
      inputSchema: {
        problemTitle: z.string(),
        problemDescription: z.string(),
      },
    },
    guarded(async (body) => {
      const { session } = await api.request<{ session: { id: number } }>("/ai/coding/sessions", {
        method: "POST",
        body,
      });

      return ok(session, `Tutor session #${session.id} opened.`);
    }),
  );

  server.registerTool(
    "send_session_message",
    {
      title: "Send a message to a tutor session",
      description:
        "One turn of a stored chat session. The whole transcript is replayed server-side, so the " +
        "session remembers everything said so far. Mock interviews use `mock_interview_turn` instead.",
      inputSchema: {
        sessionId: z.number().int(),
        message: z.string(),
      },
    },
    guarded(async ({ sessionId, message }) => {
      const result = await api.request<{ text: string }>(`/ai/sessions/${sessionId}/messages`, {
        method: "POST",
        body: { message },
      });

      return ok(result.text);
    }),
  );

  server.registerTool(
    "get_session",
    {
      title: "Read a session transcript",
      description: "The stored session and every message in it, so a conversation can be resumed.",
      inputSchema: { sessionId: z.number().int() },
      annotations: { readOnlyHint: true },
    },
    guarded(async ({ sessionId }) =>
      ok(
        (await api.request<{ session: unknown }>(`/ai/sessions/${sessionId}`)).session,
      ),
    ),
  );

  server.registerTool(
    "behavioral_practice_question",
    {
      title: "Get an interview practice question",
      description:
        "One behavioral question on a theme such as weakness, challenge, failure, disagreement, " +
        "pressure or impact. Scoring a spoken answer is a browser-only feature and is not exposed here.",
      inputSchema: { theme: z.string().describe("The theme to ask about.") },
    },
    guarded(async ({ theme }) => {
      const { text } = await api.request<{ text: string }>("/ai/behavioral/prompt", {
        method: "POST",
        body: { theme },
      });

      return ok(text);
    }),
  );

  server.registerTool(
    "start_mock_interview",
    {
      title: "Start a mock interview",
      description:
        "Open a multi-turn mock interview, optionally grounded in a specific company and role. " +
        "Then call `mock_interview_turn` with no answer to get the opening question.",
      inputSchema: {
        company: z.string().optional(),
        role: z.string().optional(),
        jobDescription: z.string().optional(),
        facts: z.string().optional().describe("Background about the candidate to hold the interviewer to."),
      },
    },
    guarded(async (context) => {
      const { session } = await api.request<{ session: { id: number } }>("/ai/mock/sessions", {
        method: "POST",
        body: { companyContext: present(context) },
      });

      return ok(session, `Mock interview #${session.id} started.`);
    }),
  );

  server.registerTool(
    "mock_interview_turn",
    {
      title: "Answer a mock interview question",
      description:
        "Submit the candidate's typed answer and get the interviewer's next question. Omit the " +
        "answer on the first call to receive the opening question.",
      inputSchema: {
        sessionId: z.number().int(),
        answer: z.string().optional().describe("The candidate's answer. Omit for the first turn."),
      },
    },
    guarded(async ({ sessionId, answer }) =>
      ok(
        await api.request(`/ai/mock/sessions/${sessionId}/turns`, {
          method: "POST",
          body: present({ answer }),
        }),
      ),
    ),
  );

  server.registerTool(
    "mock_interview_report",
    {
      title: "Close a mock interview with a report",
      description:
        "End the interview and get the written hiring report over the whole transcript. The report " +
        "is stored on the session.",
      inputSchema: { sessionId: z.number().int() },
    },
    guarded(async ({ sessionId }) => {
      const { report } = await api.request<{ report: string }>(
        `/ai/mock/sessions/${sessionId}/report`,
        { method: "POST" },
      );

      return ok(report);
    }),
  );
}

type DocumentArgs = {
  applicationId?: number;
  company?: string;
  role?: string;
  jobDescription?: string;
  cv?: string;
  template?: string;
  save?: boolean;
};

/**
 * Gather the four required inputs from the tracker and the profile, generate,
 * and optionally write the result back onto the application.
 */
async function generateDocument(api: ApiClient, kind: "cover-letter" | "cv", args: DocumentArgs) {
  const application = args.applicationId
    ? unwrap<Application>(await api.request(`/applications/${args.applicationId}`))
    : null;

  const profile = unwrap<Profile>(await api.request("/profile"));

  const company = args.company ?? application?.company ?? "";
  const role = args.role ?? application?.role ?? "";
  const jobDescription = args.jobDescription ?? application?.jobDescription ?? "";
  const cv = args.cv ?? profile.baseCV ?? "";

  const missing = Object.entries({ company, role, jobDescription, cv })
    .filter(([, value]) => value.trim() === "")
    .map(([field]) => field);

  if (missing.length > 0) {
    return fail(
      `Missing ${missing.join(", ")}. Pass the field directly, give an applicationId that has it, ` +
        "or save a base CV with `update_profile`.",
    );
  }

  const { text } = await api.request<{ text: string }>(`/ai/${kind}/generate`, {
    method: "POST",
    body: present({
      company,
      role,
      jobDescription,
      cv,
      template: args.template ?? (kind === "cv" ? profile.cvTemplate : profile.coverLetterTemplate),
      portfolioUrl: profile.portfolioUrl,
    }),
  });

  if (args.save && args.applicationId) {
    await api.request(`/applications/${args.applicationId}`, {
      method: "PATCH",
      body: kind === "cv" ? { tailoredCV: text } : { coverLetter: text },
    });

    return ok(text, `Saved to application #${args.applicationId}.`);
  }

  if (args.save) {
    return ok(text, "Not saved: `save` needs an applicationId to write to.");
  }

  return ok(text);
}
