import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import { Link, useLocation } from "wouter";
import { useLang } from "@/lib/i18n";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import { Moon, Sun, Menu, X, Globe, ExternalLink, Mail, User, Star, Calendar, Tag, MapPin, Paperclip, Network, FlaskConical, Pencil, History, ChevronDown, ChevronLeft, ChevronRight } from "lucide-react";
import { GalaxyBackground } from "@/components/galaxy-bg";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuCheckboxItem, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { Partnership, Stage, Category, Region, MacroRegion, AttachmentMeta, AuditLog, AdvisorWithRoles } from "@shared/schema";
import { GOBI_OFFICES, MACRO_REGIONS, MACRO_TO_REGIONS } from "@shared/schema";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Checkbox } from "@/components/ui/checkbox";
import { STAGES, STAGE_ORDER, STAGE_NUM, STAGE_STYLES, CATEGORY_COLORS, GOBI_STAFF, logoFor, initialsFor, picsOf, levelOfStage, isNew } from "@/lib/constants";
import { useQuery } from "@tanstack/react-query";
import { API_BASE, getAuthToken } from "@/lib/queryClient";
import { cn } from "@/lib/utils";
import { VersionLogDialog, ProfileDialog, UserAvatar } from "@/components/user-panels";
import { CURRENT_VERSION } from "@/lib/versions";

// Auto-open the version log once per browser session after login (memory only — no storage APIs).
let versionLogShown = false;

