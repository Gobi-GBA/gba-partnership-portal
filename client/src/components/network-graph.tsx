import { useEffect, useRef, useState } from "react";
import { useLang } from "@/lib/i18n";
import type { Partnership, Category, Region, AdvisorWithRoles } from "@shared/schema";
import { CATEGORY_COLORS_DARK, CATEGORIES, CATEGORY_COLORS, REGION_ORDER, REGION_COLORS, logoFor, isNew } from "@/lib/constants";
import { DEFAULT_VIEW_OPTIONS, type ViewOptions } from "@/components/shared";
import {
  forceSimulation, forceLink, forceManyBody, forceCenter, forceCollide, forceX, forceY, forceRadial,
  type SimulationNodeDatum,
} from "d3-force";
import { select } from "d3-selection";
import "d3-transition";
import { zoom, zoomIdentity, type ZoomBehavior, type ZoomTransform } from "d3-zoom";
import { drag } from "d3-drag";
import { Plus, Minus, Maximize } from "lucide-react";

interface GraphNode extends SimulationNodeDatum {
  id: string;
  label?: string;
  sub?: string;
  r: number;
  color: string;
  opacity?: number;
  isCenter?: boolean;
  isHub?: boolean;
  hubKey?: string;
  hubGroup?: "region" | "category";
  isParticle?: boolean;
  partnership?: Partnership;
  // v6.0 — advisors as an extension of the constellation
  isAdvisor?: boolean;
  advisorId?: number;
  tooltip?: string;
}

