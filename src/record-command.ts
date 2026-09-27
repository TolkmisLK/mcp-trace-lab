import { spawn } from "node:child_process";
import { once } from "node:events";
import { resolve } from "node:path";
import type { Readable, Writable } from "node:stream";

import { LineObserver } from "./line-observer.js";
import { TraceRecorder } from "./recorder.js";

export interface RecordOptions {
  output: string;
  command: string;
  commandArguments: readonly string[];
  redactKeys?: readonly string[];
}

function forwardObserved(
  source: Readable,
  destination: Writable,
  observer: LineObserver,
  recorder: TraceRecorder,
  endDestination: boolean,
): () => void {
  let active = true;
  const onData = (chunk: Buffer | string): void => {
    if (!active) return;
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    const protocolReady = destination.write(buffer);
    const traceReady = observer.push(buffer);
    if (protocolReady && traceReady) {
      return;
    }

    source.pause();
    const ready = [
      ...(protocolReady ? [] : [once(destination, "drain")]),
      ...(traceReady ? [] : [recorder.waitForDrain()]),
    ];
    void Promise.all(ready).then(
      () => {
        if (active && !source.destroyed) source.resume();
      },
      () => undefined,
    );
  };
  const onEnd = (): void => {
    observer.end();
    if (endDestination) destination.end();
  };
  source.on("data", onData);
  source.once("end", onEnd);
  return () => {
    active = false;
    source.pause();
    source.off("data", onData);
    source.off("end", onEnd);
  };
}

export async function runRecord(options: RecordOptions): Promise<number> {
  const outputPath = resolve(options.output);
  const recorder = await TraceRecorder.create(outputPath, {
    ...(options.redactKeys === undefined
      ? {}
      : { additionalKeys: options.redactKeys }),
  });
  const child = spawn(options.command, [...options.commandArguments], {
    stdio: ["pipe", "pipe", "pipe"],
    env: process.env,
    windowsHide: true,
  });

  const clientObserver = new LineObserver((line) =>
    recorder.observe("client_to_server", line),
  );
  const serverObserver = new LineObserver((line) =>
    recorder.observe("server_to_client", line),
  );

  const stopClientForwarding = forwardObserved(
    process.stdin,
    child.stdin,
    clientObserver,
    recorder,
    true,
  );
  const stopServerForwarding = forwardObserved(
    child.stdout,
    process.stdout,
    serverObserver,
    recorder,
    false,
  );

  // A server may close stdin before its process exits. Stop reading the client
  // stream when its input pipe closes so an ordinary early exit cannot crash
  // the recorder with an unhandled EPIPE.
  const stdinFailure = new Promise<never>((_, reject) => {
    child.stdin.on("error", (error: NodeJS.ErrnoException) => {
      stopClientForwarding();
      if (error.code !== "EPIPE" && error.code !== "ERR_STREAM_DESTROYED") {
        reject(error);
      }
    });
  });
  child.stderr.pipe(process.stderr);

  const forwardSignal = (signal: NodeJS.Signals): void => {
    if (child.exitCode === null && child.signalCode === null) {
      child.kill(signal);
    }
  };
  const onSigint = (): void => forwardSignal("SIGINT");
  const onSigterm = (): void => forwardSignal("SIGTERM");
  process.once("SIGINT", onSigint);
  process.once("SIGTERM", onSigterm);

  let result: { code: number | null; signal: NodeJS.Signals | null };
  try {
    result = await Promise.race([
      once(child, "close").then((values) => {
        const [code, signal] = values as [number | null, NodeJS.Signals | null];
        return { code, signal };
      }),
      once(child, "error").then(([error]) => {
        throw error;
      }),
      stdinFailure,
    ]);
  } finally {
    process.removeListener("SIGINT", onSigint);
    process.removeListener("SIGTERM", onSigterm);
    stopClientForwarding();
    stopServerForwarding();
    clientObserver.end();
    serverObserver.end();
    await recorder.close();
  }

  return result.code ?? (result.signal === "SIGINT" ? 130 : 1);
}
