import { useMemo, useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Layout } from "@/components/shared";
import { UserAvatar } from "@/components/user-panels";
import { useLang } from "@/lib/i18n";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { RD_KINDS, RD_STATUSES, GOBI_STAFF, type RdItem, type RdKind, type RdStatus } from "@shared/schema";
import { FlaskConical, Plus, Pencil, Trash2, X, CalendarRange } from "lucide-react";
import { cn } from "@/lib/utils";

// Status palette — aligned with the portal's navy/aqua/gold identity
const STATUS_BAR: Record<RdStatus, string> = {
  planned: "bg-slate-400/70 dark:bg-slate-500/70",
  in_progress: "bg-[hsl(193,52%,45%)]",
  testing: "bg-[hsl(42,63%,55%)]",
  done: "bg-emerald-500/85",
  paused: "bg-zinc-400/60",
};
const STATUS_BADGE: Record<RdStatus, string> = {
  planned: "bg-slate-500/15 text-slate-700 dark:text-slate-300 border-slate-500/30",
  in_progress: "bg-[hsl(193,52%,38%)]/15 text-[hsl(193,52%,30%)] dark:text-[hsl(193,60%,60%)] border-[hsl(193,52%,38%)]/30",
  testing: "bg-[hsl(42,63%,55%)]/15 text-[hsl(42,63%,35%)] dark:text-[hsl(42,63%,65%)] border-[hsl(42,63%,55%)]/30",
  done: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border-emerald-500/30",
  paused: "bg-muted text-muted-foreground border-border",
};

function parseTeammates(raw: string): string[] {
  try {
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr.filter((x) => typeof x === "string") : [];
  } catch {
    return [];
  }
}

const DAY = 24 * 60 * 60 * 1000;
const toMs = (d: string) => new Date(`${d}T00:00:00Z`).getTime();

function StatusBadge({ status }: { status: RdStatus }) {
  const { t } = useLang();
  return (
    <Badge variant="outline" className={cn("text-[11px] font-semibold", STATUS_BADGE[status])} data-testid={`badge-rd-status-${status}`}>
      {t(`rdSt_${status}` as any)}
    </Badge>
  );
}

function TeammateChips({ names, size = "sm" }: { names: string[]; size?: "sm" | "xs" }) {
  if (!names.length) return null;
  return (
    <span className="flex flex-wrap items-center gap-1">
      {names.map((n) => (
        <span
          key={n}
          className={cn(
            "inline-flex items-center gap-1 rounded-full border border-border/60 bg-background/60 font-medium",
            size === "sm" ? "px-2 py-0.5 text-[11px]" : "px-1.5 py-px text-[10px]",
          )}
          data-testid={`chip-teammate-${n.replace(/\s+/g, "-")}`}
        >
          <UserAvatar name={n} size="sm" />
          {n}
        </span>
      ))}
    </span>
  );
}

