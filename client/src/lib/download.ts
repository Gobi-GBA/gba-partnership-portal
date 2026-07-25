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
