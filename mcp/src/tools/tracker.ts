import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

import type { ApiClient } from "../client.js";
import { guarded, ok, present } from "./shared.js";

/** The stored values of App\Enums\JobStatus — the exact strings the API takes. */
export const JOB_STATUSES = ["Saved", "Applied", "Interviewing", "Offer", "Rejected"] as const;

/** InterviewStage::TYPES. `system_design` is a real interview round, not the cut drill. */
export const STAGE_TYPES = [
  "phone",
  "technical",
  "system_design",
  "behavioral",
  "onsite",
  "take_home",
] as const;

/** BehavioralAnswer::THEME_IDS. */
export const BEHAVIORAL_THEMES = [
  "weakness",
  "challenge",
  "failure",
  "disagreement",
  "pressure",
  "impact",
] as const;

export const CODING_DIFFICULTIES = ["easy", "medium", "hard"] as const;

/** Laravel resources wrap their payload in `data`; tool callers want the value. */
export function unwrap<T>(payload: unknown): T {
  const body = payload as { data?: unknown };

  return (body && typeof body === "object" && "data" in body ? body.data : payload) as T;
}

const recruiterContact = z
  .object({
    name: z.string().nullable().optional(),
    email: z.string().nullable().optional(),
    linkedin: z.string().nullable().optional(),
  })
  .describe("Recruiter details. Send null for a field to clear it.");

const takeHome = z.object({
  deadline: z.string().nullable().optional(),
  repo: z.string().nullable().optional(),
  status: z.enum(["not_started", "in_progress", "submitted"]).nullable().optional(),
});

const offer = z.object({
  base: z.number().nullable().optional(),
  equity: z.string().nullable().optional(),
  benefits: z.string().nullable().optional(),
  startDate: z.string().nullable().optional(),
});

/**
 * The writable half of an application. Every field is optional here; the create
 * tool adds `company` and `role` as required on top of it.
 */
const applicationFields = {
  location: z.string().nullable().optional(),
  url: z.string().nullable().optional(),
  status: z.enum(JOB_STATUSES).optional().describe("Changing this appends to the status timeline."),
  dateApplied: z.string().nullable().optional().describe("YYYY-MM-DD."),
  notes: z.string().nullable().optional(),
  jobDescription: z.string().nullable().optional(),
  coverLetter: z.string().nullable().optional(),
  tailoredCV: z.string().nullable().optional(),
  nextAction: z.string().nullable().optional(),
  nextActionDue: z.string().nullable().optional().describe("YYYY-MM-DD."),
  recruiterContact: recruiterContact.nullable().optional(),
  takeHome: takeHome.nullable().optional(),
  offer: offer.nullable().optional(),
};

type Application = {
  id: number;
  company: string;
  role: string;
  status: string;
  dateApplied: string;
  nextAction: string;
  nextActionDue: string;
};

