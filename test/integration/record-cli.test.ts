import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { once } from "node:events";
import { access, mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { describe, it } from "node:test";

import { inspectTrace } from "../../src/inspect.js";
import type { TraceEvent } from "../../src/types.js";

describe("record CLI integration", () => {
  it("preserves exact bytes in metadata mode, including split UTF-8, CRLF and an unfinished line", async (t) => {
    const directory = await mkdtemp(join(tmpdir(), "mcp-trace-metadata-cli-"));
    t.after(() => rm(directory, { recursive: true, force: true }));
    const tracePath = join(directory, "metadata.trace.jsonl");
    const child = spawn(
      process.execPath,
      [
        "--import",
        "tsx",
        resolve("src/cli.ts"),
        "record",
        "--output",
        tracePath,
        "--capture",
        "metadata",
        "--",
        process.execPath,
        "-e",
        "process.stdin.pipe(process.stdout)",
      ],
      { stdio: ["pipe", "pipe", "pipe"] },
    );
    t.after(() => {
      if (child.exitCode === null) child.kill();
    });
    const payload = "private-free-text-秘密";
    const input = Buffer.from(
      `${JSON.stringify({
        jsonrpc: "2.0",
        id: "request-1",
        method: "tools/call",
        params: { name: "echo", arguments: { note: payload.repeat(10_000) } },
      })}\r\n${payload}\r\n${JSON.stringify({
        jsonrpc: "2.0",
        method: "notifications/message",
        params: { data: payload },
      })}`,
    );
    const chunks: Buffer[] = [];
    let stderr = "";
    child.stdout.on("data", (chunk: Buffer) => chunks.push(chunk));
    child.stderr.setEncoding("utf8");
    child.stderr.on("data", (chunk: string) => (stderr += chunk));
    // The first write ends inside a multibyte character in the input stream.
    const split = input.indexOf(Buffer.from("秘")) + 1;
    child.stdin.write(input.subarray(0, split));
    child.stdin.end(input.subarray(split));
    const [exitCode] = (await once(child, "close")) as [
      number | null,
      NodeJS.Signals | null,
    ];
    assert.equal(exitCode, 0, stderr);
    assert.deepEqual(Buffer.concat(chunks), input);
    const content = await readFile(tracePath, "utf8");
    assert.ok(!content.includes(payload));
    const events = content
      .trim()
      .split("\n")
      .map((line) => JSON.parse(line) as TraceEvent);
    assert.equal(events.length, 6);
    assert.equal(events.filter((event) => event.kind === "invalid").length, 2);
    for (const event of events) {
      assert.equal(event.capturePolicy, "metadata");
      assert.equal(Object.hasOwn(event, "message"), false);
    }
  });

  it("keeps metadata-mode failures visible to inspect --fail-on-error", async (t) => {
    const directory = await mkdtemp(
      join(tmpdir(), "mcp-trace-metadata-errors-"),
    );
    t.after(() => rm(directory, { recursive: true, force: true }));
    const tracePath = join(directory, "metadata.trace.jsonl");
    const requests = ["echo", "fail", "tool-fail"].map((name, id) => ({
      jsonrpc: "2.0",
      id,
      method: "tools/call",
      params: { name, arguments: { note: "private-client-payload" } },
    }));
    const result = spawnSync(
      process.execPath,
      [
        "--import",
        "tsx",
        resolve("src/cli.ts"),
        "record",
        "--output",
        tracePath,
        "--capture",
        "metadata",
        "--",
        process.execPath,
        resolve("test/fixtures/mock-server.mjs"),
      ],
      {
        input: `${requests.map((message) => JSON.stringify(message)).join("\n")}\n`,
        encoding: "utf8",
        timeout: 15_000,
      },
    );
    assert.equal(result.status, 0, result.stderr);
    const responses = result.stdout
      .trim()
      .split("\n")
      .map((line) => JSON.parse(line) as unknown);
    assert.equal(responses.length, 3);
    assert.ok(result.stdout.includes("private-server-payload"));
    const trace = await readFile(tracePath, "utf8");
    assert.doesNotMatch(
      trace,
      /private-client-payload|private-server-payload|server-secret/,
    );
    const inspected = spawnSync(
      process.execPath,
      [
        "--import",
        "tsx",
        resolve("src/cli.ts"),
        "inspect",
        "--fail-on-error",
        "--format",
        "json",
        tracePath,
      ],
      { encoding: "utf8", timeout: 15_000 },
    );
    assert.equal(inspected.status, 2, inspected.stderr);
    const summary = JSON.parse(inspected.stdout) as {
      protocolErrors: number;
      toolErrors: number;
      malformedTraceLines: number;
    };
    assert.equal(summary.protocolErrors, 1);
    assert.equal(summary.toolErrors, 1);
    assert.equal(summary.malformedTraceLines, 0);
  });

  it("rejects invalid capture arguments without spawning a server or creating output", async (t) => {
    const directory = await mkdtemp(join(tmpdir(), "mcp-trace-bad-capture-"));
    t.after(() => rm(directory, { recursive: true, force: true }));
    const tracePath = join(directory, "trace.jsonl");
    const marker = join(directory, "server-started");
    for (const args of [
      ["--capture", "all"],
      ["--capture", ""],
      ["--capture"],
    ]) {
      const result = spawnSync(
        process.execPath,
        [
          "--import",
          "tsx",
          resolve("src/cli.ts"),
          "record",
          "--output",
          tracePath,
          ...args,
          "--",
          process.execPath,
          "-e",
          "require('node:fs').writeFileSync(process.argv[1], 'started')",
          marker,
        ],
        { encoding: "utf8", timeout: 15_000 },
      );
      assert.equal(result.status, 1, result.stderr);
      assert.equal(result.stdout, "");
      assert.match(result.stderr, /capture/);
      await assert.rejects(access(tracePath), { code: "ENOENT" });
      await assert.rejects(access(marker), { code: "ENOENT" });
    }
  });

  it("exits with the server while client stdin stays open", async () => {
    const directory = await mkdtemp(join(tmpdir(), "mcp-trace-open-stdin-"));
    for (const serverExitCode of [0, 7]) {
      const child = spawn(
        process.execPath,
        [
          "--import",
          "tsx",
          resolve("src/cli.ts"),
          "record",
          "--output",
          join(directory, `${serverExitCode}.trace.jsonl`),
          "--",
          process.execPath,
          "-e",
          `process.exit(${serverExitCode})`,
        ],
        { stdio: ["pipe", "pipe", "pipe"] },
      );
      let stderr = "";
      child.stderr.setEncoding("utf8");
      child.stderr.on("data", (chunk: string) => (stderr += chunk));
      child.stdout.resume();

      const exitCode = await new Promise<number | null>(
        (resolveExit, reject) => {
          const timeout = setTimeout(() => {
            child.kill();
            reject(
              new Error(
                `Recorder stayed open after server exited ${serverExitCode}`,
              ),
            );
          }, 5_000);
          child.once("close", (code) => {
            clearTimeout(timeout);
            resolveExit(code);
          });
          child.once("error", (error) => {
            clearTimeout(timeout);
            reject(error);
          });
        },
      );
      assert.equal(exitCode, serverExitCode, stderr);
      assert.equal(child.stdin.writableEnded, false);
    }
  });

  it("does not crash when the wrapped server closes stdin early", async () => {
    const directory = await mkdtemp(join(tmpdir(), "mcp-trace-early-exit-"));
    const child = spawn(
      process.execPath,
      [
        "--import",
        "tsx",
        resolve("src/cli.ts"),
        "record",
        "--output",
        join(directory, "session.trace.jsonl"),
        "--",
        process.execPath,
        "-e",
        "process.exit(0)",
      ],
      { stdio: ["pipe", "pipe", "pipe"] },
    );
    let stderr = "";
    child.stderr.setEncoding("utf8");
    child.stderr.on("data", (chunk: string) => (stderr += chunk));
    child.stdout.resume();
    child.stdin.on("error", (error: NodeJS.ErrnoException) => {
      assert.ok(["EPIPE", "EOF"].includes(error.code ?? ""));
    });
    child.stdin.end(Buffer.alloc(1_000_000, "a"));

    const [exitCode] = (await once(child, "close")) as [
      number,
      NodeJS.Signals | null,
    ];
    assert.equal(exitCode, 0, stderr);
    assert.doesNotMatch(stderr, /Unhandled 'error' event|EPIPE/);
  });

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
