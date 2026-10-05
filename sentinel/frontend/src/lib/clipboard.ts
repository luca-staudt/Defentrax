/**
 * Robust clipboard copy that works on HTTP (non-secure contexts) where
 * navigator.clipboard is often unavailable or rejects.
 */
export type CopyResult =
  | { ok: true; method: "clipboard" | "execCommand" }
  | { ok: false; method: "select"; message: string };

export async function copyText(
  text: string,
  selectEl?: HTMLElement | null,
): Promise<CopyResult> {
  if (!text) {
    return {
      ok: false,
      method: "select",
      message: "Nothing to copy",
    };
  }

  // Prefer Clipboard API when available (typically HTTPS / localhost).
  if (
    typeof navigator !== "undefined" &&
    navigator.clipboard &&
    typeof navigator.clipboard.writeText === "function"
  ) {
    try {
      await navigator.clipboard.writeText(text);
      return { ok: true, method: "clipboard" };
    } catch {
      // Fall through to execCommand / select.
    }
  }

  // Fallback: temporary textarea + document.execCommand('copy').
  // Works on many HTTP origins where Clipboard API is blocked.
  try {
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
    const ok = document.execCommand("copy");
    document.body.removeChild(ta);
    if (ok) {
      return { ok: true, method: "execCommand" };
    }
  } catch {
    // Fall through to select.
  }

  // Last resort: select the visible token so the user can Ctrl/Cmd+C.
  if (selectEl) {
    try {
      const range = document.createRange();
      range.selectNodeContents(selectEl);
      const sel = window.getSelection();
      sel?.removeAllRanges();
      sel?.addRange(range);
    } catch {
      // ignore
    }
  }

  return {
    ok: false,
    method: "select",
    message:
      "Automatic copy unavailable on this connection — token selected; press Ctrl+C (Cmd+C on Mac)",
  };
}
