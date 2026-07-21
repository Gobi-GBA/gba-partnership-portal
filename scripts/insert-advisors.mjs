// One-off migration: insert advisors from advisor-migration/advisors-final.json
// into BOTH the local sqlite data.db and Neon prod (DATABASE_URL env).
// Idempotent: skips advisors whose exact name already exists.
// Personal data (emails, photos) intentionally never enters the git repo.
import { readFileSync } from "node:fs";
import Database from "better-sqlite3";
import { neon } from "@neondatabase/serverless";

const advisors = JSON.parse(readFileSync("/home/user/workspace/advisor-migration/advisors-final.json", "utf8"));
const orgLogos = JSON.parse(readFileSync("/home/user/workspace/advisor-migration/org-logos.json", "utf8"));
const NOW = new Date().toISOString();

// Map an org name from fact-check to a partnership id via priority keyword rules.
function matchPartner(orgName, partners) {
  if (!orgName) return null;
  const n = orgName.toLowerCase();
  const byName = (pred) => partners.find((p) => pred((p.name_en ?? p.nameEn ?? "").toLowerCase()))?.id ?? null;
  // Direct full-name containment first
  const direct = partners.find((p) => {
    const pn = (p.name_en ?? p.nameEn ?? "").toLowerCase();
    return pn.length > 3 && (pn === n || n.includes(pn));
  });
  if (direct) return direct.id;
  // Priority keyword rules — most specific first (hkust before hku!)
  if (n.includes("hkust") || n.includes("university of science and technology")) return byName((pn) => pn.includes("hkust"));
  if (n.includes("polyu") || (n.includes("polytechnic") && n.includes("hong kong"))) return byName((pn) => pn.includes("polytechnic") || pn.includes("polyu"));
  if (n.includes("hkbu") || n.includes("baptist")) return byName((pn) => pn.includes("baptist"));
  if (n.includes("cityu") || n.includes("city university")) return byName((pn) => pn.includes("city university"));
  if (n.includes("cuhk") || n.includes("chinese university")) {
    if (n.includes("shenzhen")) return byName((pn) => pn.includes("cuhk-shenzhen"));
    return byName((pn) => pn.includes("cuhk"));
  }
  if (n.includes("hku") || n.includes("university of hong kong")) {
    if (n.includes("medicine") || n.includes("surgery") || n.includes("hkumed")) return byName((pn) => pn.includes("hkumed") || pn.includes("hku medicine"));
    return byName((pn) => pn.includes("the university of hong kong"));
  }
  if (n.includes("esri")) return byName((pn) => pn.includes("esri"));
  if (n.includes("oasa") || n.includes("orion astropreneur")) return byName((pn) => pn.includes("oasa"));
  if (n.includes("immuno cure")) return byName((pn) => pn.includes("immuno cure"));
  if (n.includes("biohk")) return byName((pn) => pn.includes("biohk"));
  if (n.includes("hkstp") || n.includes("science and technology parks")) return byName((pn) => pn.includes("hkstp"));
  return null;
}

// Pair each role line with the org from orgNames that the line actually mentions.
function assignRoleOrgs(a) {
  const orgs = a.orgNames ?? [];
  const tokens = (o) => o.toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length >= 3);
  for (const role of a.roles ?? []) {
    const line = role.title.toLowerCase();
    const hit = orgs.find((o) => {
      const ts = tokens(o);
      const strong = ts.filter((w) => !["the","and","for","ltd","limited","group","hong","kong"].includes(w));
      return strong.some((w) => line.includes(w));
    });
    if (hit) role.organization = hit;
  }
  // Primary keeps a fallback org so the card always shows an affiliation
  const primary = (a.roles ?? []).find((r) => r.isPrimary === 1);
  if (primary && !primary.organization && orgs.length) primary.organization = orgs[0];
}

