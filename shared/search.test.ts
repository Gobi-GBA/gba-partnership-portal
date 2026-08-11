import assert from "node:assert/strict";
import test from "node:test";
import { isCjk, matchesRecord, scoreRecord, scoreToken, tokenize } from "./search.js";

const f = (text: string, weight = 1) => ({ text, weight });

test("tokenize lowercases, splits on whitespace and drops empties", () => {
  assert.deepEqual(tokenize("  Shenzhen   LAB "), ["shenzhen", "lab"]);
  assert.deepEqual(tokenize(""), []);
  assert.deepEqual(tokenize("   "), []);
  assert.deepEqual(tokenize("阿里云"), ["阿里云"]);
});

test("isCjk distinguishes Chinese from Latin tokens", () => {
  assert.equal(isCjk("云"), true);
  assert.equal(isCjk("算力"), true);
  assert.equal(isCjk("cloud"), false);
  assert.equal(isCjk("gpu"), false);
});

test("scoreToken ranks exact over prefix over word-start", () => {
  assert.equal(scoreToken("hkust", "HKUST"), 4);
  assert.equal(scoreToken("hku", "HKUST"), 3);
  assert.equal(scoreToken("lab", "Sunway iLabs Laboratory"), 2);
});

// This is the regression the whole module exists for. Searching "lab" used to
// return Alibaba, Global and collaborate because of naive substring matching.
test("Latin tokens must start a word, so short queries stop matching mid-word", () => {
  assert.equal(scoreToken("lab", "Alibaba Cloud"), 0);
  assert.equal(scoreToken("lab", "Alibaba Global Initiatives"), 0);
  assert.equal(scoreToken("lab", "ecosystem collaboration"), 0);
  assert.equal(scoreToken("lab", "Katalyst Labs"), 2);
  assert.equal(scoreToken("lab", "Clinical and Translational Research Laboratory"), 2);
});

test("a word-start match is found even when an earlier mid-word hit exists", () => {
  // "collaborate" contains "lab" mid-word; "Labs" later is the real match.
  assert.equal(scoreToken("lab", "collaborate with Labs"), 2);
});

test("CJK tokens keep substring semantics because Chinese has no word breaks", () => {
  assert.equal(scoreToken("云", "阿里云"), 1);
  assert.equal(scoreToken("算力", "提供算力资源"), 1);
  assert.equal(scoreToken("云", "亚马逊云科技"), 1);
  assert.equal(scoreToken("云", "腾讯教育"), 0);
});

test("field weights let a name hit outrank a description hit", () => {
  const named = scoreRecord("alibaba", [f("Alibaba Cloud", 10), f("some prose", 3)]);
  const buried = scoreRecord("alibaba", [f("Other Co", 10), f("partnered with Alibaba", 3)]);
  assert.ok(named > buried, `${named} should beat ${buried}`);
});

test("multi-token queries are AND-ed across fields", () => {
  const fields = [f("Shenzhen Angel FOF", 10), f("guidance fund for hard tech", 3)];
  assert.ok(scoreRecord("shenzhen fund", fields) > 0);
  assert.equal(scoreRecord("shenzhen biotech", fields), 0);
});

test("tokens may match different fields of the same record", () => {
  const fields = [f("BAAI", 10), f("open-source foundation models", 3)];
  assert.ok(scoreRecord("baai models", fields) > 0);
});

test("an empty query matches every record", () => {
  assert.equal(scoreRecord("", [f("anything", 1)]), 1);
  assert.equal(scoreRecord("   ", [f("anything", 1)]), 1);
});

test("null, undefined and empty fields are skipped safely", () => {
  const fields = [{ text: null, weight: 10 }, { text: undefined, weight: 5 }, f("", 4), f("Volcano Engine", 10)];
  assert.ok(matchesRecord("volcano", fields));
  assert.equal(matchesRecord("nothinghere", fields), false);
});

test("matchesRecord mirrors scoreRecord as a boolean", () => {
  assert.equal(matchesRecord("gpu", [f("GPU cluster", 5)]), true);
  assert.equal(matchesRecord("gpu", [f("cloud only", 5)]), false);
});

test("mixed EN and CN queries work against a bilingual record", () => {
  const fields = [f("Alibaba Cloud", 10), f("阿里云", 10), f("cloud credits 云资源 算力", 4)];
  assert.ok(matchesRecord("cloud", fields));
  assert.ok(matchesRecord("云", fields));
  assert.ok(matchesRecord("算力", fields));
  assert.ok(matchesRecord("alibaba 云", fields));
});
