import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";

import { ApiError } from "../client.js";

/** A successful tool result. Structured data goes back as pretty JSON. */
export function ok(data: unknown, note?: string): CallToolResult {
  const body = typeof data === "string" ? data : JSON.stringify(data, null, 2);

  return { content: [{ type: "text", text: note ? `${note}\n\n${body}` : body }] };
}

/** A failure the model should read and act on, not a transport-level error. */
export function fail(message: string): CallToolResult {
  return { content: [{ type: "text", text: message }], isError: true };
}

/**
 * Wrap a tool handler so an API failure becomes an `isError` result the model
 * can recover from — a thrown error would only surface as a protocol fault.
 */
export function guarded<Args>(
  handler: (args: Args) => Promise<CallToolResult>,
): (args: Args) => Promise<CallToolResult> {
  return async (args) => {
    try {
      return await handler(args);
    } catch (error) {
      if (error instanceof ApiError) {
        return fail(error.message);
      }

      return fail(error instanceof Error ? error.message : String(error));
    }
  };
}

/**
 * Drop keys the caller left out so a PATCH stays partial. `null` is kept: it
 * is how a field is cleared.
 */
export function present<T extends Record<string, unknown>>(input: T): Partial<T> {
  return Object.fromEntries(
    Object.entries(input).filter(([, value]) => value !== undefined),
  ) as Partial<T>;
}
