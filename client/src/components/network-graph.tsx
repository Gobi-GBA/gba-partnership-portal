import { useEffect, useRef, useState } from "react";
import { useLang } from "@/lib/i18n";
import type { Partnership, Category, Region } from "@shared/schema";
import { CATEGORY_COLORS_DARK, CATEGORIES, CATEGORY_COLORS, REGION_ORDER, REGION_COLORS, logoFor, isNew } from "@/lib/constants";
import { DEFAULT_VIEW_OPTIONS, type ViewOptions } from "@/components/shared";
import {
  forceSimulation, forceLink, forceManyBody, forceCenter, forceCollide, forceX, forceY,
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
  isParticle?: boolean;
  partnership?: Partnership;
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
    </div>
  );
}

export function NetworkGraph({
  partnerships,
  onSelect,
  height = 620,
  options = DEFAULT_VIEW_OPTIONS,
}: {
  partnerships: Partnership[];
  onSelect: (p: Partnership) => void;
  height?: number;
  options?: ViewOptions;
}) {
  const { t, lang } = useLang();
  const svgRef = useRef<SVGSVGElement>(null);
  const [groupBy, setGroupBy] = useState<"region" | "category">("region");
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
          : (CATEGORY_COLORS_DARK[k as Category] ?? CATEGORY_COLORS_DARK.other),
      isHub: true,
      x: hubPos.get(k)!.x,
      y: hubPos.get(k)!.y,
    }));

    const nodeFor = (p: Partnership, isChild: boolean): GraphNode => ({
      id: `p-${p.id}`,
      label: lang === "cn" && p.nameCn ? p.nameCn : p.nameEn,
      sub: isChild || dense ? undefined : p.partnershipType ?? undefined,
      r: isChild ? 10 + p.collabLevel * 2.5 : (dense ? 11 : 13) + p.collabLevel * (dense ? 3 : 4),
      color: CATEGORY_COLORS_DARK[p.category as Category] ?? CATEGORY_COLORS_DARK.other,
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

    // Ambient constellation particles
    const particleCount = Math.min(42, 20 + partnerships.length * 2);
    const particles: GraphNode[] = Array.from({ length: particleCount }, (_, i) => ({
      id: `dot-${i}`,
      r: 1.6 + rand() * 2.6,
      color: PARTICLE_COLORS[Math.floor(rand() * PARTICLE_COLORS.length)],
      opacity: 0.25 + rand() * 0.5,
      isParticle: true,
      x: rand() * width,
      y: rand() * height,
    }));

    const nodes: GraphNode[] = [centerNode, ...hubNodes, ...partnerNodes, ...childNodes, ...particles];

    type L = { source: string; target: string; kind: "trunk" | "branch" | "child" | "web"; strength?: number };
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
    grad.append("stop").attr("offset", "0%").attr("stop-color", "#16385E");
    grad.append("stop").attr("offset", "55%").attr("stop-color", "#0B2240");
    grad.append("stop").attr("offset", "100%").attr("stop-color", "#040D1C");

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
        .attr("fill", "#EAF3FA")
        .attr("opacity", 0.08 + rand() * 0.22);
    }

    const zoomBehavior = zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.35, 4])
      .on("zoom", (event) => {
        transformRef.current = event.transform;
        container.attr("transform", event.transform);
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
          ? "rgba(240,199,94,0.5)"
          : d.kind === "branch"
            ? "rgba(168,216,232,0.4)"
            : d.kind === "child"
              ? "rgba(240,199,94,0.55)"
              : "rgba(168,216,232,0.12)",
      )
      .attr("stroke-width", (d) =>
        d.kind === "trunk" ? 1.6 : d.kind === "branch" ? 0.8 + (d.strength ?? 1) * 0.3 : d.kind === "child" ? 1.1 : 0.6,
      )
      .attr("stroke-dasharray", (d) => (d.kind === "web" ? "2 4" : d.kind === "child" ? "4 3" : null));

    const nodeSel = container
      .append("g")
      .selectAll<SVGGElement, GraphNode>("g")
      .data(nodes)
      .join("g")
      .style("cursor", (d) => (d.isParticle ? "default" : d.partnership ? "pointer" : "grab"))
      .on("click", (_event, d) => {
        if (d.partnership) onSelect(d.partnership);
      });

    // glow halo
    nodeSel
      .filter((d) => !d.isParticle)
      .append("circle")
      .attr("class", "halo")
      .attr("r", (d) => d.r * (d.isHub ? 1.3 : 1.45))
      .attr("fill", (d) => d.color)
      .attr("opacity", (d) => (d.isHub ? 0.2 : 0.28))
      .attr("filter", "url(#net-glow)");

    nodeSel
      .append("circle")
      .attr("class", "body")
      .attr("r", (d) => d.r)
      .attr("fill", (d) => (d.isHub ? "#0B2240" : d.color))
      .attr("opacity", (d) => d.opacity ?? 1)
      .attr("stroke", (d) => (d.isParticle ? "none" : d.isHub ? d.color : "rgba(234,243,250,0.9)"))
      .attr("stroke-width", (d) => (d.isCenter ? 2 : d.isHub ? 1.8 : 1.2))
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
      .filter((d) => !d.isCenter && !d.isHub && !d.isParticle)
      .append("text")
      .attr("class", "name")
      .text((d) => d.label!)
      .attr("text-anchor", "middle")
      .attr("dy", (d) => d.r + 15)
      .attr("font-size", (d) => (d.partnership?.parentId ? 9.5 : dense ? 9.5 : 10.5))
      .attr("font-weight", 600)
      .attr("fill", "#EAF3FA");

    nodeSel
      .filter((d) => !d.isCenter && !d.isHub && !d.isParticle && !!d.sub)
      .append("text")
      .text((d) => d.sub!)
      .attr("text-anchor", "middle")
      .attr("dy", (d) => d.r + 28)
      .attr("font-size", 9)
      .attr("fill", "#A8C4DA");

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
      .filter((d) => !!d.partnership || !!d.isHub)
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
          .attr("fill", "#F0C75E");
      })
      .on("mouseleave", function (_event, d) {
        const g = select(this);
        g.select<SVGCircleElement>("circle.body")
          .transition().duration(200)
          .attr("r", d.r)
          .attr("stroke", d.isHub ? d.color : "rgba(234,243,250,0.9)")
          .attr("stroke-width", d.isHub ? 1.8 : 1.2);
        g.select<SVGCircleElement>("circle.halo")
          .transition().duration(200)
          .attr("opacity", d.isHub ? 0.2 : 0.28)
          .attr("r", d.r * (d.isHub ? 1.3 : 1.45));
        g.select<SVGTextElement>("text.name")
          .transition().duration(200)
          .attr("font-size", d.partnership?.parentId ? 9.5 : dense ? 9.5 : 10.5)
          .attr("font-weight", 600)
          .attr("fill", "#EAF3FA");
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
                  : 120,
          )
          .strength((d: any) =>
            d.kind === "trunk" ? 0.75 : d.kind === "branch" ? 0.5 : d.kind === "child" ? 0.6 : 0.015,
          ),
      )
      .force("charge", forceManyBody<GraphNode>().strength((d) => (d.isParticle ? -20 : d.isHub ? -380 : dense ? -220 : -300)))
      .force("center", forceCenter(cx, cy))
      .force("x", forceX<GraphNode>(cx).strength((d) => (d.isParticle ? 0.005 : 0.03)))
      .force("y", forceY<GraphNode>(cy).strength((d) => (d.isParticle ? 0.005 : 0.035)))
      .force(
        "collide",
        forceCollide<GraphNode>().radius((d) =>
          d.isParticle ? d.r + 6 : d.isHub ? d.r + 26 : d.r + (dense ? 24 : 42),
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
  }, [partnerships, lang, t, height, groupBy, options]);

  const zoomBy = (factor: number) => {
    if (!svgRef.current || !zoomBehaviorRef.current) return;
    select(svgRef.current).transition().duration(240).call(zoomBehaviorRef.current.scaleBy, factor);
  };
  const zoomReset = () => {
    if (!svgRef.current || !zoomBehaviorRef.current) return;
    select(svgRef.current).transition().duration(300).call(zoomBehaviorRef.current.transform, zoomIdentity);
  };

  return (
    <div className="rounded-xl border border-card-border overflow-hidden bg-[#0B2240]">
      <div className="flex items-center justify-end gap-1 px-3 py-2 bg-[#0B2240] border-b border-white/10">
        <span className="text-[11px] font-medium text-[#A8C4DA] mr-1">{t("layerBy")}</span>
        <button
          onClick={() => setGroupBy("region")}
          className={`rounded-md px-2.5 py-1 text-[11px] font-semibold transition-colors ${groupBy === "region" ? "bg-[#48A9C5]/20 text-[#A8D8E8] border border-[#48A9C5]/50" : "text-[#7E97AF] border border-transparent"}`}
          data-testid="button-layer-region"
        >
          {t("layerRegion")}
        </button>
        <button
          onClick={() => setGroupBy("category")}
          className={`rounded-md px-2.5 py-1 text-[11px] font-semibold transition-colors ${groupBy === "category" ? "bg-[#48A9C5]/20 text-[#A8D8E8] border border-[#48A9C5]/50" : "text-[#7E97AF] border border-transparent"}`}
          data-testid="button-layer-type"
        >
          {t("layerType")}
        </button>
      </div>
      <div className="relative">
        <svg ref={svgRef} className="w-full touch-none" style={{ height }} data-testid="svg-network" />
        {/* Zoom controls */}
        <div className="absolute bottom-3 right-3 flex flex-col gap-1.5">
          <button
            onClick={() => zoomBy(1.4)}
            className="flex h-8 w-8 items-center justify-center rounded-md border border-white/20 bg-[#0B2240]/80 text-[#A8D8E8] backdrop-blur transition-colors hover:bg-[#48A9C5]/30 hover:text-white"
            aria-label="Zoom in"
            data-testid="button-zoom-in"
          >
            <Plus className="h-4 w-4" />
          </button>
          <button
            onClick={() => zoomBy(1 / 1.4)}
            className="flex h-8 w-8 items-center justify-center rounded-md border border-white/20 bg-[#0B2240]/80 text-[#A8D8E8] backdrop-blur transition-colors hover:bg-[#48A9C5]/30 hover:text-white"
            aria-label="Zoom out"
            data-testid="button-zoom-out"
          >
            <Minus className="h-4 w-4" />
          </button>
          <button
            onClick={zoomReset}
            className="flex h-8 w-8 items-center justify-center rounded-md border border-white/20 bg-[#0B2240]/80 text-[#A8D8E8] backdrop-blur transition-colors hover:bg-[#48A9C5]/30 hover:text-white"
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