// ---------------- Multi-select filter (dropdown with checkboxes) ----------------
export function MultiSelectFilter({
  label, options, selected, onChange, className, testid,
}: {
  label: string;
  options: { value: string; label: string }[];
  selected: string[];
  onChange: (v: string[]) => void;
  className?: string;
  testid: string;
}) {
  const { t } = useLang();
  const toggle = (value: string) => {
    onChange(selected.includes(value) ? selected.filter((v) => v !== value) : [...selected, value]);
  };
  const display =
    selected.length === 0
      ? `${label}: ${t("filterAll")}`
      : selected.length === 1
        ? options.find((o) => o.value === selected[0])?.label ?? label
        : `${label} (${selected.length})`;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          data-testid={testid}
          className={cn(
            "flex h-10 items-center justify-between gap-2 rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2",
            selected.length > 0 && "border-[hsl(var(--aqua))]/60 text-foreground",
            className,
          )}
        >
          <span className="truncate">{display}</span>
          <ChevronDown className="h-4 w-4 shrink-0 opacity-50" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="max-h-80 overflow-y-auto min-w-[12rem]">
        <DropdownMenuItem
          onSelect={(e) => { e.preventDefault(); onChange([]); }}
          className={cn("text-sm", selected.length === 0 && "font-semibold")}
          data-testid={`${testid}-all`}
        >
          {label}: {t("filterAll")}
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        {options.map((o) => (
          <DropdownMenuCheckboxItem
            key={o.value}
            checked={selected.includes(o.value)}
            onSelect={(e) => e.preventDefault()}
            onCheckedChange={() => toggle(o.value)}
            data-testid={`${testid}-${o.value}`}
          >
            {o.label}
          </DropdownMenuCheckboxItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

// Two-layer region filter: territories grouped under macro-regions.
// A macro header toggles all its territories at once; the trigger shows a count.
export function GroupedRegionFilter({
  selected, onChange, className, testid,
}: {
  selected: string[];
  onChange: (v: string[]) => void;
  className?: string;
  testid: string;
}) {
  const { t } = useLang();
  const toggle = (value: string) =>
    onChange(selected.includes(value) ? selected.filter((v) => v !== value) : [...selected, value]);
  const macroState = (macro: MacroRegion): "all" | "some" | "none" => {
    const terrs = MACRO_TO_REGIONS[macro];
    const on = terrs.filter((r) => selected.includes(r)).length;
    if (on === 0) return "none";
    if (on === terrs.length) return "all";
    return "some";
  };
  const toggleMacro = (macro: MacroRegion) => {
    const terrs = MACRO_TO_REGIONS[macro] as string[];
    if (macroState(macro) === "all") {
      onChange(selected.filter((v) => !terrs.includes(v)));
    } else {
      onChange(Array.from(new Set([...selected, ...terrs])));
    }
  };
  const display =
    selected.length === 0 ? `${t("filterRegion")}: ${t("filterAll")}` : `${t("filterRegion")} (${selected.length})`;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          data-testid={testid}
          className={cn(
            "flex h-10 items-center justify-between gap-2 rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2",
            selected.length > 0 && "border-[hsl(var(--aqua))]/60 text-foreground",
            className,
          )}
        >
          <span className="truncate">{display}</span>
          <ChevronDown className="h-4 w-4 shrink-0 opacity-50" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="max-h-[70vh] overflow-y-auto min-w-[13rem]">
        <DropdownMenuItem
          onSelect={(e) => { e.preventDefault(); onChange([]); }}
          className={cn("text-sm", selected.length === 0 && "font-semibold")}
          data-testid={`${testid}-all`}
        >
          {t("filterRegion")}: {t("filterAll")}
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        {MACRO_REGIONS.map((macro) => {
          const st = macroState(macro);
          return (
            <div key={macro}>
              <DropdownMenuItem
                onSelect={(e) => { e.preventDefault(); toggleMacro(macro); }}
                className="gap-2 py-1.5"
                data-testid={`${testid}-macro-${macro}`}
              >
                <span
                  className={cn(
                    "flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-[3px] border",
                    st === "all" && "bg-[hsl(var(--aqua))] border-[hsl(var(--aqua))]",
                    st === "some" && "bg-[hsl(var(--aqua))]/40 border-[hsl(var(--aqua))]",
                    st === "none" && "border-muted-foreground/40",
                  )}
                >
                  {st === "all" && <span className="h-1.5 w-1.5 rounded-[1px] bg-white" />}
                  {st === "some" && <span className="h-0.5 w-2 rounded bg-white" />}
                </span>
                <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                  {t(`macro_${macro}` as any)}
                </span>
              </DropdownMenuItem>
              {MACRO_TO_REGIONS[macro].map((r) => (
                <DropdownMenuCheckboxItem
                  key={r}
                  checked={selected.includes(r)}
                  onSelect={(e) => e.preventDefault()}
                  onCheckedChange={() => toggle(r)}
                  className="pl-8"
                  data-testid={`${testid}-${r}`}
                >
                  {t(`region_${r}` as any)}
                </DropdownMenuCheckboxItem>
              ))}
            </div>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

// ---------------- Photo carousel (partner gallery) ----------------
export function PhotoCarousel({ photos, alt }: { photos: string[]; alt: string }) {
  const [idx, setIdx] = useState(0);
  const { t } = useLang();
  if (photos.length === 0) return null;
  const go = (d: number) => setIdx((i) => (i + d + photos.length) % photos.length);
  return (
    <div className="relative overflow-hidden rounded-lg border border-border bg-muted" data-testid="carousel-photos">
      <div className="flex transition-transform duration-300 ease-out" style={{ transform: `translateX(-${idx * 100}%)` }}>
        {photos.map((src, i) => (
          <img
            key={src}
            src={src}
            alt={`${alt} — ${i + 1}`}
            loading={i === 0 ? "eager" : "lazy"}
            className="h-52 sm:h-60 w-full shrink-0 object-cover"
            data-testid={`img-photo-${i}`}
          />
        ))}
      </div>
      {photos.length > 1 && (
        <>
          <button
            type="button"
            onClick={() => go(-1)}
            aria-label="Previous photo"
            className="absolute left-2 top-1/2 -translate-y-1/2 rounded-full bg-black/45 p-1.5 text-white backdrop-blur-sm transition-colors hover:bg-black/65"
            data-testid="button-photo-prev"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={() => go(1)}
            aria-label="Next photo"
            className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full bg-black/45 p-1.5 text-white backdrop-blur-sm transition-colors hover:bg-black/65"
            data-testid="button-photo-next"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
          <div className="absolute bottom-2 right-2 rounded-full bg-black/45 px-2 py-0.5 text-[10px] font-semibold text-white backdrop-blur-sm tabular-nums">
            {idx + 1} {t("photoOf")} {photos.length}
          </div>
          <div className="absolute bottom-2 left-1/2 -translate-x-1/2 flex gap-1.5">
            {photos.map((_, i) => (
              <button
                key={i}
                type="button"
                aria-label={`Photo ${i + 1}`}
                onClick={() => setIdx(i)}
                className={cn("h-1.5 rounded-full transition-all", i === idx ? "w-4 bg-white" : "w-1.5 bg-white/50 hover:bg-white/80")}
                data-testid={`button-photo-dot-${i}`}
              />
            ))}
          </div>
        </>
      )}
    </div>
  );
}

// ---------------- Theme ----------------
const ThemeContext = createContext<{ dark: boolean; toggle: () => void }>({
  dark: false,
  toggle: () => {},
});

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [dark, setDark] = useState(
    () => window.matchMedia("(prefers-color-scheme: dark)").matches,
  );
  useEffect(() => {
    document.documentElement.classList.toggle("dark", dark);
  }, [dark]);
  return (
    <ThemeContext.Provider value={{ dark, toggle: () => setDark((d) => !d) }}>
      {children}
    </ThemeContext.Provider>
  );
}
export const useTheme = () => useContext(ThemeContext);

// ---------------- Logo mark ----------------
export function BrandMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={className} aria-label="Gobi Partnership Portal" fill="none">
      <rect width="32" height="32" rx="7" fill="#0C2340" />
      <path d="M16 16L7 9M16 16l9-7M16 16l-9 8M16 16l9 8" stroke="#48A9C5" strokeWidth="1.2" />
      <circle cx="16" cy="16" r="4" fill="#D4A843" />
      <circle cx="7" cy="9" r="2.4" fill="#48A9C5" />
      <circle cx="25" cy="9" r="2.4" fill="#48A9C5" />
      <circle cx="7" cy="24" r="2.4" fill="#48A9C5" />
      <circle cx="25" cy="24" r="2.4" fill="#48A9C5" />
    </svg>
  );
}

// ---------------- Layout ----------------
export function Layout({ children }: { children: ReactNode }) {
  const { lang, setLang, t } = useLang();
  const { user, logout } = useAuth();
  const { dark, toggle } = useTheme();
  const [location] = useLocation();
  const [open, setOpen] = useState(false);
  const [showTestBanner, setShowTestBanner] = useState(true);
  const [showVersions, setShowVersions] = useState(false);
  const [showProfile, setShowProfile] = useState(false);

  useEffect(() => {
    if (user && !versionLogShown) {
      versionLogShown = true;
      setShowVersions(true);
    }
  }, [user]);

  const links: { href: string; label: string; show: boolean; soon?: boolean }[] = [
    { href: "/", label: t("navDirectory"), show: true },
    { href: "/submit", label: t("navSubmit"), show: true },
    { href: "/advisors", label: t("navAdvisors"), show: true },
    { href: "/updates", label: t("navUpdates"), show: true },
    { href: "/rd", label: t("navRd"), show: user?.role === "admin" || user?.isDev === 1 },
    { href: "/admin", label: t("navAdmin"), show: user?.role === "admin" },
  ];

  return (
    <div className="relative min-h-screen flex flex-col text-foreground">
      <GalaxyBackground />
      <header className="sticky top-0 z-40 border-b border-border bg-background/90 backdrop-blur">
        <div className="mx-auto max-w-6xl px-4 h-16 flex items-center gap-3">
          <a href="https://www.gobi.vc" target="_blank" rel="noopener noreferrer" data-testid="link-home" className="flex items-center gap-3 shrink-0">
            <img
              src={dark ? "gobi-logo-white.png" : "gobi-logo-navy.png"}
              alt="Gobi Partners"
              className="h-8 sm:h-9 w-auto"
              data-testid="img-gobi-logo"
            />
            <span className="leading-tight border-l border-border pl-3 hidden sm:block">
              <span className="block text-sm font-bold tracking-tight">{t("brandTitle")}</span>
              <span className="block text-[11px] text-muted-foreground">{t("brandSub")}</span>
            </span>
          </a>

          <nav className="hidden md:flex items-center gap-1 ml-6">
            {links.filter((l) => l.show).map((l) => (
              <Link key={l.href} href={l.href} data-testid={`link-nav-${l.href.replace(/\//g, "") || "home"}`}>
                <span
                  className={cn(
                    "whitespace-nowrap px-3 py-1.5 rounded-md text-sm font-medium cursor-pointer transition-colors",
                    location === l.href
                      ? "bg-secondary text-secondary-foreground"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  {l.label}
                  {l.soon && (
                    <span className="ml-1.5 whitespace-nowrap rounded-full border border-[hsl(var(--gold))]/40 bg-[hsl(var(--gold))]/10 px-1.5 py-px text-[9px] font-semibold uppercase tracking-wide text-[hsl(var(--gold))] align-middle">
                      {t("soonTag")}
                    </span>
                  )}
                </span>
              </Link>
            ))}
          </nav>

          <div className="ml-auto flex items-center gap-1.5">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setLang(lang === "en" ? "cn" : "en")}
              data-testid="button-lang-toggle"
              className="gap-1.5 font-semibold"
            >
              <Globe className="h-4 w-4" />
              {lang === "en" ? "中文" : "EN"}
            </Button>
            <Button variant="ghost" size="icon" onClick={toggle} data-testid="button-theme-toggle">
              {dark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
            </Button>
            {user ? (
              <div className="hidden md:flex items-center gap-2">
                <button
                  onClick={() => setShowProfile(true)}
                  className="flex items-center gap-2 rounded-full py-0.5 pl-0.5 pr-2 hover:bg-secondary transition-colors"
                  title={t("profileTitle")}
                  data-testid="button-open-profile"
                >
                  <UserAvatar name={user.name} avatarUrl={user.avatarUrl} size="md" />
                  <span className="text-left leading-tight max-w-[130px]">
                    <span className="block truncate text-xs font-semibold" data-testid="text-username">{user.name}</span>
                    {user.title && <span className="block truncate text-[10px] text-muted-foreground" data-testid="text-usertitle">{user.title}</span>}
                  </span>
                </button>
                <Button variant="outline" size="sm" onClick={logout} data-testid="button-logout">
                  {t("navLogout")}
                </Button>
              </div>
            ) : (
              <Link href="/login" data-testid="link-login" className="hidden md:block">
                <Button size="sm">{t("navLogin")}</Button>
              </Link>
            )}
            <Button
              variant="ghost"
              size="icon"
              className="md:hidden"
              onClick={() => setOpen((o) => !o)}
              data-testid="button-mobile-menu"
            >
              {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
            </Button>
          </div>
        </div>

        {open && (
          <div className="md:hidden border-t border-border bg-background px-4 py-3 space-y-1">
            {links.filter((l) => l.show).map((l) => (
              <Link key={l.href} href={l.href}>
                <span
                  onClick={() => setOpen(false)}
                  className={cn(
                    "block px-3 py-2 rounded-md text-sm font-medium cursor-pointer",
                    location === l.href ? "bg-secondary" : "text-muted-foreground",
                  )}
                >
                  {l.label}
                  {l.soon && (
                    <span className="ml-1.5 whitespace-nowrap rounded-full border border-[hsl(var(--gold))]/40 bg-[hsl(var(--gold))]/10 px-1.5 py-px text-[9px] font-semibold uppercase tracking-wide text-[hsl(var(--gold))]">
                      {t("soonTag")}
                    </span>
                  )}
                </span>
              </Link>
            ))}
            {user ? (
              <>
                <button
                  onClick={() => { setShowProfile(true); setOpen(false); }}
                  className="flex w-full items-center gap-2 px-3 py-2 rounded-md text-sm font-medium text-muted-foreground"
                  data-testid="button-open-profile-mobile"
                >
                  <UserAvatar name={user.name} avatarUrl={user.avatarUrl} size="sm" />
                  {t("profileTitle")} · {user.name}
                </button>
                <button
                  onClick={() => { logout(); setOpen(false); }}
                  className="block w-full text-left px-3 py-2 rounded-md text-sm font-medium text-muted-foreground"
                  data-testid="button-logout-mobile"
                >
                  {t("navLogout")}
                </button>
              </>
            ) : (
              <Link href="/login">
                <span onClick={() => setOpen(false)} className="block px-3 py-2 rounded-md text-sm font-medium text-muted-foreground cursor-pointer">
                  {t("navLogin")}
                </span>
              </Link>
            )}
          </div>
        )}
      </header>

      {showTestBanner && (
        <div
          role="status"
          data-testid="banner-internal-test"
          className="sticky top-16 z-30 border-b border-amber-500/30 bg-background text-foreground"
        >
          <div className="absolute inset-0 bg-amber-500/10 pointer-events-none" aria-hidden="true" />
          <div className="relative mx-auto max-w-6xl px-4 py-2 flex items-start md:items-center gap-2.5 text-xs md:text-[13px]">
            <FlaskConical className="h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400 mt-0.5 md:mt-0" aria-hidden="true" />
            <p className="flex-1 leading-snug">
              <span className="font-semibold">{t("testBannerTitle")}</span>
              <span className="text-muted-foreground"> — {t("testBannerBody")}</span>
            </p>
            <button
              onClick={() => setShowTestBanner(false)}
              data-testid="button-dismiss-test-banner"
              className="shrink-0 rounded px-2 py-1 font-medium text-amber-700 dark:text-amber-300 hover:bg-amber-500/15 transition-colors"
            >
              {t("testBannerDismiss")}
            </button>
          </div>
        </div>
      )}

      <main className="flex-1">{children}</main>

      {user && <VersionLogDialog open={showVersions} onClose={() => setShowVersions(false)} />}
      {user && showProfile && <ProfileDialog open={showProfile} onClose={() => setShowProfile(false)} />}

      <footer className="border-t border-border bg-background/70 backdrop-blur-sm py-8 mt-16">
        <div className="mx-auto max-w-6xl px-4 flex flex-col gap-3">
          <div className="flex flex-col md:flex-row items-center justify-between gap-3">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <BrandMark className="h-5 w-5" />
              {t("footerLine")}
            </div>
            <div className="flex items-center gap-3 text-xs text-muted-foreground">
              <Link href="/updates" data-testid="button-version-log">
                <span
                  className="inline-block cursor-pointer rounded-full border border-border px-2 py-0.5 font-semibold tabular-nums hover:bg-secondary hover:text-foreground transition-colors"
                  title={t("updatesTitle")}
                >
                  v{CURRENT_VERSION}
                </span>
              </Link>
            </div>
          </div>
          <div className="flex flex-col md:flex-row items-center gap-2 md:gap-4 border-t border-border/60 pt-3 text-xs text-muted-foreground" data-testid="footer-related-sites">
            <span className="font-semibold uppercase tracking-wide text-[10px] text-muted-foreground/70">{t("relatedSites")}</span>
            <a
              href="https://gobi.vc"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 hover:text-[hsl(var(--aqua))] transition-colors"
              data-testid="link-related-gobi"
            >
              <ExternalLink className="h-3 w-3" /> Gobi Partners — gobi.vc
            </a>
            <a
              href="https://fred-li.vercel.app"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 hover:text-[hsl(var(--aqua))] transition-colors"
              data-testid="link-related-fred"
            >
              <ExternalLink className="h-3 w-3" /> Fred Li — fred-li.vercel.app
            </a>
          </div>
          <div className="text-center md:text-left text-xs text-muted-foreground/80" data-testid="text-dev-note">
            {t("devNote")}
          </div>
          <div className="text-center md:text-left text-[11px] leading-relaxed text-muted-foreground/70" data-testid="text-disclaimer">
            {t("disclaimer")}
          </div>
        </div>
      </footer>
    </div>
  );
}

// ---------------- Partner logo avatar ----------------
export function PartnerLogo({ p, size = "md" }: { p: Partnership; size?: "sm" | "md" | "lg" }) {
  const [failed, setFailed] = useState(false);
  const url = logoFor(p);
  const cls = size === "lg" ? "h-16 w-16 text-lg" : size === "sm" ? "h-8 w-8 text-[10px]" : "h-12 w-12 text-sm";
  if (!url || failed) {
    return (
      <div
        className={cn(cls, "rounded-lg bg-primary text-primary-foreground flex items-center justify-center font-bold shrink-0")}
        data-testid={`img-logo-fallback-${p.id}`}
      >
        {initialsFor(p.nameEn)}
      </div>
    );
  }
  return (
    <div className={cn(cls, "rounded-lg bg-white border border-border flex items-center justify-center shrink-0 overflow-hidden p-1.5")}>
      <img
        src={url}
        alt={`${p.nameEn} logo`}
        className="max-h-full max-w-full object-contain"
        onError={() => setFailed(true)}
        data-testid={`img-logo-${p.id}`}
      />
    </div>
  );
}

// ---------------- LP badge (IR team only — server redacts lpStatus to 'na' for everyone else) ----------------
export function LpBadge({ p }: { p: Pick<Partnership, "lpStatus"> }) {
  const { t } = useLang();
  if (p.lpStatus !== "lp" && p.lpStatus !== "target") return null;
  const isLp = p.lpStatus === "lp";
  return (
    <span
      title={t("lpBadgeHint")}
      data-testid={isLp ? "badge-lp" : "badge-lp-target"}
      className={
        isLp
          ? "inline-flex items-center gap-1 rounded-full border border-[hsl(var(--gold))] bg-[hsl(var(--gold))]/15 px-1.5 py-0.5 text-[9px] font-extrabold uppercase tracking-wide text-[hsl(40,55%,32%)] dark:text-[hsl(var(--gold))] shrink-0"
          : "inline-flex items-center gap-1 rounded-full border border-dashed border-[hsl(var(--gold))] px-1.5 py-0.5 text-[9px] font-extrabold uppercase tracking-wide text-[hsl(40,55%,32%)] dark:text-[hsl(var(--gold))] shrink-0"
      }
    >
      <Star className={isLp ? "h-2.5 w-2.5 fill-[hsl(var(--gold))] text-[hsl(var(--gold))]" : "h-2.5 w-2.5 text-[hsl(var(--gold))]"} />
      {isLp ? t("lpStatusLp") : t("lpStatusTarget")}
    </span>
  );
}

// ---------------- NEW badge (entries added within the last month) ----------------
export function NewBadge({ p }: { p: Pick<Partnership, "createdAt"> }) {
  const { t } = useLang();
  if (!isNew(p)) return null;
  return (
    <span
      className="inline-flex items-center rounded-full bg-[hsl(var(--gold))] px-1.5 py-0.5 text-[9px] font-extrabold uppercase tracking-wide text-[hsl(214,68%,12%)] shrink-0"
      data-testid="badge-new"
    >
      {t("newBadge")}
    </span>
  );
}

// ---------------- Stage badge ----------------
export function StageBadge({ stage }: { stage: Stage }) {
  const { t } = useLang();
  return (
    <Badge className={cn("font-medium tabular-nums", STAGE_STYLES[stage])} data-testid={`badge-stage-${stage}`}>
      {STAGE_NUM[stage]} · {t(`stage_${stage}` as any)}
    </Badge>
  );
}

export function RegionBadge({ region }: { region: Region }) {
  const { t } = useLang();
  return (
    <Badge variant="outline" className="font-normal text-muted-foreground gap-1">
      <MapPin className="h-3 w-3" />
      {t(`region_${region}` as any)}
    </Badge>
  );
}

// ---------------- Gobi PIC avatar (small circle with initials) ----------------
export function PicAvatar({ name, size = "sm", withName = false }: { name?: string | null; size?: "sm" | "md"; withName?: boolean }) {
  const { t } = useLang();
  if (!name) return null;
  const staff = GOBI_STAFF.find((s) => s.name === name);
  const cls = size === "md" ? "h-7 w-7 text-[10px]" : "h-5 w-5 text-[8px]";
  return (
    <span className="inline-flex items-center gap-1.5" title={`${t("picLabel")}: ${name}${staff ? ` — ${staff.title}` : ""}`} data-testid={`pic-avatar-${name.replace(/\s+/g, "-").toLowerCase()}`}>
      <span
        className={cn(
          cls,
          "rounded-full bg-[hsl(var(--gold))]/15 text-[hsl(42,63%,35%)] dark:text-[hsl(var(--gold))] border border-[hsl(var(--gold))]/40 flex items-center justify-center font-bold shrink-0",
        )}
      >
        {initialsFor(name)}
      </span>
      {withName && <span className="text-xs text-muted-foreground">{name}</span>}
    </span>
  );
}

// Checklist picker for multiple Gobi PICs, grouped by office
export function PicChecklist({ value, onChange }: { value: string[]; onChange: (v: string[]) => void }) {
  const { t } = useLang();
  const toggle = (name: string) =>
    onChange(value.includes(name) ? value.filter((n) => n !== name) : [...value, name]);
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button type="button" variant="outline" className="w-full justify-between font-normal" data-testid="button-pic-checklist">
          <span className="truncate text-left">
            {value.length > 0 ? value.join(", ") : t("selectPics")}
          </span>
          <span className="ml-2 shrink-0 text-xs text-muted-foreground">
            {value.length > 0 ? `${value.length} ${t("picsSelected")}` : ""}
          </span>
        </Button>
      </PopoverTrigger>
      <PopoverContent
        className="w-80 p-0"
        align="start"
        collisionPadding={12}
        avoidCollisions
      >
        <div
          className="overflow-y-auto overscroll-contain"
          style={{ maxHeight: "min(18rem, var(--radix-popover-content-available-height, 18rem))" }}
        >
          {GOBI_OFFICES.map((office) => {
            const staff = GOBI_STAFF.filter((s) => s.office === office);
            if (!staff.length) return null;
            return (
              <div key={office} className="p-2 border-b border-border last:border-0">
                <p className="px-2 pb-1 text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">{office}</p>
                {staff.map((s) => (
                  <label
                    key={s.name}
                    className="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm cursor-pointer hover:bg-muted"
                    data-testid={`check-pic-${s.name.replace(/\s+/g, "-").toLowerCase()}`}
                  >
                    <Checkbox checked={value.includes(s.name)} onCheckedChange={() => toggle(s.name)} />
                    <span className="min-w-0 flex-1 truncate">{s.name}</span>
                    <span className="text-[10px] text-muted-foreground truncate max-w-[8rem]">{s.title}</span>
                  </label>
                ))}
              </div>
            );
          })}
        </div>
      </PopoverContent>
    </Popover>
  );
}

// Multiple PICs rendered as a compact avatar group
export function PicAvatars({ names, size = "sm", withName = false, max = 4 }: { names?: string[] | null; size?: "sm" | "md"; withName?: boolean; max?: number }) {
  const list = (names ?? []).filter(Boolean);
  if (list.length === 0) return null;
  const shown = list.slice(0, max);
  const extra = list.length - shown.length;
  return (
    <span className="inline-flex items-center gap-1" data-testid="pic-avatars">
      {shown.map((n) => (
        <PicAvatar key={n} name={n} size={size} withName={withName && list.length === 1} />
      ))}
      {extra > 0 && <span className="text-[10px] text-muted-foreground font-medium">+{extra}</span>}
      {withName && list.length > 1 && (
        <span className="text-xs text-muted-foreground ml-1">{list.join(" · ")}</span>
      )}
    </span>
  );
}

export function CategoryBadge({ category }: { category: Category }) {
  const { t } = useLang();
  return (
    <Badge variant="outline" className="font-normal text-muted-foreground gap-1">
      <span className="h-2 w-2 rounded-full inline-block" style={{ background: CATEGORY_COLORS[category] }} />
      {t(`cat_${category}` as any)}
    </Badge>
  );
}

// ---------------- Collaboration level dots ----------------
export function LevelDots({ level, showLabel = false }: { level: number; showLabel?: boolean }) {
  const { t } = useLang();
  return (
    <span className="inline-flex items-center gap-1" title={`${t("collabLevel")}: ${level}/5`} data-testid={`level-dots-${level}`}>
      {[1, 2, 3, 4, 5].map((i) => (
        <span
          key={i}
          className={cn(
            "h-1.5 w-1.5 rounded-full",
            i <= level ? "bg-[hsl(var(--aqua))]" : "bg-border",
          )}
        />
      ))}
      {showLabel && <span className="text-xs text-muted-foreground ml-1">{level}/5</span>}
    </span>
  );
}

// ---------------- Pipeline progress ----------------
export function PipelineProgress({ stage }: { stage: Stage }) {
  const { t } = useLang();
  const idx = STAGE_ORDER[stage];
  return (
    <div className="w-full">
      <div className="flex items-center">
        {STAGES.map((s, i) => (
          <div key={s} className="flex items-center flex-1 last:flex-none">
            <div
              className={cn(
                "h-2.5 w-2.5 rounded-full shrink-0 transition-colors",
                i <= idx ? "bg-[hsl(var(--aqua))]" : "bg-border",
                i === idx && "ring-4 ring-[hsl(var(--aqua))]/20",
              )}
            />
            {i < STAGES.length - 1 && (
              <div className={cn("h-0.5 flex-1", i < idx ? "bg-[hsl(var(--aqua))]" : "bg-border")} />
            )}
          </div>
        ))}
      </div>
      <div className="mt-2 flex justify-between text-[10px] text-muted-foreground tabular-nums">
        <span>01 {t("stage_s1_new")}</span>
        <span className="font-semibold text-foreground">{STAGE_NUM[stage]} · {t(`stage_${stage}` as any)}</span>
        <span>05 {t("stage_s5_strategic")}</span>
      </div>
    </div>
  );
}

// ---------------- Partnership card ----------------
// Display options: which info blocks appear on cards and the star map.
// Lets users hide sensitive or noisy blocks before taking a screenshot.
export type ViewOptions = {
  newBadge: boolean;
  lpStar: boolean;
  pic: boolean;
  region: boolean;
  stage: boolean;
  category: boolean;
};

export const DEFAULT_VIEW_OPTIONS: ViewOptions = {
  newBadge: true,
  lpStar: true,
  pic: true,
  region: true,
  stage: true,
  category: true,
};

export function PartnershipCard({ p, onClick, opts = DEFAULT_VIEW_OPTIONS }: { p: Partnership; onClick: () => void; opts?: ViewOptions }) {
  const { lang, t } = useLang();
  const name = lang === "cn" && p.nameCn ? p.nameCn : p.nameEn;
  const altName = lang === "cn" ? p.nameEn : p.nameCn;
  const desc = lang === "cn" ? p.descriptionCn || p.descriptionEn : p.descriptionEn || p.descriptionCn;
  return (
    <button
      onClick={onClick}
      data-testid={`card-partnership-${p.id}`}
      className="text-left w-full rounded-xl border border-card-border bg-card p-5 transition-all hover:border-[hsl(var(--aqua))]/60 hover:shadow-md focus:outline-none focus:ring-2 focus:ring-ring"
    >
      <div className="flex items-start gap-4">
        <PartnerLogo p={p} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h3 className="font-bold text-base truncate">{name}</h3>
            {opts.lpStar && p.hallOfFame === 1 && <Star className="h-4 w-4 shrink-0 fill-[hsl(var(--gold))] text-[hsl(var(--gold))]" />}
            {opts.lpStar && <LpBadge p={p} />}
            {opts.newBadge && <NewBadge p={p} />}
          </div>
          {altName && <p className="text-xs text-muted-foreground truncate">{altName}</p>}
          {(opts.stage || opts.category || opts.region) && (
            <div className="mt-2 flex flex-wrap items-center gap-2">
              {opts.stage && <StageBadge stage={p.stage as Stage} />}
              {opts.category && <CategoryBadge category={p.category as Category} />}
              {opts.region && <RegionBadge region={p.region as Region} />}
            </div>
          )}
        </div>
      </div>
      {desc && <p className="mt-3 text-sm text-muted-foreground line-clamp-2">{desc}</p>}
      <div className="mt-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <LevelDots level={levelOfStage(p.stage)} />
          {opts.pic && <PicAvatars names={picsOf(p)} />}
        </div>
        <span className="text-xs text-[hsl(var(--aqua))] font-medium">{t("viewDetails")} →</span>
      </div>
    </button>
  );
}

// ---------------- Detail dialog ----------------
export function PartnershipDetailDialog({
  p, open, onOpenChange, onEdit,
}: {
  p: Partnership | null;
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onEdit?: (p: Partnership) => void;
}) {
  const { lang, t } = useLang();
  const { user } = useAuth();
  const canEdit = !!onEdit && (user?.role === "admin" || user?.role === "staff");
  const { data: attachments } = useQuery<AttachmentMeta[]>({
    queryKey: ["/api/partnerships", p?.id ?? 0, "attachments"],
    enabled: open && !!p,
  });
  const { data: allPartners } = useQuery<Partnership[]>({
    queryKey: ["/api/partnerships"],
    enabled: open && !!p,
  });
  const { data: allAdvisors } = useQuery<AdvisorWithRoles[]>({
    queryKey: ["/api/advisors"],
    enabled: open && !!p,
  });
  const [, navigate] = useLocation();
  if (!p) return null;
  const linkedAdvisors = (allAdvisors ?? []).filter((a) =>
    (a.roles ?? []).some((r) => r.partnershipId === p.id),
  );
  const name = lang === "cn" && p.nameCn ? p.nameCn : p.nameEn;
  const altName = lang === "cn" ? p.nameEn : p.nameCn;
  const desc = lang === "cn" ? p.descriptionCn || p.descriptionEn : p.descriptionEn || p.descriptionCn;
  const parent = p.parentId ? allPartners?.find((x) => x.id === p.parentId) : undefined;
  const children = allPartners?.filter((x) => x.parentId === p.id) ?? [];
  const partnerName = (x: Partnership) => (lang === "cn" && x.nameCn ? x.nameCn : x.nameEn);
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex items-center gap-4">
            <PartnerLogo p={p} size="lg" />
            <div className="min-w-0">
              <DialogTitle className="flex items-center gap-2 text-lg">
                <span className="truncate">{name}</span>
                {p.hallOfFame === 1 && <Star className="h-4 w-4 shrink-0 fill-[hsl(var(--gold))] text-[hsl(var(--gold))]" />}
                <LpBadge p={p} />
                <NewBadge p={p} />
              </DialogTitle>
              {altName && <DialogDescription>{altName}</DialogDescription>}
            </div>
            {canEdit && (
              <Button
                size="sm"
                onClick={() => onEdit!(p)}
                className="ml-auto mr-6 shrink-0 gap-1.5 bg-[hsl(193,52%,38%)] text-white shadow-sm transition-all hover:bg-[hsl(193,52%,30%)] hover:shadow-md"
                data-testid={`button-edit-detail-${p.id}`}
              >
                <Pencil className="h-3.5 w-3.5" /> {t("editRecord")}
              </Button>
            )}
          </div>
        </DialogHeader>

        <div className="space-y-5 pt-2">
          {(p.photos ?? []).length > 0 && <PhotoCarousel photos={p.photos!} alt={name} />}

          <div className="flex flex-wrap gap-2">
            <StageBadge stage={p.stage as Stage} />
            <CategoryBadge category={p.category as Category} />
            <RegionBadge region={p.region as Region} />
            {p.isDomainKnowledgePartner === 1 && (
              <Badge variant="outline" className="text-[11px] font-semibold border-[hsl(var(--gold))]/40 bg-[hsl(var(--gold))]/10 text-[hsl(var(--gold))]" data-testid={`badge-dkp-${p.id}`}>
                {t("domainKnowledgePartnerBadge")}
              </Badge>
            )}
          </div>

          {linkedAdvisors.length > 0 && (
            <div className="rounded-lg border border-border p-3 space-y-2">
              <p className="text-xs font-semibold text-muted-foreground flex items-center gap-1.5">
                <User className="h-3.5 w-3.5" /> {t("linkedAdvisorsLabel")}
              </p>
              <div className="flex flex-wrap gap-2">
                {linkedAdvisors.map((a) => (
                  <button
                    key={a.id}
                    type="button"
                    onClick={() => { onOpenChange(false); navigate(`/advisors/${a.id}`); }}
                    className="inline-flex items-center gap-2 rounded-full border border-border bg-secondary/50 py-1 pl-1 pr-3 text-xs font-medium transition-colors hover:border-[hsl(var(--gold))]/50 hover:bg-secondary"
                    data-testid={`chip-advisor-${a.id}`}
                  >
                    {a.photoThumbUrl ? (
                      <img src={a.photoThumbUrl} alt={a.name} className="h-5 w-5 rounded-full object-cover" />
                    ) : (
                      <span className="flex h-5 w-5 items-center justify-center rounded-full bg-muted text-[9px] font-bold text-[hsl(var(--gold))]">
                        {a.name.split(/\s+/).map((s) => s[0]).slice(0, 2).join("").toUpperCase()}
                      </span>
                    )}
                    {lang === "cn" && a.nameCn ? a.nameCn : a.name}
                  </button>
                ))}
              </div>
            </div>
          )}

          {(parent || children.length > 0) && (
            <div className="rounded-lg border border-border p-3 space-y-1.5">
              <p className="text-xs font-semibold text-muted-foreground flex items-center gap-1.5">
                <Network className="h-3.5 w-3.5" /> {parent ? t("parentLabel") : t("subEntities")}
              </p>
              {parent && (
                <p className="text-sm font-medium" data-testid={`text-parent-${p.id}`}>{partnerName(parent)}</p>
              )}
              {children.length > 0 && (
                <p className="text-sm" data-testid={`text-children-${p.id}`}>
                  {children.map(partnerName).join(" · ")}
                </p>
              )}
            </div>
          )}

          <PipelineProgress stage={p.stage as Stage} />

          {desc && <p className="text-sm leading-relaxed">{desc}</p>}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
            <DetailRow icon={<Tag className="h-3.5 w-3.5" />} label={t("partnershipType")} value={p.partnershipType} />
            <DetailRow icon={<Calendar className="h-3.5 w-3.5" />} label={t("startDate")} value={p.startDate} />
            <DetailRow icon={<User className="h-3.5 w-3.5" />} label={t("contact")} value={p.contactName} />
            <DetailRow
              icon={<Mail className="h-3.5 w-3.5" />}
              label={t("contactEmail")}
              value={p.contactEmail}
              href={p.contactEmail ? `mailto:${p.contactEmail}` : undefined}
            />
          </div>

          {picsOf(p).length > 0 && (
            <div className="space-y-1.5">
              <p className="text-xs text-muted-foreground">{t("picsLabel")}:</p>
              <div className="flex flex-col gap-1.5">
                {picsOf(p).map((n) => {
                  const staff = GOBI_STAFF.find((s) => s.name === n);
                  return (
                    <div key={n} className="flex items-center gap-2">
                      <PicAvatar name={n} size="md" withName />
                      {staff && <span className="text-xs text-muted-foreground">{staff.title} · {staff.office}</span>}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {p.context && (
            <div className="rounded-lg bg-muted p-3">
              <p className="text-xs font-semibold text-muted-foreground mb-1">{t("contextLabel")}</p>
              <p className="text-sm leading-relaxed whitespace-pre-wrap">{p.context}</p>
            </div>
          )}

          {attachments && attachments.length > 0 && (
            <div className="space-y-1.5">
              <p className="text-xs font-semibold text-muted-foreground flex items-center gap-1.5">
                <Paperclip className="h-3.5 w-3.5" /> {t("attachments")}
              </p>
              {attachments.map((a) => (
                <a
                  key={a.id}
                  href={`${API_BASE}/api/attachments/${a.id}${getAuthToken() ? `?token=${encodeURIComponent(getAuthToken()!)}` : ""}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-2 rounded-md border border-border px-3 py-2 text-sm hover:border-[hsl(var(--aqua))]/60 transition-colors"
                  data-testid={`link-attachment-${a.id}`}
                >
                  <Paperclip className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                  <span className="truncate font-medium">{a.name}</span>
                  <span className="ml-auto text-xs text-muted-foreground shrink-0">{Math.max(1, Math.round(a.size / 1024))} KB</span>
                </a>
              ))}
            </div>
          )}

          <div className="flex items-center justify-between border-t border-border pt-4">
            <div>
              <p className="text-xs text-muted-foreground mb-1">{t("collabLevel")}</p>
              <LevelDots level={levelOfStage(p.stage)} showLabel />
            </div>
            {p.website && (
              <a
                href={p.website}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 text-sm font-medium text-[hsl(var(--aqua))] hover:underline"
                data-testid={`link-website-${p.id}`}
              >
                {t("website")} <ExternalLink className="h-3.5 w-3.5" />
              </a>
            )}
          </div>

          {p.notes && (
            <div className="rounded-lg bg-muted p-3">
              <p className="text-xs font-semibold text-muted-foreground mb-1">{t("notes")}</p>
              <p className="text-sm whitespace-pre-wrap">{p.notes}</p>
            </div>
          )}

          <AuditSection partnershipId={p.id} open={open} />
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ---------------- Per-partner change log (audit) ----------------
function AuditSection({ partnershipId, open }: { partnershipId: number; open: boolean }) {
  const { t, lang } = useLang();
  const { data: logs } = useQuery<AuditLog[]>({
    queryKey: ["/api/partnerships", partnershipId, "audit"],
    enabled: open,
  });
  const fmt = (iso: string) => {
    const d = new Date(iso);
    if (isNaN(d.getTime())) return iso;
    return d.toLocaleString(lang === "cn" ? "zh-CN" : "en-US", {
      year: "numeric", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit",
    });
  };
  const fieldNames = (changes: string | null) => {
    if (!changes) return null;
    try {
      const keys = Object.keys(JSON.parse(changes));
      return keys.length ? keys.join(", ") : null;
    } catch {
      return null;
    }
  };
  return (
    <div className="border-t border-border pt-4" data-testid="section-audit">
      <p className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        <History className="h-3.5 w-3.5" /> {t("changeLogTitle")}
      </p>
      {!logs || logs.length === 0 ? (
        <p className="text-sm text-muted-foreground" data-testid="text-audit-empty">{t("changeLogEmpty")}</p>
      ) : (
        <ul className="space-y-2">
          {logs.map((l) => {
            const fields = fieldNames(l.changes);
            return (
              <li key={l.id} className="flex items-start gap-2 text-sm" data-testid={`row-audit-${l.id}`}>
                <span className="mt-[7px] h-1.5 w-1.5 shrink-0 rounded-full bg-[hsl(var(--aqua))]" />
                <div className="min-w-0">
                  <p className="leading-snug">
                    <span className="font-semibold">{t(`audit_${l.action}` as any)}</span>
                    <span className="text-muted-foreground"> {t("auditBy")} {l.userName}</span>
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {fmt(l.createdAt)}
                    {fields && <span> · {t("auditChangedFields")}: {fields}</span>}
                  </p>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

function DetailRow({ icon, label, value, href }: { icon: ReactNode; label: string; value?: string | null; href?: string }) {
  if (!value) return null;
  return (
    <div className="flex items-start gap-2">
      <span className="mt-0.5 text-muted-foreground">{icon}</span>
      <div className="min-w-0">
        <p className="text-xs text-muted-foreground">{label}</p>
        {href ? (
          <a href={href} className="font-medium text-[hsl(var(--aqua))] hover:underline break-all">{value}</a>
        ) : (
          <p className="font-medium break-words">{value}</p>
        )}
      </div>
    </div>
  );
}
