import { createReadStream } from "node:fs";
import { resolve } from "node:path";
import { StringDecoder } from "node:string_decoder";

import type { TraceEvent } from "./types.js";

export type TraceLine =
  | { lineNumber: number; event: TraceEvent }
  | { lineNumber: number; malformed: true };

function isTraceEvent(value: unknown): value is TraceEvent {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }
  const event = value as Partial<TraceEvent>;
  return (
    typeof event.schemaVersion === "string" &&
    typeof event.sessionId === "string" &&
    Number.isSafeInteger(event.sequence) &&
    typeof event.timestamp === "string" &&
    (event.direction === "client_to_server" ||
      event.direction === "server_to_client") &&
    ["request", "notification", "response", "invalid"].includes(
      event.kind ?? "",
    ) &&
    typeof event.byteLength === "number" &&
    Number.isFinite(event.byteLength) &&
    (event.method === undefined || typeof event.method === "string") &&
    (event.toolName === undefined || typeof event.toolName === "string") &&
    (event.id === undefined ||
      event.id === null ||
      typeof event.id === "string" ||
      (typeof event.id === "number" && Number.isFinite(event.id))) &&
    (event.responseStatus === undefined ||
      event.responseStatus === "ok" ||
      event.responseStatus === "error") &&
    (event.durationMs === undefined ||
      (typeof event.durationMs === "number" &&
        Number.isFinite(event.durationMs) &&
        event.durationMs >= 0)) &&
    (event.parseError === undefined || typeof event.parseError === "string") &&
    (event.contentSha256 === undefined ||
      typeof event.contentSha256 === "string")
  );
}

/** Empty lines are ignored. Malformed lines expose only their line number. */
function parseLine(line: string, lineNumber: number): TraceLine | undefined {
  if (line.trim().length === 0) return undefined;
  let parsed: unknown;
  try {
    parsed = JSON.parse(line) as unknown;
  } catch {
    return { lineNumber, malformed: true };
  }
  return isTraceEvent(parsed)
    ? { lineNumber, event: parsed }
    : { lineNumber, malformed: true };
}

export async function* readTrace(
  tracePath: string,
  options: { maxBytes?: number } = {},
): AsyncGenerator<TraceLine> {
  const input = createReadStream(resolve(tracePath));
  const decoder = new StringDecoder("utf8");
  let rest = "";
  let lineNumber = 0;
  let bytes = 0;
  try {
    for await (const rawChunk of input) {
      if (!Buffer.isBuffer(rawChunk))
        throw new Error("Unexpected trace stream data");
      const chunk: Buffer = rawChunk;
      bytes += chunk.length;
      if (options.maxBytes !== undefined && bytes > options.maxBytes) {
        throw new Error(
          "Trace exceeds 10 MiB report limit / 追踪文件超过报告的 10 MiB 限制",
        );
      }
      rest += decoder.write(chunk);
      let newline = rest.indexOf("\n");
      while (newline >= 0) {
        const rawLine = rest.slice(0, newline);
        rest = rest.slice(newline + 1);
        lineNumber += 1;
        const parsed = parseLine(
          rawLine.endsWith("\r") ? rawLine.slice(0, -1) : rawLine,
          lineNumber,
        );
        if (parsed !== undefined) yield parsed;
        newline = rest.indexOf("\n");
      }
    }
    rest += decoder.end();
    if (rest.length > 0) {
      lineNumber += 1;
      const parsed = parseLine(rest, lineNumber);
      if (parsed !== undefined) yield parsed;
    }
  } finally {
    input.destroy();
  }
}
