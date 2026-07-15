// Safe wrapper around localStorage.
// In the sandboxed preview iframe, accessing window.localStorage throws a
// SecurityError — every call is wrapped so the app degrades gracefully
// (remember-me simply stays off) instead of crashing.

export function safeGet(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

export function safeSet(key: string, value: string): void {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    /* storage unavailable — ignore */
  }
}

export function safeRemove(key: string): void {
  try {
    window.localStorage.removeItem(key);
  } catch {
    /* storage unavailable — ignore */
  }
}

export const TOKEN_KEY = "gobi_portal_token";
