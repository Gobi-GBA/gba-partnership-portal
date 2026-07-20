import type { Stage, Category, Region, MacroRegion, Partnership } from "@shared/schema";
import { STAGES, CATEGORIES, REGIONS, MACRO_REGIONS, GOBI_STAFF } from "@shared/schema";

export { STAGES, CATEGORIES, REGIONS, GOBI_STAFF };

// Stage ordering for pipeline progress (index = progress)
export const STAGE_ORDER: Record<Stage, number> = {
  s1_new: 0,
  s2_engaged: 1,
  s3_agreement: 2,
  s4_progressive: 3,
  s5_strategic: 4,
};

// Numeric prefix shown on badges: 01-05
export const STAGE_NUM: Record<Stage, string> = {
  s1_new: "01",
  s2_engaged: "02",
  s3_agreement: "03",
  s4_progressive: "04",
  s5_strategic: "05",
};

// Badge styling per stage (Tailwind classes, light+dark)
export const STAGE_STYLES: Record<Stage, string> = {
  s1_new: "bg-muted text-muted-foreground border-transparent",
  s2_engaged: "bg-[hsl(193,45%,88%)] text-[hsl(214,68%,20%)] dark:bg-[hsl(214,55%,20%)] dark:text-[hsl(193,52%,70%)] border-transparent",
  s3_agreement: "bg-[hsl(193,52%,43%)] text-white dark:bg-[hsl(193,52%,35%)] border-transparent",
  s4_progressive: "bg-[hsl(214,68%,25%)] text-white dark:bg-[hsl(214,60%,35%)] border-transparent",
  s5_strategic: "bg-[hsl(42,63%,50%)] text-[hsl(214,68%,12%)] dark:bg-[hsl(42,63%,55%)] border-transparent",
};

// Region ordering — Gobi office regions first
export const REGION_ORDER: Record<Region, number> = Object.fromEntries(
  REGIONS.map((r, i) => [r, i]),
) as Record<Region, number>;

// Hub colors per territory-level region (network diagram)
export const REGION_COLORS: Record<Region, string> = {
  hongkong: "#48A9C5",
  mainland: "#C4716C",
  taiwan: "#C99A5B",
  macau: "#9B8CC4",
  singapore: "#3E8E7E",
  malaysia: "#7FB069",
  indonesia: "#B08968",
  vietnam: "#6B93C4",
  philippines: "#D4A843",
  japan: "#C48BB8",
  korea: "#8E7CC3",
  pakistan: "#5E8C61",
  global: "#5B84B1",
};

// Macro-region colors (broad grouping for the two-layer taxonomy)
export const MACRO_REGION_COLORS: Record<MacroRegion, string> = {
  greater_china: "#48A9C5",
  southeast_asia: "#3E8E7E",
  northeast_asia: "#C48BB8",
  south_asia: "#5E8C61",
  global: "#5B84B1",
};

// Category colors (used in network diagram + badges)
export const CATEGORY_COLORS: Record<Category, string> = {
  university: "#48A9C5", // aqua
  corporate: "#0C2340", // navy
  government: "#7A6FBE", // muted violet
  investor: "#D4A843", // gold
  accelerator: "#3E8E7E", // teal-green
  research: "#A8D8E8", // aqua light
  media: "#C4716C", // warm coral
  ecosystem: "#7FB069", // leaf green
  other: "#8FA5BB", // gray-blue
};

export const CATEGORY_COLORS_DARK: Record<Category, string> = {
  ...CATEGORY_COLORS,
  corporate: "#6B93C4",
};

export function logoFor(p: Pick<Partnership, "logoUrl" | "website">): string | null {
  if (p.logoUrl) return p.logoUrl;
  if (p.website) {
    try {
      const domain = new URL(p.website).hostname;
      return `https://www.google.com/s2/favicons?domain=${domain}&sz=128`;
    } catch {
      return null;
    }
  }
  return null;
}

// Merge multi-PIC list with legacy single picName
export function picsOf(p: Pick<Partnership, "picNames" | "picName">): string[] {
  const list = Array.isArray(p.picNames) ? p.picNames.filter(Boolean) : [];
  if (list.length > 0) return list;
  return p.picName ? [p.picName] : [];
}

export function initialsFor(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return "?";
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return (words[0][0] + words[1][0]).toUpperCase();
}

// Strategic-level sort: most advanced stage first, then alphabetical by English name
export function sortPartnerships<T extends Pick<Partnership, "region" | "category" | "stage" | "hallOfFame" | "nameEn">>(list: T[]): T[] {
  return [...list].sort((a, b) => {
    const s = (STAGE_ORDER[b.stage as Stage] ?? 0) - (STAGE_ORDER[a.stage as Stage] ?? 0);
    if (s !== 0) return s;
    return a.nameEn.localeCompare(b.nameEn);
  });
}

// Collaboration level is derived 1:1 from the partnership stage (01-05)
export function levelOfStage(stage: string): number {
  return (STAGE_ORDER[stage as Stage] ?? 0) + 1;
}

// Entries created within the last 30 days get a NEW badge
export function isNew(p: Pick<Partnership, "createdAt">): boolean {
  if (!p.createdAt) return false;
  const ts = Date.parse(p.createdAt);
  if (Number.isNaN(ts)) return false;
  return Date.now() - ts < 30 * 24 * 3600 * 1000;
}

// Years present in the data (from startDate), newest first
export function yearsOf(list: Pick<Partnership, "startDate">[]): string[] {
  const ys = new Set<string>();
  for (const p of list) {
    const y = (p.startDate ?? "").slice(0, 4);
    if (/^\d{4}$/.test(y)) ys.add(y);
  }
  return Array.from(ys).sort().reverse();
}

// Secret question ids — rendered bilingually via i18n keys of the same name
export const SECRET_QUESTIONS = [
  "sq_birth_city",
  "sq_first_school",
  "sq_first_pet",
  "sq_mother_name",
  "sq_favorite_book",
  "sq_childhood_friend",
] as const;
