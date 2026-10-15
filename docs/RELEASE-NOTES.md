# 循迹命令行预览包 / CLI preview

需要 Node.js 22+。本预览包包含已编译 CLI，无需安装 TypeScript 或从源码构建；没有发布到 npm registry。

从本页下载 `.tgz` 和 `.sha256`，核对 SHA-256 后，在一个新目录运行：

```sh
npm install --ignore-scripts ./mcp-trace-lab-0.2.0-preview.2.tgz
node node_modules/mcp-trace-lab/dist/cli.js --help
node node_modules/mcp-trace-lab/examples/run-demo.mjs
```

把上述路径中的文件名替换为实际下载文件；PowerShell 也可逐行执行。演示生成的记录位于安装包内的 `traces/demo-*`。CLI 支持 `record`、`inspect`、`report`；完整中文步骤随包位于 `node_modules/mcp-trace-lab/docs`。

- JSON-RPC 错误与工具执行失败分开统计；报告可单独筛选工具失败。
- `inspect --fail-on-error` 输出摘要，并在发现错误时返回退出码 2。
- 离线报告不请求网络，但追踪内容仍可能包含敏感信息，分享前需检查。
- 发布包包含安全与追踪数据指南，README 中的本地文档链接已由打包检查逐一验证。
- 自动化验证包括质量检查、从本 tgz 安装、执行示例、读取摘要与生成报告。没有据此宣称任意 MCP 客户端兼容或真实浏览器视觉验收。

## English

Requires Node.js 22+. Download and checksum the `.tgz`, then run the commands above in a new directory. The archive includes compiled JavaScript, documentation and the local demo; no TypeScript build is needed. This is a GitHub prerelease, not an npm registry publication.

Protocol errors and tool execution failures are diagnosed separately. `inspect --fail-on-error` still prints its summary and exits 2 on detected failures. Reports remain offline and may contain sensitive trace data. CI installs the exact archive and exercises its demo, inspector and report generator; broad MCP-client compatibility and browser visual acceptance are not implied.

The archive includes the security and trace-data guide. Package verification checks every local Markdown link against the files in the actual archive.
