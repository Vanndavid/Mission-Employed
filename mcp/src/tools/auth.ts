import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

import type { ApiClient } from "../client.js";
import { guarded, ok } from "./shared.js";

/** The parts of GET /api/subscription whoami passes on. */
type Subscription = {
  plan: string;
  planExpiresAt: string | null;
  premiumRequestedAt: string | null;
  requestsPerMinute: number | null;
  features: {
    key: string;
    name: string;
    enabled: boolean;
    limit: number | null;
    period: string;
    used: number;
    resetsAt: string | null;
  }[];
};

/**
 * Signing in and finding out who you are. Everything else in this server needs
 * a token, so these are the tools a fresh client reaches for first.
 */
export function registerAuthTools(
  server: McpServer,
  api: ApiClient,
  { withLogin = true }: { withLogin?: boolean } = {},
): void {
  if (withLogin) {
    registerLoginTools(server, api);
  }

  server.registerTool(
    "whoami",
    {
      title: "Current account",
      description:
        "The signed-in user (id, email, role, effective plan) and what that plan allows: each " +
        "feature, whether it is included, its limit per day/week/month and how much is used. " +
        "Use it to check whether an AI tool is available, and how many uses are left, before " +
        "calling one.",
      inputSchema: {},
      annotations: { readOnlyHint: true },
    },
    guarded(async () => {
      const [{ user }, subscription] = await Promise.all([
        api.request<{ user: unknown }>("/auth/me"),
        api.request<Subscription>("/subscription"),
      ]);

      return ok({
        user,
        plan: subscription.plan,
        planExpiresAt: subscription.planExpiresAt,
        premiumRequestedAt: subscription.premiumRequestedAt,
        requestsPerMinute: subscription.requestsPerMinute,
        // The catalog's descriptions and the plan comparison are for the web
        // page; a model needs what it can call and how often.
        features: subscription.features.map(({ key, name, enabled, limit, period, used, resetsAt }) => ({
          key,
          name,
          enabled,
          limit,
          period,
          used,
          resetsAt,
        })),
      });
    }),
  );
}

function registerLoginTools(server: McpServer, api: ApiClient): void {
  server.registerTool(
    "login",
    {
      title: "Sign in to Mission-Employed",
      description:
        "Exchange an email and password for an API token and remember it for later calls. " +
        "Only needed when the server was not started with MISSION_EMPLOYED_TOKEN set.",
      inputSchema: {
        email: z.string().email().describe("The account's email address."),
        password: z.string().min(8).describe("The account's password."),
      },
    },
    guarded(async ({ email, password }) => {
      const { user } = await api.login(email, password);

      return ok(user, "Signed in. The token is stored for subsequent calls.");
    }),
  );

  server.registerTool(
    "logout",
    {
      title: "Sign out",
      description:
        "Revoke the token this server is using. Other sessions of the same account stay signed in.",
      inputSchema: {},
    },
    guarded(async () => {
      await api.logout();

      return ok("Token revoked.");
    }),
  );
}
