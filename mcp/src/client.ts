import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

import type { Config } from "./config.js";

/**
 * An API failure that carries a message safe to hand straight back to the
 * model. The Laravel side deliberately never leaks upstream Gemini detail, so
 * whatever it sends is already fit to show.
 */
export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

type RequestOptions = {
  method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  body?: unknown;
  /** Endpoints that are readable without a token (login, register, health). */
  anonymous?: boolean;
};

export class ApiClient {
  private token: string | null;
  private tokenLoaded = false;

  constructor(private readonly config: Config) {
    this.token = config.token;
    // A token from the environment wins outright and is never overwritten on
    // disk, so a machine configured by env vars behaves predictably.
    this.tokenLoaded = config.token !== null;
  }

  async request<T>(path: string, options: RequestOptions = {}): Promise<T> {
    const { method = "GET", body, anonymous = false } = options;
    const headers: Record<string, string> = { Accept: "application/json" };

    if (!anonymous) {
      const token = await this.currentToken();

      if (!token) {
        throw new ApiError(
          "Not signed in. Call the `login` tool with your Mission-Employed email and password, " +
            "or set MISSION_EMPLOYED_TOKEN in the server environment.",
          401,
        );
      }

      headers.Authorization = `Bearer ${token}`;
    }

    if (body !== undefined) {
      headers["Content-Type"] = "application/json";
    }

    const response = await fetch(`${this.config.baseUrl}${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(this.config.timeoutMs),
    }).catch((cause: unknown) => {
      throw new ApiError(
        `Could not reach the Mission-Employed API at ${this.config.baseUrl}: ${describe(cause)}`,
        0,
      );
    });

    const payload = await readJson(response);

    if (!response.ok) {
      throw new ApiError(explain(response.status, payload), response.status);
    }

    return payload as T;
  }

  /** Exchange credentials for a bearer token and remember it. */
  async login(email: string, password: string): Promise<{ token: string; user: unknown }> {
    const result = await this.request<{ token: string; user: unknown }>("/auth/login", {
      method: "POST",
      body: { email, password },
      anonymous: true,
    });

    await this.storeToken(result.token);

    return result;
  }

  async logout(): Promise<void> {
    await this.request("/auth/logout", { method: "POST" });
    await this.storeToken(null);
  }

  private async currentToken(): Promise<string | null> {
    if (!this.tokenLoaded) {
      this.token = await readFile(this.config.tokenFile, "utf8")
        .then((contents) => contents.trim() || null)
        .catch(() => null);
      this.tokenLoaded = true;
    }

    return this.token;
  }

  private async storeToken(token: string | null): Promise<void> {
    this.token = token;
    this.tokenLoaded = true;

    if (this.config.token !== null) {
      // Configured by environment; there is nothing to persist.
      return;
    }

    await mkdir(dirname(this.config.tokenFile), { recursive: true, mode: 0o700 });
    await writeFile(this.config.tokenFile, token ?? "", { mode: 0o600 });
  }
}

async function readJson(response: Response): Promise<unknown> {
  const text = await response.text();

  if (text.trim() === "") {
    return null;
  }

  try {
    return JSON.parse(text);
  } catch {
    return { message: text.slice(0, 500) };
  }
}

/**
 * Turn a Laravel error body into one sentence. 422s are the common case and
 * their field errors are the only part worth showing.
 */
function explain(status: number, payload: unknown): string {
  const body = (payload ?? {}) as { message?: unknown; errors?: unknown };
  const message = typeof body.message === "string" && body.message !== "" ? body.message : null;

  if (status === 401) {
    return "Mission-Employed rejected the token. Call `login` again to get a fresh one.";
  }

  if (status === 403) {
    return (
      message ??
      "Refused: this endpoint needs a premium plan (or the admin role). An admin upgrades a plan by hand."
    );
  }

  if (status === 404) {
    // Laravel's own 404 body names the model class, which tells the caller
    // nothing and reads like an internal error. The API answers 404 rather
    // than 403 for another user's record on purpose, so one wording covers
    // both cases.
    return "No such record — it does not exist, or it belongs to another account.";
  }

  if (status === 422 && isRecord(body.errors)) {
    const fields = Object.entries(body.errors)
      .map(([field, messages]) => `${field}: ${[messages].flat().join(" ")}`)
      .join("; ");

    return `Validation failed — ${fields}`;
  }

  return message ?? `The API returned HTTP ${status}.`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function describe(cause: unknown): string {
  if (cause instanceof Error) {
    return cause.name === "TimeoutError" ? "the request timed out" : cause.message;
  }

  return String(cause);
}
