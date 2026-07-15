# Gobi GBA Partnership Portal · 大湾区合作伙伴门户

Bilingual (EN / 中文) partnership registry for Gobi Partners GBA — universities, corporates, government bodies and ecosystem partners across Hong Kong, the Greater Bay Area and Gobi's wider network (Southeast Asia, Pakistan, Japan, Korea, Vietnam).

## Features

- **Partner directory** — card view and interactive star-map network view, grouped by region (domicile) or type, with zoom, hover and click-through to full partner profiles
- **Progress tracking** — 5-stage levels (01 New/Target → 05 Strategic) plus collaboration depth and Hall of Fame markers
- **Role-based access** — admin / staff / viewer; staff submit new records or suggest changes, admin approves
- **Multiple PICs** — assign one or more Gobi people-in-charge per partner via checklist
- **AI quick-fill** — paste an email or upload PDF / DOCX / image and the form fills itself
- **Attachments** — supporting documents per partner
- **Fully bilingual** — English and Simplified Chinese throughout

## Stack

Express · Vite · React · Tailwind CSS · shadcn/ui · Drizzle ORM · SQLite (better-sqlite3)

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

The SQLite database (`data.db`) is created and seeded automatically on first run. Default admin account is created at seed time — change the password after first login.

---

Developed by Fred Li and Elaine ZHANG — every great partnership begins with a single connection. Keep building.
