# Update Log

Append-only. One entry per released change, newest at the bottom.
Format: `date · version · author · summary · key files`
See `docs/SOP.md` — the entry is added in the SAME commit as the change.

| Date | Version | Author | Summary | Key files |
|------|---------|--------|---------|-----------|
| 2026-07-25 | v6.00 | Fred Li | Interactive network star maps (partners + advisors), animated day/night world background, version log dialog | client/src/components/network-graph.tsx, client/src/pages/home.tsx, client/src/lib/versions.ts |
| 2026-07-26 | v6.01 | Fred Li | Activity photo uploads with server storage + thumbnails, unsaved-edit guards across all editors, member request tracker, mandatory profile email, star map hover/reset fixes, PIC on advisor cards | server/routes.ts, client/src/components/unsaved-guard.tsx, client/src/pages/advisors.tsx, shared/schema.ts |
| 2026-07-26 | v6.02 | Fred Li | Star map click-vs-drag tolerance fix (reliable hub reset), sun/moon click reaction | client/src/components/network-graph.tsx, client/src/components/shared.tsx |
| 2026-07-26 | v6.03 | Fred Li | Partnership taxonomy 5→4 levels with hover definitions and form level guide, automatic data migration, registry refresh (new partners + team photos) | shared/schema.ts, server/storage-pg.ts, client/src/components/shared.tsx, client/src/pages/register.tsx |
| 2026-07-27 | v6.03p1 | Fred Li | Bugfix: partnership detail popup no longer clipped on small screens | client/src/components/shared.tsx |
| 2026-07-28 | v6.04 | Fred Li | Advisor change log (field-names-only audit trail), CV file upload with AI extraction and standardized year–org–scope background format, signed letter filing that completes the sign-back step, consolidated Contact & links card, repository SOP + update log | shared/schema.ts, shared/schema-pg.ts, server/storage-*.ts, server/routes.ts, client/src/pages/advisors.tsx, client/src/components/advisor-crm.tsx, client/src/components/shared.tsx, docs/SOP.md |
