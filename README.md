# MCP Trace Lab

> Record and inspect Model Context Protocol (MCP) stdio traffic.  
> 记录和分析 Model Context Protocol（MCP）的 stdio 通信。

MCP Trace Lab runs between an MCP client and a stdio server. It forwards the original byte stream, records redacted JSON-RPC events as JSONL, and correlates requests with responses to show tool calls, errors, and response times.

MCP Trace Lab 运行在 MCP 客户端与 stdio 服务端之间。它会转发原始字节流，将脱敏后的 JSON-RPC 事件记录为 JSONL，并关联请求与响应，统计工具调用、错误和响应耗时。

> **Project status / 项目状态:** `v0.1.0`, experimental. The CLI and trace format may evolve before the first stable release.  
> `v0.1.0` 实验阶段；首个稳定版本前，CLI 与追踪格式可能调整。

## When to use it / 使用场景

Use it when an MCP tool call fails or takes too long and you need to see the request and response. The recorder saves traces to a separate file, leaving stdout for protocol messages.

当 MCP 工具调用失败或响应慢，需要查看具体请求和响应时，可以使用它。记录保存在单独的文件中，stdout 继续用于协议通信。

## Features / 功能

- Transparent stdio forwarding with backpressure on both directions.  
  双向透明转发，并处理流背压。
- JSON-RPC request, notification, response, and invalid-message classification.  
  对 JSON-RPC 请求、通知、响应和无效消息分类。
- Request/response correlation, method metrics, tool-call metrics, errors, and duration.  
  关联请求与响应，统计方法、工具调用、错误和耗时。
- Recursive key-based redaction with extra keys configurable from the CLI.  
  递归按字段名脱敏，并支持通过 CLI 增加自定义敏感字段。
- Malformed lines: forward unchanged, persist only length and SHA-256.  
  无法解析的消息：原样转发，但仅持久化长度和 SHA-256。
- Text and JSON summaries.  
  提供文本摘要和 JSON 输出。

## Quick start / 快速开始

Requirements / 环境要求:

- Node.js 22+
- npm 10+

```bash
npm ci
npm run build
```

Wrap an existing MCP stdio server / 包装现有 MCP stdio 服务：

```bash
node dist/cli.js record \
  --output traces/session.trace.jsonl \
  -- node path/to/server.js
```

Add application-specific sensitive keys / 增加业务敏感字段：

```bash
node dist/cli.js record \
  --output traces/session.trace.jsonl \
  --redact-key tenantCode \
  --redact-key accountId \
  -- node path/to/server.js
```

Inspect a trace / 分析追踪文件：

```bash
node dist/cli.js inspect traces/session.trace.jsonl
node dist/cli.js inspect --format json traces/session.trace.jsonl
```

Example text output / 文本输出示例：

```text
MCP Trace Lab · Trace summary / 追踪摘要
File / 文件: session.trace.jsonl
Events / 事件: 9
Sessions / 会话: 1
Protocol invalid / 协议无效: 0
Trace parse errors / 追踪解析错误: 0

Methods / 方法
  tools/call  req=2 notif=0 res=2 err=1 avg=8.42 ms

Tools / 工具
  weather  calls=1 err=0 avg=6.11 ms
```

## MCP client configuration / MCP 客户端配置

Build the project first, then replace your MCP server command with the recorder. Use absolute paths because many MCP clients start servers with a different working directory.

先构建项目，再用记录器替换原 MCP Server 命令。建议全部使用绝对路径，因为许多 MCP 客户端会从不同的工作目录启动服务。

```json
{
  "mcpServers": {
    "example": {
      "command": "node",
      "args": [
        "/absolute/path/mcp-trace-lab/dist/cli.js",
        "record",
        "--output",
        "/absolute/path/traces/example.trace.jsonl",
        "--",
        "node",
        "/absolute/path/server.js"
      ]
    }
  }
}
```

## Development / 开发

```bash
npm run check
```

This runs ESLint, Prettier verification, strict TypeScript checking, unit and subprocess integration tests, then builds the CLI.

该命令依次执行 ESLint、Prettier 校验、严格 TypeScript 类型检查、单元与子进程集成测试，最后构建 CLI。

## Implementation notes / 实现说明

- **No runtime dependencies / 无运行时依赖:** the proxy uses Node.js streams and JSON-RPC framing directly.
- **Protocol isolation / 协议隔离:** the wrapped server is the only source written to stdout; diagnostics use stderr.
- **Forward first / 转发优先:** invalid messages are observable without changing their bytes in transit.
- **Local by default / 默认本地:** no telemetry, remote upload, or cloud service is included.
- **Transport support / 传输支持:** v0.1 supports stdio only; Streamable HTTP and HTML reports are future work.

See [Architecture / 架构](docs/architecture.md), [Trace format / 追踪格式](docs/trace-format.md), and [Security / 安全](SECURITY.md).

## Protocol compatibility / 协议兼容性

The recorder treats stdio payloads as newline-delimited JSON-RPC 2.0 and does not interpret protocol-version-specific fields. The implementation is aligned with the MCP `2026-07-28` stdio transport and base protocol documentation:

记录器将 stdio 数据视为按换行分隔的 JSON-RPC 2.0，不解释特定协议版本字段。当前实现参考 MCP `2026-07-28` 的 stdio 传输与基础协议文档：

- [MCP stdio transport](https://modelcontextprotocol.io/specification/2026-07-28/basic/transports/stdio)
- [MCP base protocol](https://modelcontextprotocol.io/specification/2026-07-28/basic)

## Roadmap / 路线图

- `v0.1`: stdio recording, redaction, correlation, text/JSON inspection.
- `v0.2`: configurable payload capture policies and standalone HTML report.
- Later / 后续: Streamable HTTP support only after the stdio behavior is stable.

## License / 许可证

[MIT](LICENSE) © 2026 NCC
