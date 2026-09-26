# Mission-Employed MCP server

Exposes the Mission-Employed API as [MCP](https://modelcontextprotocol.io) tools,
so an MCP client — Claude Code, Claude Desktop, Cowork — can track a job
application, tailor a CV, or run a mock interview without opening the web app.

It is a thin client over the Laravel API in `../backend`. There is no second copy
of any business rule here: ownership, validation, the status timeline and the
premium gate are all still enforced by the API, and this server's job is to make
its shapes legible to a model.

## Setup

```bash
npm install
npm run build
```

Point it at an API and sign in. Either set a token in the environment:

```bash
MISSION_EMPLOYED_API_URL=https://mission-employed.vanndavidteng.com
MISSION_EMPLOYED_TOKEN=<a Sanctum token>
```

…or leave the token out and call the `login` tool with an email and password.
The token it gets back is written to `~/.config/mission-employed/token` with
`0600` permissions, so signing in survives a restart. See `.env.example` for
every variable.

## Connecting a client

Claude Code:

```bash
claude mcp add mission-employed -- node /absolute/path/to/mcp/dist/index.js
```

Claude Desktop — in `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "mission-employed": {
      "command": "node",
      "args": ["/absolute/path/to/mcp/dist/index.js"],
      "env": { "MISSION_EMPLOYED_API_URL": "http://localhost:8000" }
    }
  }
}
```

### Claude (web and desktop) and Cowork — the hosted connector

The deployed site serves this server as a remote connector with OAuth. In
Claude, go to **Settings → Connectors → Add custom connector** and give it:

```
https://mission-employed.vanndavidteng.com/mcp
```

Claude opens a Mission-Employed sign-in page. Signing in there hands Claude an
OAuth token that wraps your normal API token, so it can do exactly what you can
in the web app, and nothing more. Signing out of that token (or an admin
deleting it) disconnects the connector straight away. Cowork uses the same
connectors.

How it works: `node dist/index.js --http` with `MCP_PUBLIC_URL` set serves
OAuth 2.1 with dynamic client registration and PKCE alongside a stateless
Streamable HTTP endpoint at `/mcp`. It keeps no state. Client ids, codes and
tokens are AES-GCM-sealed with `MCP_OAUTH_SECRET`, so a redeploy signs nobody
out, and rotating the secret signs everybody out. Access tokens last an hour,
and refresh tokens last 90 days, rotating on use. The sign-in form is limited to
10 failed attempts per address per 15 minutes, because Laravel's own login is
not throttled. In the deployed stack this is the `mcp` service
(`Dockerfile.mcp`), and nginx routes `/mcp`, `/authorize`, `/token`,
`/register`, `/revoke`, `/oauth/login` and `/.well-known/oauth-*` to it.

### A plain local HTTP endpoint

Without `MCP_PUBLIC_URL`, `--http` serves the same tools with no auth at all,
using the env or `login` token:

```bash
PORT=8787 node dist/index.js --http   # POST http://localhost:8787/mcp
```

Bind it to localhost only.

## Updating the tracker from email

This server does not read mail, and never sees a mailbox credential. Claude
already has a Gmail connector. Turn it on next to this one and ask:

> Update my job tracker from my email for the last two weeks.

…or pick the **`sync_job_emails`** prompt (it takes `since`, and `apply: yes`
to skip the review step). Claude searches the inbox for confirmations,
interview invitations, take-homes, offers and rejections. It matches each email
to an application and proposes status changes, which only ever move forward.
It logs each email it acted on with `append_application_note` and
`ref: "gmail:<message id>"`. A ref already on an application is skipped, so
running the sync again is a no-op. In Cowork this can run on a schedule.

## The tools

| | |
| --- | --- |
| **Account** | `login`, `logout`, `whoami` |
| **Tracker** | `list_applications`, `get_application`, `create_application`, `update_application`, `append_application_note`, `delete_application` |
| **Interview rounds** | `add_interview_stage`, `delete_interview_stage` |
| **CV profile** | `get_profile`, `update_profile` |
| **Practice history** | `list_coding_attempts`, `log_coding_attempt`, `list_behavioral_answers`, `save_behavioral_answer` |
| **AI — jobs** | `parse_job_description`, `track_job_from_description` |
| **AI — documents** | `generate_cover_letter`, `generate_tailored_cv` |
| **AI — coding** | `generate_coding_problem`, `start_coding_tutor`, `send_session_message`, `get_session` |
| **AI — interviews** | `behavioral_practice_question`, `start_mock_interview`, `mock_interview_turn`, `mock_interview_report` |

Prompt: `sync_job_emails`, described above. `login` and `logout` exist only in
the local modes: over OAuth the connector owns the token.

Everything under **AI** is premium-gated by the API; a free account gets a
readable refusal rather than an error. `whoami` reports the effective plan.

Three API features are deliberately not exposed: evaluating a spoken behavioral
answer, text-to-speech, and the spoken mock interview over Gemini Live
(`/mock/sessions/{id}/live` and `/exchanges`). All three are audio that only
makes sense in the browser. The mock interview tools here use the typed
`/turns` route, which the browser no longer calls but which stays for them.

### Two conveniences worth knowing

`track_job_from_description` parses a pasted posting and creates the application
in one call — the usual "track this job" request. Use `parse_job_description`
instead when the fields should be reviewed before anything is saved.

`generate_cover_letter` and `generate_tailored_cv` take an `applicationId` and
read the company, role and job description from the tracker and the CV from the
profile, so a normal call is just `{ applicationId: 12, save: true }`.

## Tests

```bash
npm test          # node:test, against a fake API — never hits the network
npm run typecheck
```
