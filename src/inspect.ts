import { createReadStream } from "node:fs";
import { basename, resolve } from "node:path";
import { createInterface } from "node:readline";

import {
  TRACE_SCHEMA_VERSION,
  type Direction,
  type MessageKind,
  type MethodSummary,
  type ToolSummary,
  type TraceEvent,
  type TraceSummary,
} from "./types.js";

function emptyMethodSummary(): MethodSummary {
  return {
    requests: 0,
    notifications: 0,
    responses: 0,
    errors: 0,
    completedDurationsMs: [],
  };
}

function emptyToolSummary(): ToolSummary {
  return { calls: 0, errors: 0, completedDurationsMs: [] };
}

function isTraceEvent(value: unknown): value is TraceEvent {
  if (value === null || typeof value !== "object") {
    return false;
  }
  const event = value as Partial<TraceEvent>;
  return (
    typeof event.schemaVersion === "string" &&
    typeof event.sessionId === "string" &&
    typeof event.sequence === "number" &&
    typeof event.timestamp === "string" &&
    (event.direction === "client_to_server" ||
      event.direction === "server_to_client") &&
    ["request", "notification", "response", "invalid"].includes(
      event.kind ?? "",
    )
  );
}

export async function inspectTrace(tracePath: string): Promise<TraceSummary> {
  const absolutePath = resolve(tracePath);
  const summary: TraceSummary = {
    schemaVersion: TRACE_SCHEMA_VERSION,
    traceFile: basename(absolutePath),
    sessions: 0,
    events: 0,
    malformedTraceLines: 0,
    invalidProtocolMessages: 0,
    directions: { client_to_server: 0, server_to_client: 0 },
    kinds: { request: 0, notification: 0, response: 0, invalid: 0 },
    methods: {},
    tools: {},
  };
  const sessionIds = new Set<string>();

  const lines = createInterface({
    input: createReadStream(absolutePath),
    crlfDelay: Infinity,
  });
  for await (const line of lines) {
    if (line.trim().length === 0) {
      continue;
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(line) as unknown;
    } catch {
      summary.malformedTraceLines += 1;
      continue;
    }
    if (!isTraceEvent(parsed)) {
      summary.malformedTraceLines += 1;
      continue;
    }

    const event = parsed;
    sessionIds.add(event.sessionId);
    summary.sessions = sessionIds.size;
    summary.events += 1;
    summary.directions[event.direction] += 1;
    summary.kinds[event.kind] += 1;
    if (event.kind === "invalid") {
      summary.invalidProtocolMessages += 1;
    }
    summary.firstTimestamp ??= event.timestamp;
    summary.lastTimestamp = event.timestamp;

    if (event.method !== undefined) {
      const method = (summary.methods[event.method] ??= emptyMethodSummary());
      if (event.kind === "request") method.requests += 1;
      if (event.kind === "notification") method.notifications += 1;
      if (event.kind === "response") method.responses += 1;
      if (event.responseStatus === "error") method.errors += 1;
      if (event.durationMs !== undefined)
        method.completedDurationsMs.push(event.durationMs);
    }

    if (event.toolName !== undefined) {
      const tool = (summary.tools[event.toolName] ??= emptyToolSummary());
      if (event.kind === "request") tool.calls += 1;
      if (event.responseStatus === "error") tool.errors += 1;
      if (event.durationMs !== undefined)
        tool.completedDurationsMs.push(event.durationMs);
    }
  }

  return summary;
}

function average(values: readonly number[]): number | undefined {
  if (values.length === 0) return undefined;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function formatDuration(values: readonly number[]): string {
  const value = average(values);
  return value === undefined ? "-" : `${value.toFixed(2)} ms`;
}

function sortEntries<T>(record: Record<string, T>): [string, T][] {
  return Object.entries(record).sort(([left], [right]) =>
    left.localeCompare(right),
  );
}

function pad(value: string, width: number): string {
  return value.padEnd(width, " ");
}

export function formatTextSummary(summary: TraceSummary): string {
  const output = [
    "MCP Trace Lab · Trace summary / 追踪摘要",
    `File / 文件: ${summary.traceFile}`,
    `Events / 事件: ${summary.events}`,
    `Sessions / 会话: ${summary.sessions}`,
    `Protocol invalid / 协议无效: ${summary.invalidProtocolMessages}`,
    `Trace parse errors / 追踪解析错误: ${summary.malformedTraceLines}`,
    "",
    "Kinds / 类型",
    `  requests=${summary.kinds.request} notifications=${summary.kinds.notification} responses=${summary.kinds.response} invalid=${summary.kinds.invalid}`,
  ];

  const methods = sortEntries(summary.methods);
  if (methods.length > 0) {
    const width = Math.max(6, ...methods.map(([name]) => name.length));
    output.push("", "Methods / 方法");
    for (const [name, stats] of methods) {
      output.push(
        `  ${pad(name, width)}  req=${stats.requests} notif=${stats.notifications} res=${stats.responses} err=${stats.errors} avg=${formatDuration(stats.completedDurationsMs)}`,
      );
    }
  }

  const tools = sortEntries(summary.tools);
  if (tools.length > 0) {
    const width = Math.max(4, ...tools.map(([name]) => name.length));
    output.push("", "Tools / 工具");
    for (const [name, stats] of tools) {
      output.push(
        `  ${pad(name, width)}  calls=${stats.calls} err=${stats.errors} avg=${formatDuration(stats.completedDurationsMs)}`,
      );
    }
  }

  return `${output.join("\n")}\n`;
}

export function formatJsonSummary(summary: TraceSummary): string {
  return `${JSON.stringify(summary, null, 2)}\n`;
}

export const DIRECTIONS: readonly Direction[] = [
  "client_to_server",
  "server_to_client",
];
export const MESSAGE_KINDS: readonly MessageKind[] = [
  "request",
  "notification",
  "response",
  "invalid",
];
