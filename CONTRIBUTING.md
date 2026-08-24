# Contributing / 贡献指南

Thank you for improving MCP Trace Lab. Please keep changes focused, reviewable, and supported by tests.

感谢你改进 MCP Trace Lab。请让改动保持聚焦、可审查，并由测试支撑。

## Workflow / 工作流

1. Create a branch from `main`, such as `feat/html-report` or `fix/stdio-shutdown`.  
   从 `main` 创建分支，例如 `feat/html-report` 或 `fix/stdio-shutdown`。
2. Add or update tests with the implementation.  
   实现功能时同步添加或更新测试。
3. Run `npm run check`.  
   执行 `npm run check`。
4. Use a purposeful Conventional Commit, for example `fix: preserve partial stdio frames`.  
   使用有明确目的的 Conventional Commit，例如 `fix: preserve partial stdio frames`。
5. Open a Pull Request explaining behavior, design choices, verification, and security impact.  
   创建 Pull Request，说明行为、设计选择、验证方法和安全影响。

## Design expectations / 设计要求

- Preserve byte-transparent protocol forwarding. / 保持协议字节透明转发。
- Never write diagnostics to protocol stdout. / 不得向协议 stdout 输出诊断。
- Treat trace content as sensitive by default. / 默认将追踪内容视为敏感数据。
- Prefer Node.js built-ins over new runtime dependencies. / 优先使用 Node.js 内置模块，谨慎增加运行时依赖。
- Avoid broad refactors mixed with behavior changes. / 避免将大范围重构与行为改动混在一起。

## Pull Request checklist / PR 检查清单

- [ ] Tests cover the changed behavior / 测试覆盖改动行为
- [ ] `npm run check` passes / 质量门禁通过
- [ ] Documentation reflects user-visible changes / 文档同步用户可见变化
- [ ] No credentials or real trace data are committed / 未提交凭据或真实追踪数据
