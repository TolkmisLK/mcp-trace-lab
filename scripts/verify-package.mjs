import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import {
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, dirname, join, posix, resolve } from "node:path";

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
const packageFiles = new Set(
  packed[0].files.map(({ path }) => path.replaceAll("\\", "/")),
);
const requiredGuides = [
  "README.md",
  "SECURITY.md",
  "docs/RELEASE-NOTES.md",
  "docs/architecture.md",
  "docs/demo.md",
  "docs/html-report.md",
  "docs/trace-format.md",
];
for (const guide of requiredGuides)
  assert.ok(packageFiles.has(guide), `Missing packaged guide: ${guide}`);
for (const path of packageFiles)
  assert.doesNotMatch(path, /^(?:\.github|scripts|src|tests?)\//);
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
  const markdownFiles = [...packageFiles].filter((path) =>
    path.endsWith(".md"),
  );
  for (const markdownPath of markdownFiles) {
    const markdown = await readFile(
      join(installed, ...markdownPath.split("/")),
      "utf8",
    );
    for (const match of markdown.matchAll(/!?\[[^\]]*\]\(([^)]+)\)/g)) {
      const rawTarget = match[1].trim();
      const target = rawTarget.startsWith("<")
        ? rawTarget.slice(1, rawTarget.indexOf(">"))
        : rawTarget.split(/\s+/u, 1)[0];
      if (
        !target ||
        target.startsWith("#") ||
        target.startsWith("//") ||
        /^[a-z][a-z\d+.-]*:/iu.test(target)
      )
        continue;
      const encodedPath = target.split(/[?#]/u, 1)[0];
      if (!encodedPath) continue;
      assert.ok(
        !encodedPath.startsWith("/"),
        `${markdownPath} links outside the package: ${target}`,
      );
      const linkedPath = posix.normalize(
        posix.join(
          posix.dirname(markdownPath),
          decodeURIComponent(encodedPath),
        ),
      );
      assert.ok(
        linkedPath !== ".." && !linkedPath.startsWith("../"),
        `${markdownPath} links outside the package: ${target}`,
      );
      assert.ok(
        packageFiles.has(linkedPath),
        `${markdownPath} links to a missing packaged file: ${target}`,
      );
      assert.ok(
        (await stat(join(installed, ...linkedPath.split("/")))).isFile(),
        `${markdownPath} link is not a packaged file: ${target}`,
      );
    }
  }
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
