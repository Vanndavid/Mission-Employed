import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

/**
 * Reading email is not something this server does. The client already has a
 * mail connector (Gmail in Claude, Cowork and Claude Desktop) with the user's
 * own consent attached; this prompt tells the model how to join the two, so no
 * mailbox credential ever reaches Mission-Employed.
 */
export function syncJobEmailsPrompt(since: string, apply: boolean): string {
  return `Bring my Mission-Employed job tracker up to date from my email.

1. Search my inbox with the mail tools you have (Gmail or similar) for job-hunt email from the last ${since}: application confirmations, recruiter outreach, interview invitations and scheduling, take-home assignments, offers, and rejections. Skip newsletters, job alerts and marketing. If you have no mail tool, say so and stop.

2. Call list_applications once and match each email to an application by company (and role, when a company has several). Read an application with get_application before changing it.

3. Work out what each email means for the tracker:
   - Confirmation that I applied to a job that is not tracked → create_application with status Applied, dateApplied set to the email's date, and source "email".
   - Interview invitation or scheduling → add_interview_stage with the right type and scheduledAt when a time is given, and status Interviewing if it is earlier than that.
   - Take-home → update_application with takeHome (deadline when stated).
   - Offer → status Offer. Rejection → status Rejected.
   - Recruiter name or email I do not have yet → recruiterContact.
   Status only ever moves forward: Saved → Applied → Interviewing → Offer. Rejected can follow any of them. Never move a status backwards. Pass statusDate as the email's date so the timeline is dated correctly.

4. Record every email you act on with append_application_note, one line saying what happened, with ref set to "gmail:<message id>" (or the equivalent id from your mail tool). A ref already on the application means that email was handled on an earlier run — skip it entirely.

${
  apply
    ? "5. Apply the changes, then give me a short summary grouped by company."
    : "5. Before changing anything, show me the proposed changes as a table (company, email, change). Apply them only after I confirm, then summarise what was done."
}

Do not delete anything, and never copy an email's full body into the tracker.`;
}

export function registerPrompts(server: McpServer): void {
  server.registerPrompt(
    "sync_job_emails",
    {
      title: "Update the tracker from my email",
      description:
        "Read recent job-hunt email with your mail connector and bring the tracker up to date: " +
        "new applications, interviews, offers and rejections.",
      argsSchema: {
        since: z.string().optional().describe('How far back to look, e.g. "7 days". Defaults to 7 days.'),
        apply: z
          .string()
          .optional()
          .describe('"yes" to apply changes without showing them first. Defaults to review first.'),
      },
    },
    ({ since, apply }) => ({
      messages: [
        {
          role: "user",
          content: {
            type: "text",
            text: syncJobEmailsPrompt(since?.trim() || "7 days", apply?.trim().toLowerCase() === "yes"),
          },
        },
      ],
    }),
  );
}
