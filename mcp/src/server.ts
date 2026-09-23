import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

import { ApiClient } from "./client.js";
import type { Config } from "./config.js";
import { registerPrompts } from "./prompts.js";
import { registerAiTools } from "./tools/ai.js";
import { registerAuthTools } from "./tools/auth.js";
import { registerTrackerTools } from "./tools/tracker.js";

export const SERVER_NAME = "mission-employed";
export const SERVER_VERSION = "0.2.0";

export type ServerOptions = {
  /**
   * Served over OAuth, one server per request with the caller's token already
   * in the config. `login` and `logout` are left out: the token belongs to the
   * OAuth grant, and a tool that swapped it would only confuse the client.
   */
  hosted?: boolean;
};

/** Build a server with every tool registered against one API client. */
export function createServer(
  config: Config,
  api: ApiClient = new ApiClient(config),
  options: ServerOptions = {},
): McpServer {
  const server = new McpServer(
    { name: SERVER_NAME, version: SERVER_VERSION },
    {
      instructions:
        "Mission-Employed is a job-hunting app: a tracker for applications, coding practice, " +
        "interview practice and mock interviews. Applications are the centre of it — read them " +
        "with list_applications and drill in with get_application before changing anything. " +
        "When updating the tracker from email or any other source, record what happened with " +
        "append_application_note and a `ref` so it is never applied twice; the sync_job_emails " +
        "prompt describes the whole routine. " +
        "The AI tools (parsing, cover letters, CVs, problems, interviews) need a premium or admin " +
        "account; whoami says which. Ask before deleting anything.",
    },
  );

  registerAuthTools(server, api, { withLogin: !options.hosted });
  registerTrackerTools(server, api);
  registerAiTools(server, api);
  registerPrompts(server);

  return server;
}
