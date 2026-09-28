import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { reportClient } from "../src/report-client.js";

class FakeElement {
  readonly children: FakeElement[] = [];
  readonly listeners = new Map<string, () => void>();
  readonly classList = { remove: () => {} };
  textContent = "";
  value = "";
  className = "";
  tabIndex = -1;
  disabled = false;

  append(...items: FakeElement[]): void {
    for (const item of items) {
      if (item instanceof FakeFragment) this.children.push(...item.children);
      else this.children.push(item);
    }
  }

  replaceChildren(): void {
    this.children.length = 0;
  }

  addEventListener(name: string, listener: () => void): void {
    this.listeners.set(name, listener);
  }

  fire(name: string): void {
    const listener = this.listeners.get(name);
    assert.ok(listener, `missing ${name} listener`);
    listener();
  }

  scrollIntoView(): void {}
}

class FakeFragment extends FakeElement {}

describe("report interactions", () => {
  it("filters failures, searches payloads and opens inert text details", () => {
    const ids = new Map<string, FakeElement>();
    for (const id of [
      "trace-data",
      "rows",
      "search",
      "state",
      "kind",
      "session",
      "count",
      "more",
      "detail",
      "cards",
      "detail-title",
      "meta",
      "payload",
    ])
      ids.set(id, new FakeElement());
    const rows = [
      {
        line: 1,
        state: "ok",
        event: {
          sessionId: "a",
          sequence: 1,
          timestamp: "t1",
          direction: "client_to_server",
          kind: "request",
          id: 1,
          method: "tools/call",
          message: { text: "safe" },
        },
      },
      {
        line: 2,
        state: "error",
        pairLine: 1,
        event: {
          sessionId: "a",
          sequence: 2,
          timestamp: "t2",
          direction: "server_to_client",
          kind: "response",
          id: 1,
          method: "tools/call",
          responseStatus: "error",
          durationMs: 8,
          message: { detail: "<img src=x onerror=alert(1)>" },
        },
      },
      { line: 3, state: "malformed" },
    ];
    ids.get("trace-data")!.textContent = JSON.stringify({ rows });
    const previous = globalThis.document;
    globalThis.document = {
      getElementById: (id: string) => ids.get(id) ?? null,
      createElement: () => new FakeElement(),
      createDocumentFragment: () => new FakeFragment(),
    } as unknown as Document;
    try {
      reportClient();
      assert.equal(ids.get("rows")!.children.length, 3);
      ids.get("state")!.value = "error";
      ids.get("state")!.fire("change");
      assert.equal(ids.get("rows")!.children.length, 1);
      assert.match(
        ids.get("count")!.textContent,
        /已显示 1 \/ 匹配 1 \/ 总计 3/,
      );
      ids.get("search")!.value = "onerror";
      ids.get("search")!.fire("input");
      assert.equal(ids.get("rows")!.children.length, 1);
      ids.get("rows")!.children[0]!.fire("click");
      assert.match(
        ids.get("payload")!.textContent,
        /<img src=x onerror=alert\(1\)>/,
      );
      assert.match(ids.get("detail-title")!.textContent, /第 2 行/);
      ids.get("search")!.value = "absent";
      ids.get("search")!.fire("input");
      assert.equal(ids.get("rows")!.children.length, 0);
    } finally {
      globalThis.document = previous;
    }
  });

  it("shows method and tool together and updates pagination counts", () => {
    const ids = new Map<string, FakeElement>();
    for (const id of [
      "trace-data",
      "rows",
      "search",
      "state",
      "kind",
      "session",
      "count",
      "more",
      "detail",
      "cards",
      "detail-title",
      "meta",
      "payload",
    ])
      ids.set(id, new FakeElement());
    const rows = Array.from({ length: 201 }, (_, index) => ({
      line: index + 1,
      state: "pending",
      event: {
        sessionId: "a",
        sequence: index + 1,
        timestamp: "t",
        direction: "client_to_server",
        kind: "request",
        method: "tools/call",
        toolName: "echo",
      },
    }));
    ids.get("trace-data")!.textContent = JSON.stringify({ rows });
    const previous = globalThis.document;
    globalThis.document = {
      getElementById: (id: string) => ids.get(id) ?? null,
      createElement: () => new FakeElement(),
      createDocumentFragment: () => new FakeFragment(),
    } as unknown as Document;
    try {
      reportClient();
      assert.equal(ids.get("rows")!.children.length, 200);
      assert.match(
        ids.get("count")!.textContent,
        /已显示 200 \/ 匹配 201 \/ 总计 201/,
      );
      assert.equal(
        ids.get("rows")!.children[0]!.children[4]!.textContent,
        "tools/call · echo",
      );
      ids.get("more")!.fire("click");
      assert.equal(ids.get("rows")!.children.length, 201);
      assert.match(
        ids.get("count")!.textContent,
        /已显示 201 \/ 匹配 201 \/ 总计 201/,
      );
    } finally {
      globalThis.document = previous;
    }
  });
});
