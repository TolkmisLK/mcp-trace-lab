import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { describe, it } from "node:test";

import { inspectTrace } from "../../src/inspect.js";

describe("record CLI integration", () => {
  it("forwards stdio unchanged while recording a redacted trace", async () => {
    const directory = await mkdtemp(join(tmpdir(), "mcp-trace-integration-"));
    const tracePath = join(directory, "session.trace.jsonl");
    const cliPath = resolve("src/cli.ts");
    const serverPath = resolve("test/fixtures/mock-server.mjs");
    const child = spawn(
      process.execPath,
      [
        "--import",
        "tsx",
        cliPath,
        "record",
        "--output",
        tracePath,
        "--",
        process.execPath,
        serverPath,
      ],
      { stdio: ["pipe", "pipe", "pipe"] },
    );

    const requests = [
      { jsonrpc: "2.0", id: 1, method: "initialize", params: {} },
      { jsonrpc: "2.0", method: "notifications/initialized" },
      { jsonrpc: "2.0", id: 2, method: "tools/list", params: {} },
      {
        jsonrpc: "2.0",
        id: 3,
        method: "tools/call",
        params: { name: "echo", arguments: { apiKey: "client-secret" } },
      },
      { jsonrpc: "2.0", id: 4, method: "tools/call", params: { name: "fail" } },
    ];
    child.stdin.end(
      `${requests.map((message) => JSON.stringify(message)).join("\n")}\nmalformed\n`,
    );

    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk: string) => (stdout += chunk));
    child.stderr.on("data", (chunk: string) => (stderr += chunk));
    const [exitCode] = (await once(child, "close")) as [
      number,
      NodeJS.Signals | null,
    ];

    assert.equal(exitCode, 0, stderr);
    const outputLines = stdout.trim().split("\n");
    assert.equal(outputLines.length, 5);
    assert.equal(outputLines.at(-1), "malformed");
    assert.deepEqual(
      outputLines.slice(0, 4).map((line) => JSON.parse(line) as unknown),
      [
        {
          jsonrpc: "2.0",
          id: 1,
          result: {
            protocolVersion: "2026-07-28",
            capabilities: { tools: {} },
            serverInfo: { name: "mock-server", version: "1.0.0" },
          },
        },
        {
          jsonrpc: "2.0",
          id: 2,
          result: {
            tools: [
              { name: "echo", description: "Echo input", inputSchema: {} },
            ],
          },
        },
        {
          jsonrpc: "2.0",
          id: 3,
          result: {
            content: [{ type: "text", text: "ok" }],
            accessToken: "server-secret",
          },
        },
        {
          jsonrpc: "2.0",
          id: 4,
          error: {
            code: -32_000,
            message: "simulated failure",
            token: "server-secret",
          },
        },
      ],
    );

    const trace = await readFile(tracePath, "utf8");
    assert.doesNotMatch(trace, /client-secret|server-secret/);
    assert.match(trace, /\[REDACTED\]/);

    const summary = await inspectTrace(tracePath);
    assert.equal(summary.kinds.request, 4);
    assert.equal(summary.kinds.notification, 1);
    assert.equal(summary.kinds.response, 4);
    assert.equal(summary.kinds.invalid, 2);
    assert.equal(summary.tools.echo?.calls, 1);
    assert.equal(summary.tools.fail?.errors, 1);
  });
});
