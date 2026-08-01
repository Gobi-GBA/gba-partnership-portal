# Portal Upgrade — Development Spec (v6.03)

Theme: a clearer partnership taxonomy, and a data refresh that brings the registry in line with Gobi's real-world footprint.

---

## Item 1 — Simplify the partnership pipeline from 5 levels to 4, with crisp definitions

**Problem.** The current 5-stage pipeline (01 New/Target → 02 Engaged → 03 MOU & Agreement → 04 Progressive → 05 Strategic) has blurry boundaries: "MOU signed" sits in the middle, yet in practice an MoU marks a strategic commitment; "Progressive" vs "Strategic" is a judgment call nobody can explain consistently.

**New taxonomy (4 levels).** Each level has a one-line definition that appears everywhere the level is shown or chosen:

| # | Level | Definition |
|---|-------|-----------|
| 01 | New / Target | On our radar — no relationship developed yet |
| 02 | Engaged | First meeting, activity or contact done |
| 03 | Progress Partnership | Advanced meetings, collaborations done, track record building |
| 04 | Strategic Partnership | MoU signed, strategic framework or deeper |

Chinese labels: 01 新目标 / 02 接洽中 / 03 深化合作 / 04 战略伙伴, with matching one-line definitions.

**Where the definitions surface.**
- Hover tooltip on every level badge (cards, list rows, detail dialog, timeline) — instant, following the v6.01 fast-tooltip pattern.
- A compact explanatory note in the Register form and the Edit interface next to the stage selector: all four definitions listed, the selected one highlighted, so contributors self-classify correctly at the point of entry.
- The pipeline timeline in the partner detail dialog becomes 4 steps.

**Mapping from old to new (automatic, applied in Item 2's migration).**

| Old stage | New stage | Rationale |
|-----------|-----------|-----------|
| 01 New/Target | 01 New / Target | unchanged |
| 02 Engaged | 02 Engaged | unchanged |
| 03 MOU & Agreement | 04 Strategic Partnership | MoU signed = strategic by the new definition |
| 04 Progressive | 03 Progress Partnership | deep collaboration, track record |
| 05 Strategic | 04 Strategic Partnership | unchanged meaning |

**Code touchpoints.** `STAGES` enum in shared schema; stage order/number/style constants; i18n labels + new definition strings; badge component tooltips; register + edit stage selectors; detail timeline; scoreboard stage weights (1–5 becomes 1–4); network graph legend/halo logic; the AI-extraction prompt in the server routes (definitions updated so DeepSeek classifies to the new taxonomy); seed data.

## Item 2 — Migrate the existing databases

- One reversible SQL migration applying the mapping table above to the `stage` column, run on both storage backends: Neon production and the local sqlite dev database.
- Any stored per-stage history/log values migrated the same way.
- Post-migration verification: count per stage before/after; no rows left carrying a retired stage key.

## Item 3 — Data refresh from external sources

Research Gobi's public footprint (gobi.vc, LinkedIn, press) and register missing partners already worked with. Confirmed additions from the brief, each to be verified online and written up with bilingual descriptions, correct category, region, level per the new taxonomy, and partnership log entries citing sources:

| Partner | Known relationship | Expected level |
|---------|-------------------|----------------|
| RADII (media) | Produced documentary films for portfolio companies Clearbot and Ecoinno | 03 Progress |
| Tatler (Asia) | Chibo Tang is a committee member and awardee (Gen.T) | 03 Progress |
| Forbes | Gobi has nominations (e.g. lists/awards) | 02 Engaged |
| HICOOL (Beijing) | Global entrepreneurship competition Gobi participates in | 02–03 per evidence |
| HKU RISE | HKU's innovation platform — register as sub-entity under HKU | 02 Engaged |

Research may surface corrections to existing records (better official names, URLs); apply conservatively with sources logged.

**Team photos for HKU, HKUST, HKIC.** Update these partners' photo carousels with news photos featuring the Gobi team (fund launches, MoU signings, award ceremonies), sourced from press coverage; images downloaded, resized to carousel size, stored in the repo's partner-photo folder. Note: no new photo attachment arrived with this request — if a specific team photo was meant to be attached, re-attach and it will be added to the relevant partner.

**Data entry route.** New partners inserted directly into both databases via scripts (consistent with the personal-data rule: nothing sensitive enters the public repo; partner org data is public-safe). Log entries dated and source-linked.

## Item 4 — Check and test

- Type-check + production build.
- UAT: badge tooltips on all surfaces; register/edit explanatory note renders and highlights selection; timeline shows 4 steps; filters, sorting (strategic level then alphabetical), scoreboard and network graph work with 4 levels; migrated records display correct new badges; new partners render with logos, photos, correct levels, and log entries; bilingual output verified.
- Standard release train: secret scan, storage-literal scan, teammate-commit check, push to org + mirror, Vercel verification, preview redeploy, version 6.03 bilingual changelog.

## Non-goals

- No change to `collabLevel` (1–5 depth score) — it is a separate internal measure.
- No renaming of database columns; only stage values change.
- No advisor-module changes.
