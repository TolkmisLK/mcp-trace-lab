import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import {
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rm,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";

const npmCli = process.env.npm_execpath;
assert.ok(npmCli, "Run npm run package:check / 请使用 npm run package:check");
const artifacts = resolve("package-artifacts");
await mkdir(artifacts, { recursive: true });
const packed = JSON.parse(
  execFileSync(
    process.execPath,
    [npmCli, "pack", "--json", "--pack-destination", artifacts],
    { encoding: "utf8", timeout: 60_000 },
  ),
);
assert.equal(packed.length, 1);
const archive = join(artifacts, basename(packed[0].filename));
const temporary = await mkdtemp(join(tmpdir(), "mcp-package-check-"));
const run = (...args) =>
  execFileSync(process.execPath, args, {
    cwd: temporary,
    encoding: "utf8",
    timeout: 30_000,
  });
try {
  run(
    npmCli,
    "install",
    "--prefix",
    temporary,
    "--ignore-scripts",
    "--no-audit",
    "--no-fund",
    "--offline",
    archive,
  );
  const installed = join(temporary, "node_modules", "mcp-trace-lab");
  const cli = join(installed, "dist", "cli.js");
  assert.match(run(cli, "--help"), /--fail-on-error/);
  run(join(installed, "examples", "run-demo.mjs"));
  const traces = await readdir(join(installed, "traces"));
  assert.equal(traces.length, 1);
  const input = join(installed, "traces", traces[0], "session.trace.jsonl");
  const summary = JSON.parse(run(cli, "inspect", "--format", "json", input));
  assert.equal(summary.protocolErrors, 1);
  run(cli, "report", "--output", join(temporary, "demo.html"), input);
  assert.match(
    await readFile(join(temporary, "demo.html"), "utf8"),
    /Content-Security-Policy/,
  );
  const digest = createHash("sha256")
    .update(await readFile(archive))
    .digest("hex");
  await writeFile(`${archive}.sha256`, `${digest}  ${basename(archive)}\n`);
  process.stdout.write(
    `Installed package passed / 安装包验证通过: ${basename(archive)}`,
  );
} finally {
  assert.equal(dirname(resolve(temporary)), resolve(tmpdir()));
  assert.ok(basename(temporary).startsWith("mcp-package-check-"));
  await rm(temporary, { recursive: true, force: true });
}
