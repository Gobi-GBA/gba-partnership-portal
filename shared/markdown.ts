import MarkdownIt from "markdown-it";

export interface OutreachPlaceholderValues {
  name: string;
  firstName: string;
  organization: string;
}

const SAFE_LINK_RE = /^(?:https?:|mailto:)/i;

function createMarkdown(emailStyles = false) {
  const md = new MarkdownIt({
    html: false,
    breaks: true,
    linkify: false,
    typographer: false,
  });

  md.disable(["code", "fence", "backticks", "image"]);
  md.validateLink = (url) => SAFE_LINK_RE.test(url.trim());

  md.renderer.rules.link_open = (tokens, idx, options, _env, self) => {
    const href = String(tokens[idx].attrGet("href") ?? "");
    if (!md.validateLink(href)) return "";
    tokens[idx].attrSet("target", "_blank");
    tokens[idx].attrSet("rel", "noopener noreferrer");
    if (emailStyles) tokens[idx].attrSet("style", "color:#0C6078;text-decoration:underline;");
    return self.renderToken(tokens, idx, options);
  };

  if (emailStyles) {
    md.renderer.rules.paragraph_open = (tokens, idx) => tokens[idx].hidden
      ? ""
      : '<p style="margin:0 0 14px;line-height:1.55;">';
    md.renderer.rules.heading_open = (tokens, idx) => {
      const level = Number(tokens[idx].tag.slice(1));
      const size = level <= 1 ? 22 : level === 2 ? 19 : 16;
      return `<${tokens[idx].tag} style="margin:20px 0 10px;font-size:${size}px;line-height:1.3;color:#0C2340;">`;
    };
    md.renderer.rules.bullet_list_open = () => '<ul style="margin:0 0 14px;padding-left:24px;line-height:1.55;">';
    md.renderer.rules.ordered_list_open = (tokens, idx) => {
      const start = String(tokens[idx].attrGet("start") ?? "");
      return `<ol${start ? ` start="${md.utils.escapeHtml(start)}"` : ""} style="margin:0 0 14px;padding-left:24px;line-height:1.55;">`;
    };
    md.renderer.rules.list_item_open = () => '<li style="margin:0 0 5px;">';
    md.renderer.rules.blockquote_open = () => '<blockquote style="margin:0 0 14px;padding:8px 14px;border-left:3px solid #D4A843;color:#475569;background:#f8fafc;">';
    md.renderer.rules.strong_open = () => '<strong style="font-weight:700;">';
    md.renderer.rules.em_open = () => '<em style="font-style:italic;">';
  }

  return md;
}

const previewMarkdown = createMarkdown();
const emailMarkdown = createMarkdown(true);
type MarkdownToken = ReturnType<typeof previewMarkdown.parse>[number];

/** Escape dynamic recipient data so names and organisations remain literal Markdown text. */
export function escapeMarkdownText(value: string): string {
  return value.replace(/([\\`*_[\]{}()#+.!<>|~\-])/g, "\\$1");
}

export function resolveOutreachPlaceholders(
  source: string,
  values: OutreachPlaceholderValues,
  markdownValues = false,
): string {
  const literal = (value: string) => markdownValues ? escapeMarkdownText(value) : value;
  return source
    .replace(/\{\{\s*first_name\s*\}\}/gi, literal(values.firstName || values.name))
    .replace(/\{\{\s*name\s*\}\}/gi, literal(values.name))
    .replace(/\{\{\s*organization\s*\}\}/gi, literal(values.organization || ""));
}

export function renderMarkdownHtml(source: string): string {
  return previewMarkdown.render(source);
}

export function renderEmailMarkdownHtml(source: string): string {
  return emailMarkdown.render(source);
}

function inlineToText(tokens: MarkdownToken[]): string {
  let out = "";
  const links: Array<{ href: string; start: number }> = [];

  for (const token of tokens) {
    if (token.type === "text") out += token.content;
    else if (token.type === "softbreak" || token.type === "hardbreak") out += "\n";
    else if (token.type === "link_open") links.push({ href: String(token.attrGet("href") ?? ""), start: out.length });
    else if (token.type === "link_close") {
      const link = links.pop();
      if (!link?.href || !SAFE_LINK_RE.test(link.href)) continue;
      const label = out.slice(link.start).trim();
      if (label !== link.href) out += ` (${link.href})`;
    }
  }

  return out;
}

/** Convert supported Markdown into a readable plain-text email alternative. */
export function markdownToPlainText(source: string): string {
  const tokens = previewMarkdown.parse(source, {});
  const lists: Array<{ ordered: boolean; next: number }> = [];
  let out = "";

  const newline = (count = 1) => {
    const existing = out.match(/\n+$/)?.[0].length ?? 0;
    if (existing < count) out += "\n".repeat(count - existing);
  };

  for (const token of tokens) {
    switch (token.type) {
      case "inline":
        out += inlineToText(token.children ?? []);
        break;
      case "heading_close":
        newline(2);
        break;
      case "paragraph_close":
        newline(lists.length > 0 ? 1 : 2);
        break;
      case "bullet_list_open":
        lists.push({ ordered: false, next: 1 });
        break;
      case "ordered_list_open":
        lists.push({ ordered: true, next: Number(token.attrGet("start") ?? "1") });
        break;
      case "bullet_list_close":
      case "ordered_list_close":
        lists.pop();
        newline(2);
        break;
      case "list_item_open": {
        newline(out ? 1 : 0);
        const list = lists[lists.length - 1];
        const marker = list?.ordered ? `${list.next++}. ` : "- ";
        out += `${"  ".repeat(Math.max(0, lists.length - 1))}${marker}`;
        break;
      }
      case "list_item_close":
        newline(1);
        break;
      case "blockquote_open":
        newline(out ? 1 : 0);
        out += "> ";
        break;
      case "blockquote_close":
        newline(2);
        break;
      case "hr":
        newline(out ? 1 : 0);
        out += "---";
        newline(2);
        break;
    }
  }

  return out.replace(/\n{3,}/g, "\n\n").trim();
}
