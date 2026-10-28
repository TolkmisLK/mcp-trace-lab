# Changelog / 变更日志

All notable changes are documented here. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project uses [Semantic Versioning](https://semver.org/).

所有重要变更均记录于此。格式遵循 Keep a Changelog，版本遵循 Semantic Versioning。

## [Unreleased]

### Added / 新增

- `record --capture redacted|metadata` with backward-compatible redacted capture by default. Metadata mode omits saved payloads while retaining correlation, timings, and failure diagnostics; HTML details identify intentionally omitted payloads.
  新增 `record --capture redacted|metadata`，默认兼容原脱敏采集。元数据模式省略已保存载荷，保留配对、耗时及失败诊断，HTML 详情明确标识未采集正文。
- Transparent MCP stdio proxy with bidirectional backpressure.  
  支持双向背压的透明 MCP stdio 代理。
- Redacted JSONL trace recording with per-session identity.  
  带会话标识的脱敏 JSONL 追踪记录。
- Request/response, method, and `tools/call` correlation.  
  请求响应、方法及 `tools/call` 关联。
- Text and JSON trace summaries.  
  文本与 JSON 追踪摘要。
- Unit and subprocess integration test coverage.  
  单元测试与子进程集成测试覆盖。
