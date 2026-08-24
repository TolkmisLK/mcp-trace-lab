import type { RedactionOptions } from "./types.js";

const DEFAULT_PLACEHOLDER = "[REDACTED]";

const DEFAULT_SENSITIVE_KEYS = [
  "authorization",
  "proxyauthorization",
  "apikey",
  "xapikey",
  "token",
  "accesstoken",
  "refreshtoken",
  "authtoken",
  "password",
  "passphrase",
  "secret",
  "clientsecret",
  "cookie",
  "setcookie",
  "credential",
  "credentials",
] as const;

function normalizeKey(key: string): string {
  return key.toLowerCase().replaceAll(/[^a-z0-9]/g, "");
}

function redactString(value: string, placeholder: string): string {
  return value
    .replace(/\b(Bearer|Basic)\s+[^\s,;]+/gi, `$1 ${placeholder}`)
    .replace(
      /\b([a-z][a-z0-9+.-]*:\/\/)[^\s/@]+(?::[^\s/@]*)?@/gi,
      `$1${placeholder}@`,
    );
}

export function redactValue(
  value: unknown,
  options: RedactionOptions = {},
): unknown {
  const placeholder = options.placeholder ?? DEFAULT_PLACEHOLDER;
  const sensitiveKeys = new Set<string>([
    ...DEFAULT_SENSITIVE_KEYS,
    ...(options.additionalKeys ?? []).map(normalizeKey),
  ]);
  const seen = new WeakSet<object>();

  const visit = (current: unknown): unknown => {
    if (typeof current === "string") {
      return redactString(current, placeholder);
    }

    if (current === null || typeof current !== "object") {
      return current;
    }

    if (seen.has(current)) {
      return "[CIRCULAR]";
    }
    seen.add(current);

    if (Array.isArray(current)) {
      return current.map(visit);
    }

    const output: Record<string, unknown> = {};
    for (const [key, nestedValue] of Object.entries(current)) {
      output[key] = sensitiveKeys.has(normalizeKey(key))
        ? placeholder
        : visit(nestedValue);
    }
    return output;
  };

  return visit(value);
}