// ---------- sqlite (local QA) ----------
function runSqlite() {
  const db = new Database("/home/user/workspace/partnership-portal/data.db");
  const partners = db.prepare("SELECT id, name_en FROM partnerships").all();
  const existing = new Set(db.prepare("SELECT name FROM advisors").all().map((r) => r.name));
  const insA = db.prepare(`INSERT INTO advisors (name, name_cn, advisor_type, track, pillar, emails, domains, background, photo_url, photo_thumb_url, profile_url, linkedin_url, gobi_pics, cohort, engagement, status, submitted_by, created_at)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`);
  const insR = db.prepare(`INSERT INTO advisor_roles (advisor_id, title, organization, partnership_id, is_primary, sort_order) VALUES (?,?,?,?,?,?)`);
  const admin = db.prepare("SELECT id FROM users WHERE role='admin' ORDER BY id LIMIT 1").get();
  let added = 0;
  for (const a of advisors) {
    if (existing.has(a.name)) continue;
    assignRoleOrgs(a);
    const r = insA.run(a.name, a.nameCn, a.advisorType, a.track, a.pillar, JSON.stringify(a.emails ?? []), a.domains, a.background, a.photoUrl, a.photoThumbUrl, a.profileUrl, a.linkedinUrl, JSON.stringify(a.gobiPics ?? []), a.cohort, a.engagement, "approved", admin?.id ?? 1, NOW);
    const aid = Number(r.lastInsertRowid);
    (a.roles ?? []).forEach((role, i) => {
      const pid = role.partnershipId ?? matchPartner(role.organization, partners);
      insR.run(aid, role.title, role.organization, pid, role.isPrimary ?? 0, i);
    });
    added++;
  }
  // Org logos onto partner records that lack one
  for (const [org, logo] of Object.entries(orgLogos)) {
    const key = org.toLowerCase().includes("esri") ? "%Esri%" : "%OASA%";
    db.prepare("UPDATE partnerships SET logo_url = ? WHERE name_en LIKE ? AND (logo_url IS NULL OR logo_url = '')").run(logo, key);
  }
  console.log(`sqlite: +${added} advisors (of ${advisors.length})`);
  db.close();
}

// ---------- Neon prod ----------
async function runPg() {
  const sql = neon(process.env.DATABASE_URL);
  const partners = await sql`SELECT id, name_en FROM partnerships`;
  const existingRows = await sql`SELECT name FROM advisors`;
  const existing = new Set(existingRows.map((r) => r.name));
  const adminRows = await sql`SELECT id FROM users WHERE role='admin' ORDER BY id LIMIT 1`;
  const adminId = adminRows[0]?.id ?? 1;
  let added = 0;
  for (const a of advisors) {
    if (existing.has(a.name)) continue;
    assignRoleOrgs(a);
    const rows = await sql`INSERT INTO advisors (name, name_cn, advisor_type, track, pillar, emails, domains, background, photo_url, photo_thumb_url, profile_url, linkedin_url, gobi_pics, cohort, engagement, status, submitted_by, created_at)
      VALUES (${a.name}, ${a.nameCn}, ${a.advisorType}, ${a.track}, ${a.pillar}, ${JSON.stringify(a.emails ?? [])}::jsonb, ${a.domains}, ${a.background}, ${a.photoUrl}, ${a.photoThumbUrl}, ${a.profileUrl}, ${a.linkedinUrl}, ${JSON.stringify(a.gobiPics ?? [])}::jsonb, ${a.cohort}, ${a.engagement}, 'approved', ${adminId}, ${NOW})
      RETURNING id`;
    const aid = rows[0].id;
    let i = 0;
    for (const role of a.roles ?? []) {
      const pid = role.partnershipId ?? matchPartner(role.organization, partners);
      await sql`INSERT INTO advisor_roles (advisor_id, title, organization, partnership_id, is_primary, sort_order)
        VALUES (${aid}, ${role.title}, ${role.organization}, ${pid}, ${role.isPrimary ?? 0}, ${i})`;
      i++;
    }
    added++;
  }
  for (const [org, logo] of Object.entries(orgLogos)) {
    const key = org.toLowerCase().includes("esri") ? "%Esri%" : "%OASA%";
    await sql`UPDATE partnerships SET logo_url = ${logo} WHERE name_en ILIKE ${key} AND (logo_url IS NULL OR logo_url = '')`;
  }
  const count = await sql`SELECT count(*)::int AS c FROM advisors`;
  console.log(`pg: +${added} advisors, total ${count[0].c}`);
}

const target = process.argv[2] ?? "both";
if (target === "sqlite" || target === "both") runSqlite();
if (target === "pg" || target === "both") {
  if (!process.env.DATABASE_URL) { console.error("DATABASE_URL missing"); process.exit(1); }
  await runPg();
}
