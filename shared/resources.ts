// v7.17 — "What they can provide": the resource-paragraph review workflow.
//
// A resource paragraph summarises the concrete things a partner or advisor is
// known to offer the outside world — cloud credits, compute, lab or test-bed
// access, funding schemes, distribution, talent pipelines. It exists because the
// portal's free-text descriptions were written to record *the relationship*, so
// a colleague searching "cloud credits" or "GPU" found nothing even though
// several partners run exactly those programmes.
//
// Two rules govern the text, and both are deliberate:
//
//   1. A paragraph describes what the entity offers the world, never what our
//      firm negotiated or received. The portal is read by staff who will quote
//      it to founders; a private entitlement must not leak into that surface.
//
//   2. Machine-researched text lands as `draft` and is staff-only until a human
//      confirms it. Sources travel with the paragraph so a reviewer can check a
//      claim rather than trust it. Discarding is always available and reverts
//      the record to having no paragraph at all.
//
// Keep this file dependency-free: it is imported by the browser bundle and by
// the Node server (which requires the explicit .js extension on its side).

/** Which table a review row came from. */
export const RESOURCE_KINDS = ["partner", "advisor"] as const;
export type ResourceKind = (typeof RESOURCE_KINDS)[number];

/** One row in the admin review queue. */
export interface ResourceReviewRow {
  kind: ResourceKind;
  id: number;
  name: string;
  nameCn: string | null;
  resourcesEn: string | null;
  resourcesCn: string | null;
  resourcesSources: string[] | null;
  resourcesUpdatedAt: string | null;
}

/**
 * One row in the "thin records" list: entities whose searchable prose is so
 * short that search can barely reach them. Surfacing them tells the team where
 * adding a sentence pays off most.
 */
export interface ThinRecordRow {
  kind: ResourceKind;
  id: number;
  name: string;
  nameCn: string | null;
  /** Characters of searchable free text (description/background + resources). */
  chars: number;
  /** True when a resource paragraph is already waiting in the review queue. */
  hasDraft: boolean;
}

/**
 * Below this many characters of searchable prose a record is considered thin.
 * Chosen so a one-line placeholder counts as thin but a real two-sentence
 * description does not.
 */
export const THIN_DESCRIPTION_CHARS = 120;
