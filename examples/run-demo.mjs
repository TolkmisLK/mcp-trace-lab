import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { mkdir, mkdtemp, readFile } from "node:fs/promises";
import { join } from "node:path";
import { createInterface } from "node:readline";
import { fileURLToPath, URL } from "node:url";

import { formatTextSummary, inspectTrace } from "../dist/inspect.js";

const root = fileURLToPath(new URL("../", import.meta.url));
await mkdir(join(root, "traces"), { recursive: true });
const directory = await mkdtemp(join(root, "traces", "demo-"));
const tracePath = join(directory, "session.trace.jsonl");
const child = spawn(
  process.execPath,
  [
    join(root, "dist/cli.js"),
    "record",
    "--output",
    tracePath,
    "--",
    process.execPath,
    join(root, "examples/demo-server.mjs"),
  ],
  { stdio: ["pipe", "pipe", "inherit"], timeout: 10000 },
);
const closed = once(child, "close");
const lines = createInterface({ input: child.stdout, crlfDelay: Infinity });
const responses = lines[Symbol.asyncIterator]();
const send = (message) => child.stdin.write(`${JSON.stringify(message)}\n`);
async function request(message) {
  send({ jsonrpc: "2.0", ...message });
  const next = await responses.next();
  assert.equal(next.done, false, "Server stopped before replying");
  const response = JSON.parse(next.value);
  assert.equal(response.id, message.id);
  return response;
}

try {
  process.stdout.write("Demo: initialize → list tools → echo → fail\n\n");
  const initialized = await request({
    id: 1,
    method: "initialize",
    params: {
      protocolVersion: "2026-07-28",
      capabilities: {},
      clientInfo: { name: "trace-demo-client", version: "1.0.0" },
    },
  });
  assert.equal(initialized.result.serverInfo.name, "trace-demo");
  send({ jsonrpc: "2.0", method: "notifications/initialized" });
  const listed = await request({ id: 2, method: "tools/list", params: {} });
  assert.deepEqual(
    listed.result.tools.map((tool) => tool.name),
    ["echo", "fail"],
  );
  const echoed = await request({
    id: 3,
    method: "tools/call",
    params: {
      name: "echo",
      arguments: {
        text: "Hello from the demo",
        apiKey: "demo-key-not-a-credential",
      },
    },
  });
  assert.equal(echoed.result.content[0].text, "Hello from the demo");
  const failed = await request({
    id: 4,
    method: "tools/call",
    params: { name: "fail", arguments: {} },
  });
  assert.equal(failed.error.code, -32000);
  child.stdin.end();
  const [code] = await closed;
  assert.equal(code, 0, "Recorder did not exit successfully");
  const trace = await readFile(tracePath, "utf8");
  assert.doesNotMatch(trace, /demo-key-not-a-credential/);
  assert.match(trace, /\[REDACTED\]/);
  const summary = await inspectTrace(tracePath);
  assert.equal(summary.events, 9);
  assert.equal(summary.invalidProtocolMessages, 0);
  assert.equal(summary.malformedTraceLines, 0);
  assert.equal(summary.tools.echo.calls, 1);
  assert.equal(summary.tools.echo.errors, 0);
  assert.equal(summary.tools.fail.calls, 1);
  assert.equal(summary.tools.fail.errors, 1);
  process.stdout.write(formatTextSummary(summary));
  process.stdout.write(`\nSaved / 已保存: ${tracePath}\n`);
  process.stdout.write("The example apiKey is redacted / 示例 apiKey 已脱敏\n");
} finally {
  lines.close();
  if (child.exitCode === null && child.signalCode === null) {
    child.kill("SIGTERM");
  }
}
