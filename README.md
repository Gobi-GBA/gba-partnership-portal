# Gobi Partnership Portal · 合作伙伴门户

Bilingual (EN / 中文) partnership registry for Gobi Partners — universities, corporates, government bodies and ecosystem partners across Gobi's global network (Greater China, Southeast Asia, Pakistan, Japan, Korea, Vietnam and beyond).

## Features

- **Login-first** — all content requires sign-in; new accounts need admin approval
- **Partner directory** — card, star-map network and timeline views, with search, category / stage / region / year filters and a date-range timeline
- **Progress tracking** — 5-stage levels (01 New/Target → 05 Strategic); collaboration depth is derived from the stage. Hall of Fame is a star-map mode
- **Role-based access** — admin / staff / viewer; staff submit new records or suggest changes, admin approves
- **Multiple PICs** — assign one or more Gobi people-in-charge per partner via checklist
- **AI quick-fill** — paste an email or upload PDF / DOCX and DeepSeek fills the form, including a best-estimate start date (set `DEEPSEEK_API_KEY`)
- **Export** — Excel or CSV with selectable fields, respecting current filters
- **Audit trail** — per-partner change log (who changed what, when) plus a system version log
- **User profiles** — editable title and photo
- **Attachments** — supporting documents per partner
- **Fully bilingual** — English and Simplified Chinese throughout

## Stack

Express · Vite · React · Tailwind CSS · shadcn/ui · Drizzle ORM · SQLite (better-sqlite3) locally / Neon Postgres in production

## Development

```bash
npm install
npm run dev          # dev server on :5000
```

## Production

```bash
npm run build        # bundles client + server
NODE_ENV=production node dist/index.cjs
```

The SQLite database (`data.db`) is created and seeded automatically on first run. Default admin account is created at seed time — change the password after first login. Environment variables: `DATABASE_URL` (Postgres, optional), `ADMIN_SEED_PASSWORD`, `DEEPSEEK_API_KEY`.

---

Developed by Fred Li and Elaine Zhang — every great partnership begins with a single connection. Keep building.
