/** Serialized into the report. Keep this function self-contained. */
export function reportClient(): void {
  type Row = {
    line: number;
    state: string;
    pairLine?: number;
    event?: {
      sessionId: string;
      sequence: number;
      timestamp: string;
      direction: string;
      kind: string;
      method?: string;
      toolName?: string;
      id?: string | number | null;
      responseStatus?: string;
      durationMs?: number;
      parseError?: string;
      message?: unknown;
    };
  };

  function element<T extends HTMLElement>(id: string): T {
    const found = document.getElementById(id);
    if (found === null) throw new Error(`Missing report element: ${id}`);
    return found as T;
  }

  const rows = (
    JSON.parse(element("trace-data").textContent ?? "") as {
      rows: Row[];
    }
  ).rows;
  const body = element<HTMLTableSectionElement>("rows");
  const search = element<HTMLInputElement>("search");
  const state = element<HTMLSelectElement>("state");
  const kind = element<HTMLSelectElement>("kind");
  const session = element<HTMLSelectElement>("session");
  const count = element("count");
  const more = element<HTMLButtonElement>("more");
  const detail = element("detail");
  const labels: Record<string, string> = {
    pending: "未响应",
    ok: "成功",
    error: "错误",
    invalid: "协议无效",
    malformed: "追踪行无效",
    unmatched: "未匹配响应",
    notification: "通知",
    unknown: "状态未知",
    replaced: "ID 被复用",
  };
  let matches: Row[] = [];
  let shown = 0;

  function text(value: unknown): string {
    if (value === undefined || value === null) return "—";
    if (typeof value === "string") return value;
    if (typeof value === "number" || typeof value === "boolean")
      return value.toString();
    return JSON.stringify(value) ?? "—";
  }

  function cell(tr: HTMLTableRowElement, value: string): HTMLTableCellElement {
    const td = document.createElement("td");
    td.textContent = value;
    tr.append(td);
    return td;
  }

  function addCard(label: string, value: number): void {
    const box = document.createElement("div");
    box.className = "card";
    const strong = document.createElement("strong");
    strong.textContent = String(value);
    const span = document.createElement("span");
    span.textContent = label;
    box.append(strong, span);
    element("cards").append(box);
  }

  const tally = (predicate: (row: Row) => boolean): number =>
    rows.filter(predicate).length;
  addCard("事件 / Events", rows.length);
  addCard(
    "请求 / Requests",
    tally((row) => row.event?.kind === "request"),
  );
  addCard(
    "JSON-RPC 错误 / Errors",
    tally((row) => row.event?.responseStatus === "error"),
  );
  addCard(
    "无效行 / Invalid",
    tally((row) => row.state === "invalid" || row.state === "malformed"),
  );
  addCard(
    "未匹配 / Unmatched",
    tally((row) => ["unmatched", "pending", "replaced"].includes(row.state)),
  );

  for (const name of new Set(
    rows.map((row) => row.event?.sessionId).filter((id) => id !== undefined),
  )) {
    const option = document.createElement("option");
    option.value = name;
    option.textContent = name;
    session.append(option);
  }

  function searchable(row: Row): string {
    const event = row.event;
    return [
      event?.sessionId,
      event?.timestamp,
      event?.method,
      event?.toolName,
      event?.id,
      event?.parseError,
      event?.message === undefined ? "" : JSON.stringify(event.message),
    ]
      .map(text)
      .join(" ")
      .toLocaleLowerCase();
  }

  function apply(): void {
    const query = search.value.trim().toLocaleLowerCase();
    matches = rows.filter(
      (row) =>
        (!query || searchable(row).includes(query)) &&
        (!state.value || row.state === state.value) &&
        (!kind.value ||
          row.event?.kind === kind.value ||
          (kind.value === "malformed" && row.state === "malformed")) &&
        (!session.value || row.event?.sessionId === session.value),
    );
    shown = 0;
    body.replaceChildren();
    append();
  }

  function append(): void {
    const next = matches.slice(shown, shown + 200);
    const fragment = document.createDocumentFragment();
    for (const row of next) {
      const event = row.event;
      const tr = document.createElement("tr");
      tr.tabIndex = 0;
      cell(tr, String(row.line));
      cell(tr, text(event?.timestamp));
      cell(tr, text(event?.direction));
      cell(tr, text(event?.kind ?? "malformed"));
      cell(
        tr,
        [event?.method, event?.toolName]
          .filter((part) => part !== undefined)
          .join(" · ") || "—",
      );
      cell(tr, text(event?.id));
      const status = cell(tr, "");
      const pill = document.createElement("span");
      pill.className = `pill ${row.state}`;
      pill.textContent = labels[row.state] ?? row.state;
      status.append(pill);
      cell(
        tr,
        event?.durationMs === undefined
          ? "—"
          : `${event.durationMs.toFixed(2)} ms`,
      );
      tr.addEventListener("click", () => show(row));
      tr.addEventListener("keydown", (keyboardEvent) => {
        if (keyboardEvent.key === "Enter" || keyboardEvent.key === " ") {
          keyboardEvent.preventDefault();
          show(row);
        }
      });
      fragment.append(tr);
    }
    body.append(fragment);
    shown += next.length;
    count.textContent = `已显示 ${shown} / 匹配 ${matches.length} / 总计 ${rows.length} 行 · Showing ${shown} of ${matches.length} matches (${rows.length} total)`;
    more.disabled = shown >= matches.length;
    more.textContent = more.disabled
      ? "已显示全部 / All shown"
      : "显示更多 / Show more";
  }

  function show(row: Row): void {
    const event = row.event;
    detail.classList.remove("hidden");
    element("detail-title").textContent =
      `第 ${row.line} 行 · ${labels[row.state] ?? row.state}`;
    const meta = element("meta");
    meta.replaceChildren();
    const entries: [string, unknown][] = [
      ["会话 / Session", event?.sessionId],
      ["序号 / Sequence", event?.sequence],
      ["方向 / Direction", event?.direction],
      ["方法 / Method", event?.method],
      ["工具 / Tool", event?.toolName],
      ["配对行 / Paired line", row.pairLine],
      [
        "耗时 / Duration",
        event?.durationMs === undefined ? undefined : `${event.durationMs} ms`,
      ],
      ["解析错误 / Parse error", event?.parseError],
    ];
    for (const [name, value] of entries) {
      if (value === undefined) continue;
      const box = document.createElement("div");
      const heading = document.createElement("b");
      heading.textContent = name;
      const span = document.createElement("span");
      span.textContent = text(value);
      box.append(heading, span);
      meta.append(box);
    }
    element("payload").textContent =
      event?.message === undefined
        ? "无已保存消息 / No saved message"
        : JSON.stringify(event.message, null, 2);
    detail.scrollIntoView({ block: "nearest" });
  }

  for (const input of [search, state, kind, session]) {
    input.addEventListener(input === search ? "input" : "change", apply);
  }
  more.addEventListener("click", append);
  apply();
}
