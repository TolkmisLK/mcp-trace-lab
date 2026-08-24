import assert from "node:assert/strict";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";

import { formatTextSummary, inspectTrace } from "../src/inspect.js";
import { TRACE_SCHEMA_VERSION, type TraceEvent } from "../src/types.js";

describe("inspectTrace", () => {
  it("aggregates methods, tools, errors, and malformed trace lines", async () => {
    const directory = await mkdtemp(join(tmpdir(), "mcp-trace-inspect-"));
    const tracePath = join(directory, "trace.jsonl");
    const base = {
      schemaVersion: TRACE_SCHEMA_VERSION,
      sessionId: "session-1",
      timestamp: "2026-08-24T00:00:00.000Z",
      byteLength: 10,
    } as const;
    const events: TraceEvent[] = [
      {
        ...base,
        sequence: 1,
        direction: "client_to_server",
        kind: "request",
        id: 1,
        method: "tools/call",
        toolName: "weather",
      },
      {
        ...base,
        sequence: 2,
        direction: "server_to_client",
        kind: "response",
        id: 1,
        method: "tools/call",
        toolName: "weather",
        responseStatus: "error",
        durationMs: 12,
      },
      {
        ...base,
        sequence: 3,
        direction: "server_to_client",
        kind: "invalid",
        parseError: "invalid",
      },
    ];
    await writeFile(
      tracePath,
      `${events.map((event) => JSON.stringify(event)).join("\n")}\nnot-json\n`,
      "utf8",
    );

    const summary = await inspectTrace(tracePath);
    assert.equal(summary.events, 3);
    assert.equal(summary.invalidProtocolMessages, 1);
    assert.equal(summary.malformedTraceLines, 1);
    assert.equal(summary.methods["tools/call"]?.errors, 1);
    assert.deepEqual(summary.tools.weather?.completedDurationsMs, [12]);
    assert.match(
      formatTextSummary(summary),
      /weather\s+calls=1 err=1 avg=12\.00 ms/,
    );
  });
});
