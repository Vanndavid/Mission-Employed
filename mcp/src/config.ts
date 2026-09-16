import { homedir } from "node:os";
import { join } from "node:path";

export type Config = {
  /** Always ends in `/api`, never in a trailing slash. */
  baseUrl: string;
  /** A token from the environment, if one was supplied. */
  token: string | null;
  /** Where `login` stores the token so it survives a restart. */
  tokenFile: string;
  /** Milliseconds before an API call is abandoned. */
  timeoutMs: number;
};

const DEFAULT_BASE_URL = "http://localhost:8000";

/**
 * The API root is accepted either way round — with or without the `/api`
 * prefix — because the deployed app is reached at the site root while a local
 * `php artisan serve` is usually given as `http://localhost:8000`.
 */
export function normalizeBaseUrl(raw: string): string {
  const trimmed = raw.trim().replace(/\/+$/, "");
  const url = trimmed === "" ? DEFAULT_BASE_URL : trimmed;

  return url.endsWith("/api") ? url : `${url}/api`;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const token = env.MISSION_EMPLOYED_TOKEN?.trim();

  return {
    baseUrl: normalizeBaseUrl(env.MISSION_EMPLOYED_API_URL ?? DEFAULT_BASE_URL),
    token: token ? token : null,
    tokenFile:
      env.MISSION_EMPLOYED_TOKEN_FILE?.trim() ||
      join(env.XDG_STATE_HOME?.trim() || join(homedir(), ".config"), "mission-employed", "token"),
    // Model calls are slow — the deployed nginx allows 300s for the same reason.
    timeoutMs: Number(env.MISSION_EMPLOYED_TIMEOUT_MS ?? 300_000),
  };
}
