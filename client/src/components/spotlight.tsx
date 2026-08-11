/**
 * Spotlight (v7.17) — ⌘K / Ctrl+K search across partners and advisors.
 *
 * Design notes
 * ------------
 * 1. Permission safety by construction. This component never calls a dedicated
 *    search endpoint. It reads the two lists the signed-in user is already
 *    allowed to see, via the same react-query keys the rest of the app uses
 *    (`/api/partnerships`, `/api/advisors`). Those payloads have already passed
 *    through the server's per-user redaction, so Spotlight cannot surface a
 *    field the user could not otherwise load — there is no second code path to
 *    keep in sync with the redaction rules.
 *
 * 2. One definition of "what is searchable". Scoring comes from
 *    `@shared/search`, the same module the two list pages use, so a query
 *    behaves identically here and there.
 *
 * 3. Ranked, not just filtered. Results are ordered by score, so a name match
 *    beats a mention buried in a description.
 */
import { useEffect, useMemo, useState } from "react";
import { useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { useLang } from "@/lib/i18n";
import { useAuth } from "@/lib/auth";
import {
  CommandDialog, CommandInput, CommandList, CommandEmpty, CommandGroup, CommandItem,
} from "@/components/ui/command";
import { Building2, User } from "lucide-react";
import type { Partnership, AdvisorWithRoles } from "@shared/schema";
import { scoreRecord, partnerSearchFields, advisorSearchFields } from "@shared/search";

/** Cap per group so the palette stays skimmable on a broad query. */
const LIMIT = 8;

/**
 * Opens Spotlight from anywhere (e.g. the header button) without threading
 * state through the component tree. A window event keeps the header decoupled
 * from where the palette happens to be mounted.
 */
const OPEN_EVENT = "spotlight:open";
export function openSpotlight() {
  window.dispatchEvent(new Event(OPEN_EVENT));
}

export function Spotlight() {
  const { t, lang } = useLang();
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [, navigate] = useLocation();

  // Global ⌘K / Ctrl+K. Registered once for the whole signed-in app.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setOpen((v) => !v);
      }
    };
    const onOpen = () => setOpen(true);
    window.addEventListener("keydown", onKey);
    window.addEventListener(OPEN_EVENT, onOpen);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener(OPEN_EVENT, onOpen);
    };
  }, []);

  // Fetch only once the palette has been opened, so the shortcut costs nothing
  // on pages that never use it. Both keys are already warm on most pages.
  const { data: partners } = useQuery<Partnership[]>({
    queryKey: ["/api/partnerships"],
    enabled: open && !!user,
  });
  const { data: advisors } = useQuery<AdvisorWithRoles[]>({
    queryKey: ["/api/advisors"],
    enabled: open && !!user,
  });

  const partnerHits = useMemo(() => {
    const q = query.trim();
    if (!q) return [];
    return (partners ?? [])
      .map((p) => ({ p, score: scoreRecord(q, partnerSearchFields(p)) }))
      .filter((x) => x.score > 0)
      .sort((a, b) => b.score - a.score || a.p.nameEn.localeCompare(b.p.nameEn))
      .slice(0, LIMIT);
  }, [partners, query]);

  const advisorHits = useMemo(() => {
    const q = query.trim();
    if (!q) return [];
    return (advisors ?? [])
      .map((a) => ({ a, score: scoreRecord(q, advisorSearchFields(a)) }))
      .filter((x) => x.score > 0)
      .sort((a, b) => b.score - a.score || a.a.name.localeCompare(b.a.name))
      .slice(0, LIMIT);
  }, [advisors, query]);

  const go = (path: string) => {
    setOpen(false);
    setQuery("");
    navigate(path);
  };

  if (!user) return null;

  return (
    // shouldFilter={false}: we hand cmdk an already-filtered, already-ranked
    // list. Leaving cmdk's own naive substring filter on would override our
    // word-boundary scoring and re-introduce the false positives it fixes.
    <CommandDialog
      open={open}
      onOpenChange={setOpen}
      title={t("spotlightPlaceholder")}
      commandProps={{ shouldFilter: false }}
    >
      <CommandInput
        placeholder={t("spotlightPlaceholder")}
        value={query}
        onValueChange={setQuery}
        data-testid="input-spotlight"
      />
      <CommandList data-testid="list-spotlight">
        {query.trim() && partnerHits.length === 0 && advisorHits.length === 0 && (
          <CommandEmpty>{t("spotlightEmpty")}</CommandEmpty>
        )}

        {partnerHits.length > 0 && (
          <CommandGroup heading={t("spotlightPartners")}>
            {partnerHits.map(({ p }) => (
              <CommandItem
                key={`p-${p.id}`}
                value={`partner-${p.id}`}
                onSelect={() => go(`/partner/${p.id}`)}
                data-testid={`spotlight-partner-${p.id}`}
              >
                <Building2 className="mr-2 h-4 w-4 shrink-0 text-muted-foreground" />
                <span className="truncate">
                  {lang === "cn" && p.nameCn ? p.nameCn : p.nameEn}
                </span>
                {p.partnershipType && (
                  <span className="ml-auto shrink-0 pl-3 text-[11px] text-muted-foreground truncate max-w-[45%]">
                    {p.partnershipType}
                  </span>
                )}
              </CommandItem>
            ))}
          </CommandGroup>
        )}

        {advisorHits.length > 0 && (
          <CommandGroup heading={t("spotlightAdvisors")}>
            {advisorHits.map(({ a }) => (
              <CommandItem
                key={`a-${a.id}`}
                value={`advisor-${a.id}`}
                onSelect={() => go(`/advisors/${a.id}`)}
                data-testid={`spotlight-advisor-${a.id}`}
              >
                <User className="mr-2 h-4 w-4 shrink-0 text-muted-foreground" />
                <span className="truncate">{lang === "cn" && a.nameCn ? a.nameCn : a.name}</span>
                {(a.roles ?? [])[0]?.organization && (
                  <span className="ml-auto shrink-0 pl-3 text-[11px] text-muted-foreground truncate max-w-[45%]">
                    {(a.roles ?? [])[0].organization}
                  </span>
                )}
              </CommandItem>
            ))}
          </CommandGroup>
        )}
      </CommandList>
      <div className="border-t border-border px-3 py-2 text-[11px] text-muted-foreground">
        {t("spotlightFooter")}
      </div>
    </CommandDialog>
  );
}
