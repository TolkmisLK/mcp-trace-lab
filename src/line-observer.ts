import { StringDecoder } from "node:string_decoder";

export class LineObserver {
  readonly #decoder = new StringDecoder("utf8");
  #buffer = "";

  constructor(private readonly onLine: (line: string) => boolean | void) {}

  push(chunk: Buffer): boolean {
    this.#buffer += this.#decoder.write(chunk);
    return this.#drainCompleteLines();
  }

  end(): boolean {
    this.#buffer += this.#decoder.end();
    if (this.#buffer.length > 0) {
      const canContinue =
        this.onLine(this.#stripCarriageReturn(this.#buffer)) !== false;
      this.#buffer = "";
      return canContinue;
    }
    return true;
  }

  #drainCompleteLines(): boolean {
    let canContinue = true;
    let newlineIndex = this.#buffer.indexOf("\n");
    while (newlineIndex >= 0) {
      const line = this.#buffer.slice(0, newlineIndex);
      this.#buffer = this.#buffer.slice(newlineIndex + 1);
      canContinue =
        this.onLine(this.#stripCarriageReturn(line)) !== false && canContinue;
      newlineIndex = this.#buffer.indexOf("\n");
    }
    return canContinue;
  }

  #stripCarriageReturn(line: string): string {
    return line.endsWith("\r") ? line.slice(0, -1) : line;
  }
}
