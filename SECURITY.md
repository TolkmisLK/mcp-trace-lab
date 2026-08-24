# Security policy / 安全策略

## Supported versions / 支持版本

Until the first stable release, security fixes are applied to the latest commit on `main`.

首个稳定版本发布前，安全修复仅应用于 `main` 的最新提交。

## Reporting a vulnerability / 报告漏洞

Please use the repository's **Private vulnerability reporting** feature. Do not place sensitive reproduction data in a public issue.

请使用仓库的 **Private vulnerability reporting（私密漏洞报告）** 功能。不要在公开 Issue 中提交敏感复现数据。

## Threat model / 威胁模型

MCP Trace Lab protects against accidental persistence of common credential fields; it is not a data-loss-prevention system.

MCP Trace Lab 用于降低常见凭据字段被意外持久化的风险，但它不是数据防泄漏系统。

### Trust boundaries / 信任边界

- The MCP client and wrapped server are trusted to execute locally.  
  MCP 客户端和被包装服务被视为可信本地进程。
- Trace files are sensitive local artifacts. They are not safe to publish without review.  
  追踪文件属于敏感本地产物，未经审查不得公开。
- The inspector parses JSON but never executes captured values.  
  分析器只解析 JSON，不执行捕获内容。
- Server stderr is forwarded and not recorded by this project. The surrounding client may still persist it.  
  服务端 stderr 只转发、不由本项目记录，但外围客户端仍可能保存它。

## Redaction behavior / 脱敏行为

Default key matching is case-insensitive and separator-insensitive. It covers common authorization, API key, token, password, secret, cookie, and credential names. Bearer/Basic values and credentials embedded in URLs are also replaced. Use repeated `--redact-key` options for domain-specific identifiers.

默认字段匹配不区分大小写及分隔符，覆盖常见 Authorization、API Key、Token、密码、Secret、Cookie 和 Credential 名称；Bearer/Basic 值及 URL 内嵌凭据也会替换。业务特有标识应通过重复的 `--redact-key` 配置。

### Known limitations / 已知限制

- Secrets in arbitrary free text may remain if they do not match supported patterns.  
  任意自由文本中的秘密若不匹配现有模式，可能仍会保留。
- Field-name redaction cannot determine whether all business data is safe to share.  
  按字段名脱敏无法判断全部业务数据是否适合公开。
- SHA-256 fingerprints of invalid lines can reveal equality between repeated payloads.  
  无效行的 SHA-256 指纹可能暴露重复载荷之间的相等关系。
- File permissions follow the current OS defaults and process umask.  
  文件权限遵循当前操作系统默认值及进程 umask。

## Safe operation checklist / 安全使用清单

1. Store traces outside repositories and keep `*.trace.jsonl` ignored.  
   将追踪文件保存在仓库之外，并保持 `*.trace.jsonl` 被忽略。
2. Add application-specific sensitive keys before recording.  
   记录前配置业务特有敏感字段。
3. Review the full trace before sharing, even when no obvious credential appears.  
   即使未发现明显凭据，分享前也要完整审查。
4. Delete traces when the investigation is complete.  
   调查完成后删除追踪文件。