// ---------------- Timeline (swimlanes by project, month grid, today marker) ----------------
function Timeline({ items, onEdit }: { items: RdItem[]; onEdit: (it: RdItem) => void }) {
  const { t, lang } = useLang();
  const dated = items.filter((it) => it.startDate && it.endDate);
  const range = useMemo(() => {
    if (!dated.length) return null;
    let min = Math.min(...dated.map((it) => toMs(it.startDate!)));
    let max = Math.max(...dated.map((it) => toMs(it.endDate!)));
    // Pad to full months for a clean grid
    const start = new Date(min);
    const end = new Date(max);
    const from = Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), 1);
    const to = Date.UTC(end.getUTCFullYear(), end.getUTCMonth() + 1, 1);
    return { from, to };
  }, [items]);

  if (!range) return null;
  const span = range.to - range.from;
  const pct = (ms: number) => Math.min(100, Math.max(0, ((ms - range.from) / span) * 100));

  // Month tick marks
  const months: { ms: number; label: string }[] = [];
  for (let d = new Date(range.from); d.getTime() < range.to; d.setUTCMonth(d.getUTCMonth() + 1)) {
    months.push({
      ms: d.getTime(),
      label: d.toLocaleDateString(lang === "cn" ? "zh-CN" : "en-US", { month: "short", year: "2-digit", timeZone: "UTC" }),
    });
  }
  const now = Date.now();
  const projects = Array.from(new Set(dated.map((it) => it.project)));

  return (
    <div className="rounded-lg border border-card-border bg-card p-4 overflow-x-auto" data-testid="rd-timeline">
      <div className="min-w-[640px]">
        {/* Month header */}
        <div className="relative h-6 border-b border-border/60">
          {months.map((m) => (
            <span key={m.ms} className="absolute top-0 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground" style={{ left: `${pct(m.ms)}%` }}>
              {m.label}
            </span>
          ))}
        </div>
        {/* Swimlanes */}
        <div className="relative">
          {/* Month gridlines */}
          {months.map((m) => (
            <span key={m.ms} className="absolute inset-y-0 w-px bg-border/40" style={{ left: `${pct(m.ms)}%` }} />
          ))}
          {/* Today marker */}
          {now >= range.from && now <= range.to && (
            <span className="absolute inset-y-0 z-10 w-px bg-[hsl(42,63%,55%)]" style={{ left: `${pct(now)}%` }} data-testid="rd-today-line">
              <span className="absolute -top-0.5 left-1 text-[9px] font-bold uppercase tracking-wider text-[hsl(42,63%,45%)] dark:text-[hsl(42,63%,65%)]">{t("rdToday")}</span>
            </span>
          )}
          {projects.map((proj) => (
            <div key={proj} className="border-b border-border/30 py-2 last:border-b-0">
              <p className="mb-1.5 text-[10px] font-extrabold uppercase tracking-wider text-muted-foreground">{proj}</p>
              <div className="space-y-1.5">
                {dated
                  .filter((it) => it.project === proj)
                  .sort((a, b) => (a.startDate! < b.startDate! ? -1 : 1))
                  .map((it) => {
                    const left = pct(toMs(it.startDate!));
                    const width = Math.max(3, pct(toMs(it.endDate!) + DAY) - left);
                    const mates = parseTeammates(it.teammates);
                    return (
                      <div key={it.id} className="relative h-7" data-testid={`rd-bar-row-${it.id}`}>
                        <button
                          onClick={() => onEdit(it)}
                          title={`${it.name} · ${it.startDate} → ${it.endDate}`}
                          className={cn(
                            "absolute inset-y-0 flex items-center gap-1.5 overflow-hidden rounded-md px-2 text-left text-[11px] font-semibold text-white shadow-sm transition-transform hover:scale-y-105",
                            STATUS_BAR[it.status as RdStatus] ?? STATUS_BAR.planned,
                          )}
                          style={{ left: `${left}%`, width: `${width}%` }}
                          data-testid={`rd-bar-${it.id}`}
                        >
                          <span className="truncate">{it.name}</span>
                          {mates.length > 0 && <span className="hidden shrink-0 text-[9px] font-medium opacity-90 sm:inline">{mates.join(" · ")}</span>}
                        </button>
                      </div>
                    );
                  })}
              </div>
            </div>
          ))}
        </div>
      </div>
      {/* Legend */}
      <div className="mt-3 flex flex-wrap items-center gap-3 border-t border-border/40 pt-3">
        {RD_STATUSES.map((s) => (
          <span key={s} className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
            <span className={cn("h-2.5 w-2.5 rounded-sm", STATUS_BAR[s])} />
            {t(`rdSt_${s}` as any)}
          </span>
        ))}
      </div>
    </div>
  );
}

