import { useEffect, useRef } from "react";

// Animated backdrop rendered behind the whole portal (including the sign-in
// screen). Theme-aware with two cinematic scenes:
//   dark mode  — deep-space galaxy: stars, nebulas, shooting stars
//   light mode — Gobi desert: warm sky, drifting dunes, blowing sand and a
//                slow camel caravan casting long shadows
// Respects prefers-reduced-motion (renders one static frame).

interface Star {
  x: number; // 0..1 of width
  y: number; // 0..1 of height
  r: number;
  baseA: number; // base alpha
  tw: number; // twinkle speed
  ph: number; // twinkle phase
  drift: number; // horizontal drift speed
  hue: "white" | "gold" | "aqua";
}

interface Meteor {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number; // 0..1
}

const STAR_COUNT = 190;

function makeStars(): Star[] {
  const hues: Star["hue"][] = ["white", "white", "white", "white", "gold", "aqua"];
  return Array.from({ length: STAR_COUNT }, () => ({
    x: Math.random(),
    y: Math.random(),
    r: 0.4 + Math.random() * 1.3,
    baseA: 0.25 + Math.random() * 0.65,
    tw: 0.4 + Math.random() * 1.4,
    ph: Math.random() * Math.PI * 2,
    drift: 0.002 + Math.random() * 0.008,
    hue: hues[Math.floor(Math.random() * hues.length)],
  }));
}

// Sand grains for the desert scene (reseeded from the same random pool)
interface Grain {
  x: number; // 0..1
  y: number; // 0..1 (mapped to the lower part of the sky/dunes)
  r: number;
  a: number;
  v: number; // horizontal speed factor
  ph: number;
}

const GRAIN_COUNT = 110;

function makeGrains(): Grain[] {
  return Array.from({ length: GRAIN_COUNT }, () => ({
    x: Math.random(),
    y: Math.random(),
    r: 0.4 + Math.random() * 1.1,
    a: 0.12 + Math.random() * 0.3,
    v: 0.5 + Math.random() * 1.4,
    ph: Math.random() * Math.PI * 2,
  }));
}

