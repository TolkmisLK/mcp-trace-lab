import { createInterface } from "node:readline";

const lines = createInterface({ input: process.stdin, crlfDelay: Infinity });

for await (const line of lines) {
  let message;
  try {
    message = JSON.parse(line);
  } catch {
    process.stdout.write(`${line}\n`);
    continue;
  }

  if (message.method === "initialize") {
    process.stdout.write(
      `${JSON.stringify({
        jsonrpc: "2.0",
        id: message.id,
        result: {
          protocolVersion: "2026-07-28",
          capabilities: { tools: {} },
          serverInfo: { name: "mock-server", version: "1.0.0" },
        },
      })}\n`,
    );
  } else if (message.method === "tools/list") {
    process.stdout.write(
      `${JSON.stringify({
        jsonrpc: "2.0",
        id: message.id,
        result: {
          tools: [{ name: "echo", description: "Echo input", inputSchema: {} }],
        },
      })}\n`,
    );
  } else if (
    message.method === "tools/call" &&
    message.params?.name === "fail"
  ) {
    process.stdout.write(
      `${JSON.stringify({
        jsonrpc: "2.0",
        id: message.id,
        error: {
          code: -32_000,
          message: "simulated failure",
          token: "server-secret",
        },
      })}\n`,
    );
  } else if (message.method === "tools/call") {
    process.stdout.write(
      `${JSON.stringify({
        jsonrpc: "2.0",
        id: message.id,
        result: {
          content: [{ type: "text", text: "ok" }],
          accessToken: "server-secret",
        },
      })}\n`,
    );
  }
}
