# Trace format / 追踪格式

Trace files use UTF-8 JSON Lines. Each line is an independent event; multiple recorder sessions may be appended to the same file and are separated by `sessionId`.

追踪文件采用 UTF-8 JSON Lines。每行是独立事件；同一文件可以追加多个记录会话，并通过 `sessionId` 区分。

## Event fields / 事件字段

| Field / 字段     | Type / 类型             | Meaning / 含义                                                                                       |
| ---------------- | ----------------------- | ---------------------------------------------------------------------------------------------------- |
| `schemaVersion`  | string                  | Trace contract version / 追踪契约版本                                                                |
| `sessionId`      | UUID string             | Recorder process session / 记录进程会话                                                              |
| `sequence`       | integer                 | Monotonic within one session / 单次会话内单调递增                                                    |
| `timestamp`      | ISO 8601 string         | Observation wall-clock time / 观察时钟时间                                                           |
| `direction`      | enum                    | `client_to_server`（客户端到服务端）或 `server_to_client`（服务端到客户端）                          |
| `kind`           | enum                    | `request`（请求）、`notification`（通知）、`response`（响应）或 `invalid`（无效消息）                |
| `byteLength`     | integer                 | Original line size excluding delimiter / 不含分隔符的原始行字节数                                    |
| `method`         | string, optional        | JSON-RPC method; copied to correlated responses / JSON-RPC 方法；会复制到关联响应                    |
| `id`             | string, number, or null | JSON-RPC identifier / JSON-RPC 标识符                                                                |
| `toolName`       | string, optional        | `params.name` for `tools/call`; copied to its response / `tools/call` 的 `params.name`，并复制到响应 |
| `responseStatus` | enum, optional          | `ok` or `error` / 成功或错误                                                                         |
| `durationMs`     | number, optional        | Monotonic request-to-response duration / 单调时钟测得的请求响应耗时                                  |
| `capturePolicy`  | enum, optional          | `redacted` or `metadata`; policy for this event / `redacted` 或 `metadata`，本事件采用的采集策略     |
| `message`        | JSON, optional          | Parsed message after redaction / 脱敏后的已解析消息                                                  |
| `parseError`     | string, optional        | Why an event is invalid / 事件无效原因                                                               |
| `contentSha256`  | string, optional        | Fingerprint for an invalid raw line / 无效原始行指纹                                                 |

## Example / 示例

```json
{
  "schemaVersion": "1.0",
  "sessionId": "a09c9e5c-4e21-4f6a-bb6e-cf573d8e74c8",
  "sequence": 1,
  "timestamp": "2026-08-24T08:00:00.000Z",
  "direction": "client_to_server",
  "kind": "request",
  "byteLength": 132,
  "method": "tools/call",
  "id": 3,
  "toolName": "weather",
  "message": {
    "jsonrpc": "2.0",
    "id": 3,
    "method": "tools/call",
    "params": { "name": "weather", "arguments": { "apiKey": "[REDACTED]" } }
  }
}
```

## Compatibility policy / 兼容策略

- Readers must ignore unknown fields. / 读取器必须忽略未知字段。
- Additive optional fields do not change the major schema version. / 新增可选字段不提升主版本。
- Removing or redefining a field requires a major schema version change. / 删除或重新定义字段必须提升主版本。
- Invalid protocol payloads are fingerprinted but never stored verbatim. / 无效协议载荷仅保留指纹，不保存原文。

## Payload capture / 载荷采集

New events include `capturePolicy`, including invalid protocol events. `redacted` is the default and preserves the existing redacted `message` behavior. With `metadata`, `message` is absent for every event; parsed request arguments, results, error details, notification data, and extra message fields are not persisted. The recorder still classifies and correlates the original message and computes `toolError` before omitting the payload. Protocol forwarding is unchanged.

新事件均包含 `capturePolicy`，包括无效协议事件。默认 `redacted` 沿用已有的脱敏 `message` 行为。`metadata` 下所有事件均不含 `message`；已解析的请求参数、结果、错误详情、通知数据和额外消息字段都不落盘。记录器仍根据原消息分类和配对，在省略载荷前计算 `toolError`，协议转发不变。

This optional field keeps schema version `1.0`. Old events without the field remain readable; a missing `message` in an old event does not establish its capture policy. Policies may differ across sessions appended to the same file, so readers must use each event's field. Metadata retains IDs, names, timestamps, lengths and invalid-line fingerprints and may still be sensitive.

该可选字段不改变 `1.0` 契约版本。没有该字段的旧事件仍可读取；旧事件缺少 `message` 时不能据此推断采集策略。同一文件追加的会话可使用不同策略，读取器应逐事件判断。元数据保留 ID、名称、时间戳、长度及无效行指纹，仍可能敏感。

## 工具执行失败 / Tool execution failure

`toolError` 是可选布尔字段。新记录器在配对的 `tools/call` 响应中读取原始 `result.isError === true`，在脱敏消息之外保存 `toolError: true`，所以自定义脱敏 `isError` 时仍能诊断。`responseStatus` 保留 JSON-RPC 含义，工具失败的正常协议响应仍为 `ok`。旧记录可由已保存消息推断，已脱敏的历史字段无法恢复。

The optional boolean `toolError` preserves the diagnosis before message redaction. JSON-RPC `responseStatus` keeps its meaning. Inspect adds top-level `protocolErrors` and `toolErrors`, plus `toolErrors` per method/tool. Existing `errors` fields continue to count JSON-RPC errors only.

参考 / Reference: [MCP 工具错误处理规范](https://github.com/modelcontextprotocol/modelcontextprotocol/blob/main/docs/specification/2025-11-25/server/tools.mdx#error-handling).
