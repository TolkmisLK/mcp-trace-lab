import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { redactValue } from "../src/redaction.js";

describe("redactValue", () => {
  it("redacts default sensitive keys recursively without mutating input", () => {
    const input = {
      headers: { Authorization: "Bearer top-secret", "x-api-key": "key-123" },
      params: { password: "hunter2", safe: "visible" },
    };

    assert.deepEqual(redactValue(input), {
      headers: { Authorization: "[REDACTED]", "x-api-key": "[REDACTED]" },
      params: { password: "[REDACTED]", safe: "visible" },
    });
    assert.equal(input.params.password, "hunter2");
  });

  it("redacts custom keys, bearer values, and URL credentials", () => {
    assert.deepEqual(
      redactValue(
        {
          tenantCode: "private-tenant",
          note: "use Bearer abc.def and https://alice:password@example.com/path",
        },
        { additionalKeys: ["tenant-code"] },
      ),
      {
        tenantCode: "[REDACTED]",
        note: "use Bearer [REDACTED] and https://[REDACTED]@example.com/path",
      },
    );
  });
});
