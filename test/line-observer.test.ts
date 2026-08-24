import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { LineObserver } from "../src/line-observer.js";

describe("LineObserver", () => {
  it("reassembles split UTF-8 input and supports CRLF", () => {
    const lines: string[] = [];
    const observer = new LineObserver((line) => {
      lines.push(line);
    });
    const content = Buffer.from('{"text":"你好"}\r\nsecond\npartial');

    observer.push(content.subarray(0, 12));
    observer.push(content.subarray(12, 17));
    observer.push(content.subarray(17));
    observer.end();

    assert.deepEqual(lines, ['{"text":"你好"}', "second", "partial"]);
  });

  it("reports recorder backpressure", () => {
    const observer = new LineObserver((line) => line !== "pause");
    assert.equal(observer.push(Buffer.from("ok\npause\n")), false);
  });
});
