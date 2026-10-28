import assert from "node:assert/strict";
import { access, mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";

import { TraceRecorder } from "../src/recorder.js";
import { inspectTrace } from "../src/inspect.js";
import { generateHtmlReport } from "../src/report.js";
import { readTrace } from "../src/trace-reader.js";
import type { TraceEvent } from "../src/types.js";

describe("TraceRecorder", () => {
  it("correlates tool responses and never persists malformed payloads", async () => {
    const directory = await mkdtemp(join(tmpdir(), "mcp-trace-recorder-"));
    const tracePath = join(directory, "trace.jsonl");
    const recorder = await TraceRecorder.create(tracePath);

    recorder.observe(
      "client_to_server",
      JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "tools/call",
        params: { name: "lookup", arguments: { apiKey: "must-not-leak" } },
      }),
    );
    recorder.observe(
      "server_to_client",
      JSON.stringify({ jsonrpc: "2.0", id: 1, result: { content: [] } }),
    );
    recorder.observe("server_to_client", '{"token":"must-not-leak"');
    await recorder.close();

    const content = await readFile(tracePath, "utf8");
    const events = content
      .trim()
      .split("\n")
      .map((line) => JSON.parse(line) as TraceEvent);

    assert.equal(events.length, 3);
    assert.equal(events[1]?.method, "tools/call");
    assert.equal(events[1]?.toolName, "lookup");
    assert.equal(events[1]?.responseStatus, "ok");
    assert.equal(events[0]?.capturePolicy, "redacted");
    assert.ok((events[1]?.durationMs ?? -1) >= 0);
    assert.equal(events[2]?.kind, "invalid");
    assert.equal(events[2]?.message, undefined);
    assert.doesNotMatch(content, /must-not-leak/);
  });

  it("omits payloads while keeping bidirectional correlation and failure diagnostics", async (t) => {
    const directory = await mkdtemp(join(tmpdir(), "mcp-trace-metadata-"));
    t.after(() => rm(directory, { recursive: true, force: true }));
    const tracePath = join(directory, "trace.jsonl");
    const recorder = await TraceRecorder.create(tracePath, {
      capturePolicy: "metadata",
      additionalKeys: ["isError"],
    });
    const payload = "private-free-text-秘密";
    const observe = (direction: TraceEvent["direction"], message: unknown) => {
      const line = JSON.stringify(message);
      recorder.observe(direction, line);
      return Buffer.byteLength(line);
    };
    const length = observe("client_to_server", {
      jsonrpc: "2.0",
      id: 1,
      method: "tools/call",
      params: { name: "lookup", arguments: { text: payload } },
      extension: payload,
    });
    observe("server_to_client", {
      jsonrpc: "2.0",
      id: "1",
      method: "sampling/createMessage",
      params: { messages: [payload] },
    });
    observe("server_to_client", {
      jsonrpc: "2.0",
      method: "notifications/message",
      params: { data: payload },
    });
    observe("client_to_server", {
      jsonrpc: "2.0",
      id: "1",
      result: { content: payload },
    });
    observe("server_to_client", {
      jsonrpc: "2.0",
      id: 1,
      result: { isError: true, content: [{ type: "text", text: payload }] },
    });
    observe("client_to_server", {
      jsonrpc: "2.0",
      id: null,
      method: "tools/call",
      params: { name: "lookup", arguments: { text: payload } },
    });
    observe("server_to_client", {
      jsonrpc: "2.0",
      id: null,
      error: { code: -32603, message: payload, data: payload },
    });
    recorder.observe("client_to_server", payload);
    observe("server_to_client", { unexpected: payload });
    await recorder.close();

    const content = await readFile(tracePath, "utf8");
    assert.ok(!content.includes(payload));
    const events: TraceEvent[] = [];
    for await (const line of readTrace(tracePath)) {
      assert.ok("event" in line);
      events.push(line.event);
    }
    assert.equal(events.length, 9);
    for (const event of events) {
      assert.equal(event.capturePolicy, "metadata");
      assert.equal(Object.hasOwn(event, "message"), false);
    }
    assert.equal(events[0]?.byteLength, length);
    assert.equal(events[3]?.method, "sampling/createMessage");
    assert.equal(events[3]?.id, "1");
    assert.equal(events[4]?.method, "tools/call");
    assert.equal(events[4]?.toolName, "lookup");
    assert.equal(events[4]?.responseStatus, "ok");
    assert.equal(events[4]?.toolError, true);
    assert.ok((events[3]?.durationMs ?? -1) >= 0);
    assert.ok((events[4]?.durationMs ?? -1) >= 0);
    assert.equal(events[6]?.id, null);
    assert.equal(events[6]?.responseStatus, "error");
    assert.equal(events[7]?.kind, "invalid");
    assert.match(events[7]?.contentSha256 ?? "", /^[a-f0-9]{64}$/);
    assert.equal(events[8]?.kind, "invalid");

    const summary = await inspectTrace(tracePath);
    assert.equal(summary.malformedTraceLines, 0);
    assert.equal(summary.invalidProtocolMessages, 2);
    assert.equal(summary.protocolErrors, 1);
    assert.equal(summary.toolErrors, 1);
    assert.equal(summary.tools.lookup?.calls, 2);
    assert.equal(summary.tools.lookup?.completedDurationsMs.length, 2);
    const reportPath = join(directory, "report.html");
    await generateHtmlReport(tracePath, reportPath);
    const html = await readFile(reportPath, "utf8");
    assert.ok(!html.includes(payload));
    const data = html.match(/id="trace-data">([^<]*)<\/script>/)?.[1];
    assert.ok(data);
    const rows = (
      JSON.parse(data) as { rows: { state: string; pairLine?: number }[] }
    ).rows;
    assert.equal(rows[0]?.state, "tool_error");
    assert.equal(rows[0]?.pairLine, 5);
    assert.equal(rows[1]?.pairLine, 4);
    assert.equal(rows[5]?.state, "error");
  });

  it("allows mixed capture policies in appended sessions without changing redaction", async (t) => {
    const directory = await mkdtemp(join(tmpdir(), "mcp-trace-mixed-"));
    t.after(() => rm(directory, { recursive: true, force: true }));
    const tracePath = join(directory, "trace.jsonl");
    for (const capturePolicy of ["redacted", "metadata"] as const) {
      const recorder = await TraceRecorder.create(tracePath, {
        capturePolicy,
        additionalKeys: ["tenantId"],
      });
      recorder.observe(
        "client_to_server",
        JSON.stringify({
          jsonrpc: "2.0",
          id: 1,
          method: "tools/call",
          params: {
            name: "lookup",
            arguments: { tenantId: "must-not-leak", note: "visible" },
          },
        }),
      );
      await recorder.close();
    }
    const content = await readFile(tracePath, "utf8");
    assert.doesNotMatch(content, /must-not-leak/);
    const events = content
      .trim()
      .split("\n")
      .map((line) => JSON.parse(line) as TraceEvent);
    assert.equal(events[0]?.capturePolicy, "redacted");
    assert.ok(JSON.stringify(events[0]?.message).includes("[REDACTED]"));
    assert.ok(JSON.stringify(events[0]?.message).includes("visible"));
    assert.equal(events[1]?.capturePolicy, "metadata");
    assert.equal(events[1]?.message, undefined);
    assert.notEqual(events[0]?.sessionId, events[1]?.sessionId);
    assert.equal((await inspectTrace(tracePath)).sessions, 2);
  });

  it("rejects an invalid capture policy before creating a trace", async (t) => {
    const directory = await mkdtemp(
      join(tmpdir(), "mcp-trace-invalid-policy-"),
    );
    t.after(() => rm(directory, { recursive: true, force: true }));
    const tracePath = join(directory, "trace.jsonl");
    await assert.rejects(
      TraceRecorder.create(tracePath, {
        capturePolicy: "all" as "metadata",
      }),
      /Capture policy/,
    );
    await assert.rejects(access(tracePath), { code: "ENOENT" });
  });
});
