import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { describe, it, type TestContext } from "node:test";

import { formatTextSummary, inspectTrace } from "../src/inspect.js";
import { TRACE_SCHEMA_VERSION, type TraceEvent } from "../src/types.js";

async function testDirectory(context: TestContext): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), "mcp-trace-inspect-"));
  context.after(async () => {
    if (dirname(resolve(directory)) !== resolve(tmpdir())) {
      throw new Error("Unexpected test directory / 测试目录异常");
    }
    await rm(directory, { recursive: true, force: true });
  });
  return directory;
}

describe("inspectTrace", () => {
  it("aggregates methods, tools, errors, and malformed trace lines", async (context) => {
    const directory = await testDirectory(context);
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

  it("counts method names that match Object prototype properties", async (context) => {
    const directory = await testDirectory(context);
    const tracePath = join(directory, "trace.jsonl");
    await writeFile(
      tracePath,
      `${JSON.stringify({
        schemaVersion: TRACE_SCHEMA_VERSION,
        sessionId: "s",
        sequence: 1,
        timestamp: "2026-09-28T00:00:00.000Z",
        direction: "client_to_server",
        kind: "request",
        byteLength: 1,
        method: "__proto__",
        toolName: "constructor",
      })}\n`,
      "utf8",
    );
    const summary = await inspectTrace(tracePath);
    assert.equal(summary.methods["__proto__"]?.requests, 1);
    assert.equal(
      Object.entries(summary.tools).find(
        ([name]) => name === "constructor",
      )?.[1].calls,
      1,
    );
  });
});
