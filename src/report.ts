import { createHash } from "node:crypto";
import { mkdir, stat, writeFile } from "node:fs/promises";
import { basename, dirname, resolve } from "node:path";

import { requestKey } from "./protocol.js";
import { reportClient } from "./report-client.js";
import { readTrace } from "./trace-reader.js";
import type { Direction, TraceEvent } from "./types.js";

const MAX_TRACE_BYTES = 10 * 1024 * 1024;
const MAX_ROWS = 10_000;

interface ReportRow {
  line: number;
  event?: TraceEvent;
  state:
    | "pending"
    | "ok"
    | "error"
    | "invalid"
    | "malformed"
    | "unmatched"
    | "notification"
    | "unknown"
    | "replaced";
  pairLine?: number;
}

function opposite(direction: Direction): Direction {
  return direction === "client_to_server"
    ? "server_to_client"
    : "client_to_server";
}

function pairKey(event: TraceEvent, direction: Direction): string {
  return JSON.stringify([
    event.sessionId,
    direction,
    requestKey(event.id ?? null),
  ]);
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => {
    const replacements: Record<string, string> = {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;",
    };
    return replacements[character] ?? character;
  });
}

function safeJson(value: unknown): string {
  return JSON.stringify(value).replace(
    /[<>&\u2028\u2029]/g,
    (character) =>
      `\\u${character.charCodeAt(0).toString(16).padStart(4, "0")}`,
  );
}

function hash(value: string): string {
  return createHash("sha256").update(value).digest("base64");
}

const CSS = `:root{font:15px/1.5 system-ui,"Microsoft YaHei",sans-serif;color:#e7edf4;background:#0d1420;color-scheme:dark}*{box-sizing:border-box}body{margin:0}header{padding:32px max(24px,calc((100vw - 1200px)/2));background:#172337;border-bottom:1px solid #344359}h1{margin:0 0 5px;font-size:27px}h2{font-size:17px;margin:0 0 12px}.sub{color:#aebed0;margin:0}.wrap{max-width:1248px;margin:auto;padding:24px}.notice{border:1px solid #947448;background:#322b20;color:#f5d6a7;padding:11px 15px;border-radius:8px;margin-bottom:20px}.cards{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:12px;margin-bottom:22px}.card{background:#1a283a;border:1px solid #344359;border-radius:9px;padding:14px}.card strong{display:block;font-size:25px}.card span{color:#afc0d1;font-size:13px}.panel{background:#162235;border:1px solid #344359;border-radius:10px;padding:18px;margin-bottom:20px}.filters{display:grid;grid-template-columns:minmax(200px,2fr) repeat(3,minmax(130px,1fr));gap:10px}label{display:block;color:#b9c9d8;font-size:13px}input,select,button{font:inherit}input,select{width:100%;margin-top:5px;border:1px solid #50617a;border-radius:6px;background:#101a29;color:#f0f4f8;padding:8px}input:focus,select:focus,button:focus{outline:2px solid #67b9e8;outline-offset:2px}.table-wrap{overflow:auto}table{width:100%;border-collapse:collapse;min-width:860px}th{text-align:left;color:#aebed0;font-size:12px;letter-spacing:.02em;background:#1e2c40}td,th{padding:10px 8px;border-bottom:1px solid #2d3c50;vertical-align:top}tbody tr{cursor:pointer}tbody tr:hover,tbody tr:focus{background:#26374d;outline:0}td{word-break:break-word}code,pre{font:12px/1.5 ui-monospace,SFMono-Regular,Consolas,monospace}code{color:#c5e5fb}.pill{display:inline-block;padding:2px 7px;border-radius:99px;background:#344862;white-space:nowrap;font-size:12px}.error,.invalid,.malformed,.unmatched,.replaced{background:#673334;color:#ffd4ce}.pending,.unknown{background:#645022;color:#ffe3a6}.ok{background:#245b4b;color:#cbf3df}.small{color:#afc0d1;font-size:13px}.actions{display:flex;align-items:center;justify-content:space-between;gap:10px;margin-top:12px}button{background:#295b80;border:1px solid #5292bd;color:white;padding:8px 14px;border-radius:6px;cursor:pointer}button:disabled{opacity:.5;cursor:default}pre{background:#0c1624;border:1px solid #344359;padding:14px;overflow:auto;max-height:440px;white-space:pre-wrap;word-break:break-word}.detail-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(230px,1fr));gap:8px;margin:12px 0}.detail-grid div{background:#1d2b3e;padding:9px;border-radius:5px}.detail-grid b{display:block;font-size:12px;color:#adbfce}.hidden{display:none}@media(max-width:760px){.filters{grid-template-columns:1fr 1fr}header{padding:24px}.wrap{padding:16px}}`;

const JS = `(${reportClient.toString()})();`;

