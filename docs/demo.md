# Run the example / 运行自带示例

这个示例不需要安装 MCP 客户端，也不需要 API 密钥。它启动仓库里的小型 stdio 服务，完成初始化、查询工具、调用 `echo`，最后调用故意报错的 `fail`。

The example starts a bundled stdio server, initializes a session, lists its tools, calls `echo`, and calls `fail` to produce a JSON-RPC error. No MCP client or API key is needed.

## Start / 开始

安装 Node.js 22 或更新版本，下载或克隆仓库，在仓库目录执行：

```bash
npm ci
npm run demo
```

The command builds the CLI and runs the example. Every run creates a fresh file under `traces/demo-*/session.trace.jsonl`; the final line prints its full path.

命令会先构建 CLI，再运行示例。每次会在 `traces/demo-*/session.trace.jsonl` 保存一份新记录，结尾显示完整路径，不会覆盖前一次结果。

## Read the result / 看懂结果

下面是一次实际运行的输出，耗时随电脑和运行情况变化：

```text
MCP Trace Lab · Trace summary / 追踪摘要
File / 文件: session.trace.jsonl
Events / 事件: 9
Sessions / 会话: 1
Protocol invalid / 协议无效: 0
Trace parse errors / 追踪解析错误: 0

Kinds / 类型
  requests=4 notifications=1 responses=4 invalid=0

Methods / 方法
  initialize                 req=1 notif=0 res=1 err=0 avg=46.22 ms
  notifications/initialized  req=0 notif=1 res=0 err=0 avg=-
  tools/call                 req=2 notif=0 res=2 err=1 avg=0.56 ms
  tools/list                 req=1 notif=0 res=1 err=0 avg=0.27 ms

Tools / 工具
  echo  calls=1 err=0 avg=0.32 ms
  fail  calls=1 err=1 avg=0.79 ms
```

This output comes from one run; timings will vary.

| 结果 / Result        | 含义 / Meaning                                                                   |
| -------------------- | -------------------------------------------------------------------------------- |
| 9 events             | 4 个请求、4 个响应、1 个初始化完成通知 / 4 requests, 4 responses, 1 notification |
| `echo calls=1 err=0` | 一次成功调用 / One successful call                                               |
| `fail calls=1 err=1` | 示例故意返回的 JSON-RPC 错误 / The intentional JSON-RPC error                    |
| `invalid=0`          | 没有无法解析的协议消息 / No invalid protocol messages                            |

`err=1` 是演示的一部分。它演示的是 JSON-RPC `error` 响应，不是工具结果里的 `isError` 字段。

The intentional failure is a JSON-RPC `error` response, not an `isError` tool result.

`echo` 请求带有名为 `apiKey` 的示例字符串。打开生成的记录，这个字段的值会显示为 `[REDACTED]`。普通的 `text` 内容仍然保留。示例会自动核对这些结果，出错时返回非零退出码。

The `echo` request includes a dummy `apiKey`. The saved trace replaces its value with `[REDACTED]` and keeps the ordinary `text` field. The example checks these results and exits with a nonzero code if they differ.

## Inspect it again / 再次查看

把命令中的路径替换为刚才输出的实际文件路径：

```bash
node dist/cli.js inspect traces/demo-XXXXXX/session.trace.jsonl
node dist/cli.js inspect --format json traces/demo-XXXXXX/session.trace.jsonl
```

Replace `demo-XXXXXX` with the directory printed by your run.

也可以先分析仓库内这份[演示记录](../examples/demo.trace.jsonl)，无需重新启动示例服务：

```bash
node dist/cli.js inspect examples/demo.trace.jsonl
```

The checked-in trace contains only this example's synthetic messages. You can inspect it without running the server again.

## Files / 文件

- [demo-server.mjs](../examples/demo-server.mjs)：只供演示的 stdio 服务 / the demonstration server.
- [run-demo.mjs](../examples/run-demo.mjs)：按顺序发送请求、读取响应，并检查记录结果 / the client sequence and result checks.
- [demo.trace.jsonl](../examples/demo.trace.jsonl)：上面这次运行生成的记录 / the trace from the run shown above.

## If it fails / 遇到问题

- `node` 找不到：安装 Node.js 22 或更新版本，重新打开终端。 / Install Node.js 22+ and reopen the terminal.
- `dist` 文件不存在：运行 `npm run build`，或直接运行 `npm run demo`。 / Build first, or use `npm run demo`.
- 无法写入 `traces/`：把仓库放到自己有写权限的目录。 / Use a writable checkout.

接入自己的 MCP 服务时，按 [README 的客户端配置](../README.md#mcp-client-configuration--mcp-客户端配置)替换命令与路径。自己的记录仍可能包含业务内容，分享前需要检查。

For your own server, follow the [client configuration](../README.md#mcp-client-configuration--mcp-客户端配置). Review your own traces before sharing; key-based redaction does not remove every kind of application data.