/** Deterministic pseudo-random generator so the constellation is stable across renders */
function mulberry32(seed: number) {
  return function () {
    let t = (seed += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const PARTICLE_COLORS = ["#A8D8E8", "#9BE29B", "#C9B8F0", "#EAF3FA", "#F0C75E"];
// v7.03 — muted particles for light mode (the pastel set above is invisible on light)
const LIGHT_PARTICLE_COLORS = ["#3E6E90", "#4E8E5E", "#6E5BA0", "#2E5E7E", "#B8862A"];

/**
 * v7.03 — theme-aware palette so the star maps render in both dark and light mode.
 * `bgAlpha` makes the cosmic backdrop semi-transparent (glass) so the portal's
 * galaxy/oasis background shows through instead of being fully blocked.
 */
function themePalette(dark: boolean) {
  return {
    isLight: !dark,
    bgStops: dark ? ["#16385E", "#0B2240", "#040D1C"] : ["#E8F2FC", "#CBE2F6", "#A9C8E6"],
    bgAlpha: 0.32,
    starColor: dark ? "#EAF3FA" : "rgba(28,58,92,0.6)",
    particleColors: dark ? PARTICLE_COLORS : LIGHT_PARTICLE_COLORS,
    link: {
      trunk: dark ? "rgba(240,199,94,0.5)" : "rgba(190,140,20,0.55)",
      branch: dark ? "rgba(168,216,232,0.4)" : "rgba(30,100,140,0.45)",
      child: dark ? "rgba(240,199,94,0.55)" : "rgba(190,140,20,0.6)",
      adv: dark ? "rgba(240,199,94,0.35)" : "rgba(190,140,20,0.5)",
      web: dark ? "rgba(168,216,232,0.12)" : "rgba(30,100,140,0.2)",
    },
    catColor: (c: Category) => (dark ? CATEGORY_COLORS_DARK[c] : CATEGORY_COLORS[c]),
    hubBodyFill: dark ? "#0B2240" : "#FFFFFF",
    nodeStroke: dark ? "rgba(234,243,250,0.9)" : "rgba(15,35,60,0.5)",
    label: dark ? "#EAF3FA" : "#16324F",
    sub: dark ? "#A8C4DA" : "#3E5C7A",
    centerText: "#0C2340",
    hoverName: dark ? "#F0C75E" : "#0C2340",
    haloNode: dark ? 0.28 : 0.22,
    haloHubSelected: dark ? 0.5 : 0.4,
    haloHubBase: dark ? 0.2 : 0.14,
  };
}

/** v6.01 — instant HTML tooltip that follows the cursor (native SVG <title> has a ~1s browser delay) */
function attachFastTooltip(
  nodeSel: { on: (evt: string, cb: (event: MouseEvent, d: GraphNode) => void) => any },
  tooltipEl: HTMLDivElement | null,
  textFor: (d: GraphNode) => string,
) {
  if (!tooltipEl) return;
  const move = (event: MouseEvent) => {
    const wrap = tooltipEl.offsetParent as HTMLElement | null;
    if (!wrap) return;
    const rect = wrap.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;
    const tw = tooltipEl.offsetWidth;
    const th = tooltipEl.offsetHeight;
    let lx = x + 14;
    let ly = y + 14;
    if (lx + tw > rect.width - 8) lx = x - tw - 14;
    if (ly + th > rect.height - 8) ly = y - th - 10;
    tooltipEl.style.left = `${Math.max(4, lx)}px`;
    tooltipEl.style.top = `${Math.max(4, ly)}px`;
  };
  nodeSel
    .on("mouseenter.tip", (event: MouseEvent, d: GraphNode) => {
      const txt = textFor(d);
      if (!txt) return;
      tooltipEl.textContent = txt;
      tooltipEl.style.display = "block";
      move(event);
    })
    .on("mousemove.tip", (event: MouseEvent) => move(event))
    .on("mouseleave.tip", () => {
      tooltipEl.style.display = "none";
    });
}

export function NetworkLegend() {
  const { t } = useLang();
  return (
    <div className="flex flex-wrap gap-x-4 gap-y-2">
      {CATEGORIES.map((c) => (
        <span key={c} className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
          <span className="h-2.5 w-2.5 rounded-full" style={{ background: CATEGORY_COLORS[c] }} />
          {t(`cat_${c}` as any)}
        </span>
      ))}
      <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
        <span className="h-2.5 w-2.5 rounded-full bg-[hsl(var(--gold))]" />
        {t("networkCenter")}
      </span>
      <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
        <span className="h-1.5 w-1.5 rounded-full bg-[hsl(var(--gold))] ring-2 ring-[hsl(var(--gold))]/30" />
        {t("navAdvisors")}
      </span>
    </div>
  );
}

export function NetworkGraph({
  partnerships,
  onSelect,
  height = 620,
  options = DEFAULT_VIEW_OPTIONS,
  selectedRegions = [],
  onToggleRegion,
  advisors,
  onSelectAdvisor,
  dark,
}: {
  partnerships: Partnership[];
  onSelect: (p: Partnership) => void;
  height?: number;
  options?: ViewOptions;
  selectedRegions?: string[];
  onToggleRegion?: (region: string) => void;
  advisors?: AdvisorWithRoles[];
  onSelectAdvisor?: (advisorId: number) => void;
  /** v7.03 — when false, render the day-sky light theme instead of the cosmic dark one */
  dark?: boolean;
}) {
  const { t, lang } = useLang();
  const svgRef = useRef<SVGSVGElement>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);
  const [groupBy, setGroupBy] = useState<"region" | "category">("region");
  const [showAdvisors, setShowAdvisors] = useState(true);
  // Preserve the user's zoom/pan across re-renders and layer toggles
  const transformRef = useRef<ZoomTransform>(zoomIdentity);
  const zoomBehaviorRef = useRef<ZoomBehavior<SVGSVGElement, unknown> | null>(null);

  useEffect(() => {
    if (!svgRef.current) return;
    const svgEl = svgRef.current;
    const width = svgEl.clientWidth || 900;
    const cx = width / 2;
    const cy = height / 2;
    const rand = mulberry32(42);
    const pal = themePalette(dark ?? true);

    const centerNode: GraphNode = {
      id: "gobi",
      label: t("networkCenter"),
      r: 40,
      color: "#F0C75E",
      isCenter: true,
      fx: cx,
      fy: cy,
    };

    // Layer 1: hubs (region or category), Layer 2: top-level partners, Layer 3: sub-entities
    const shownIds = new Set(partnerships.map((p) => p.id));
    const topLevel = partnerships.filter((p) => !p.parentId || !shownIds.has(p.parentId));
    const childrenList = partnerships.filter((p) => p.parentId && shownIds.has(p.parentId));
    const dense = topLevel.length > 26;

    const hubKeys = Array.from(new Set(topLevel.map((p) => (groupBy === "region" ? p.region : p.category))));
    hubKeys.sort((a, b) =>
      groupBy === "region"
        ? (REGION_ORDER[a as Region] ?? 99) - (REGION_ORDER[b as Region] ?? 99)
        : a.localeCompare(b),
    );

    // Radial seeding: hubs evenly spaced around the center, partners near their hub.
    // This keeps the layout stable when switching layers and avoids pile-ups.
    const hubAngle = new Map<string, number>();
    const hubPos = new Map<string, { x: number; y: number }>();
    const hubRadius = Math.min(width, height) * 0.34;
    hubKeys.forEach((k, i) => {
      const angle = -Math.PI / 2 + (i / hubKeys.length) * Math.PI * 2;
      hubAngle.set(k, angle);
      hubPos.set(k, { x: cx + Math.cos(angle) * hubRadius, y: cy + Math.sin(angle) * hubRadius });
    });

    const hubNodes: GraphNode[] = hubKeys.map((k) => ({
      id: `hub-${k}`,
      label: groupBy === "region" ? t(`region_${k}` as any) : t(`cat_${k}` as any),
      r: 21,
      color:
        groupBy === "region"
          ? (REGION_COLORS[k as Region] ?? "#48A9C5")
          : pal.catColor(k as Category),
      isHub: true,
      hubKey: k,
      hubGroup: groupBy,
      x: hubPos.get(k)!.x,
      y: hubPos.get(k)!.y,
    }));

    const nodeFor = (p: Partnership, isChild: boolean): GraphNode => ({
      id: `p-${p.id}`,
      label: lang === "cn" && p.nameCn ? p.nameCn : p.nameEn,
      sub: isChild || dense ? undefined : p.partnershipType ?? undefined,
      r: isChild ? 10 + p.collabLevel * 2.5 : (dense ? 11 : 13) + p.collabLevel * (dense ? 3 : 4),
      color: pal.catColor(p.category as Category),
      partnership: p,
    });

    // Seed partners fanned out beyond their hub, away from the center
    const byHub = new Map<string, Partnership[]>();
    topLevel.forEach((p) => {
      const k = groupBy === "region" ? p.region : p.category;
      if (!byHub.has(k)) byHub.set(k, []);
      byHub.get(k)!.push(p);
    });

    const partnerNodes: GraphNode[] = [];
    const partnerPos = new Map<number, { x: number; y: number }>();
    byHub.forEach((list, k) => {
      const baseAngle = hubAngle.get(k) ?? 0;
      const hp = hubPos.get(k)!;
      const spread = Math.min(Math.PI * 0.7, 0.45 + list.length * 0.16);
      list.forEach((p, i) => {
        const frac = list.length === 1 ? 0.5 : i / (list.length - 1);
        const angle = baseAngle + (frac - 0.5) * spread;
        const dist = 105 + (i % 3) * 38 + rand() * 22;
        const node = nodeFor(p, false);
        node.x = hp.x + Math.cos(angle) * dist;
        node.y = hp.y + Math.sin(angle) * dist;
        partnerPos.set(p.id, { x: node.x, y: node.y });
        partnerNodes.push(node);
      });
    });

    const childNodes: GraphNode[] = childrenList.map((p) => {
      const node = nodeFor(p, true);
      const pp = partnerPos.get(p.parentId!) ?? { x: cx, y: cy };
      node.x = pp.x + (rand() - 0.5) * 90;
      node.y = pp.y + 70 + rand() * 30;
      return node;
    });

    // v6.0 — advisors orbit the partner org they are tagged with (small gold stars)
    const advisorNodes: GraphNode[] = [];
    const advisorLinks: Array<{ source: string; target: string }> = [];
    if (showAdvisors && advisors) {
      advisors.forEach((a) => {
        const linkedRoles = a.roles.filter((r) => r.partnershipId && shownIds.has(r.partnershipId));
        if (linkedRoles.length === 0) return;
        const pr = linkedRoles.find((r) => r.isPrimary === 1) ?? linkedRoles[0];
        const anchor = partnerPos.get(pr.partnershipId!) ?? { x: cx, y: cy };
        const name = lang === "cn" && a.nameCn ? a.nameCn : a.name;
        advisorNodes.push({
          id: `a-${a.id}`,
          r: 5,
          color: "#F0C75E",
          isAdvisor: true,
          advisorId: a.id,
          tooltip: `${name} · ${pr.title}${pr.organization ? ` @ ${pr.organization}` : ""}`,
          x: anchor.x + (rand() - 0.5) * 70,
          y: anchor.y - 55 - rand() * 25,
        });
        linkedRoles.forEach((r) => advisorLinks.push({ source: `a-${a.id}`, target: `p-${r.partnershipId}` }));
      });
    }

    // Ambient constellation particles
    const particleCount = Math.min(42, 20 + partnerships.length * 2);
    const particles: GraphNode[] = Array.from({ length: particleCount }, (_, i) => ({
      id: `dot-${i}`,
      r: 1.6 + rand() * 2.6,
      color: pal.particleColors[Math.floor(rand() * pal.particleColors.length)],
      opacity: 0.25 + rand() * 0.5,
      isParticle: true,
      x: rand() * width,
      y: rand() * height,
    }));

    const nodes: GraphNode[] = [centerNode, ...hubNodes, ...partnerNodes, ...childNodes, ...advisorNodes, ...particles];

    type L = { source: string; target: string; kind: "trunk" | "branch" | "child" | "web" | "adv"; strength?: number };
    const links: L[] = [];
    // Gobi -> hubs
    hubKeys.forEach((k) => links.push({ source: "gobi", target: `hub-${k}`, kind: "trunk" }));
    // hub -> partner
    topLevel.forEach((p) => {
      const k = groupBy === "region" ? p.region : p.category;
      links.push({ source: `hub-${k}`, target: `p-${p.id}`, kind: "branch", strength: p.collabLevel });
    });
    // partner -> sub-entity
    childrenList.forEach((p) => links.push({ source: `p-${p.parentId}`, target: `p-${p.id}`, kind: "child" }));
    // advisor -> linked partner org
    advisorLinks.forEach((l) => links.push({ ...l, kind: "adv" }));
    // particles weave a faint web
    particles.forEach((d, i) => {
      if (partnerNodes.length && rand() > (dense ? 0.5 : 0)) {
        const p = partnerNodes[Math.floor(rand() * partnerNodes.length)];
        links.push({ source: d.id, target: p.id, kind: "web" });
      }
      if (i > 0 && rand() > 0.45) {
        links.push({ source: d.id, target: particles[Math.floor(rand() * i)].id, kind: "web" });
      }
    });

    const svg = select(svgEl);
    svg.selectAll("*").remove();

    // ---- cosmic backdrop (fixed, not zoomed) ----
    const defs = svg.append("defs");
    const grad = defs.append("radialGradient").attr("id", "net-bg").attr("cx", "50%").attr("cy", "42%").attr("r", "75%");
    grad.append("stop").attr("offset", "0%").attr("stop-color", pal.bgStops[0]).attr("stop-opacity", pal.bgAlpha);
    grad.append("stop").attr("offset", "55%").attr("stop-color", pal.bgStops[1]).attr("stop-opacity", pal.bgAlpha);
    grad.append("stop").attr("offset", "100%").attr("stop-color", pal.bgStops[2]).attr("stop-opacity", pal.bgAlpha);

    const glow = defs.append("filter").attr("id", "net-glow").attr("x", "-80%").attr("y", "-80%").attr("width", "260%").attr("height", "260%");
    glow.append("feGaussianBlur").attr("stdDeviation", 5).attr("result", "b");
    const merge = glow.append("feMerge");
    merge.append("feMergeNode").attr("in", "b");
    merge.append("feMergeNode").attr("in", "SourceGraphic");

    svg.append("rect").attr("width", "100%").attr("height", "100%").attr("fill", "url(#net-bg)");

    const container = svg.append("g");

    // static starfield (pans/zooms with graph)
    const starG = container.append("g");
    for (let i = 0; i < 90; i++) {
      starG
        .append("circle")
        .attr("cx", rand() * width * 1.4 - width * 0.2)
        .attr("cy", rand() * height * 1.4 - height * 0.2)
        .attr("r", rand() * 1.1 + 0.3)
        .attr("fill", pal.starColor)
        .attr("opacity", pal.isLight ? 0.2 + rand() * 0.3 : 0.08 + rand() * 0.22);
    }

    const zoomBehavior = zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.35, 4])
      .clickDistance(8) // v6.02 — small pointer jitter still counts as a click
      .on("zoom", (event) => {
        transformRef.current = event.transform;
        container.attr("transform", event.transform);
        if (tooltipRef.current) tooltipRef.current.style.display = "none";
      });
    zoomBehaviorRef.current = zoomBehavior;
    svg.call(zoomBehavior);
    // Restore the previous zoom/pan instead of resetting — fixes the jump when toggling layers
    svg.call(zoomBehavior.transform, transformRef.current);

    const linkSel = container
      .append("g")
      .selectAll("line")
      .data(links)
      .join("line")
      .attr("stroke", (d) =>
        d.kind === "trunk"
          ? pal.link.trunk
          : d.kind === "branch"
            ? pal.link.branch
            : d.kind === "child"
              ? pal.link.child
              : d.kind === "adv"
                ? pal.link.adv
                : pal.link.web,
      )
      .attr("stroke-width", (d) =>
        d.kind === "trunk" ? 1.6 : d.kind === "branch" ? 0.8 + (d.strength ?? 1) * 0.3 : d.kind === "child" ? 1.1 : d.kind === "adv" ? 0.7 : 0.6,
      )
      .attr("stroke-dasharray", (d) => (d.kind === "web" ? "2 4" : d.kind === "child" ? "4 3" : d.kind === "adv" ? "1.5 3" : null));

    const nodeSel = container
      .append("g")
      .selectAll<SVGGElement, GraphNode>("g")
      .data(nodes)
      .join("g")
      .style("cursor", (d) =>
        d.isParticle
          ? "default"
          : d.isCenter || d.partnership || (d.isAdvisor && onSelectAdvisor)
            ? "pointer"
            : d.isHub && d.hubGroup === "region" && onToggleRegion
              ? "pointer"
              : "grab",
      )
      .on("click", (event, d) => {
        if (d.partnership) {
          onSelect(d.partnership);
        } else if (d.isAdvisor && d.advisorId != null && onSelectAdvisor) {
          event.stopPropagation();
          onSelectAdvisor(d.advisorId);
        } else if (d.isHub && d.hubGroup === "region" && d.hubKey && onToggleRegion) {
          event.stopPropagation();
          onToggleRegion(d.hubKey);
        } else if (d.isCenter) {
          // v6.01 — clicking the Gobi hub resets the map view
          event.stopPropagation();
          if (svgRef.current && zoomBehaviorRef.current)
            select(svgRef.current).transition().duration(300).call(zoomBehaviorRef.current.transform, zoomIdentity);
        }
      });

    // v6.01 — instant tooltips on all meaningful nodes (native <title> was ~1s slow)
    nodeSel.filter((d) => !!d.isCenter).attr("data-testid", "node-center-reset");
    attachFastTooltip(
      nodeSel.filter((d) => !d.isParticle),
      tooltipRef.current,
      (d) => (d.isCenter ? t("clickResetView") : d.tooltip ?? [d.label, d.sub].filter(Boolean).join(" · ")),
    );

    // glow halo
    nodeSel
      .filter((d) => !d.isParticle)
      .append("circle")
      .attr("class", "halo")
      .attr("r", (d) => d.r * (d.isHub ? 1.3 : 1.45))
      .attr("fill", (d) => d.color)
      .attr("opacity", (d) =>
        d.isHub
          ? (d.hubGroup === "region" && d.hubKey && selectedRegions.includes(d.hubKey) ? pal.haloHubSelected : pal.haloHubBase)
          : pal.haloNode,
      )
      .attr("filter", "url(#net-glow)");

    nodeSel
      .append("circle")
      .attr("class", "body")
      .attr("r", (d) => d.r)
      .attr("fill", (d) => (d.isHub ? pal.hubBodyFill : d.color))
      .attr("opacity", (d) => d.opacity ?? 1)
      .attr("stroke", (d) =>
        d.isParticle
          ? "none"
          : d.isHub && d.hubGroup === "region" && d.hubKey && selectedRegions.includes(d.hubKey)
            ? "#F0C75E"
            : d.isHub
              ? d.color
              : pal.nodeStroke,
      )
      .attr("stroke-width", (d) =>
        d.isCenter
          ? 2
          : d.isHub && d.hubGroup === "region" && d.hubKey && selectedRegions.includes(d.hubKey)
            ? 3.5
            : d.isHub
              ? 1.8
              : 1.2,
      )
      .attr("filter", (d) => (d.isParticle ? "url(#net-glow)" : null));

    // logos inside partner nodes
    nodeSel
      .filter((d) => !d.isCenter && !d.isHub && !d.isParticle && !!d.partnership && !!logoFor(d.partnership))
      .append("image")
      .attr("href", (d) => logoFor(d.partnership!)!)
      .attr("x", (d) => -d.r * 0.55)
      .attr("y", (d) => -d.r * 0.55)
      .attr("width", (d) => d.r * 1.1)
      .attr("height", (d) => d.r * 1.1)
      .attr("clip-path", "circle()")
      .attr("preserveAspectRatio", "xMidYMid slice");

    nodeSel
      .filter((d) => !!d.isCenter)
      .append("text")
      .text((d) => d.label!)
      .attr("text-anchor", "middle")
      .attr("dy", "0.35em")
      .attr("font-size", 11)
      .attr("font-weight", 800)
      .attr("fill", "#0C2340");

    // hub labels inside the ring (hidden when the region/category block is opted out)
    const showHubLabels = groupBy === "region" ? options.region : options.category;
    nodeSel
      .filter((d) => !!d.isHub && showHubLabels)
      .append("text")
      .text((d) => d.label!)
      .attr("text-anchor", "middle")
      .attr("dy", "0.35em")
      .attr("font-size", 9.5)
      .attr("font-weight", 700)
      .attr("fill", (d) => d.color);

    nodeSel
      .filter((d) => !d.isCenter && !d.isHub && !d.isParticle && !d.isAdvisor)
      .append("text")
      .attr("class", "name")
      .text((d) => d.label!)
      .attr("text-anchor", "middle")
      .attr("dy", (d) => d.r + 15)
      .attr("font-size", (d) => (d.partnership?.parentId ? 9.5 : dense ? 9.5 : 10.5))
      .attr("font-weight", 600)
      .attr("fill", pal.label);

    nodeSel
      .filter((d) => !d.isCenter && !d.isHub && !d.isParticle && !d.isAdvisor && !!d.sub)
      .append("text")
      .text((d) => d.sub!)
      .attr("text-anchor", "middle")
      .attr("dy", (d) => d.r + 28)
      .attr("font-size", 9)
      .attr("fill", pal.sub);

    // NEW tag above recently added partners
    if (options.newBadge) {
      nodeSel
        .filter((d) => !d.isCenter && !d.isHub && !d.isParticle && !!d.partnership && isNew(d.partnership))
        .append("text")
        .attr("class", "tag-new")
        .text("NEW")
        .attr("text-anchor", "middle")
        .attr("dy", (d) => -(d.r + 8))
        .attr("font-size", 7.5)
        .attr("font-weight", 800)
        .attr("letter-spacing", 1.2)
        .attr("fill", "#F0C75E");
    }

    // LP / Hall-of-Fame star beside the node (LP status only present for IR users)
    if (options.lpStar) {
      nodeSel
        .filter((d) => !d.isCenter && !d.isHub && !d.isParticle && !!d.partnership && (d.partnership.lpStatus === "lp" || d.partnership.lpStatus === "target" || d.partnership.hallOfFame === 1))
        .append("text")
        .attr("class", "tag-star")
        .text((d) => (d.partnership!.lpStatus === "target" && d.partnership!.hallOfFame !== 1 ? "\u2606" : "\u2605"))
        .attr("text-anchor", "middle")
        .attr("x", (d) => d.r * 0.95)
        .attr("y", (d) => -d.r * 0.75)
        .attr("font-size", 11)
        .attr("fill", "#F0C75E");
    }

    // Hover effect: brighten + enlarge the hovered partner star
    nodeSel
      .filter((d) => !!d.partnership || !!d.isHub || !!d.isAdvisor)
      .on("mouseenter", function (_event, d) {
        const g = select(this);
        g.raise();
        g.select<SVGCircleElement>("circle.body")
          .transition().duration(150)
          .attr("r", d.r * 1.18)
          .attr("stroke", "#F0C75E")
          .attr("stroke-width", 2.4);
        g.select<SVGCircleElement>("circle.halo")
          .transition().duration(150)
          .attr("opacity", 0.5)
          .attr("r", d.r * 1.9);
        g.select<SVGTextElement>("text.name")
          .transition().duration(150)
          .attr("font-size", 12)
          .attr("font-weight", 800)
          .attr("fill", pal.hoverName);
      })
      .on("mouseleave", function (_event, d) {
        const g = select(this);
        g.select<SVGCircleElement>("circle.body")
          .transition().duration(200)
          .attr("r", d.r)
          .attr("stroke", d.isHub ? d.color : pal.nodeStroke)
          .attr("stroke-width", d.isHub ? 1.8 : 1.2);
        g.select<SVGCircleElement>("circle.halo")
          .transition().duration(200)
          .attr("opacity", d.isHub ? 0.2 : 0.28)
          .attr("r", d.r * (d.isHub ? 1.3 : 1.45));
        g.select<SVGTextElement>("text.name")
          .transition().duration(200)
          .attr("font-size", d.partnership?.parentId ? 9.5 : dense ? 9.5 : 10.5)
          .attr("font-weight", 600)
          .attr("fill", pal.label);
      });

    const sim = forceSimulation<GraphNode>(nodes)
      .force(
        "link",
        forceLink(links as any)
          .id((d: any) => d.id)
          .distance((d: any) =>
            d.kind === "trunk"
              ? hubRadius
              : d.kind === "branch"
                ? (dense ? 118 : 150) - (d.strength ?? 1) * 10
                : d.kind === "child"
                  ? 78
                  : d.kind === "adv"
                    ? 48
                    : 120,
          )
          .strength((d: any) =>
            d.kind === "trunk" ? 0.75 : d.kind === "branch" ? 0.5 : d.kind === "child" ? 0.6 : d.kind === "adv" ? 0.7 : 0.015,
          ),
      )
      .force("charge", forceManyBody<GraphNode>().strength((d) => (d.isParticle ? -20 : d.isAdvisor ? -45 : d.isHub ? -380 : dense ? -220 : -300)))
      .force("center", forceCenter(cx, cy))
      .force("x", forceX<GraphNode>(cx).strength((d) => (d.isParticle ? 0.005 : 0.03)))
      .force("y", forceY<GraphNode>(cy).strength((d) => (d.isParticle ? 0.005 : 0.035)))
      .force(
        "collide",
        forceCollide<GraphNode>().radius((d) =>
          d.isParticle ? d.r + 6 : d.isAdvisor ? d.r + 9 : d.isHub ? d.r + 26 : d.r + (dense ? 24 : 42),
        ),
      )
      .on("tick", () => {
        linkSel
          .attr("x1", (d: any) => d.source.x)
          .attr("y1", (d: any) => d.source.y)
          .attr("x2", (d: any) => d.target.x)
          .attr("y2", (d: any) => d.target.y);
        nodeSel.attr("transform", (d) => `translate(${d.x},${d.y})`);
      });

    const dragBehavior = drag<SVGGElement, GraphNode>()
      .clickDistance(8) // v6.02 — don't swallow clicks over trackpad jitter
      .on("start", (event, d) => {
        if (!event.active) sim.alphaTarget(0.25).restart();
        d.fx = d.x;
        d.fy = d.y;
      })
      .on("drag", (event, d) => {
        d.fx = event.x;
        d.fy = event.y;
      })
      .on("end", (event, d) => {
        if (!event.active) sim.alphaTarget(0);
        if (!d.isCenter) {
          d.fx = null;
          d.fy = null;
        }
      });
    nodeSel.filter((d) => !d.isParticle).call(dragBehavior);

    return () => {
      sim.stop();
    };
  }, [partnerships, lang, t, height, groupBy, options, selectedRegions, onToggleRegion, advisors, showAdvisors, onSelectAdvisor, dark]);

  const zoomBy = (factor: number) => {
    if (!svgRef.current || !zoomBehaviorRef.current) return;
    select(svgRef.current).transition().duration(240).call(zoomBehaviorRef.current.scaleBy, factor);
  };
  const zoomReset = () => {
    if (!svgRef.current || !zoomBehaviorRef.current) return;
    select(svgRef.current).transition().duration(300).call(zoomBehaviorRef.current.transform, zoomIdentity);
  };

  return (
    <div className="rounded-xl border border-border overflow-hidden bg-background/20 backdrop-blur-md">
      <div className="flex items-center justify-end gap-1 px-3 py-2 bg-background/25 border-b border-border">
        <span className="text-[11px] font-medium text-muted-foreground mr-1">{t("layerBy")}</span>
        <button
          onClick={() => setGroupBy("region")}
          className={`rounded-md px-2.5 py-1 text-[11px] font-semibold transition-colors ${groupBy === "region" ? "bg-primary/15 text-primary border border-primary/50" : "text-muted-foreground border border-transparent"}`}
          data-testid="button-layer-region"
        >
          {t("layerRegion")}
        </button>
        <button
          onClick={() => setGroupBy("category")}
          className={`rounded-md px-2.5 py-1 text-[11px] font-semibold transition-colors ${groupBy === "category" ? "bg-primary/15 text-primary border border-primary/50" : "text-muted-foreground border border-transparent"}`}
          data-testid="button-layer-type"
        >
          {t("layerType")}
        </button>
        {advisors && advisors.length > 0 && (
          <button
            onClick={() => setShowAdvisors((v) => !v)}
            className={`ml-2 rounded-md px-2.5 py-1 text-[11px] font-semibold transition-colors ${showAdvisors ? "bg-[hsl(var(--gold))]/15 text-[hsl(var(--gold))] border border-[hsl(var(--gold))]/50" : "text-muted-foreground border border-transparent"}`}
            data-testid="button-toggle-advisors"
          >
            {t("navAdvisors")}
          </button>
        )}
      </div>
      <div className="relative">
        <svg ref={svgRef} className="w-full touch-none" style={{ height }} data-testid="svg-network" />
        <div
          ref={tooltipRef}
          data-testid="graph-tooltip"
          style={{ display: "none" }}
          className="pointer-events-none absolute z-20 max-w-[280px] rounded-md border border-[hsl(var(--gold))]/40 bg-background/90 px-2.5 py-1.5 text-[11px] leading-snug text-foreground shadow-xl backdrop-blur"
        />
        {/* Zoom controls */}
        <div className="absolute bottom-3 right-3 flex flex-col gap-1.5">
          <button
            onClick={() => zoomBy(1.4)}
            className="flex h-8 w-8 items-center justify-center rounded-md border border-border bg-background/70 text-foreground/80 backdrop-blur transition-colors hover:bg-primary/30 hover:text-foreground"
            aria-label="Zoom in"
            data-testid="button-zoom-in"
          >
            <Plus className="h-4 w-4" />
          </button>
          <button
            onClick={() => zoomBy(1 / 1.4)}
            className="flex h-8 w-8 items-center justify-center rounded-md border border-border bg-background/70 text-foreground/80 backdrop-blur transition-colors hover:bg-primary/30 hover:text-foreground"
            aria-label="Zoom out"
            data-testid="button-zoom-out"
          >
            <Minus className="h-4 w-4" />
          </button>
          <button
            onClick={zoomReset}
            className="flex h-8 w-8 items-center justify-center rounded-md border border-border bg-background/70 text-foreground/80 backdrop-blur transition-colors hover:bg-primary/30 hover:text-foreground"
            aria-label="Reset zoom"
            data-testid="button-zoom-reset"
          >
            <Maximize className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// v6.0 — Advisor star map: the advisory network as its own constellation.
// Org hubs anchor linked advisors; unlinked advisors drift on the outer ring.
// ============================================================================
export function AdvisorStarMap({
  advisors,
  partnerships,
  onSelect,
  height = 620,
  /** v7.03 — when false, render the day-sky light theme instead of the cosmic dark one */
  dark = true,
}: {
  advisors: AdvisorWithRoles[];
  partnerships: Partnership[];
  onSelect: (advisorId: number) => void;
  height?: number;
  dark?: boolean;
}) {
  const { t, lang } = useLang();
  const svgRef = useRef<SVGSVGElement>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);
  const transformRef = useRef<ZoomTransform>(zoomIdentity);
  const zoomBehaviorRef = useRef<ZoomBehavior<SVGSVGElement, unknown> | null>(null);

  useEffect(() => {
    if (!svgRef.current) return;
    const svgEl = svgRef.current;
    const width = svgEl.clientWidth || 900;
    const cx = width / 2;
    const cy = height / 2;
    const rand = mulberry32(7);
    const pal = themePalette(dark ?? true);

    const pById = new Map<number, Partnership>();
    partnerships.forEach((p) => pById.set(p.id, p));

    // Org hubs = partner orgs referenced by at least one visible advisor role
    const orgIds = new Set<number>();
    advisors.forEach((a) => a.roles.forEach((r) => {
      if (r.partnershipId && pById.has(r.partnershipId)) orgIds.add(r.partnershipId);
    }));
    const orgs = Array.from(orgIds).map((id) => pById.get(id)!);
    orgs.sort((a, b) => a.nameEn.localeCompare(b.nameEn));

    const centerNode: GraphNode = {
      id: "gobi",
      label: t("advisorMapCenter"),
      r: 38,
      color: "#F0C75E",
      isCenter: true,
      fx: cx,
      fy: cy,
    };

    // v6.01 — advisor counts per org hub for the fast tooltip
    const orgAdvisorCount = new Map<number, number>();
    advisors.forEach((a) => {
      const seen = new Set<number>();
      a.roles.forEach((r) => {
        if (r.partnershipId && orgIds.has(r.partnershipId) && !seen.has(r.partnershipId)) {
          seen.add(r.partnershipId);
          orgAdvisorCount.set(r.partnershipId, (orgAdvisorCount.get(r.partnershipId) ?? 0) + 1);
        }
      });
    });

    const hubRadius = Math.min(width, height) * 0.3;
    const hubPos = new Map<number, { x: number; y: number }>();
    const hubNodes: GraphNode[] = orgs.map((p, i) => {
      const angle = -Math.PI / 2 + (i / Math.max(orgs.length, 1)) * Math.PI * 2;
      const pos = { x: cx + Math.cos(angle) * hubRadius, y: cy + Math.sin(angle) * hubRadius };
      hubPos.set(p.id, pos);
      const label = lang === "cn" && p.nameCn ? p.nameCn : p.nameEn;
      return {
        id: `org-${p.id}`,
        label,
        r: 15,
        color: "#48A9C5",
        isHub: true,
        partnership: p,
        x: pos.x,
        y: pos.y,
        tooltip: `${label} · ${orgAdvisorCount.get(p.id) ?? 0} ${t("navAdvisors")}`,
      };
    });

    const outerR = Math.min(width, height) * 0.46;
    const advisorNodes: GraphNode[] = [];
    type L = { source: string; target: string; kind: "trunk" | "adv" | "web" };
    const links: L[] = [];
    orgs.forEach((p) => links.push({ source: "gobi", target: `org-${p.id}`, kind: "trunk" }));

    advisors.forEach((a, i) => {
      const linked = a.roles.filter((r) => r.partnershipId && orgIds.has(r.partnershipId));
      const name = lang === "cn" && a.nameCn ? a.nameCn : a.name;
      const pr = a.roles.find((r) => r.isPrimary === 1) ?? a.roles[0];
      const node: GraphNode = {
        id: `a-${a.id}`,
        label: name,
        r: 6.5,
        color: "#F0C75E",
        isAdvisor: true,
        advisorId: a.id,
        tooltip: pr ? `${name} · ${pr.title}${pr.organization ? ` @ ${pr.organization}` : ""}` : name,
      };
      if (linked.length > 0) {
        const anchor = hubPos.get(linked[0].partnershipId!) ?? { x: cx, y: cy };
        node.x = anchor.x + (rand() - 0.5) * 90;
        node.y = anchor.y + (rand() - 0.5) * 90;
        linked.forEach((r) => links.push({ source: `a-${a.id}`, target: `org-${r.partnershipId}`, kind: "adv" }));
      } else {
        // Unlinked advisors take the outer ring
        const angle = (i / Math.max(advisors.length, 1)) * Math.PI * 2 + rand() * 0.4;
        node.x = cx + Math.cos(angle) * outerR;
        node.y = cy + Math.sin(angle) * outerR;
        (node as any).isOuter = true;
      }
      advisorNodes.push(node);
    });

    // Ambient particles
    const particles: GraphNode[] = Array.from({ length: 34 }, (_, i) => ({
      id: `dot-${i}`,
      r: 1.4 + rand() * 2.4,
      color: pal.particleColors[Math.floor(rand() * pal.particleColors.length)],
      opacity: 0.22 + rand() * 0.45,
      isParticle: true,
      x: rand() * width,
      y: rand() * height,
    }));
    particles.forEach((d, i) => {
      if (i > 0 && rand() > 0.5) links.push({ source: d.id, target: particles[Math.floor(rand() * i)].id, kind: "web" });
    });

    const nodes: GraphNode[] = [centerNode, ...hubNodes, ...advisorNodes, ...particles];

    const svg = select(svgEl);
    svg.selectAll("*").remove();

    const defs = svg.append("defs");
    const grad = defs.append("radialGradient").attr("id", "adv-bg").attr("cx", "50%").attr("cy", "42%").attr("r", "75%");
    grad.append("stop").attr("offset", "0%").attr("stop-color", pal.bgStops[0]).attr("stop-opacity", pal.bgAlpha);
    grad.append("stop").attr("offset", "55%").attr("stop-color", pal.bgStops[1]).attr("stop-opacity", pal.bgAlpha);
    grad.append("stop").attr("offset", "100%").attr("stop-color", pal.bgStops[2]).attr("stop-opacity", pal.bgAlpha);
    const glow = defs.append("filter").attr("id", "adv-glow").attr("x", "-80%").attr("y", "-80%").attr("width", "260%").attr("height", "260%");
    glow.append("feGaussianBlur").attr("stdDeviation", 5).attr("result", "b");
    const merge = glow.append("feMerge");
    merge.append("feMergeNode").attr("in", "b");
    merge.append("feMergeNode").attr("in", "SourceGraphic");

    svg.append("rect").attr("width", "100%").attr("height", "100%").attr("fill", "url(#adv-bg)");
    const container = svg.append("g");

    const starG = container.append("g");
    for (let i = 0; i < 80; i++) {
      starG.append("circle")
        .attr("cx", rand() * width * 1.4 - width * 0.2)
        .attr("cy", rand() * height * 1.4 - height * 0.2)
        .attr("r", rand() * 1.1 + 0.3)
        .attr("fill", pal.starColor)
        .attr("opacity", pal.isLight ? 0.2 + rand() * 0.3 : 0.08 + rand() * 0.22);
    }

    const zoomBehavior = zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.35, 4])
      .clickDistance(8) // v6.02 — small pointer jitter still counts as a click
      .on("zoom", (event) => {
        transformRef.current = event.transform;
        container.attr("transform", event.transform);
        if (tooltipRef.current) tooltipRef.current.style.display = "none";
      });
    zoomBehaviorRef.current = zoomBehavior;
    svg.call(zoomBehavior);
    svg.call(zoomBehavior.transform, transformRef.current);

    const linkSel = container.append("g")
      .selectAll("line")
      .data(links)
      .join("line")
      .attr("stroke", (d) => (d.kind === "trunk" ? pal.link.trunk : d.kind === "adv" ? pal.link.adv : pal.link.web))
      .attr("stroke-width", (d) => (d.kind === "trunk" ? 1.4 : d.kind === "adv" ? 0.8 : 0.6))
      .attr("stroke-dasharray", (d) => (d.kind === "adv" ? "1.5 3" : d.kind === "web" ? "2 4" : null));

    const nodeSel = container.append("g")
      .selectAll<SVGGElement, GraphNode>("g")
      .data(nodes)
      .join("g")
      .style("cursor", (d) => (d.isAdvisor || d.isCenter ? "pointer" : d.isParticle ? "default" : "grab"))
      .on("click", (event, d) => {
        if (d.isAdvisor && d.advisorId != null) {
          onSelect(d.advisorId);
        } else if (d.isCenter) {
          // v6.01 — clicking the Gobi hub resets the map view
          event.stopPropagation();
          if (svgRef.current && zoomBehaviorRef.current)
            select(svgRef.current).transition().duration(300).call(zoomBehaviorRef.current.transform, zoomIdentity);
        }
      });

    // v6.01 — instant tooltips (native <title> was ~1s slow)
    nodeSel.filter((d) => !!d.isCenter).attr("data-testid", "node-advmap-center-reset");
    attachFastTooltip(
      nodeSel.filter((d) => !d.isParticle),
      tooltipRef.current,
      (d) => (d.isCenter ? t("clickResetView") : d.tooltip ?? d.label ?? ""),
    );

    nodeSel
      .filter((d) => !d.isParticle)
      .append("circle")
      .attr("class", "halo")
      .attr("r", (d) => d.r * (d.isHub ? 1.35 : 1.6))
      .attr("fill", (d) => d.color)
      .attr("opacity", (d) => (d.isHub ? pal.haloHubBase : pal.haloNode))
      .attr("filter", "url(#adv-glow)");

    nodeSel
      .append("circle")
      .attr("class", "body")
      .attr("r", (d) => d.r)
      .attr("fill", (d) => (d.isHub ? pal.hubBodyFill : d.color))
      .attr("opacity", (d) => d.opacity ?? 1)
      .attr("stroke", (d) => (d.isParticle ? "none" : d.isHub ? d.color : pal.nodeStroke))
      .attr("stroke-width", (d) => (d.isCenter ? 2 : d.isHub ? 1.8 : 1))
      .attr("filter", (d) => (d.isParticle ? "url(#adv-glow)" : null));

    // Org logo inside the hub
    nodeSel
      .filter((d) => !!d.isHub && !!d.partnership && !!logoFor(d.partnership))
      .append("image")
      .attr("href", (d) => logoFor(d.partnership!)!)
      .attr("x", (d) => -d.r * 0.55)
      .attr("y", (d) => -d.r * 0.55)
      .attr("width", (d) => d.r * 1.1)
      .attr("height", (d) => d.r * 1.1)
      .attr("clip-path", "circle()")
      .attr("preserveAspectRatio", "xMidYMid slice");

    nodeSel
      .filter((d) => !!d.isCenter)
      .append("text")
      .text((d) => d.label!)
      .attr("text-anchor", "middle")
      .attr("dy", "0.35em")
      .attr("font-size", 10)
      .attr("font-weight", 800)
      .attr("fill", "#0C2340");

    nodeSel
      .filter((d) => !!d.isHub)
      .append("text")
      .text((d) => d.label!)
      .attr("text-anchor", "middle")
      .attr("dy", (d) => d.r + 14)
      .attr("font-size", 9.5)
      .attr("font-weight", 700)
      .attr("fill", pal.label);

    nodeSel
      .filter((d) => !!d.isAdvisor)
      .append("text")
      .attr("class", "name")
      .text((d) => d.label!)
      .attr("text-anchor", "middle")
      .attr("dy", (d) => d.r + 12)
      .attr("font-size", 8.5)
      .attr("font-weight", 600)
      .attr("fill", pal.label)
      .attr("opacity", 0.85);

    nodeSel
      .filter((d) => !!d.isAdvisor || !!d.isHub)
      .on("mouseenter", function (_event, d) {
        const g = select(this);
        g.raise();
        g.select<SVGCircleElement>("circle.body").transition().duration(150)
          .attr("r", d.r * 1.25).attr("stroke", "#F0C75E").attr("stroke-width", 2.2);
        g.select<SVGCircleElement>("circle.halo").transition().duration(150)
          .attr("opacity", 0.5).attr("r", d.r * 2);
        g.select<SVGTextElement>("text.name").transition().duration(150)
          .attr("font-size", 11).attr("font-weight", 800).attr("fill", pal.hoverName).attr("opacity", 1);
      })
      .on("mouseleave", function (_event, d) {
        const g = select(this);
        g.select<SVGCircleElement>("circle.body").transition().duration(200)
          .attr("r", d.r).attr("stroke", d.isHub ? d.color : pal.nodeStroke).attr("stroke-width", d.isHub ? 1.8 : 1);
        g.select<SVGCircleElement>("circle.halo").transition().duration(200)
          .attr("opacity", d.isHub ? 0.18 : 0.3).attr("r", d.r * (d.isHub ? 1.35 : 1.6));
        g.select<SVGTextElement>("text.name").transition().duration(200)
          .attr("font-size", 8.5).attr("font-weight", 600).attr("fill", pal.label).attr("opacity", 0.85);
      });

    const sim = forceSimulation<GraphNode>(nodes)
      .force(
        "link",
        forceLink(links as any)
          .id((d: any) => d.id)
          .distance((d: any) => (d.kind === "trunk" ? hubRadius : d.kind === "adv" ? 62 : 120))
          .strength((d: any) => (d.kind === "trunk" ? 0.75 : d.kind === "adv" ? 0.6 : 0.015)),
      )
      .force("charge", forceManyBody<GraphNode>().strength((d) => (d.isParticle ? -15 : d.isAdvisor ? -90 : d.isHub ? -320 : -260)))
      .force("center", forceCenter(cx, cy))
      .force("x", forceX<GraphNode>(cx).strength((d) => ((d as any).isOuter ? 0.002 : d.isParticle ? 0.005 : 0.03)))
      .force("y", forceY<GraphNode>(cy).strength((d) => ((d as any).isOuter ? 0.002 : d.isParticle ? 0.005 : 0.035)))
      .force("ring", forceRadial<GraphNode>((d) => ((d as any).isOuter ? outerR : 0), cx, cy).strength((d) => ((d as any).isOuter ? 0.28 : 0)))
      .force(
        "collide",
        forceCollide<GraphNode>().radius((d) => (d.isParticle ? d.r + 6 : d.isAdvisor ? d.r + 22 : d.isHub ? d.r + 30 : d.r + 40)),
      )
      .on("tick", () => {
        linkSel
          .attr("x1", (d: any) => d.source.x)
          .attr("y1", (d: any) => d.source.y)
          .attr("x2", (d: any) => d.target.x)
          .attr("y2", (d: any) => d.target.y);
        nodeSel.attr("transform", (d) => `translate(${d.x},${d.y})`);
      });

    const dragBehavior = drag<SVGGElement, GraphNode>()
      .clickDistance(8) // v6.02 — don't swallow clicks over trackpad jitter
      .on("start", (event, d) => {
        if (!event.active) sim.alphaTarget(0.25).restart();
        d.fx = d.x;
        d.fy = d.y;
      })
      .on("drag", (event, d) => {
        d.fx = event.x;
        d.fy = event.y;
      })
      .on("end", (event, d) => {
        if (!event.active) sim.alphaTarget(0);
        if (!d.isCenter) {
          d.fx = null;
          d.fy = null;
        }
      });
    nodeSel.filter((d) => !d.isParticle).call(dragBehavior);

    return () => {
      sim.stop();
    };
  }, [advisors, partnerships, lang, t, height, onSelect, dark]);

  const zoomBy = (factor: number) => {
    if (!svgRef.current || !zoomBehaviorRef.current) return;
    select(svgRef.current).transition().duration(240).call(zoomBehaviorRef.current.scaleBy, factor);
  };
  const zoomReset = () => {
    if (!svgRef.current || !zoomBehaviorRef.current) return;
    select(svgRef.current).transition().duration(300).call(zoomBehaviorRef.current.transform, zoomIdentity);
  };

  return (
    <div className="rounded-xl border border-border overflow-hidden bg-background/20 backdrop-blur-md">
      <div className="relative">
        <svg ref={svgRef} className="w-full touch-none" style={{ height }} data-testid="svg-advisor-map" />
        <div
          ref={tooltipRef}
          data-testid="advmap-tooltip"
          style={{ display: "none" }}
          className="pointer-events-none absolute z-20 max-w-[280px] rounded-md border border-[hsl(var(--gold))]/40 bg-background/90 px-2.5 py-1.5 text-[11px] leading-snug text-foreground shadow-xl backdrop-blur"
        />
        <div className="absolute bottom-3 right-3 flex flex-col gap-1.5">
          <button
            onClick={() => zoomBy(1.4)}
            className="flex h-8 w-8 items-center justify-center rounded-md border border-border bg-background/70 text-foreground/80 backdrop-blur transition-colors hover:bg-primary/30 hover:text-foreground"
            aria-label="Zoom in"
            data-testid="button-advmap-zoom-in"
          >
            <Plus className="h-4 w-4" />
          </button>
          <button
            onClick={() => zoomBy(1 / 1.4)}
            className="flex h-8 w-8 items-center justify-center rounded-md border border-border bg-background/70 text-foreground/80 backdrop-blur transition-colors hover:bg-primary/30 hover:text-foreground"
            aria-label="Zoom out"
            data-testid="button-advmap-zoom-out"
          >
            <Minus className="h-4 w-4" />
          </button>
          <button
            onClick={zoomReset}
            className="flex h-8 w-8 items-center justify-center rounded-md border border-border bg-background/70 text-foreground/80 backdrop-blur transition-colors hover:bg-primary/30 hover:text-foreground"
            aria-label="Reset zoom"
            data-testid="button-advmap-zoom-reset"
          >
            <Maximize className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
