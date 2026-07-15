import { useEffect, useRef } from "react";

// Animated starry-galaxy backdrop rendered behind the whole portal (including the
// sign-in screen). Theme-aware: deep-space navy in dark mode, a pale cosmic wash in
// light mode so text stays readable. Respects prefers-reduced-motion.

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

export function GalaxyBackground() {
  const ref = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const stars = makeStars();
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

    function starColor(hue: Star["hue"], dark: boolean, a: number): string {
      if (hue === "gold") return `hsla(43, 60%, ${dark ? 68 : 45}%, ${a})`;
      if (hue === "aqua") return `hsla(193, 60%, ${dark ? 70 : 40}%, ${a})`;
      return dark ? `hsla(210, 40%, 92%, ${a})` : `hsla(214, 55%, 35%, ${a})`;
    }

    function nebula(cx: number, cy: number, radius: number, color: string) {
      const g = ctx!.createRadialGradient(cx, cy, 0, cx, cy, radius);
      g.addColorStop(0, color);
      g.addColorStop(1, "transparent");
      ctx!.fillStyle = g;
      ctx!.fillRect(0, 0, w, h);
    }

    function frame(now: number) {
      const dark = document.documentElement.classList.contains("dark");
      const t = now / 1000;

      // Space wash
      const bg = ctx!.createLinearGradient(0, 0, 0, h);
      if (dark) {
        bg.addColorStop(0, "hsl(220, 70%, 4%)");
        bg.addColorStop(0.55, "hsl(218, 65%, 7%)");
        bg.addColorStop(1, "hsl(214, 60%, 10%)");
      } else {
        bg.addColorStop(0, "hsl(210, 55%, 97%)");
        bg.addColorStop(0.55, "hsl(208, 50%, 94%)");
        bg.addColorStop(1, "hsl(205, 45%, 91%)");
      }
      ctx!.fillStyle = bg;
      ctx!.fillRect(0, 0, w, h);

      // Slowly-drifting nebulas (aqua, gold, violet)
      const na = dark ? 0.16 : 0.1;
      nebula(
        w * (0.22 + 0.05 * Math.sin(t * 0.05)),
        h * (0.3 + 0.04 * Math.cos(t * 0.04)),
        Math.max(w, h) * 0.5,
        `hsla(193, 70%, ${dark ? 40 : 60}%, ${na})`,
      );
      nebula(
        w * (0.8 + 0.04 * Math.cos(t * 0.037)),
        h * (0.65 + 0.05 * Math.sin(t * 0.045)),
        Math.max(w, h) * 0.45,
        `hsla(43, 80%, ${dark ? 45 : 62}%, ${na * 0.85})`,
      );
      nebula(
        w * (0.55 + 0.06 * Math.sin(t * 0.03)),
        h * (0.85 + 0.03 * Math.cos(t * 0.05)),
        Math.max(w, h) * 0.55,
        `hsla(258, 60%, ${dark ? 45 : 70}%, ${na * 0.7})`,
      );

      // Stars
      for (const s of stars) {
        const a = s.baseA * (reduced ? 1 : 0.55 + 0.45 * Math.sin(t * s.tw + s.ph));
        const x = ((s.x + (reduced ? 0 : t * s.drift * 0.01)) % 1) * w;
        const y = s.y * h;
        ctx!.beginPath();
        ctx!.arc(x, y, s.r, 0, Math.PI * 2);
        ctx!.fillStyle = starColor(s.hue, dark, Math.max(0.05, a));
        ctx!.fill();
        if (s.r > 1.3) {
          // soft glow on the brightest stars
          ctx!.beginPath();
          ctx!.arc(x, y, s.r * 2.6, 0, Math.PI * 2);
          ctx!.fillStyle = starColor(s.hue, dark, Math.max(0.02, a * 0.18));
          ctx!.fill();
        }
      }

      // Occasional shooting star
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
          grad.addColorStop(1, dark ? `hsla(45, 90%, 80%, ${0.75 * meteor.life})` : `hsla(214, 60%, 40%, ${0.45 * meteor.life})`);
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

      if (!reduced) raf = requestAnimationFrame(frame);
    }

    raf = requestAnimationFrame(frame);
    // Reduced motion: draw exactly one static frame (the rAF above runs once and stops),
    // and redraw when the theme class flips so the wash matches the mode.
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
