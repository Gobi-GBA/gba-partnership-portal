// v6.05 — URL normalization shared by client forms and server extraction.
// Repairs what people actually type: missing scheme, scheme typos, stray
// wrappers and trailing punctuation. Returns "" for input that cannot be a URL.
export function normalizeUrl(raw: string): string {
  let s = String(raw ?? "").trim();
  if (!s) return "";
  // strip wrapping brackets/quotes and markdown link leftovers
  s = s.replace(/^[<\["'(]+/, "").replace(/[>\]"')]+$/, "").trim();
  // strip trailing punctuation that rides along from prose
  s = s.replace(/[.,;:!?]+$/, "");
  if (!s) return "";
  // repair scheme typos: https:/x → https://x, https//x → https://x
  s = s.replace(/^(https?)[:;]\/(?!\/)/i, "$1://");
  s = s.replace(/^(https?)\/\//i, "$1://");
  // prepend https:// when the scheme is missing and it plausibly is a URL
  if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(s)) {
    if (!/^[a-z0-9-]+(\.[a-z0-9-]+)+([/:?#]|$)/i.test(s)) return ""; // not a domain
    s = `https://${s}`;
  }
  // only http(s) is meaningful for profile/website sync
  if (!/^https?:\/\//i.test(s)) return "";
  // lowercase the scheme+host part only
  try {
    const u = new URL(s);
    u.protocol = u.protocol.toLowerCase();
    u.hostname = u.hostname.toLowerCase();
    return u.toString();
  } catch {
    return "";
  }
}

// Recognize a LinkedIn personal profile URL and return its slug ("" when not one).
export function linkedinSlug(url: string): string {
  return normalizeUrl(url).match(/linkedin\.com\/in\/([a-z0-9\u4e00-\u9fff%_-]+)/i)?.[1] ?? "";
}