// ---------------- Add / edit dialog ----------------
function RdItemDialog({ item, open, onClose, existingProjects }: { item: RdItem | null; open: boolean; onClose: () => void; existingProjects: string[] }) {
  const { t } = useLang();
  const { toast } = useToast();
  const defaultProject = item?.project ?? existingProjects[0] ?? "";
  const [project, setProject] = useState(defaultProject);
  const [newProjectMode, setNewProjectMode] = useState(existingProjects.length === 0);
  const [name, setName] = useState(item?.name ?? "");
  const [details, setDetails] = useState(item?.details ?? "");
  const [kind, setKind] = useState<RdKind>((item?.kind as RdKind) ?? "module");
  const [status, setStatus] = useState<RdStatus>((item?.status as RdStatus) ?? "planned");
  const [startDate, setStartDate] = useState(item?.startDate ?? "");
  const [endDate, setEndDate] = useState(item?.endDate ?? "");
  const [teammates, setTeammates] = useState<string[]>(item ? parseTeammates(item.teammates) : []);
  const [mateInput, setMateInput] = useState("");

  const addMate = (raw?: string) => {
    const v = (raw ?? mateInput).trim();
    if (v && !teammates.includes(v) && teammates.length < 12) setTeammates([...teammates, v]);
    setMateInput("");
  };

  const mutation = useMutation({
    mutationFn: async () => {
      const body = {
        project: project.trim(),
        name: name.trim(),
        details: details.trim() || null,
        kind,
        status,
        teammates,
        startDate: startDate || null,
        endDate: endDate || null,
      };
      const res = item
        ? await apiRequest("PATCH", `/api/rd-items/${item.id}`, body)
        : await apiRequest("POST", "/api/rd-items", body);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/rd-items"] });
      toast({ title: t("rdSaved") });
      onClose();
    },
    onError: (e: any) => toast({ title: String(e?.message ?? "Save failed"), variant: "destructive" }),
  });

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto" data-testid="dialog-rd-item">
        <DialogHeader>
          <DialogTitle className="font-display">{item ? t("rdEditItem") : t("rdAddItem")}</DialogTitle>
          <DialogDescription>{t("rdBigProjectHint")}</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <label className="mb-1 block text-xs font-semibold">{t("rdProject")}</label>
            {!newProjectMode ? (
              <Select
                value={project}
                onValueChange={(v) => {
                  if (v === "__new__") {
                    setNewProjectMode(true);
                    setProject("");
                  } else setProject(v);
                }}
              >
                <SelectTrigger data-testid="select-rd-project"><SelectValue placeholder={t("rdProjectPick")} /></SelectTrigger>
                <SelectContent className="max-h-56">
                  {existingProjects.map((p) => (
                    <SelectItem key={p} value={p}>{p}</SelectItem>
                  ))}
                  <SelectItem value="__new__">{t("rdProjectNew")}</SelectItem>
                </SelectContent>
              </Select>
            ) : (
              <div className="flex items-center gap-2">
                <Input value={project} onChange={(e) => setProject(e.target.value)} maxLength={120} placeholder={t("rdProjectNewPlaceholder")} data-testid="input-rd-project" />
                {existingProjects.length > 0 && (
                  <Button type="button" variant="ghost" size="sm" onClick={() => { setNewProjectMode(false); setProject(defaultProject || existingProjects[0]); }} data-testid="button-rd-project-back">
                    <X className="h-4 w-4" />
                  </Button>
                )}
              </div>
            )}
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold">{t("rdName")}</label>
            <Input value={name} onChange={(e) => setName(e.target.value)} maxLength={120} data-testid="input-rd-name" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-xs font-semibold">{t("rdKind")}</label>
              <Select value={kind} onValueChange={(v) => setKind(v as RdKind)}>
                <SelectTrigger data-testid="select-rd-kind"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {RD_KINDS.map((k) => (
                    <SelectItem key={k} value={k}>{t(`rdKind_${k}` as any)}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold">{t("rdStatusLabel")}</label>
              <Select value={status} onValueChange={(v) => setStatus(v as RdStatus)}>
                <SelectTrigger data-testid="select-rd-status"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {RD_STATUSES.map((s) => (
                    <SelectItem key={s} value={s}>{t(`rdSt_${s}` as any)}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-xs font-semibold">{t("rdStart")}</label>
              <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} data-testid="input-rd-start" />
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold">{t("rdEnd")}</label>
              <Input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} data-testid="input-rd-end" />
            </div>
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold">{t("rdTeammates")}</label>
            <div className="mb-2 flex flex-wrap gap-1.5">
              {teammates.map((n) => (
                <span key={n} className="inline-flex items-center gap-1 rounded-full border border-border bg-muted px-2 py-0.5 text-[11px] font-medium">
                  {n}
                  <button onClick={() => setTeammates(teammates.filter((x) => x !== n))} data-testid={`button-remove-mate-${n.replace(/\s+/g, "-")}`}>
                    <X className="h-3 w-3" />
                  </button>
                </span>
              ))}
            </div>
            <div className="flex gap-2">
              <Input
                value={mateInput}
                onChange={(e) => setMateInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addMate(); } }}
                placeholder={t("rdTeammatePlaceholder")}
                list="rd-staff-list"
                data-testid="input-rd-teammate"
              />
              <datalist id="rd-staff-list">
                {GOBI_STAFF.map((s) => <option key={s.name} value={s.name} />)}
              </datalist>
              <Button type="button" variant="secondary" size="sm" onClick={() => addMate()} data-testid="button-add-teammate">
                <Plus className="h-4 w-4" />
              </Button>
            </div>
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold">{t("rdDetails")}</label>
            <Textarea value={details} onChange={(e) => setDetails(e.target.value)} rows={3} maxLength={2000} data-testid="input-rd-details" />
          </div>
          <div className="flex justify-end gap-2 pt-1">
            <Button variant="ghost" onClick={onClose} data-testid="button-cancel-rd">{t("cancel")}</Button>
            <Button onClick={() => mutation.mutate()} disabled={!name.trim() || !project.trim() || mutation.isPending} data-testid="button-save-rd">
              {t("save")}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ---------------- Page ----------------
export default function RdPlanner() {
  const { t, lang } = useLang();
  const { toast } = useToast();
  const { data: items, isLoading } = useQuery<RdItem[]>({ queryKey: ["/api/rd-items"] });
  const [dialog, setDialog] = useState<{ open: boolean; item: RdItem | null }>({ open: false, item: null });

  const del = useMutation({
    mutationFn: async (id: number) => (await apiRequest("DELETE", `/api/rd-items/${id}`)).json(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/rd-items"] });
      toast({ title: t("rdDeleted") });
    },
    onError: (e: any) => toast({ title: String(e?.message ?? "Delete failed"), variant: "destructive" }),
  });

  const sorted = useMemo(
    () => (items ?? []).slice().sort((a, b) => (a.project !== b.project ? a.project.localeCompare(b.project) : (a.startDate ?? "9999") < (b.startDate ?? "9999") ? -1 : 1)),
    [items],
  );
  const projects = Array.from(new Set(sorted.map((it) => it.project)));

  return (
    <Layout>
      <div className="mx-auto max-w-5xl px-4 py-8 space-y-8">
        <section>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <FlaskConical className="h-5 w-5 text-[hsl(193,52%,38%)]" />
                <h1 className="font-display text-xl font-bold" data-testid="text-rd-title">{t("rdTitle")}</h1>
              </div>
              <p className="max-w-2xl text-sm text-muted-foreground">{t("rdSub")}</p>
            </div>
            <Button onClick={() => setDialog({ open: true, item: null })} data-testid="button-add-rd-item">
              <Plus className="mr-1.5 h-4 w-4" /> {t("rdAddItem")}
            </Button>
          </div>
        </section>

        {isLoading ? (
          <div className="space-y-3">
            <Skeleton className="h-40 w-full" />
            <Skeleton className="h-24 w-full" />
          </div>
        ) : !sorted.length ? (
          <p className="text-sm text-muted-foreground" data-testid="text-rd-empty">{t("rdEmpty")}</p>
        ) : (
          <>
            <section className="space-y-2">
              <h2 className="flex items-center gap-2 text-sm font-bold uppercase tracking-wide text-muted-foreground">
                <CalendarRange className="h-4 w-4" /> {t("rdTimeline")}
              </h2>
              <Timeline items={sorted} onEdit={(it) => setDialog({ open: true, item: it })} />
            </section>

            <section className="space-y-2">
              <h2 className="text-sm font-bold uppercase tracking-wide text-muted-foreground">{t("rdItemsList")}</h2>
              {projects.map((proj) => (
                <div key={proj} className="space-y-2">
                  <p className="pt-2 text-[11px] font-extrabold uppercase tracking-wider text-muted-foreground">{proj}</p>
                  {sorted
                    .filter((it) => it.project === proj)
                    .map((it) => {
                      const mates = parseTeammates(it.teammates);
                      return (
                        <div key={it.id} className="rounded-lg border border-card-border bg-card px-4 py-3" data-testid={`card-rd-item-${it.id}`}>
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="font-semibold text-sm" data-testid={`text-rd-name-${it.id}`}>{it.name}</span>
                            <Badge variant="outline" className="text-[10px] uppercase tracking-wide">{t(`rdKind_${it.kind}` as any)}</Badge>
                            <StatusBadge status={it.status as RdStatus} />
                            <span className="ml-auto flex items-center gap-1">
                              <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => setDialog({ open: true, item: it })} data-testid={`button-edit-rd-${it.id}`}>
                                <Pencil className="h-3.5 w-3.5" />
                              </Button>
                              <Button
                                size="icon"
                                variant="ghost"
                                className="h-7 w-7 text-destructive"
                                onClick={() => { if (window.confirm(t("rdConfirmDelete"))) del.mutate(it.id); }}
                                data-testid={`button-delete-rd-${it.id}`}
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </Button>
                            </span>
                          </div>
                          <p className="mt-0.5 text-xs tabular-nums text-muted-foreground">
                            {it.startDate && it.endDate ? `${it.startDate} → ${it.endDate}` : t("rdNoDates")}
                          </p>
                          {it.details && <p className="mt-1.5 text-sm text-muted-foreground" data-testid={`text-rd-details-${it.id}`}>{it.details}</p>}
                          {mates.length > 0 && (
                            <div className="mt-2">
                              <TeammateChips names={mates} />
                            </div>
                          )}
                        </div>
                      );
                    })}
                </div>
              ))}
            </section>
          </>
        )}

        {dialog.open && <RdItemDialog key={dialog.item?.id ?? "new"} item={dialog.item} open={dialog.open} onClose={() => setDialog({ open: false, item: null })} existingProjects={projects} />}
      </div>
    </Layout>
  );
}
