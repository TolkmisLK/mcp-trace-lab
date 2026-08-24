import { createHash } from "node:crypto";

import type { ClassifiedMessage, JsonRpcId } from "./types.js";

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function hasOwn(record: Record<string, unknown>, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(record, key);
}

function readId(record: Record<string, unknown>): JsonRpcId | undefined {
  if (!hasOwn(record, "id")) {
    return undefined;
  }
  const id = record.id;
  return typeof id === "string" || typeof id === "number" || id === null
    ? id
    : undefined;
}

function readToolName(record: Record<string, unknown>): string | undefined {
  if (record.method !== "tools/call" || !isRecord(record.params)) {
    return undefined;
  }
  return typeof record.params.name === "string"
    ? record.params.name
    : undefined;
}

export function classifyMessage(value: unknown): ClassifiedMessage | undefined {
  if (!isRecord(value) || value.jsonrpc !== "2.0") {
    return undefined;
  }

  const id = readId(value);
  if (typeof value.method === "string") {
    const toolName = readToolName(value);
    const base = {
      method: value.method,
      ...(toolName === undefined ? {} : { toolName }),
    };
    return id === undefined
      ? { kind: "notification", ...base }
      : { kind: "request", id, ...base };
  }

  if (id !== undefined && (hasOwn(value, "result") || hasOwn(value, "error"))) {
    return {
      kind: "response",
      id,
      responseStatus: hasOwn(value, "error") ? "error" : "ok",
    };
  }

  return undefined;
}

export function hashContent(content: string): string {
  return createHash("sha256").update(content).digest("hex");
}

export function requestKey(id: JsonRpcId): string {
  return `${typeof id}:${String(id)}`;
}
