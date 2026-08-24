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
| `direction`      | enum                    | `client_to_server` or `server_to_client`                                                             |
| `kind`           | enum                    | `request`, `notification`, `response`, or `invalid`                                                  |
| `byteLength`     | integer                 | Original line size excluding delimiter / 不含分隔符的原始行字节数                                    |
| `method`         | string, optional        | JSON-RPC method; copied to correlated responses / JSON-RPC 方法；会复制到关联响应                    |
| `id`             | string, number, or null | JSON-RPC identifier / JSON-RPC 标识符                                                                |
| `toolName`       | string, optional        | `params.name` for `tools/call`; copied to its response / `tools/call` 的 `params.name`，并复制到响应 |
| `responseStatus` | enum, optional          | `ok` or `error` / 成功或错误                                                                         |
| `durationMs`     | number, optional        | Monotonic request-to-response duration / 单调时钟测得的请求响应耗时                                  |
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
