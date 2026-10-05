/** Robust clipboard copy with HTTP-safe fallbacks (Clipboard API needs secure context). */

export type CopyResult =
  | { ok: true; method: "clipboard-api" | "execCommand" }
  | { ok: false; reason: string; manualSelect: boolean };

function canUseClipboardAPI(): boolean {
  if (typeof window === "undefined") return false;
  if (!window.isSecureContext) return false;
  return typeof navigator !== "undefined" && !!navigator.clipboard?.writeText;
}

function copyViaExecCommand(text: string): boolean {
  if (typeof document === "undefined") return false;
  const ta = document.createElement("textarea");
  ta.value = text;
  ta.setAttribute("readonly", "");
  ta.style.position = "fixed";
  ta.style.top = "0";
  ta.style.left = "0";
  ta.style.width = "1px";
  ta.style.height = "1px";
  ta.style.padding = "0";
  ta.style.border = "none";
  ta.style.outline = "none";
  ta.style.boxShadow = "none";
  ta.style.background = "transparent";
  ta.style.opacity = "0";
  document.body.appendChild(ta);
  ta.focus();
  ta.select();
  ta.setSelectionRange(0, text.length);
  let ok = false;
  try {
    ok = document.execCommand("copy");
  } catch {
    ok = false;
  }
  document.body.removeChild(ta);
  return ok;
}

/** Select text in an input/textarea so the user can Ctrl/Cmd+C manually. */
export function selectForManualCopy(
  el: HTMLInputElement | HTMLTextAreaElement | null | undefined,
): boolean {
  if (!el) return false;
  try {
    el.focus();
    el.select();
    el.setSelectionRange(0, el.value.length);
    return true;
  } catch {
    return false;
  }
}

/**
 * Copy text to clipboard. Prefer Clipboard API in secure contexts;
 * fall back to execCommand; optionally select a visible input for manual copy.
 */
export async function copyText(
  text: string,
  options?: {
    selectEl?: HTMLInputElement | HTMLTextAreaElement | null;
  },
): Promise<CopyResult> {
  if (!text) {
    return { ok: false, reason: "Nothing to copy", manualSelect: false };
  }

  if (canUseClipboardAPI()) {
    try {
      await navigator.clipboard.writeText(text);
      return { ok: true, method: "clipboard-api" };
    } catch {
      // fall through to execCommand
    }
  }

  if (copyViaExecCommand(text)) {
    return { ok: true, method: "execCommand" };
  }

  const selected = selectForManualCopy(options?.selectEl);
  return {
    ok: false,
    reason: selected
      ? "Automatic copy failed — token is selected; press Ctrl+C (or Cmd+C) to copy"
      : "Clipboard copy failed — select the token manually",
    manualSelect: selected,
  };
}

/** Exported for unit tests (decision helpers). */
export const clipboardInternals = {
  canUseClipboardAPI,
  copyViaExecCommand,
};
