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

For a client that connects to a URL rather than spawning a command, run the same
server over Streamable HTTP:

```bash
PORT=8787 node dist/index.js --http   # POST http://localhost:8787/mcp
```

The HTTP mode is stateless — a fresh server per request. It has no auth of its
own, so bind it to localhost or put it behind something that does.

## The tools

| | |
| --- | --- |
| **Account** | `login`, `logout`, `whoami` |
| **Tracker** | `list_applications`, `get_application`, `create_application`, `update_application`, `delete_application` |
| **Interview rounds** | `add_interview_stage`, `delete_interview_stage` |
| **CV profile** | `get_profile`, `update_profile` |
| **Practice history** | `list_coding_attempts`, `log_coding_attempt`, `list_behavioral_answers`, `save_behavioral_answer` |
| **AI — jobs** | `parse_job_description`, `track_job_from_description` |
| **AI — documents** | `generate_cover_letter`, `generate_tailored_cv` |
| **AI — coding** | `generate_coding_problem`, `start_coding_tutor`, `send_session_message`, `get_session` |
| **AI — interviews** | `behavioral_practice_question`, `start_mock_interview`, `mock_interview_turn`, `mock_interview_report` |

Everything under **AI** is premium-gated by the API; a free account gets a
readable refusal rather than an error. `whoami` reports the effective plan.

Two API features are deliberately not exposed: evaluating a spoken behavioral
answer, and text-to-speech. Both are audio round trips that only make sense in
the browser.

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