export function registerTrackerTools(server: McpServer, api: ApiClient): void {
  server.registerTool(
    "list_applications",
    {
      title: "List job applications",
      description:
        "Every tracked application, newest first, with interview stages and the status timeline. " +
        "Optional filters narrow the list client-side; `brief` returns one line per application " +
        "instead of the full records, which is usually what you want before drilling into one.",
      inputSchema: {
        status: z.enum(JOB_STATUSES).optional().describe("Only applications at this status."),
        company: z.string().optional().describe("Case-insensitive substring match on the company."),
        brief: z
          .boolean()
          .optional()
          .describe("Return id, company, role, status and next action only. Defaults to true."),
      },
      annotations: { readOnlyHint: true },
    },
    guarded(async ({ status, company, brief = true }) => {
      const all = unwrap<Application[]>(await api.request("/applications"));

      const matches = all.filter(
        (application) =>
          (status === undefined || application.status === status) &&
          (company === undefined ||
            application.company.toLowerCase().includes(company.toLowerCase())),
      );

      if (!brief) {
        return ok(matches);
      }

      return ok(
        matches.map(({ id, company: name, role, status: state, dateApplied, nextAction }) => ({
          id,
          company: name,
          role,
          status: state,
          dateApplied,
          nextAction,
        })),
        `${matches.length} of ${all.length} applications.`,
      );
    }),
  );

  server.registerTool(
    "get_application",
    {
      title: "Read one job application",
      description:
        "The full record: notes, job description, stored cover letter and tailored CV, interview " +
        "stages and the status history.",
      inputSchema: { id: z.number().int().describe("The application id.") },
      annotations: { readOnlyHint: true },
    },
    guarded(async ({ id }) => ok(unwrap(await api.request(`/applications/${id}`)))),
  );

  server.registerTool(
    "create_application",
    {
      title: "Track a new job application",
      description:
        "Add an application to the tracker. Only company and role are required; a new application " +
        "starts at status Saved unless you say otherwise. To start from a pasted job posting, call " +
        "`parse_job_description` first and pass its fields in here.",
      inputSchema: {
        company: z.string().describe("The hiring company."),
        role: z.string().describe("The job title."),
        ...applicationFields,
      },
    },
    guarded(async (args) => {
      const created = unwrap<Application>(
        await api.request("/applications", { method: "POST", body: present(args) }),
      );

      return ok(created, `Tracked ${created.company} — ${created.role} as #${created.id}.`);
    }),
  );

  server.registerTool(
    "update_application",
    {
      title: "Update a job application",
      description:
        "Change any subset of an application's fields; anything you leave out is untouched. " +
        "Moving `status` records a dated entry in the application's timeline.",
      inputSchema: {
        id: z.number().int().describe("The application id."),
        company: z.string().optional(),
        role: z.string().optional(),
        ...applicationFields,
      },
    },
    guarded(async ({ id, ...fields }) =>
      ok(
        unwrap(await api.request(`/applications/${id}`, { method: "PATCH", body: present(fields) })),
      ),
    ),
  );

  server.registerTool(
    "delete_application",
    {
      title: "Delete a job application",
      description:
        "Permanently remove an application along with its interview stages and status history.",
      inputSchema: { id: z.number().int().describe("The application id.") },
      annotations: { destructiveHint: true },
    },
    guarded(async ({ id }) => {
      await api.request(`/applications/${id}`, { method: "DELETE" });

      return ok(`Application #${id} deleted.`);
    }),
  );

  server.registerTool(
    "add_interview_stage",
    {
      title: "Add an interview stage",
      description:
        "Schedule or record a round on an application — a phone screen, technical, system design, " +
        "behavioral, onsite or take-home.",
      inputSchema: {
        applicationId: z.number().int(),
        type: z.enum(STAGE_TYPES),
        scheduledAt: z
          .string()
          .nullable()
          .optional()
          .describe("ISO 8601 date-time, or omitted when nothing is booked yet."),
        notes: z.string().nullable().optional(),
      },
    },
    guarded(async ({ applicationId, ...stage }) =>
      ok(
        unwrap(
          await api.request(`/applications/${applicationId}/stages`, {
            method: "POST",
            body: present(stage),
          }),
        ),
      ),
    ),
  );

  server.registerTool(
    "delete_interview_stage",
    {
      title: "Delete an interview stage",
      description: "Remove one round from an application.",
      inputSchema: {
        applicationId: z.number().int(),
        stageId: z.number().int(),
      },
      annotations: { destructiveHint: true },
    },
    guarded(async ({ applicationId, stageId }) => {
      await api.request(`/applications/${applicationId}/stages/${stageId}`, { method: "DELETE" });

      return ok(`Stage #${stageId} deleted.`);
    }),
  );

  server.registerTool(
    "get_profile",
    {
      title: "Read the CV profile",
      description:
        "The base CV, base cover letter, portfolio URL and the two style templates. These are the " +
        "inputs the document generators tailor from.",
      inputSchema: {},
      annotations: { readOnlyHint: true },
    },
    guarded(async () => ok(unwrap(await api.request("/profile")))),
  );

  server.registerTool(
    "update_profile",
    {
      title: "Update the CV profile",
      description: "Save any subset of the CV and cover letter settings.",
      inputSchema: {
        baseCV: z.string().optional().describe("The master CV, as plain text."),
        cvFileName: z.string().optional(),
        baseCoverLetter: z.string().optional(),
        portfolioUrl: z.string().optional(),
        coverLetterTemplate: z.string().optional().describe("Style notes for generated letters."),
        cvTemplate: z.string().optional().describe("Style notes for generated CVs."),
      },
    },
    guarded(async (fields) =>
      ok(unwrap(await api.request("/profile", { method: "PUT", body: present(fields) }))),
    ),
  );

  server.registerTool(
    "list_coding_attempts",
    {
      title: "Coding practice history",
      description: "Every recorded practice attempt, newest first.",
      inputSchema: {},
      annotations: { readOnlyHint: true },
    },
    guarded(async () => ok(unwrap(await api.request("/coding/attempts")))),
  );

  server.registerTool(
    "log_coding_attempt",
    {
      title: "Log a coding practice attempt",
      description: "Append one problem to the practice history.",
      inputSchema: {
        title: z.string(),
        difficulty: z.enum(CODING_DIFFICULTIES),
        topics: z.array(z.string()).optional(),
        completed: z.boolean().optional().describe("Defaults to false."),
        date: z.string().optional().describe("ISO 8601. Defaults to now."),
      },
    },
    guarded(async (attempt) =>
      ok(unwrap(await api.request("/coding/attempts", { method: "POST", body: present(attempt) }))),
    ),
  );

  server.registerTool(
    "list_behavioral_answers",
    {
      title: "Read behavioral prep answers",
      description:
        "The saved STAR bullets for each behavioral theme. These are per account, not per " +
        "application, and feed the interview practice feedback.",
      inputSchema: {},
      annotations: { readOnlyHint: true },
    },
    guarded(async () => ok(unwrap(await api.request("/behavioral-answers")))),
  );

  server.registerTool(
    "save_behavioral_answer",
    {
      title: "Save one behavioral theme",
      description:
        "Replace the bullets stored for a theme — this edits in place rather than appending, and " +
        "an empty list clears the theme.",
      inputSchema: {
        themeId: z.enum(BEHAVIORAL_THEMES),
        bullets: z.array(z.string()).describe("The full set of bullets for this theme."),
      },
    },
    guarded(async ({ themeId, bullets }) =>
      ok(
        unwrap(
          await api.request(`/behavioral-answers/${themeId}`, { method: "PUT", body: { bullets } }),
        ),
      ),
    ),
  );
}
