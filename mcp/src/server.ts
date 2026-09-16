import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

import { ApiClient } from "./client.js";
import type { Config } from "./config.js";
import { registerAiTools } from "./tools/ai.js";
import { registerAuthTools } from "./tools/auth.js";
import { registerTrackerTools } from "./tools/tracker.js";

export const SERVER_NAME = "mission-employed";
export const SERVER_VERSION = "0.1.0";

/** Build a server with every tool registered against one API client. */
export function createServer(config: Config, api: ApiClient = new ApiClient(config)): McpServer {
  const server = new McpServer(
    { name: SERVER_NAME, version: SERVER_VERSION },
    {
      instructions:
        "Mission-Employed is a job-hunting app: a tracker for applications, coding practice, " +
        "interview practice and mock interviews. Applications are the centre of it — read them " +
        "with list_applications and drill in with get_application before changing anything. " +
        "The AI tools (parsing, cover letters, CVs, problems, interviews) need a premium or admin " +
        "account; whoami says which. Ask before deleting anything.",
    },
  );

  registerAuthTools(server, api);
  registerTrackerTools(server, api);
  registerAiTools(server, api);

  return server;
}
