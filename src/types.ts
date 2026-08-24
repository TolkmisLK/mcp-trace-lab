export const TRACE_SCHEMA_VERSION = "1.0" as const;

export type Direction = "client_to_server" | "server_to_client";
export type MessageKind = "request" | "notification" | "response" | "invalid";
export type ResponseStatus = "ok" | "error";
export type JsonRpcId = string | number | null;

export interface TraceEvent {
  schemaVersion: typeof TRACE_SCHEMA_VERSION;
  sessionId: string;
  sequence: number;
  timestamp: string;
  direction: Direction;
  kind: MessageKind;
  byteLength: number;
  method?: string;
  id?: JsonRpcId;
  toolName?: string;
  responseStatus?: ResponseStatus;
  durationMs?: number;
  message?: unknown;
  parseError?: string;
  contentSha256?: string;
}

export interface ClassifiedMessage {
  kind: Exclude<MessageKind, "invalid">;
  method?: string;
  id?: JsonRpcId;
  toolName?: string;
  responseStatus?: ResponseStatus;
}

export interface PendingRequest {
  method: string;
  startedAtNs: bigint;
  toolName?: string;
}

export interface RedactionOptions {
  additionalKeys?: readonly string[];
  placeholder?: string;
}

export interface MethodSummary {
  requests: number;
  notifications: number;
  responses: number;
  errors: number;
  completedDurationsMs: number[];
}

export interface ToolSummary {
  calls: number;
  errors: number;
  completedDurationsMs: number[];
}

export interface TraceSummary {
  schemaVersion: string;
  traceFile: string;
  sessions: number;
  events: number;
  malformedTraceLines: number;
  invalidProtocolMessages: number;
  directions: Record<Direction, number>;
  kinds: Record<MessageKind, number>;
  methods: Record<string, MethodSummary>;
  tools: Record<string, ToolSummary>;
  firstTimestamp?: string;
  lastTimestamp?: string;
}
