# Repository SOP — Update Discipline

Binding procedure for ANYONE (human or AI agent) pushing to this repository.
Principle: **check any update first, check the log, then work, after work — record it back.**

## 1. Before starting work

1. `git fetch origin` and `git rev-list --count HEAD..origin/main` — must be `0`.
   If not, merge/rebase `origin/main` first. Never build or push from a stale base.
2. Read the tail of `docs/UPDATE_LOG.md` to see what changed recently and why.
3. Confirm the working tree is clean (`git status`).

## 2. While working

- Keep secrets out of the repo. `DEEPSEEK_API_KEY` and any personal advisor data
  (emails, photos, mobile, WeChat) must NEVER be committed — this repo is PUBLIC.
- All relative imports in `api/`, `server/` and `shared/` value-import chains carry
  explicit `.js` extensions (Vercel serverless requirement).

## 3. Before every commit / release

Run all scans — every one must come back clean:

1. Secret scan: grep the repo for the DeepSeek key prefix (`sk-` followed by the first four hex digits of the key), excluding `node_modules` and `.git` → expect exit 1 (no hits).
2. `npm run build`, then `grep -l "localStorage\|sessionStorage\|indexedDB" dist/public/assets/*.js` → expect exit 1.
3. `git fetch origin && git rev-list --count HEAD..origin/main` → expect `0`.

## 4. After work — record it back

1. Append one entry to `docs/UPDATE_LOG.md` **in the same commit** as the change:
   `date · version · author · summary · key files`.
2. If the change is user-visible, also add a bilingual entry to
   `client/src/lib/versions.ts` and bump `CURRENT_VERSION`.
3. Commit message: short imperative summary prefixed with the version, e.g.
   `v6.04: advisor change log, CV filing + AI extraction, letter filing`.

## 5. Push and verify

1. Push to BOTH remotes: `git push origin main` and `git push mirror main`.
2. Wait ~90s, then verify the Vercel production deployment is READY and serving
   the new build (compare the `index-*.js` asset hash).
3. If deployment fails, fix forward or revert — never leave prod broken.

A pull request or commit that skips the log entry (step 4) is considered incomplete
and should be amended before anything else is built on top of it.
