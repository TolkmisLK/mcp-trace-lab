import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { classifyMessage, requestKey } from "../src/protocol.js";

describe("classifyMessage", () => {
  it("classifies requests and extracts MCP tool names", () => {
    assert.deepEqual(
      classifyMessage({
        jsonrpc: "2.0",
        id: 7,
        method: "tools/call",
        params: { name: "weather", arguments: { city: "Shanghai" } },
      }),
      { kind: "request", id: 7, method: "tools/call", toolName: "weather" },
    );
  });

  it("distinguishes notifications and error responses", () => {
    assert.deepEqual(
      classifyMessage({ jsonrpc: "2.0", method: "notifications/initialized" }),
      {
        kind: "notification",
        method: "notifications/initialized",
      },
    );
    assert.deepEqual(
      classifyMessage({
        jsonrpc: "2.0",
        id: "request-1",
        error: { code: -32_000 },
      }),
      { kind: "response", id: "request-1", responseStatus: "error" },
    );
  });

  it("rejects unsupported JSON-RPC shapes", () => {
    assert.equal(
      classifyMessage({ jsonrpc: "1.0", id: 1, method: "tools/list" }),
      undefined,
    );
    assert.equal(classifyMessage({ jsonrpc: "2.0", result: {} }), undefined);
    assert.equal(classifyMessage([]), undefined);
  });

  it("keeps string, numeric, and null request ids distinct", () => {
    assert.notEqual(requestKey(1), requestKey("1"));
    assert.notEqual(requestKey(null), requestKey("null"));
  });
});
