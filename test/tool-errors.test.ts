import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { it, type TestContext } from "node:test";

import { inspectTrace } from "../src/inspect.js";
import { TraceRecorder } from "../src/recorder.js";
import { generateHtmlReport } from "../src/report.js";
import { isToolError } from "../src/tool-error.js";
import type { TraceEvent } from "../src/types.js";

async function directory(t: TestContext): Promise<string> {
  const path = await mkdtemp(join(tmpdir(), "mcp-tool-error-"));
  t.after(async () => {
    assert.equal(dirname(resolve(path)), resolve(tmpdir()));
    await rm(path, { recursive: true, force: true });
  });
  return path;
}

const base: TraceEvent = {
  schemaVersion: "1.0",
  sessionId: "s",
  sequence: 1,
  timestamp: "2026-10-15T00:00:00Z",
  direction: "server_to_client",
  kind: "response",
  byteLength: 50,
  method: "tools/call",
  toolName: "search",
  responseStatus: "ok",
  id: 1,
};

it("recognizes only boolean tool failures and preserves the protocol meaning", () => {
  const failed = { ...base, message: { result: { isError: true } } };
  assert.equal(isToolError(failed), true);
  assert.equal(
    isToolError({ ...base, message: { result: { isError: "true" } } }),
    false,
  );
  assert.equal(isToolError({ ...failed, method: "resources/read" }), false);
  assert.equal(isToolError({ ...failed, kind: "request" }), false);
  assert.equal(isToolError({ ...failed, responseStatus: "error" }), false);
  assert.equal(isToolError({ ...base, toolError: true }), true);
});

it("records diagnosis before custom redaction and counts both failure classes separately", async (t) => {
  const path = join(await directory(t), "trace.jsonl");
  const recorder = await TraceRecorder.create(path, {
    additionalKeys: ["isError"],
  });
  for (const id of [1, 2]) {
    recorder.observe(
      "client_to_server",
      JSON.stringify({
        jsonrpc: "2.0",
        id,
        method: "tools/call",
        params: { name: "search" },
      }),
    );
    recorder.observe(
      "server_to_client",
      JSON.stringify(
        id === 1
          ? { jsonrpc: "2.0", id, result: { isError: true, content: [] } }
          : { jsonrpc: "2.0", id, error: { code: -32603, message: "failed" } },
      ),
    );
  }
  await recorder.close();
  const events = (await readFile(path, "utf8"))
    .trim()
    .split("\n")
    .map((line) => JSON.parse(line) as TraceEvent);
  assert.equal(events[1]?.toolError, true);
  assert.equal(events[1]?.responseStatus, "ok");
  assert.equal(
    (events[1]?.message as { result: { isError: unknown } }).result.isError,
    "[REDACTED]",
  );
  const summary = await inspectTrace(path);
  assert.equal(summary.protocolErrors, 1);
  assert.equal(summary.toolErrors, 1);
  assert.equal(summary.tools.search?.errors, 1);
  assert.equal(summary.tools.search?.toolErrors, 1);
});

it("diagnoses older saved payloads, pairs report failures, and supports opt-in CLI exit codes", async (t) => {
  const dir = await directory(t);
  const input = join(dir, "old.jsonl");
  const output = join(dir, "report.html");
  await writeFile(
    input,
    [
      {
        ...base,
        direction: "client_to_server",
        kind: "request",
        responseStatus: undefined,
      },
      { ...base, sequence: 2, message: { result: { isError: true } } },
    ]
      .map((row) => JSON.stringify(row))
      .join("\n"),
  );
  assert.equal((await inspectTrace(input)).toolErrors, 1);
  await generateHtmlReport(input, output);
  const html = await readFile(output, "utf8");
  const match = html.match(/id="trace-data">([^<]*)<\/script>/);
  assert.ok(match?.[1]);
  const rows = (
    JSON.parse(match[1]) as { rows: { state: string; event: TraceEvent }[] }
  ).rows;
  assert.deepEqual(
    rows.map((row) => row.state),
    ["tool_error", "tool_error"],
  );
  assert.equal(rows.filter((row) => row.event.toolError === true).length, 1);
  assert.match(html, /value="tool_error"/);
  const cli = (...args: string[]) =>
    spawnSync(
      process.execPath,
      ["--import", "tsx", "src/cli.ts", "inspect", ...args, input],
      { encoding: "utf8", timeout: 15_000 },
    );
  assert.equal(cli().status, 0);
  const strict = cli("--format", "json", "--fail-on-error");
  assert.equal(strict.status, 2, strict.stderr);
  assert.equal(
    (JSON.parse(strict.stdout) as { toolErrors: number }).toolErrors,
    1,
  );
  await writeFile(input, "not-json\n");
  assert.equal(cli("--fail-on-error").status, 2);
  await writeFile(
    input,
    JSON.stringify({ ...base, message: { result: { isError: false } } }),
  );
  assert.equal(cli("--fail-on-error").status, 0);
});
