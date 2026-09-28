# 离线 HTML 追踪报告 / Offline HTML report

HTML 报告把一份 JSONL 追踪记录整理为可筛选的时间线，适合先定位失败调用，再查看该调用保存的请求和响应内容。它是本地生成的单个文件，不需要启动服务，也不加载远程资源。

The report turns one JSONL trace into a searchable timeline. It is a single local file; no server or remote resources are required.

## 生成 / Generate

先在仓库目录构建，再指定输入与新的输出路径：

```bash
npm ci
npm run build
node dist/cli.js report --output traces/demo.trace.html examples/demo.trace.jsonl
```

Open `traces/demo.trace.html` in a browser. For your own trace, replace the last argument with its path. The command refuses to overwrite an existing report; choose a new output name for another run.

在浏览器中打开 `traces/demo.trace.html`。分析自己的记录时，把最后一个参数替换成追踪文件路径。重复生成时请换一个输出文件名；命令不会覆盖已有报告。

## 定位失败 / Find a failure

1. 在“状态 / Status”选择“错误 / Error”，查看 JSON-RPC `error` 响应。也可选择“协议无效”“追踪行无效”“未匹配响应”或“未响应”。
2. 用“搜索 / Search”输入方法名、工具名、ID 或已保存的消息内容；按类型和会话继续缩小范围。
3. 选择时间线中的一行查看消息详情。“配对行”指出同一会话中按方向及 JSON-RPC ID 关联的请求或响应。
4. 响应行的耗时来自记录器保存的 `durationMs`。空白表示原始记录没有该值；报告不会从时间戳估算。

Use Status to find JSON-RPC errors, invalid lines, unmatched responses or unanswered requests. Search method, tool, ID or saved message text, then select a row for its payload and paired line. Duration is shown only when the trace contains `durationMs`.

## 边界 / Limits

- 报告按文件顺序显示事件；时间戳是记录字段，不用来重新排序。/ Rows retain file order; timestamps do not reorder them.
- 追加的多个会话按 `sessionId` 隔离关联。相同 ID 的后续请求会取代尚未配对的前一请求，前者标为“ID 被复用”。/ Sessions are isolated; reuse of a pending ID marks the earlier request as replaced.
- “错误”指 JSON-RPC `error` 响应。工具结果 `isError` 仍可在保存的消息中看到，但不计入该计数。/ Error counts refer to JSON-RPC errors, not tool result `isError` values.
- 格式无效的追踪行只显示行号；无效协议消息显示记录器保存的解析原因与指纹，不恢复原始内容。/ Malformed trace rows show only line numbers. Invalid protocol events show saved metadata, not discarded raw content.
- 输入上限为 10 MiB 和 10,000 个非空行，超限会报错且不会生成报告。时间线每次显示最多 200 行，可继续点击“显示更多”。/ The 10 MiB and 10,000 row limits avoid an oversized standalone page; timeline rows are shown in batches of 200.
- 报告内嵌追踪数据，仍可能包含自由文本中的秘密或业务数据。分享前审查和脱敏 HTML 与原追踪文件。/ The embedded trace may retain sensitive data. Review and redact both files before sharing.
