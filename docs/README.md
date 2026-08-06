# Documentation

Development specs and operating procedure for the Gobi GBA Partnership Portal.

## Operating procedure

| Document | Purpose |
| --- | --- |
| [SOP.md](SOP.md) | Binding release procedure. Read before shipping anything. |
| [UPDATE_LOG.md](UPDATE_LOG.md) | Every release, dated, with author, description and files touched. |

## Development specs

Each spec states the requirements for one release: what was asked for, what the
code audit found, and the acceptance criteria. They are written before the work,
so they record intent rather than outcome — see `UPDATE_LOG.md` for what actually
shipped.

| Spec | Date | Scope |
| --- | --- | --- |
| [SPEC-v5.0.md](SPEC-v5.0.md) | 2026-07-21 | Advisor Network module — original build |
| [SPEC-v5.5.md](SPEC-v5.5.md) | 2026-07-21 | Advisor module enhancements |
| [SPEC-v6.0.md](SPEC-v6.0.md) | 2026-07-26 | Performance, UX polish, navigation restructure, desert/starry visual identity, star-map extensions |
| [SPEC-v6.01.md](SPEC-v6.01.md) | 2026-07-26 | Eleven targeted UI and infrastructure improvements, grounded in a code audit |
| [SPEC-v6.02.md](SPEC-v6.02.md) | 2026-07-26 | Patch: two bugs reported against v6.01, each with root cause |
| [SPEC-v6.03.md](SPEC-v6.03.md) | 2026-07-26 | Clearer partnership taxonomy and a registry data refresh |
| [SPEC-v6.04.md](SPEC-v6.04.md) | 2026-07-28 | Advisor record update log, CV filing with AI auto-pull, signed-letter filing, contact layout; introduced the GitHub update-log SOP |
| [SPEC-v6.05.md](SPEC-v6.05.md) | 2026-07-28 | Sync-from-link hardening with photo/logo auto-pull, guided input flow, mandatory-field highlighting, pending badges |
| [SPEC-v7.09.md](SPEC-v7.09.md) | 2026-08-01 | Update logs made complete and activity-sorted; advisor log route fix; history reconstruction; approval email and Google OAuth diagnosis |
| [SPEC-v7.11.md](SPEC-v7.11.md) | 2026-08-04 | Gobi staff edit rights by default; approval reserved for partnership level and admin-only delete |
| [SPEC-v7.14.md](SPEC-v7.14.md) | 2026-08-06 | Conflict-of-interest declaration required before the COO advisor approval email; declared conflicts block the send and park the candidate for admin reassignment |

Releases v6.06 through v7.08 shipped without a standalone spec; their scope is
recorded in `UPDATE_LOG.md` and in the in-app system update log
(`client/src/lib/versions.ts`).

## Conventions

- Spec files are named `SPEC-v<version>.md`.
- Specs are committed to this repository, which is **public**. Never include
  API keys, passwords, or advisor personal data (emails, mobile numbers, WeChat
  IDs, photos). Refer to fields by name only.
