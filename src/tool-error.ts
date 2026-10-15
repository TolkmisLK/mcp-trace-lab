import type { TraceEvent } from "./types.js";

/** Tool execution failure is distinct from a JSON-RPC error response. */
export function resultIsError(message: unknown): boolean {
  if (message === null || typeof message !== "object" || Array.isArray(message))
    return false;
  const result = (message as Record<string, unknown>).result;
  return (
    result !== null &&
    typeof result === "object" &&
    !Array.isArray(result) &&
    (result as Record<string, unknown>).isError === true
  );
}

export function isToolError(event: TraceEvent): boolean {
  return (
    event.kind === "response" &&
    event.method === "tools/call" &&
    event.responseStatus === "ok" &&
    (event.toolError === true || resultIsError(event.message))
  );
}