export async function generateHtmlReport(
  tracePath: string,
  outputPath: string,
): Promise<void> {
  const input = resolve(tracePath);
  const output = resolve(outputPath);
  if (input === output)
    throw new Error("Input and output must differ / 输入与输出不能相同");
  const file = await stat(input);
  if (!file.isFile())
    throw new Error("Trace must be a file / 追踪路径必须是文件");
  if (file.size > MAX_TRACE_BYTES)
    throw new Error(
      "Trace exceeds 10 MiB report limit / 追踪文件超过报告的 10 MiB 限制",
    );
  const rows: ReportRow[] = [];
  const pending = new Map<string, ReportRow>();
  for await (const line of readTrace(input, { maxBytes: MAX_TRACE_BYTES })) {
    if (rows.length >= MAX_ROWS)
      throw new Error(
        "Trace exceeds 10,000 report rows / 追踪文件超过 10,000 行报告限制",
      );
    if ("malformed" in line) {
      rows.push({ line: line.lineNumber, state: "malformed" });
      continue;
    }
    const event = line.event;
    const row: ReportRow = { line: line.lineNumber, event, state: "unknown" };
    rows.push(row);
    if (event.kind === "invalid") row.state = "invalid";
    else if (event.kind === "notification") row.state = "notification";
    else if (event.kind === "request") {
      row.state = "pending";
      if (event.id !== undefined) {
        const key = pairKey(event, event.direction);
        const previous = pending.get(key);
        if (previous !== undefined) previous.state = "replaced";
        pending.set(key, row);
      }
    } else if (event.kind === "response") {
      row.state = event.responseStatus ?? "unknown";
      if (event.id !== undefined) {
        const key = pairKey(event, opposite(event.direction));
        const request = pending.get(key);
        if (request === undefined) row.state = "unmatched";
        else {
          pending.delete(key);
          request.state = row.state;
          request.pairLine = row.line;
          row.pairLine = request.line;
        }
      } else row.state = "unmatched";
    }
  }
  const title = `MCP Trace Lab · ${basename(input)}`;
  const csp = `default-src 'none'; script-src 'sha256-${hash(JS)}'; style-src 'sha256-${hash(CSS)}'; img-src 'none'; connect-src 'none'; form-action 'none'; base-uri 'none'`;
  const html = `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="${csp}"><title>${escapeHtml(title)}</title><style>${CSS}</style></head><body><header><h1>MCP Trace Lab · 追踪报告</h1><p class="sub">${escapeHtml(basename(input))} · Offline trace report / 离线报告</p></header><main class="wrap"><p class="notice">报告包含追踪文件中已保存的消息内容，可能仍有敏感信息。分享前请审查并脱敏。 / This report may contain sensitive trace data. Review before sharing.</p><section class="cards" id="cards" aria-label="概览 / Overview"></section><section class="panel"><h2>筛选 / Filters</h2><div class="filters"><label>搜索 / Search<input id="search" type="search" placeholder="方法、工具、ID、消息内容"></label><label>状态 / Status<select id="state"><option value="">全部 / All</option><option value="error">错误 / Error</option><option value="invalid">协议无效 / Invalid</option><option value="malformed">追踪行无效 / Malformed</option><option value="unmatched">未匹配响应 / Unmatched</option><option value="pending">未响应 / Pending</option><option value="replaced">ID 被复用 / Replaced</option><option value="ok">成功 / OK</option></select></label><label>类型 / Kind<select id="kind"><option value="">全部 / All</option><option value="request">请求 / Request</option><option value="response">响应 / Response</option><option value="notification">通知 / Notification</option><option value="invalid">协议无效 / Invalid</option><option value="malformed">追踪行无效 / Malformed</option></select></label><label>会话 / Session<select id="session"><option value="">全部 / All</option></select></label></div></section><section class="panel"><h2>时间线 / Timeline</h2><div class="table-wrap"><table><thead><tr><th>行 / Line</th><th>时间 / Time</th><th>方向 / Direction</th><th>类型 / Kind</th><th>方法 / 工具</th><th>ID</th><th>状态 / Status</th><th>耗时 / Duration</th></tr></thead><tbody id="rows"></tbody></table></div><div class="actions"><span id="count" class="small"></span><button id="more" type="button">显示更多 / Show more</button></div></section><section class="panel hidden" id="detail" aria-live="polite"><h2 id="detail-title">事件详情 / Event detail</h2><div id="meta" class="detail-grid"></div><h2>已保存消息 / Saved message</h2><pre id="payload"></pre></section></main><script type="application/json" id="trace-data">${safeJson({ rows })}</script><script>${JS}</script></body></html>`;
  await mkdir(dirname(output), { recursive: true });
  await writeFile(output, html, { encoding: "utf8", flag: "wx" });
}
