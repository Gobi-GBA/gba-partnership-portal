import assert from "node:assert/strict";
import test from "node:test";
import {
  markdownToPlainText,
  renderEmailMarkdownHtml,
  renderMarkdownHtml,
  resolveOutreachPlaceholders,
} from "./markdown.js";

test("renders the supported email formatting", () => {
  const html = renderMarkdownHtml("## Update\n\n**Bold** and *italic*\n\n- First\n- Second\n\n> Note\n\n[Read more](https://www.gobi.vc)");
  assert.match(html, /<h2>Update<\/h2>/);
  assert.match(html, /<strong>Bold<\/strong>/);
  assert.match(html, /<em>italic<\/em>/);
  assert.match(html, /<ul>/);
  assert.match(html, /<blockquote>/);
  assert.match(html, /href="https:\/\/www\.gobi\.vc"/);
});

test("escapes raw HTML and rejects unsafe links", () => {
  const html = renderMarkdownHtml("<script>alert(1)</script> [Open](javascript:alert(1))");
  assert.match(html, /&lt;script&gt;/);
  assert.doesNotMatch(html, /<script>/);
  assert.doesNotMatch(html, /href=/);
});

test("keeps recipient placeholder values literal", () => {
  const source = "Hello **{{name}}** from {{organization}}";
  const resolved = resolveOutreachPlaceholders(source, {
    name: "A_B [Lead]",
    firstName: "A_B",
    organization: "R&D (Asia)",
  }, true);
  const html = renderMarkdownHtml(resolved);
  assert.match(html, /<strong>A_B \[Lead\]<\/strong>/);
  assert.match(html, /R&amp;D \(Asia\)/);
});

test("creates readable plain text with list markers and link URLs", () => {
  const plain = markdownToPlainText("**Hello**\n\n1. First\n2. [Gobi](https://www.gobi.vc)");
  assert.equal(plain, "Hello\n\n1. First\n2. Gobi (https://www.gobi.vc)");
});

test("renders valid tight-list HTML for email", () => {
  const html = renderEmailMarkdownHtml("- First\n- Second");
  assert.match(html, /<ul style=/);
  assert.doesNotMatch(html, /<p[^>]*>First<\/li>/);
  assert.match(html, /<li[^>]*>First<\/li>/);
});
