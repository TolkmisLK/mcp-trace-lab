import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { describe, it, type TestContext } from "node:test";
import { Script } from "node:vm";

import { generateHtmlReport } from "../src/report.js";
import { readTrace } from "../src/trace-reader.js";
import { TRACE_SCHEMA_VERSION, type TraceEvent } from "../src/types.js";

const base = {
  schemaVersion: TRACE_SCHEMA_VERSION,
  timestamp: "2026-09-28T00:00:00.000Z",
  byteLength: 20,
} as const;

async function fixture(
  context: TestContext,
  lines: string[],
): Promise<{ input: string; output: string; directory: string }> {
  const directory = await mkdtemp(join(tmpdir(), "mcp-trace-report-"));
  context.after(async () => {
    if (dirname(resolve(directory)) !== resolve(tmpdir())) {
      throw new Error("Unexpected test directory / 测试目录异常");
    }
    await rm(directory, { recursive: true, force: true });
  });
  const input = join(directory, "input.trace.jsonl");
  const output = join(directory, "report.html");
  await writeFile(input, `${lines.join("\n")}\n`, "utf8");
  return { input, output, directory };
}

function event(overrides: Partial<TraceEvent>): TraceEvent {
  return {
    ...base,
    sessionId: "one",
    sequence: 1,
    direction: "client_to_server",
    kind: "request",
    ...overrides,
  };
}

function reportRows(html: string): {
  rows: {
    line: number;
    state: string;
    pairLine?: number;
    event?: TraceEvent;
  }[];
} {
  const match = html.match(
    /<script type="application\/json" id="trace-data">([^<]*)<\/script>/,
  );
  assert.ok(match?.[1]);
  return JSON.parse(match[1]) as {
    rows: {
      line: number;
      state: string;
      pairLine?: number;
      event?: TraceEvent;
    }[];
  };
}

describe("HTML report", () => {
  it("correlates by session, direction and typed ID; keeps recorded duration", async (context) => {
    const lines = [
      event({
        id: 1,
        method: "tools/call",
        toolName: "echo",
        message: { note: "request" },
      }),
      event({
        sequence: 2,
        direction: "server_to_client",
        kind: "response",
        id: "1",
        responseStatus: "error",
        durationMs: 2,
      }),
      event({
        sequence: 3,
        direction: "server_to_client",
        kind: "response",
        id: 1,
        responseStatus: "ok",
        durationMs: 7,
      }),
      event({ sequence: 4, kind: "request", id: 2 }),
      event({ sequence: 5, kind: "request", id: 2 }),
      event({
        sequence: 6,
        direction: "server_to_client",
        kind: "response",
        id: 2,
        responseStatus: "error",
        durationMs: 3,
      }),
      event({
        sequence: 1,
        sessionId: "two",
        direction: "server_to_client",
        kind: "response",
        id: 1,
        responseStatus: "ok",
      }),
      event({ sequence: 7, kind: "invalid", parseError: "bad" }),
    ].map((item) => JSON.stringify(item));
    const { input, output } = await fixture(context, [...lines, "not-json"]);
    await generateHtmlReport(input, output);
    const rows = reportRows(await readFile(output, "utf8")).rows;
    assert.deepEqual(
      rows.map((row) => row.state),
      [
        "ok",
        "unmatched",
        "ok",
        "replaced",
        "error",
        "error",
        "unmatched",
        "invalid",
        "malformed",
      ],
    );
    assert.equal(rows[0]?.pairLine, 3);
    assert.equal(rows[2]?.pairLine, 1);
    assert.equal(rows[2]?.event?.durationMs, 7);
    assert.equal(rows[8]?.event, undefined);
  });

  it("keeps hostile trace values inert in HTML and does not load network resources", async (context) => {
    const attack =
      '</script><script>alert("x")</script><img src=x onerror=alert(1)>';
    const { input, output } = await fixture(context, [
      JSON.stringify(
        event({ method: attack, sessionId: attack, message: { text: attack } }),
      ),
    ]);
    await generateHtmlReport(input, output);
    const html = await readFile(output, "utf8");
    assert.equal(html.includes(attack), false);
    assert.match(html, /\\u003c\/script\\u003e/);
    assert.match(html, /default-src 'none'/);
    assert.match(html, /connect-src 'none'/);
    const script = html.match(/<script>([\s\S]*?)<\/script><\/body>/)?.[1];
    assert.ok(script);
    new Script(script);
    const hash = createHash("sha256").update(script).digest("base64");
    assert.ok(html.includes(`script-src 'sha256-${hash}'`));
    assert.equal(reportRows(html).rows[0]?.event?.method, attack);
  });

  it("rejects oversized input and existing output without overwriting it", async (context) => {
    const { input, output, directory } = await fixture(context, [
      JSON.stringify(event({ id: 1 })),
    ]);
    await writeFile(output, "keep", "utf8");
    await assert.rejects(generateHtmlReport(input, output), { code: "EEXIST" });
    assert.equal(await readFile(output, "utf8"), "keep");
    await writeFile(input, "x".repeat(10 * 1024 * 1024 + 1), "utf8");
    await assert.rejects(
      generateHtmlReport(input, join(directory, "unused-report.html")),
      /10 MiB/,
    );
  });

  it("enforces raw byte limits on malformed or blank input and closes the reader", async (context) => {
    const { input } = await fixture(context, [" ".repeat(100), "not-json"]);
    await assert.rejects(async () => {
      for await (const line of readTrace(input, { maxBytes: 50 })) {
        assert.fail(`Unexpected trace row ${line.lineNumber}`);
      }
    }, /10 MiB/);
    await rm(input);
  });
});
