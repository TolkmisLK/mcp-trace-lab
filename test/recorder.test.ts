import assert from "node:assert/strict";
import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";

import { TraceRecorder } from "../src/recorder.js";
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
    assert.ok((events[1]?.durationMs ?? -1) >= 0);
    assert.equal(events[2]?.kind, "invalid");
    assert.equal(events[2]?.message, undefined);
    assert.doesNotMatch(content, /must-not-leak/);
  });
});
