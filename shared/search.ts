/**
 * Shared, token-aware search scoring (v7.17).
 *
 * Why this exists
 * ---------------
 * Both the partnership list and the advisor list used to filter with a plain
 * `haystack.toLowerCase().includes(query)`. That is cheap but produces bad
 * results on short queries, because a substring can land in the middle of an
 * unrelated word. Against live data, searching "lab" matched 28 of 87 partners
 * — almost all of them false positives from "A-lib-aba", "G-lob-al" and
 * "col-lab-orate" — which buries the handful of records that genuinely involve
 * a laboratory.
 *
 * The fix is to require Latin matches to begin at a word boundary, so "lab"
 * matches "Labs" and "laboratory" but not "Alibaba". CJK has no word
 * delimiters, so CJK tokens keep substring semantics, which is correct for
 * Chinese.
 *
 * On top of that, matches are scored so the caller can rank: a hit in a record's
 * name matters far more than a hit deep in a description. Multi-word queries are
 * AND-ed — every token must match somewhere, which is what people expect when
 * they type "shenzhen lab".
 */

/** A weighted piece of text belonging to one record. */
export interface SearchField {
  text: string | null | undefined;
  /** Higher = more important. Names ~10, categories ~4, long prose ~2-3. */
  weight: number;
}

/** Matches any CJK ideograph, plus kana. Such tokens use substring matching. */
const CJK = /[\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff]/;

/** Latin word characters, used to test whether an index is a word start. */
const WORD = /[a-z0-9]/;

export function isCjk(token: string): boolean {
  return CJK.test(token);
}

/**
 * Split a raw query into tokens. Whitespace-delimited, lowercased, empties
 * dropped. A CJK run with no spaces stays a single token, which is intended.
 */
export function tokenize(query: string): string[] {
  return query.toLowerCase().split(/\s+/).filter((t) => t.length > 0);
}

/**
 * Score one token against one piece of text. Returns 0 for no match.
 *
 * Tiers, best first:
 *   4  the text is exactly the token
 *   3  the token starts the text
 *   2  the token starts a word inside the text
 *   1  (CJK only) the token appears anywhere
 */
export function scoreToken(token: string, text: string): number {
  if (!token || !text) return 0;
  const hay = text.toLowerCase();

  if (hay === token) return 4;
  if (hay.startsWith(token)) return 3;

  if (isCjk(token)) {
    // No word boundaries in Chinese; any occurrence is a real match.
    return hay.includes(token) ? 1 : 0;
  }

  // Latin: only accept a hit that begins a word, so "lab" misses "Alibaba".
  let from = 0;
  for (;;) {
    const at = hay.indexOf(token, from);
    if (at < 0) return 0;
    const before = at === 0 ? "" : hay[at - 1];
    if (!before || !WORD.test(before)) return 2;
    from = at + 1;
  }
}

/**
 * Score a whole query against a record's fields.
 *
 * Returns 0 unless EVERY token matches at least one field. Otherwise returns the
 * summed best weighted score per token, so records matching in stronger fields
 * rank above records matching only in prose.
 */
export function scoreRecord(query: string, fields: SearchField[]): number {
  const tokens = tokenize(query);
  if (tokens.length === 0) return 1; // empty query matches everything

  let total = 0;
  for (const token of tokens) {
    let best = 0;
    for (const field of fields) {
      if (!field.text) continue;
      const s = scoreToken(token, field.text);
      if (s > 0) best = Math.max(best, s * field.weight);
    }
    if (best === 0) return 0; // AND semantics: this token matched nothing
    total += best;
  }
  return total;
}

/** Convenience boolean wrapper for list filtering. */
export function matchesRecord(query: string, fields: SearchField[]): boolean {
  return scoreRecord(query, fields) > 0;
}

/* ------------------------------------------------------------------------- *
 * Field definitions
 *
 * Defined once here and shared by the list pages and the Spotlight overlay, so
 * the three surfaces can never drift into searching different things. The shapes
 * are structural on purpose: this module stays free of schema imports and so
 * remains trivially unit-testable.
 * ------------------------------------------------------------------------- */

export interface PartnerLike {
  nameEn?: string | null;
  nameCn?: string | null;
  partnershipType?: string | null;
  descriptionEn?: string | null;
  descriptionCn?: string | null;
  resourcesEn?: string | null;
  resourcesCn?: string | null;
  context?: string | null;
  contactName?: string | null;
  picNames?: string[] | null;
  picName?: string | null;
}

export function partnerSearchFields(p: PartnerLike): SearchField[] {
  const pics = [...(p.picNames ?? []), p.picName].filter(Boolean).join(" ");
  return [
    { text: p.nameEn, weight: 10 },
    { text: p.nameCn, weight: 10 },
    { text: p.partnershipType, weight: 4 },
    // v7.17 — "what can they provide" is a first-class search target: it is the
    // field that answers "who can give us cloud credits".
    { text: p.resourcesEn, weight: 4 },
    { text: p.resourcesCn, weight: 4 },
    { text: p.descriptionEn, weight: 3 },
    { text: p.descriptionCn, weight: 3 },
    { text: p.context, weight: 2 },
    { text: p.contactName, weight: 2 },
    { text: pics, weight: 2 },
  ];
}

export interface AdvisorLike {
  name?: string | null;
  nameCn?: string | null;
  domains?: string | null;
  background?: string | null;
  resourcesEn?: string | null;
  resourcesCn?: string | null;
  roles?: { title?: string | null; organization?: string | null }[] | null;
  tags?: { nameEn?: string | null; nameCn?: string | null }[] | null;
}

export function advisorSearchFields(a: AdvisorLike): SearchField[] {
  const roles = (a.roles ?? []).flatMap((r) => [r.title, r.organization]).filter(Boolean).join(" ");
  const tags = (a.tags ?? []).flatMap((t) => [t.nameEn, t.nameCn]).filter(Boolean).join(" ");
  return [
    { text: a.name, weight: 10 },
    { text: a.nameCn, weight: 10 },
    { text: a.domains, weight: 5 },
    { text: roles, weight: 4 },
    { text: tags, weight: 4 },
    { text: a.resourcesEn, weight: 4 },
    { text: a.resourcesCn, weight: 4 },
    // v7.17 — background was previously not searched at all, which is why a
    // query like "lab" or "compute" returned almost nothing on this page even
    // though the detail is written down in every profile.
    { text: a.background, weight: 3 },
  ];
}
