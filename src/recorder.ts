import { once } from "node:events";
import { randomUUID } from "node:crypto";
import { createWriteStream, type WriteStream } from "node:fs";
import { mkdir } from "node:fs/promises";
import { dirname } from "node:path";

import { classifyMessage, hashContent, requestKey } from "./protocol.js";
import { redactValue } from "./redaction.js";
import { resultIsError } from "./tool-error.js";
import {
  TRACE_SCHEMA_VERSION,
  type CapturePolicy,
  type Direction,
  type PendingRequest,
  type RedactionOptions,
  type TraceEvent,
} from "./types.js";

export interface RecorderOptions extends RedactionOptions {
  capturePolicy?: CapturePolicy;
}

function opposite(direction: Direction): Direction {
  return direction === "client_to_server"
    ? "server_to_client"
    : "client_to_server";
}

export class TraceRecorder {
  readonly #pending = new Map<string, PendingRequest>();
  readonly #redaction: RedactionOptions;
  readonly #capturePolicy: CapturePolicy;
  readonly #stream: WriteStream;
  readonly #sessionId = randomUUID();
  #sequence = 0;
  #closed = false;

  private constructor(
    stream: WriteStream,
    options: RecorderOptions,
    capturePolicy: CapturePolicy,
  ) {
    this.#stream = stream;
    this.#redaction = options;
    this.#capturePolicy = capturePolicy;
  }

  static async create(
    outputPath: string,
    options: RecorderOptions = {},
  ): Promise<TraceRecorder> {
    const capturePolicy = options.capturePolicy ?? "redacted";
    if (capturePolicy !== "redacted" && capturePolicy !== "metadata") {
      throw new Error("Capture policy must be redacted or metadata");
    }
    await mkdir(dirname(outputPath), { recursive: true });
    const stream = createWriteStream(outputPath, {
      flags: "a",
      encoding: "utf8",
    });
    await once(stream, "open");
    return new TraceRecorder(stream, options, capturePolicy);
  }

  observe(direction: Direction, line: string): boolean {
    if (this.#closed) {
      return false;
    }

    const timestamp = new Date().toISOString();
    const observedAtNs = process.hrtime.bigint();
    const byteLength = Buffer.byteLength(line);
    let parsed: unknown;

    try {
      parsed = JSON.parse(line) as unknown;
    } catch {
      return this.#write({
        schemaVersion: TRACE_SCHEMA_VERSION,
        sessionId: this.#sessionId,
        sequence: ++this.#sequence,
        timestamp,
        direction,
        kind: "invalid",
        byteLength,
        capturePolicy: this.#capturePolicy,
        parseError:
          "Invalid JSON; payload omitted to avoid persisting unredacted data.",
        contentSha256: hashContent(line),
      });
    }

    const classified = classifyMessage(parsed);
    if (classified === undefined) {
      return this.#write({
        schemaVersion: TRACE_SCHEMA_VERSION,
        sessionId: this.#sessionId,
        sequence: ++this.#sequence,
        timestamp,
        direction,
        kind: "invalid",
        byteLength,
        capturePolicy: this.#capturePolicy,
        parseError: "Unsupported JSON-RPC 2.0 message shape.",
        contentSha256: hashContent(line),
      });
    }

    const event: TraceEvent = {
      schemaVersion: TRACE_SCHEMA_VERSION,
      sessionId: this.#sessionId,
      sequence: ++this.#sequence,
      timestamp,
      direction,
      kind: classified.kind,
      byteLength,
      capturePolicy: this.#capturePolicy,
      ...("id" in classified ? { id: classified.id } : {}),
      ...(classified.method === undefined ? {} : { method: classified.method }),
      ...(classified.toolName === undefined
        ? {}
        : { toolName: classified.toolName }),
      ...(classified.responseStatus === undefined
        ? {}
        : { responseStatus: classified.responseStatus }),
    };

    if (classified.kind === "request" && classified.id !== undefined) {
      this.#pending.set(`${direction}:${requestKey(classified.id)}`, {
        method: classified.method ?? "unknown",
        startedAtNs: observedAtNs,
        ...(classified.toolName === undefined
          ? {}
          : { toolName: classified.toolName }),
      });
    } else if (classified.kind === "response" && classified.id !== undefined) {
      const pendingKey = `${opposite(direction)}:${requestKey(classified.id)}`;
      const pending = this.#pending.get(pendingKey);
      if (pending !== undefined) {
        this.#pending.delete(pendingKey);
        event.method = pending.method;
        event.durationMs =
          Number(observedAtNs - pending.startedAtNs) / 1_000_000;
        if (pending.toolName !== undefined) {
          event.toolName = pending.toolName;
        }
      }
    }

    // Preserve failure diagnostics even when the message payload is omitted or redacted.
    if (
      event.kind === "response" &&
      event.method === "tools/call" &&
      event.responseStatus === "ok" &&
      resultIsError(parsed)
    ) {
      event.toolError = true;
    }
    if (this.#capturePolicy === "redacted") {
      event.message = redactValue(parsed, this.#redaction);
    }
    return this.#write(event);
  }

  async waitForDrain(): Promise<void> {
    if (!this.#stream.writableNeedDrain) {
      return;
    }
    await once(this.#stream, "drain");
  }

  async close(): Promise<void> {
    if (this.#closed) {
      return;
    }
    this.#closed = true;
    this.#stream.end();
    await once(this.#stream, "close");
  }

  #write(event: TraceEvent): boolean {
    return this.#stream.write(`${JSON.stringify(event)}\n`);
  }
}
