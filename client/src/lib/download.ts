// Authenticated downloads (v5.8).
// Auth is carried as an in-memory bearer token (see lib/queryClient.ts), so a
// plain window.open("/api/…") would hit the endpoint without the Authorization
// header and fail. Every download therefore goes through apiRequest and is
// handed to the browser as an object URL.
import { apiRequest } from "./queryClient";

function filenameFrom(res: Response, fallback: string): string {
  const disp = res.headers.get("Content-Disposition") ?? "";
  const match = /filename\*?=(?:UTF-8'')?"?([^";]+)"?/i.exec(disp);
  return match?.[1] ? decodeURIComponent(match[1]) : fallback;
}

function revokeLater(url: string, ms: number) {
  window.setTimeout(() => URL.revokeObjectURL(url), ms);
}

/** Fetch a file with auth and save it via a temporary anchor. */
export async function downloadWithAuth(url: string, fallbackName: string): Promise<void> {
  const res = await apiRequest("GET", url);
  const blob = await res.blob();
  const objectUrl = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = objectUrl;
  a.download = filenameFrom(res, fallbackName);
  a.style.display = "none";
  document.body.appendChild(a);
  a.click();
  a.remove();
  revokeLater(objectUrl, 30000);
}

/**
 * Open a blank tab synchronously inside the click handler. Popup blockers reject
 * window.open once an await has happened, so the tab is claimed up-front and the
 * fetched document is written into it afterwards.
 */
export function preopenTab(): Window | null {
  return window.open("", "_blank");
}

/**
 * Copy text to the clipboard (v5.10). navigator.clipboard is blocked in some
 * embedded/preview iframes, so fall back to a hidden textarea + execCommand.
 */
export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    try {
      const ta = document.createElement("textarea");
      ta.value = text;
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.focus();
      ta.select();
      const ok = document.execCommand("copy");
      ta.remove();
      return ok;
    } catch {
      return false;
    }
  }
}

/**
 * Copy a formatted email to the clipboard (v6.11). Writes both text/html and
 * text/plain so Outlook and Gmail paste the branded layout while plain-text
 * editors still receive a readable message. Falls back to the plain text alone
 * where the async clipboard API or ClipboardItem is unavailable (Safari in some
 * embedded contexts, and sandboxed preview iframes).
 */
export async function copyRichText(html: string, plain: string): Promise<boolean> {
  try {
    if (typeof ClipboardItem !== "undefined" && navigator.clipboard?.write) {
      await navigator.clipboard.write([
        new ClipboardItem({
          "text/html": new Blob([html], { type: "text/html" }),
          "text/plain": new Blob([plain], { type: "text/plain" }),
        }),
      ]);
      return true;
    }
  } catch {
    // fall through to the plain-text path
  }
  try {
    // execCommand("copy") over a contenteditable node preserves rich formatting
    // in browsers that reject ClipboardItem.
    const host = document.createElement("div");
    host.contentEditable = "true";
    host.innerHTML = html;
    host.style.position = "fixed";
    host.style.left = "-9999px";
    host.style.opacity = "0";
    document.body.appendChild(host);
    const range = document.createRange();
    range.selectNodeContents(host);
    const sel = window.getSelection();
    sel?.removeAllRanges();
    sel?.addRange(range);
    const ok = document.execCommand("copy");
    sel?.removeAllRanges();
    host.remove();
    if (ok) return true;
  } catch {
    // fall through
  }
  return copyText(plain);
}

/** Fetch an HTML document with auth and show it in a tab for printing to PDF. */
export async function openHtmlWithAuth(url: string, target?: Window | null): Promise<boolean> {
  const res = await apiRequest("GET", url);
  const html = await res.text();
  const blob = new Blob([html], { type: "text/html;charset=utf-8" });
  const objectUrl = URL.createObjectURL(blob);
  const win = target ?? window.open(objectUrl, "_blank");
  if (!win) {
    revokeLater(objectUrl, 5000);
    return false;
  }
  if (target) target.location.href = objectUrl;
  revokeLater(objectUrl, 120000);
  return true;
}
