#!/usr/bin/env node

import { parseArgs } from "node:util";

import {
  formatJsonSummary,
  formatTextSummary,
  inspectTrace,
} from "./inspect.js";
import { runRecord } from "./record-command.js";

const HELP = `MCP Trace Lab — local-first MCP stdio recorder / 本地优先的 MCP stdio 记录器

Usage / 用法:
  mcp-trace record --output <trace.jsonl> [--redact-key <key>] -- <server> [args...]
  mcp-trace inspect [--format text|json] <trace.jsonl>
  mcp-trace --help

Examples / 示例:
  mcp-trace record --output traces/demo.trace.jsonl -- node server.js
  mcp-trace inspect traces/demo.trace.jsonl

Security / 安全:
  Traces may still contain sensitive application data. Keep them local and review before sharing.
  追踪文件仍可能包含敏感业务数据；请保留在本地，并在分享前进行审查。
`;

class CliError extends Error {}

function parseRecordArguments(arguments_: readonly string[]): {
  output: string;
  redactKeys: string[];
  command: string;
  commandArguments: string[];
} {
  const separatorIndex = arguments_.indexOf("--");
  const optionArguments =
    separatorIndex >= 0 ? arguments_.slice(0, separatorIndex) : arguments_;
  const commandArguments =
    separatorIndex >= 0 ? arguments_.slice(separatorIndex + 1) : [];
  const parsed = parseArgs({
    args: [...optionArguments],
    options: {
      output: { type: "string", short: "o" },
      "redact-key": { type: "string", multiple: true },
    },
    strict: true,
    allowPositionals: false,
  });

  if (parsed.values.output === undefined) {
    throw new CliError(
      "Missing --output <trace.jsonl> / 缺少 --output <trace.jsonl>",
    );
  }
  if (commandArguments.length === 0 || commandArguments[0] === undefined) {
    throw new CliError("Missing server command after -- / -- 后缺少服务端命令");
  }

  return {
    output: parsed.values.output,
    redactKeys: parsed.values["redact-key"] ?? [],
    command: commandArguments[0],
    commandArguments: commandArguments.slice(1),
  };
}

async function main(arguments_: readonly string[]): Promise<number> {
  if (
    arguments_.length === 0 ||
    arguments_.includes("--help") ||
    arguments_.includes("-h")
  ) {
    process.stdout.write(HELP);
    return 0;
  }

  const [command, ...rest] = arguments_;
  if (command === "record") {
    return runRecord(parseRecordArguments(rest));
  }

  if (command === "inspect") {
    const parsed = parseArgs({
      args: rest,
      options: { format: { type: "string", short: "f", default: "text" } },
      strict: true,
      allowPositionals: true,
    });
    const tracePath = parsed.positionals[0];
    if (tracePath === undefined) {
      throw new CliError("Missing trace path / 缺少追踪文件路径");
    }
    if (parsed.positionals.length > 1) {
      throw new CliError(
        "Only one trace path is accepted / 只能指定一个追踪文件",
      );
    }
    if (parsed.values.format !== "text" && parsed.values.format !== "json") {
      throw new CliError(
        "--format must be text or json / --format 必须是 text 或 json",
      );
    }

    const summary = await inspectTrace(tracePath);
    process.stdout.write(
      parsed.values.format === "json"
        ? formatJsonSummary(summary)
        : formatTextSummary(summary),
    );
    return 0;
  }

  throw new CliError(`Unknown command: ${command ?? ""} / 未知命令`);
}

main(process.argv.slice(2))
  .then((exitCode) => {
    process.exitCode = exitCode;
  })
  .catch((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write(`mcp-trace: ${message}\n`);
    process.exitCode = 1;
  });