export function GalaxyBackground() {
  const ref = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const stars = makeStars();
    const grains = makeGrains();
    let meteor: Meteor | null = null;
    let nextMeteorAt = performance.now() + 4000 + Math.random() * 5000;
    let raf = 0;
    let w = 0;
    let h = 0;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    function resize() {
      if (!canvas) return;
      w = window.innerWidth;
      h = window.innerHeight;
      canvas.width = Math.floor(w * dpr);
      canvas.height = Math.floor(h * dpr);
      canvas.style.width = `${w}px`;
      canvas.style.height = `${h}px`;
      ctx!.setTransform(dpr, 0, 0, dpr, 0, 0);
    }
    resize();
    window.addEventListener("resize", resize);

    function starColor(hue: Star["hue"], a: number): string {
      if (hue === "gold") return `hsla(43, 60%, 68%, ${a})`;
      if (hue === "aqua") return `hsla(193, 60%, 70%, ${a})`;
      return `hsla(210, 40%, 92%, ${a})`;
    }

    function nebula(cx: number, cy: number, radius: number, color: string) {
      const g = ctx!.createRadialGradient(cx, cy, 0, cx, cy, radius);
      g.addColorStop(0, color);
      g.addColorStop(1, "transparent");
      ctx!.fillStyle = g;
      ctx!.fillRect(0, 0, w, h);
    }

    // ---------------- Dark mode: galaxy ----------------
    function drawGalaxy(now: number) {
      const t = now / 1000;
      const bg = ctx!.createLinearGradient(0, 0, 0, h);
      bg.addColorStop(0, "hsl(220, 70%, 4%)");
      bg.addColorStop(0.55, "hsl(218, 65%, 7%)");
      bg.addColorStop(1, "hsl(214, 60%, 10%)");
      ctx!.fillStyle = bg;
      ctx!.fillRect(0, 0, w, h);

      const na = 0.16;
      nebula(w * (0.22 + 0.05 * Math.sin(t * 0.05)), h * (0.3 + 0.04 * Math.cos(t * 0.04)), Math.max(w, h) * 0.5, `hsla(193, 70%, 40%, ${na})`);
      nebula(w * (0.8 + 0.04 * Math.cos(t * 0.037)), h * (0.65 + 0.05 * Math.sin(t * 0.045)), Math.max(w, h) * 0.45, `hsla(43, 80%, 45%, ${na * 0.85})`);
      nebula(w * (0.55 + 0.06 * Math.sin(t * 0.03)), h * (0.85 + 0.03 * Math.cos(t * 0.05)), Math.max(w, h) * 0.55, `hsla(258, 60%, 45%, ${na * 0.7})`);

      for (const s of stars) {
        const a = s.baseA * (reduced ? 1 : 0.55 + 0.45 * Math.sin(t * s.tw + s.ph));
        const x = ((s.x + (reduced ? 0 : t * s.drift * 0.01)) % 1) * w;
        const y = s.y * h;
        ctx!.beginPath();
        ctx!.arc(x, y, s.r, 0, Math.PI * 2);
        ctx!.fillStyle = starColor(s.hue, Math.max(0.05, a));
        ctx!.fill();
        if (s.r > 1.3) {
          ctx!.beginPath();
          ctx!.arc(x, y, s.r * 2.6, 0, Math.PI * 2);
          ctx!.fillStyle = starColor(s.hue, Math.max(0.02, a * 0.18));
          ctx!.fill();
        }
      }

      if (!reduced) {
        if (!meteor && now > nextMeteorAt) {
          meteor = {
            x: w * (0.15 + Math.random() * 0.6),
            y: h * (0.05 + Math.random() * 0.25),
            vx: 6 + Math.random() * 5,
            vy: 2.5 + Math.random() * 2,
            life: 1,
          };
        }
        if (meteor) {
          meteor.x += meteor.vx;
          meteor.y += meteor.vy;
          meteor.life -= 0.016;
          const tailX = meteor.x - meteor.vx * 9;
          const tailY = meteor.y - meteor.vy * 9;
          const grad = ctx!.createLinearGradient(tailX, tailY, meteor.x, meteor.y);
          grad.addColorStop(0, "transparent");
          grad.addColorStop(1, `hsla(45, 90%, 80%, ${0.75 * meteor.life})`);
          ctx!.strokeStyle = grad;
          ctx!.lineWidth = 1.6;
          ctx!.beginPath();
          ctx!.moveTo(tailX, tailY);
          ctx!.lineTo(meteor.x, meteor.y);
          ctx!.stroke();
          if (meteor.life <= 0 || meteor.x > w + 40 || meteor.y > h + 40) {
            meteor = null;
            nextMeteorAt = now + 6000 + Math.random() * 9000;
          }
        }
      }
    }

    // ---------------- Light mode: Gobi desert ----------------
    // Dune ridge as a function of x, for a given layer
    function duneY(x: number, base: number, amp: number, freq: number, phase: number): number {
      return (
        base +
        amp * Math.sin((x / w) * Math.PI * freq + phase) +
        amp * 0.45 * Math.sin((x / w) * Math.PI * freq * 2.3 + phase * 1.7)
      );
    }

    function drawDuneLayer(base: number, amp: number, freq: number, phase: number, fill: string) {
      ctx!.beginPath();
      ctx!.moveTo(0, h);
      for (let x = 0; x <= w; x += 8) {
        ctx!.lineTo(x, duneY(x, base, amp, freq, phase));
      }
      ctx!.lineTo(w, h);
      ctx!.closePath();
      ctx!.fillStyle = fill;
      ctx!.fill();
    }

    // A camel silhouette walking on the ridge. x,y = ground point under the body.
    function drawCamel(x: number, y: number, s: number, t: number, alpha: number) {
      const c = `hsla(26, 45%, 22%, ${alpha})`;
      // long cinematic shadow stretching toward the viewer's left
      ctx!.beginPath();
      ctx!.ellipse(x - s * 0.5, y + s * 0.06, s * 1.15, s * 0.11, 0, 0, Math.PI * 2);
      ctx!.fillStyle = `hsla(26, 50%, 25%, ${alpha * 0.28})`;
      ctx!.fill();

      ctx!.fillStyle = c;
      ctx!.strokeStyle = c;
      // legs with a slow walking swing
      ctx!.lineWidth = Math.max(1, s * 0.07);
      const hip = y - s * 0.52;
      for (let i = 0; i < 4; i++) {
        const lx = x - s * 0.34 + i * s * 0.23;
        const swing = Math.sin(t * 2.2 + i * Math.PI * 0.9) * s * 0.06;
        ctx!.beginPath();
        ctx!.moveTo(lx, hip);
        ctx!.lineTo(lx + swing, y);
        ctx!.stroke();
      }
      // body
      ctx!.beginPath();
      ctx!.ellipse(x, y - s * 0.6, s * 0.48, s * 0.2, 0, 0, Math.PI * 2);
      ctx!.fill();
      // humps
      ctx!.beginPath();
      ctx!.ellipse(x - s * 0.16, y - s * 0.78, s * 0.15, s * 0.13, 0, 0, Math.PI * 2);
      ctx!.ellipse(x + s * 0.14, y - s * 0.76, s * 0.14, s * 0.12, 0, 0, Math.PI * 2);
      ctx!.fill();
      // neck + head
      ctx!.lineWidth = Math.max(1.2, s * 0.11);
      ctx!.beginPath();
      ctx!.moveTo(x + s * 0.42, y - s * 0.62);
      ctx!.quadraticCurveTo(x + s * 0.62, y - s * 0.85, x + s * 0.66, y - s * 1.0);
      ctx!.stroke();
      ctx!.beginPath();
      ctx!.ellipse(x + s * 0.72, y - s * 1.02, s * 0.11, s * 0.06, 0.35, 0, Math.PI * 2);
      ctx!.fill();
      // tail
      ctx!.lineWidth = Math.max(1, s * 0.05);
      ctx!.beginPath();
      ctx!.moveTo(x - s * 0.46, y - s * 0.62);
      ctx!.quadraticCurveTo(x - s * 0.58, y - s * 0.5, x - s * 0.54, y - s * 0.38);
      ctx!.stroke();
    }

    function drawDesert(now: number) {
      const t = now / 1000;

      // Warm desert sky
      const bg = ctx!.createLinearGradient(0, 0, 0, h);
      bg.addColorStop(0, "hsl(40, 60%, 96%)");
      bg.addColorStop(0.5, "hsl(37, 65%, 91%)");
      bg.addColorStop(1, "hsl(32, 60%, 86%)");
      ctx!.fillStyle = bg;
      ctx!.fillRect(0, 0, w, h);

      // Sun with a soft golden halo
      const sunX = w * 0.78;
      const sunY = h * 0.2;
      nebula(sunX, sunY, Math.max(w, h) * 0.38, "hsla(43, 90%, 72%, 0.28)");
      ctx!.beginPath();
      ctx!.arc(sunX, sunY, 34, 0, Math.PI * 2);
      ctx!.fillStyle = "hsla(44, 95%, 78%, 0.85)";
      ctx!.fill();

      // Heat haze drifting across the horizon
      nebula(w * (0.25 + 0.06 * Math.sin(t * 0.03)), h * 0.55, Math.max(w, h) * 0.4, "hsla(35, 70%, 80%, 0.16)");

      // Dune layers drifting at different speeds (parallax)
      const drift = reduced ? 0 : t;
      drawDuneLayer(h * 0.62, h * 0.035, 2.2, drift * 0.008 + 1.2, "hsla(36, 42%, 82%, 0.9)");
      drawDuneLayer(h * 0.72, h * 0.05, 1.7, drift * 0.014 + 3.6, "hsla(33, 48%, 74%, 0.92)");

      // Camel caravan walking along the mid dune ridge (right to left)
      const span = w + 520;
      const caravanX = reduced ? w * 0.62 : w + 260 - ((t * 14) % span);
      const spacing = 92;
      for (let i = 0; i < 3; i++) {
        const cx = caravanX + i * spacing;
        if (cx < -80 || cx > w + 80) continue;
        const gy = duneY(cx, h * 0.72, h * 0.05, 1.7, drift * 0.014 + 3.6);
        drawCamel(cx, gy + 2, 34 - i * 3, reduced ? 0 : t + i * 1.3, 0.5);
      }

      // Foreground dune in front of the caravan
      drawDuneLayer(h * 0.84, h * 0.06, 1.3, drift * 0.022 + 5.1, "hsla(30, 52%, 66%, 0.95)");

      // Wind-blown sand grains streaming horizontally
      for (const g of grains) {
        const gx = ((g.x + (reduced ? 0 : t * 0.02 * g.v)) % 1) * w;
        const gy = (0.4 + 0.6 * g.y) * h + (reduced ? 0 : Math.sin(t * 1.4 + g.ph) * 5);
        const a = g.a * (reduced ? 1 : 0.6 + 0.4 * Math.sin(t * 2 + g.ph));
        ctx!.beginPath();
        ctx!.ellipse(gx, gy, g.r * 2.2, g.r * 0.75, 0, 0, Math.PI * 2);
        ctx!.fillStyle = `hsla(33, 55%, 48%, ${Math.max(0.04, a)})`;
        ctx!.fill();
      }
    }

    function frame(now: number) {
      const dark = document.documentElement.classList.contains("dark");
      if (dark) drawGalaxy(now);
      else drawDesert(now);
      if (!reduced) raf = requestAnimationFrame(frame);
    }

    raf = requestAnimationFrame(frame);
    // Reduced motion: draw exactly one static frame (the rAF above runs once and stops),
    // and redraw when the theme class flips so the scene matches the mode.
    const observer = new MutationObserver(() => {
      if (reduced) raf = requestAnimationFrame(frame);
    });
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });

    return () => {
      cancelAnimationFrame(raf);
      observer.disconnect();
      window.removeEventListener("resize", resize);
    };
  }, []);

  return (
    <canvas
      ref={ref}
      aria-hidden="true"
      data-testid="canvas-galaxy"
      className="pointer-events-none fixed inset-0 -z-10"
    />
  );
}
