/**
 * Lightweight node tests for clipboard decision helpers (no DOM Clipboard API).
 * Run: node --experimental-strip-types --test src/lib/clipboard.test.ts
 * (or: npx tsx --test src/lib/clipboard.test.ts)
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";

// Re-implement the secure-context gate logic mirrored from clipboard.ts for pure unit checks.
function decideCopyStrategy(opts: {
  isSecureContext: boolean;
  hasClipboardWrite: boolean;
}): "clipboard-api" | "execCommand" {
  if (opts.isSecureContext && opts.hasClipboardWrite) return "clipboard-api";
  return "execCommand";
}

describe("clipboard strategy", () => {
  it("prefers Clipboard API only in secure context with writeText", () => {
    assert.equal(
      decideCopyStrategy({ isSecureContext: true, hasClipboardWrite: true }),
      "clipboard-api",
    );
  });

  it("falls back on HTTP / insecure context (typical VPS http://IP:3000)", () => {
    assert.equal(
      decideCopyStrategy({ isSecureContext: false, hasClipboardWrite: true }),
      "execCommand",
    );
  });

  it("falls back when Clipboard API is missing", () => {
    assert.equal(
      decideCopyStrategy({ isSecureContext: true, hasClipboardWrite: false }),
      "execCommand",
    );
  });
});
