import { createInterface } from "node:readline";

// A small stdio server for the example; it does not call any external service.
const lines = createInterface({ input: process.stdin, crlfDelay: Infinity });
for await (const line of lines) {
  const request = JSON.parse(line);
  if (request.id === undefined) continue;
  let result;
  let error;
  if (request.method === "initialize") {
    result = {
      protocolVersion: request.params.protocolVersion,
      capabilities: { tools: {} },
      serverInfo: { name: "trace-demo", version: "1.0.0" },
    };
  } else if (request.method === "tools/list") {
    result = {
      tools: [
        {
          name: "echo",
          description: "Return the supplied text",
          inputSchema: {
            type: "object",
            properties: {
              text: { type: "string" },
              apiKey: { type: "string" },
            },
            required: ["text"],
          },
        },
        {
          name: "fail",
          description: "Return a JSON-RPC error for this demonstration",
          inputSchema: { type: "object", properties: {} },
        },
      ],
    };
  } else if (
    request.method === "tools/call" &&
    request.params.name === "echo"
  ) {
    result = {
      content: [{ type: "text", text: request.params.arguments.text }],
    };
  } else if (
    request.method === "tools/call" &&
    request.params.name === "fail"
  ) {
    error = { code: -32000, message: "Demonstration error" };
  } else {
    error = { code: -32601, message: "Unknown method or tool" };
  }
  process.stdout.write(
    `${JSON.stringify({ jsonrpc: "2.0", id: request.id, ...(error ? { error } : { result }) })}\n`,
  );
}
