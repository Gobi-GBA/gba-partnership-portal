import { useEffect, useRef } from "react";

// Animated backdrop rendered behind the whole portal (including the sign-in
// screen). v6.0 — ONE synced Gobi desert scene shared by both themes: the same
// dunes, oasis (palms + water) and a caravan of camels and people walking
// forward together. Only the lighting changes with the theme:
//   light mode — daylight: warm sky, sun, blowing sand grains, butterflies
//   dark mode  — starry night: galaxy sky, meteors, moon, moonlit silhouettes
//                and fireflies drifting near the oasis
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

// Sand grains (day wind) — also reused as firefly seeds at night
interface Grain {
  x: number; // 0..1
  y: number; // 0..1
  r: number;
  a: number;
  v: number;
  ph: number;
}

const GRAIN_COUNT = 110;
const FIREFLY_COUNT = 14;
const BUTTERFLY_COUNT = 6;

function makeGrains(n = GRAIN_COUNT): Grain[] {
  return Array.from({ length: n }, () => ({
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
    const fireflies = makeGrains(FIREFLY_COUNT);
    const butterflies = makeGrains(BUTTERFLY_COUNT);
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

    // ---------------- Shared geometry (identical in both themes) ----------------
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
    function drawCamel(x: number, y: number, s: number, t: number, color: string, shadow: string) {
      ctx!.beginPath();
      ctx!.ellipse(x - s * 0.5, y + s * 0.06, s * 1.15, s * 0.11, 0, 0, Math.PI * 2);
      ctx!.fillStyle = shadow;
      ctx!.fill();

      ctx!.fillStyle = color;
      ctx!.strokeStyle = color;
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
      ctx!.beginPath();
      ctx!.ellipse(x, y - s * 0.6, s * 0.48, s * 0.2, 0, 0, Math.PI * 2);
      ctx!.fill();
      ctx!.beginPath();
      ctx!.ellipse(x - s * 0.16, y - s * 0.78, s * 0.15, s * 0.13, 0, 0, Math.PI * 2);
      ctx!.ellipse(x + s * 0.14, y - s * 0.76, s * 0.14, s * 0.12, 0, 0, Math.PI * 2);
      ctx!.fill();
      ctx!.lineWidth = Math.max(1.2, s * 0.11);
      ctx!.beginPath();
      ctx!.moveTo(x + s * 0.42, y - s * 0.62);
      ctx!.quadraticCurveTo(x + s * 0.62, y - s * 0.85, x + s * 0.66, y - s * 1.0);
      ctx!.stroke();
      ctx!.beginPath();
      ctx!.ellipse(x + s * 0.72, y - s * 1.02, s * 0.11, s * 0.06, 0.35, 0, Math.PI * 2);
      ctx!.fill();
      ctx!.lineWidth = Math.max(1, s * 0.05);
      ctx!.beginPath();
      ctx!.moveTo(x - s * 0.46, y - s * 0.62);
      ctx!.quadraticCurveTo(x - s * 0.58, y - s * 0.5, x - s * 0.54, y - s * 0.38);
      ctx!.stroke();
    }

    // A walking human silhouette (part of the caravan team). x,y = ground point.
    function drawHuman(x: number, y: number, s: number, t: number, color: string, shadow: string) {
      ctx!.beginPath();
      ctx!.ellipse(x - s * 0.3, y + s * 0.04, s * 0.6, s * 0.07, 0, 0, Math.PI * 2);
      ctx!.fillStyle = shadow;
      ctx!.fill();

      ctx!.fillStyle = color;
      ctx!.strokeStyle = color;
      const hipY = y - s * 0.42;
      const shoulderY = y - s * 0.78;
      // legs (walking swing)
      ctx!.lineWidth = Math.max(1, s * 0.09);
      const leg = Math.sin(t * 2.2) * s * 0.16;
      ctx!.beginPath();
      ctx!.moveTo(x, hipY);
      ctx!.lineTo(x + leg, y);
      ctx!.moveTo(x, hipY);
      ctx!.lineTo(x - leg, y);
      ctx!.stroke();
      // torso (slight forward lean — moving forward)
      ctx!.lineWidth = Math.max(1.2, s * 0.11);
      ctx!.beginPath();
      ctx!.moveTo(x, hipY);
      ctx!.lineTo(x + s * 0.06, shoulderY);
      ctx!.stroke();
      // arms — one holds a walking stick
      ctx!.lineWidth = Math.max(1, s * 0.08);
      const arm = Math.sin(t * 2.2 + Math.PI) * s * 0.12;
      ctx!.beginPath();
      ctx!.moveTo(x + s * 0.05, shoulderY + s * 0.06);
      ctx!.lineTo(x + s * 0.22 + arm, hipY + s * 0.05);
      ctx!.moveTo(x + s * 0.05, shoulderY + s * 0.06);
      ctx!.lineTo(x - s * 0.16 - arm * 0.5, hipY);
      ctx!.stroke();
      // walking stick
      ctx!.lineWidth = Math.max(0.8, s * 0.05);
      ctx!.beginPath();
      ctx!.moveTo(x + s * 0.24 + arm, hipY + s * 0.05);
      ctx!.lineTo(x + s * 0.3 + arm, y);
      ctx!.stroke();
      // head + headscarf hint
      ctx!.beginPath();
      ctx!.arc(x + s * 0.07, shoulderY - s * 0.12, s * 0.11, 0, Math.PI * 2);
      ctx!.fill();
    }

    // Palm tree at the oasis. x,y = base of trunk.
    function drawPalm(x: number, y: number, s: number, t: number, lean: number, trunk: string, frond: string) {
      const sway = Math.sin(t * 0.8 + lean * 3) * s * 0.04;
      const topX = x + lean * s * 0.34 + sway;
      const topY = y - s;
      ctx!.strokeStyle = trunk;
      ctx!.lineWidth = Math.max(1.4, s * 0.09);
      ctx!.beginPath();
      ctx!.moveTo(x, y);
      ctx!.quadraticCurveTo(x + lean * s * 0.12, y - s * 0.55, topX, topY);
      ctx!.stroke();
      // fronds
      ctx!.strokeStyle = frond;
      ctx!.lineWidth = Math.max(1, s * 0.055);
      for (let i = 0; i < 6; i++) {
        const ang = -Math.PI * 0.95 + (i / 5) * Math.PI * 0.9;
        const fl = s * (0.42 + 0.08 * Math.sin(i * 2.7));
        const bend = Math.sin(t * 0.9 + i) * s * 0.03;
        ctx!.beginPath();
        ctx!.moveTo(topX, topY);
        ctx!.quadraticCurveTo(
          topX + Math.cos(ang) * fl * 0.6,
          topY + Math.sin(ang) * fl * 0.35 - s * 0.1 + bend,
          topX + Math.cos(ang) * fl,
          topY + Math.sin(ang) * fl * 0.55 + s * 0.16 + bend,
        );
        ctx!.stroke();
      }
    }

    // ---------------- v6.01: one-shot background reactions ----------------
    // Clicking an empty part of the page hit-tests the scene; the nearest
    // actor (caravan member, palm or star) reacts once for ~1.2s through the
    // existing rAF loop — purely cosmetic, no extra render cost when idle.
    type Reaction = { kind: "member" | "palm" | "star" | "twinkle" | "celestial"; index: number; start: number; x: number; y: number };
    let reaction: Reaction | null = null;

    // v6.02 — small canvas heart for the sun/moon reaction
    function drawHeart(hx: number, hy: number, d: number, fill: string) {
      const x = hx - d / 2;
      const y = hy - d / 2;
      ctx!.beginPath();
      ctx!.moveTo(x + d / 2, y + d / 4);
      ctx!.quadraticCurveTo(x + d / 2, y, x + d / 4, y);
      ctx!.quadraticCurveTo(x, y, x, y + d / 4);
      ctx!.quadraticCurveTo(x, y + d / 2, x + d / 4, y + d * 0.72);
      ctx!.lineTo(x + d / 2, y + d);
      ctx!.lineTo(x + d * 0.75, y + d * 0.72);
      ctx!.quadraticCurveTo(x + d, y + d / 2, x + d, y + d / 4);
      ctx!.quadraticCurveTo(x + d, y, x + d * 0.75, y);
      ctx!.quadraticCurveTo(x + d / 2, y, x + d / 2, y + d / 4);
      ctx!.fillStyle = fill;
      ctx!.fill();
    }

    // Caravan order along the trail: human guide, camel, camel, human, camel
    const MEMBERS: { dx: number; kind: "camel" | "human"; s: number }[] = [
      { dx: 0, kind: "human", s: 30 },
      { dx: 64, kind: "camel", s: 34 },
      { dx: 158, kind: "camel", s: 31 },
      { dx: 232, kind: "human", s: 28 },
      { dx: 296, kind: "camel", s: 29 },
    ];

    function palmSpots(drift: number) {
      const ox = w * 0.16;
      const oBase = duneY(ox, h * 0.84, h * 0.06, 1.3, drift * 0.022 + 5.1);
      const oy = Math.min(oBase + h * 0.055, h - 12);
      const poolW = Math.max(90, w * 0.09);
      const poolH = poolW * 0.24;
      return {
        ox, oy, poolW, poolH,
        palms: [
          { x: ox - poolW * 0.75, y: oy - poolH * 0.5, s: h * 0.075, lean: -0.5, phase: 0 },
          { x: ox + poolW * 0.65, y: oy - poolH * 0.6, s: h * 0.09, lean: 0.55, phase: 1.4 },
          { x: ox + poolW * 0.95, y: oy - poolH * 0.2, s: h * 0.06, lean: 0.35, phase: 2.6 },
        ],
      };
    }

    // ---------------- The synced scene ----------------
    function drawScene(now: number, dark: boolean) {
      const t = now / 1000;
      const drift = reduced ? 0 : t;
      // v6.01 — progress of the active one-shot reaction (0..1, expires itself)
      const rProg = reaction ? Math.min(1, (now - reaction.start) / 1200) : 0;
      if (reaction && rProg >= 1) reaction = null;

      // ----- Sky -----
      if (dark) {
        const bg = ctx!.createLinearGradient(0, 0, 0, h);
        bg.addColorStop(0, "hsl(220, 70%, 4%)");
        bg.addColorStop(0.55, "hsl(218, 65%, 7%)");
        bg.addColorStop(1, "hsl(214, 60%, 10%)");
        ctx!.fillStyle = bg;
        ctx!.fillRect(0, 0, w, h);

        const na = 0.14;
        nebula(w * (0.22 + 0.05 * Math.sin(t * 0.05)), h * (0.28 + 0.04 * Math.cos(t * 0.04)), Math.max(w, h) * 0.5, `hsla(193, 70%, 40%, ${na})`);
        nebula(w * (0.8 + 0.04 * Math.cos(t * 0.037)), h * (0.45 + 0.05 * Math.sin(t * 0.045)), Math.max(w, h) * 0.45, `hsla(43, 80%, 45%, ${na * 0.85})`);
        nebula(w * (0.55 + 0.06 * Math.sin(t * 0.03)), h * (0.2 + 0.03 * Math.cos(t * 0.05)), Math.max(w, h) * 0.5, `hsla(258, 60%, 45%, ${na * 0.7})`);

        for (const s of stars) {
          const a = s.baseA * (reduced ? 1 : 0.55 + 0.45 * Math.sin(t * s.tw + s.ph));
          const x = ((s.x + (reduced ? 0 : t * s.drift * 0.01)) % 1) * w;
          const y = s.y * h * 0.72; // keep stars above the dune line
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
              y: h * (0.05 + Math.random() * 0.2),
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
            if (meteor.life <= 0 || meteor.x > w + 40 || meteor.y > h * 0.75) {
              meteor = null;
              nextMeteorAt = now + 6000 + Math.random() * 9000;
            }
          }
        }

        // Moon (same spot as the daytime sun — the scenes stay in sync)
        const moonX = w * 0.78;
        const moonY = h * 0.2;
        nebula(moonX, moonY, Math.max(w, h) * 0.3, "hsla(210, 60%, 80%, 0.1)");
        ctx!.beginPath();
        ctx!.arc(moonX, moonY, 26, 0, Math.PI * 2);
        ctx!.fillStyle = "hsla(48, 45%, 88%, 0.95)";
        ctx!.fill();
        // crescent shading
        ctx!.beginPath();
        ctx!.arc(moonX - 9, moonY - 4, 23, 0, Math.PI * 2);
        ctx!.fillStyle = "hsla(220, 65%, 7%, 0.55)";
        ctx!.fill();
        // v6.02 — celestial reaction: double wink + rising heart (moonlight tones)
        if (reaction && reaction.kind === "celestial") {
          const pulse = Math.max(0, Math.sin(rProg * Math.PI * 4)) * (1 - rProg * 0.4);
          if (pulse > 0.01) {
            ctx!.beginPath();
            ctx!.arc(moonX, moonY, 32, 0, Math.PI * 2);
            ctx!.fillStyle = `hsla(210, 90%, 94%, ${0.55 * pulse})`;
            ctx!.fill();
          }
          drawHeart(moonX + 26, moonY - 36 - rProg * 20, 17, `hsla(208, 85%, 88%, ${0.95 * (1 - rProg)})`);
        }
      } else {
        const bg = ctx!.createLinearGradient(0, 0, 0, h);
        bg.addColorStop(0, "hsl(40, 60%, 96%)");
        bg.addColorStop(0.5, "hsl(37, 65%, 91%)");
        bg.addColorStop(1, "hsl(32, 60%, 86%)");
        ctx!.fillStyle = bg;
        ctx!.fillRect(0, 0, w, h);

        const sunX = w * 0.78;
        const sunY = h * 0.2;
        nebula(sunX, sunY, Math.max(w, h) * 0.38, "hsla(43, 90%, 72%, 0.28)");
        ctx!.beginPath();
        ctx!.arc(sunX, sunY, 34, 0, Math.PI * 2);
        ctx!.fillStyle = "hsla(44, 95%, 78%, 0.85)";
        ctx!.fill();
        // v6.02 — celestial reaction: double wink + rising heart (warm gold)
        if (reaction && reaction.kind === "celestial") {
          const pulse = Math.max(0, Math.sin(rProg * Math.PI * 4)) * (1 - rProg * 0.4);
          if (pulse > 0.01) {
            ctx!.beginPath();
            ctx!.arc(sunX, sunY, 41, 0, Math.PI * 2);
            ctx!.fillStyle = `hsla(46, 100%, 96%, ${0.6 * pulse})`;
            ctx!.fill();
          }
          drawHeart(sunX + 30, sunY - 36 - rProg * 20, 17, `hsla(38, 78%, 46%, ${0.95 * (1 - rProg)})`);
        }

        nebula(w * (0.25 + 0.06 * Math.sin(t * 0.03)), h * 0.55, Math.max(w, h) * 0.4, "hsla(35, 70%, 80%, 0.16)");
      }

      // ----- Dunes (same shapes; theme-lit) -----
      const duneA = dark ? "hsla(219, 45%, 13%, 0.92)" : "hsla(36, 42%, 82%, 0.9)";
      const duneB = dark ? "hsla(217, 48%, 10%, 0.94)" : "hsla(33, 48%, 74%, 0.92)";
      const duneC = dark ? "hsla(215, 52%, 7%, 0.96)" : "hsla(30, 52%, 66%, 0.95)";
      drawDuneLayer(h * 0.62, h * 0.035, 2.2, drift * 0.008 + 1.2, duneA);
      drawDuneLayer(h * 0.72, h * 0.05, 1.7, drift * 0.014 + 3.6, duneB);

      // ----- Caravan: camels + people, one team moving forward (right to left) -----
      const silhouette = dark ? "hsla(218, 40%, 3%, 0.85)" : "hsla(26, 45%, 22%, 0.5)";
      const silShadow = dark ? "hsla(218, 60%, 2%, 0.35)" : "hsla(26, 50%, 25%, 0.14)";
      const span = w + 640;
      const caravanX = reduced ? w * 0.58 : w + 300 - ((t * 14) % span);
      for (let i = 0; i < MEMBERS.length; i++) {
        const m = MEMBERS[i];
        const cx = caravanX + m.dx;
        if (cx < -90 || cx > w + 90) continue;
        const gy = duneY(cx, h * 0.72, h * 0.05, 1.7, drift * 0.014 + 3.6);
        // v6.01 — clicked member says hi: a light hop, nothing more
        let dy = 0;
        if (reaction && reaction.kind === "member" && reaction.index === i) {
          dy = -Math.sin(Math.PI * rProg) * m.s * 0.35;
        }
        if (m.kind === "camel") drawCamel(cx, gy + 2 + dy, m.s, reduced ? 0 : t + i * 1.3, silhouette, silShadow);
        else drawHuman(cx, gy + 2 + dy, m.s, reduced ? 0.4 : t + i * 1.1, silhouette, silShadow);
        if (dy < -1) {
          // a tiny greeting sparkle above the head while hopping
          const sy = gy - m.s * 1.25 + dy;
          ctx!.beginPath();
          ctx!.arc(cx, sy, 1.6, 0, Math.PI * 2);
          ctx!.fillStyle = `hsla(43, 90%, 70%, ${0.8 * Math.sin(Math.PI * rProg)})`;
          ctx!.fill();
        }
      }

      // ----- Foreground dune -----
      drawDuneLayer(h * 0.84, h * 0.06, 1.3, drift * 0.022 + 5.1, duneC);

      // ----- Oasis (left foreground): pool + palms, identical spot both themes -----
      const { ox, oy, poolW, poolH, palms } = palmSpots(drift);
      // water
      const water = ctx!.createLinearGradient(ox - poolW, oy, ox + poolW, oy);
      if (dark) {
        water.addColorStop(0, "hsla(210, 60%, 16%, 0.9)");
        water.addColorStop(0.5, "hsla(205, 65%, 26%, 0.9)");
        water.addColorStop(1, "hsla(210, 60%, 14%, 0.9)");
      } else {
        water.addColorStop(0, "hsla(195, 60%, 52%, 0.75)");
        water.addColorStop(0.5, "hsla(190, 70%, 62%, 0.8)");
        water.addColorStop(1, "hsla(197, 60%, 48%, 0.75)");
      }
      ctx!.beginPath();
      ctx!.ellipse(ox, oy, poolW, poolH, 0, 0, Math.PI * 2);
      ctx!.fillStyle = water;
      ctx!.fill();
      // glint — sun sparkle by day, moon streak by night
      const glintA = reduced ? 0.5 : 0.35 + 0.3 * Math.sin(t * 1.8);
      ctx!.beginPath();
      ctx!.ellipse(ox + poolW * 0.3, oy - poolH * 0.15, poolW * 0.32, poolH * 0.18, 0.1, 0, Math.PI * 2);
      ctx!.fillStyle = dark ? `hsla(48, 60%, 80%, ${glintA * 0.5})` : `hsla(45, 95%, 88%, ${glintA})`;
      ctx!.fill();
      // reeds at the banks
      ctx!.strokeStyle = dark ? "hsla(160, 25%, 12%, 0.9)" : "hsla(140, 30%, 30%, 0.55)";
      ctx!.lineWidth = 1;
      for (let i = 0; i < 7; i++) {
        const rx = ox - poolW * 0.9 + i * poolW * 0.09;
        const sway = reduced ? 0 : Math.sin(t * 1.2 + i) * 2;
        ctx!.beginPath();
        ctx!.moveTo(rx, oy + poolH * 0.4);
        ctx!.quadraticCurveTo(rx + sway, oy - poolH * 0.6, rx + sway * 1.6, oy - poolH * 1.6);
        ctx!.stroke();
      }
      // palms
      const trunkC = dark ? "hsla(220, 35%, 6%, 0.95)" : "hsla(26, 40%, 26%, 0.75)";
      const frondC = dark ? "hsla(200, 30%, 10%, 0.95)" : "hsla(140, 32%, 28%, 0.7)";
      const palmT = reduced ? 0.5 : t;
      for (let i = 0; i < palms.length; i++) {
        const p = palms[i];
        // v6.01 — clicked palm rustles: a brief extra sway that settles again
        const rustle =
          reaction && reaction.kind === "palm" && reaction.index === i
            ? Math.sin(rProg * Math.PI * 4) * 1.6 * (1 - rProg)
            : 0;
        drawPalm(p.x, p.y, p.s, palmT + p.phase + rustle, p.lean, trunkC, frondC);
      }

      // ----- Life: sand + butterflies by day, fireflies by night -----
      if (dark) {
        // fireflies wandering near the oasis
        for (let i = 0; i < fireflies.length; i++) {
          const f = fireflies[i];
          const fx = ox + Math.cos((reduced ? 0.5 : t) * 0.5 * f.v + f.ph * 4) * poolW * (0.6 + f.x);
          const fy = oy - poolH * 1.2 - f.y * h * 0.08 + Math.sin((reduced ? 0.5 : t) * 0.9 * f.v + f.ph) * 10;
          const pulse = reduced ? 0.7 : Math.max(0, Math.sin(t * (1.2 + f.v) + f.ph * 5));
          if (pulse < 0.08) continue;
          ctx!.beginPath();
          ctx!.arc(fx, fy, 1.3, 0, Math.PI * 2);
          ctx!.fillStyle = `hsla(65, 95%, 72%, ${0.75 * pulse})`;
          ctx!.fill();
          ctx!.beginPath();
          ctx!.arc(fx, fy, 3.6, 0, Math.PI * 2);
          ctx!.fillStyle = `hsla(65, 95%, 68%, ${0.18 * pulse})`;
          ctx!.fill();
        }
      } else {
        // wind-blown sand grains
        for (const g of grains) {
          const gx = ((g.x + (reduced ? 0 : t * 0.02 * g.v)) % 1) * w;
          const gy = (0.4 + 0.6 * g.y) * h + (reduced ? 0 : Math.sin(t * 1.4 + g.ph) * 5);
          const a = g.a * (reduced ? 1 : 0.6 + 0.4 * Math.sin(t * 2 + g.ph));
          ctx!.beginPath();
          ctx!.ellipse(gx, gy, g.r * 2.2, g.r * 0.75, 0, 0, Math.PI * 2);
          ctx!.fillStyle = `hsla(33, 55%, 48%, ${Math.max(0.04, a)})`;
          ctx!.fill();
        }
        // butterflies fluttering around the oasis palms
        for (let i = 0; i < butterflies.length; i++) {
          const b = butterflies[i];
          const bt = reduced ? 0.5 : t;
          const bx = ox + Math.cos(bt * 0.4 * b.v + b.ph * 3) * poolW * (0.7 + b.x * 0.8);
          const by = oy - poolH * 1.6 - b.y * h * 0.07 + Math.sin(bt * 0.8 * b.v + b.ph) * 12;
          const flap = reduced ? 0.6 : Math.abs(Math.sin(bt * 9 + b.ph * 6));
          const bs = 2.6 + b.r;
          const hueB = i % 2 ? "hsla(28, 85%, 55%," : "hsla(43, 90%, 55%,";
          ctx!.fillStyle = `${hueB} 0.7)`;
          // two wings, flapping (width shrinks with flap)
          ctx!.beginPath();
          ctx!.ellipse(bx - bs * 0.5 * flap, by, bs * 0.7 * flap, bs * 0.5, -0.4, 0, Math.PI * 2);
          ctx!.ellipse(bx + bs * 0.5 * flap, by, bs * 0.7 * flap, bs * 0.5, 0.4, 0, Math.PI * 2);
          ctx!.fill();
        }
      }

      // ----- v6.01: star / twinkle reaction — a soft expanding ring -----
      if (reaction && (reaction.kind === "star" || reaction.kind === "twinkle")) {
        const a = 0.65 * (1 - rProg);
        ctx!.beginPath();
        ctx!.arc(reaction.x, reaction.y, 3 + rProg * 24, 0, Math.PI * 2);
        ctx!.strokeStyle = `hsla(48, 90%, 76%, ${a})`;
        ctx!.lineWidth = 1.4;
        ctx!.stroke();
        ctx!.beginPath();
        ctx!.arc(reaction.x, reaction.y, 1.8, 0, Math.PI * 2);
        ctx!.fillStyle = `hsla(48, 95%, 82%, ${a})`;
        ctx!.fill();
      }
    }

    // v6.01 — background click handler: only fires on clicks that land on
    // non-interactive page chrome (never on buttons, links, cards, dialogs).
    function onBgClick(e: MouseEvent) {
      if (reaction) return; // one reaction at a time
      const el = e.target as Element | null;
      if (!el || !(el instanceof Element)) return;
      if (el.closest('a,button,input,textarea,select,label,svg,video,[role],[tabindex],[data-testid],[data-state]')) return;
      const px = e.clientX;
      const py = e.clientY;
      const now = performance.now();
      if (reduced) {
        // reduced motion — one static frame: a heart on the sun/moon, else a quiet twinkle
        const cdr = Math.hypot(px - w * 0.78, py - h * 0.2);
        reaction =
          cdr < 64
            ? { kind: "celestial", index: 0, start: now - 360, x: w * 0.78, y: h * 0.2 }
            : { kind: "twinkle", index: 0, start: now - 360, x: px, y: py };
        raf = requestAnimationFrame(frame);
        window.setTimeout(() => {
          reaction = null;
          raf = requestAnimationFrame(frame);
        }, 1200);
        return;
      }
      const t = now / 1000;
      const drift = t;
      let best: Reaction | null = null;
      let bestD = 60; // px pick radius
      // v6.02 — sun (day) / moon (night): both live at the same spot
      {
        const cd = Math.hypot(px - w * 0.78, py - h * 0.2);
        if (cd < 64) {
          bestD = cd;
          best = { kind: "celestial", index: 0, start: now, x: w * 0.78, y: h * 0.2 };
        }
      }
      // caravan members
      const span = w + 640;
      const caravanX = w + 300 - ((t * 14) % span);
      for (let i = 0; i < MEMBERS.length; i++) {
        const m = MEMBERS[i];
        const cx = caravanX + m.dx;
        if (cx < -90 || cx > w + 90) continue;
        const gy = duneY(cx, h * 0.72, h * 0.05, 1.7, drift * 0.014 + 3.6);
        const d = Math.hypot(px - cx, py - (gy - m.s * 0.5));
        if (d < bestD) {
          bestD = d;
          best = { kind: "member", index: i, start: now, x: cx, y: gy };
        }
      }
      // oasis palms (crowns)
      const geom = palmSpots(drift);
      for (let i = 0; i < geom.palms.length; i++) {
        const p = geom.palms[i];
        const d = Math.hypot(px - (p.x + p.lean * p.s * 0.34), py - (p.y - p.s * 0.8));
        if (d < bestD) {
          bestD = d;
          best = { kind: "palm", index: i, start: now, x: p.x, y: p.y };
        }
      }
      // stars (night sky only)
      if (document.documentElement.classList.contains("dark")) {
        let starD = Math.min(bestD, 36);
        for (let i = 0; i < stars.length; i++) {
          const s = stars[i];
          const sx = ((s.x + t * s.drift * 0.01) % 1) * w;
          const sy = s.y * h * 0.72;
          const d = Math.hypot(px - sx, py - sy);
          if (d < starD) {
            starD = d;
            best = { kind: "star", index: i, start: now, x: sx, y: sy };
          }
        }
      }
      if (best) reaction = best;
    }
    window.addEventListener("click", onBgClick);

    function frame(now: number) {
      const dark = document.documentElement.classList.contains("dark");
      drawScene(now, dark);
      if (!reduced) raf = requestAnimationFrame(frame);
    }

    // v6.01 — defer the first paint of the scene until the browser is idle
    // (300ms cap) so the canvas never competes with the app's initial render.
    let idleId = 0;
    let idleTimer = 0;
    const startScene = () => {
      raf = requestAnimationFrame(frame);
    };
    if (typeof (window as any).requestIdleCallback === "function") {
      idleId = (window as any).requestIdleCallback(startScene, { timeout: 300 });
    } else {
      idleTimer = window.setTimeout(startScene, 120);
    }
    // Reduced motion: draw exactly one static frame (the rAF above runs once and stops),
    // and redraw when the theme class flips so the scene matches the mode.
    const observer = new MutationObserver(() => {
      if (reduced) raf = requestAnimationFrame(frame);
    });
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });

    return () => {
      cancelAnimationFrame(raf);
      if (idleId && typeof (window as any).cancelIdleCallback === "function") (window as any).cancelIdleCallback(idleId);
      if (idleTimer) window.clearTimeout(idleTimer);
      observer.disconnect();
      window.removeEventListener("resize", resize);
      window.removeEventListener("click", onBgClick);
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

// ---------------- v6.0: post-login interstellar warp ----------------
// A short (~1.6s) full-screen zoom of star streaks radiating from the centre —
// travelling into the system. Rendered once after an interactive sign-in.
// v6.0: the login page unmounts the moment sign-in succeeds (login-first flow
// in App.tsx swaps the tree), so the warp is requested via a module-level flag
// and played by whichever Layout mounts next.
let pendingWarp = false;
export function requestWarp() {
  pendingWarp = true;
}
export function cancelWarp() {
  pendingWarp = false;
}
export function consumePendingWarp() {
  const v = pendingWarp;
  pendingWarp = false;
  return v;
}

export function WarpOverlay({ onDone }: { onDone: () => void }) {
  const ref = useRef<HTMLCanvasElement | null>(null);
  const doneRef = useRef(onDone);
  doneRef.current = onDone;

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      doneRef.current();
      return;
    }

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = window.innerWidth;
    const h = window.innerHeight;
    canvas.width = Math.floor(w * dpr);
    canvas.height = Math.floor(h * dpr);
    canvas.style.width = `${w}px`;
    canvas.style.height = `${h}px`;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    const cx = w / 2;
    const cy = h / 2;
    const maxR = Math.hypot(cx, cy);
    const DURATION = 1600;
    const streaks = Array.from({ length: 220 }, () => ({
      ang: Math.random() * Math.PI * 2,
      d: 0.04 + Math.random() * 0.96, // normalized start distance
      v: 0.6 + Math.random() * 1.6,
      hue: Math.random() < 0.12 ? 43 : Math.random() < 0.24 ? 193 : 210,
    }));

    let raf = 0;
    const start = performance.now();

    function frame(now: number) {
      const p = Math.min(1, (now - start) / DURATION);
      const ease = p * p * (3 - 2 * p); // smoothstep
      const speed = 0.02 + ease * 0.22;

      // v6.01 — gradient translucent veil: deep navy at the edges, nearly
      // clear at the centre, easing away from mid-animation so the portal
      // fades into view beneath the streaks instead of a hard reveal.
      const veilBase = (p < 0.5 ? 0.55 : 0.55 * (1 - (p - 0.5) / 0.5)) || 0;
      ctx!.clearRect(0, 0, w, h);
      ctx!.globalCompositeOperation = "source-over";
      const veil = ctx!.createRadialGradient(cx, cy, 0, cx, cy, maxR);
      veil.addColorStop(0, `rgba(4, 8, 20, ${Math.max(0, veilBase * 0.22)})`);
      veil.addColorStop(0.55, `rgba(4, 8, 20, ${Math.max(0, veilBase * 0.7)})`);
      veil.addColorStop(1, `rgba(6, 12, 28, ${Math.max(0, veilBase)})`);
      ctx!.fillStyle = veil;
      ctx!.fillRect(0, 0, w, h);

      for (const s of streaks) {
        s.d += speed * s.v * 0.06;
        if (s.d > 1.15) s.d -= 1.1;
        const r0 = s.d * maxR;
        const r1 = r0 + maxR * speed * s.v * 0.6;
        const a = Math.min(0.85, 0.15 + s.d * 0.8) * (p < 0.8 ? 1 : 1 - (p - 0.8) / 0.2);
        const x0 = cx + Math.cos(s.ang) * r0;
        const y0 = cy + Math.sin(s.ang) * r0;
        const x1 = cx + Math.cos(s.ang) * r1;
        const y1 = cy + Math.sin(s.ang) * r1;
        ctx!.strokeStyle = `hsla(${s.hue}, 70%, ${65 + s.d * 25}%, ${Math.max(0, a)})`;
        ctx!.lineWidth = 0.8 + s.d * 1.6;
        ctx!.beginPath();
        ctx!.moveTo(x0, y0);
        ctx!.lineTo(x1, y1);
        ctx!.stroke();
      }

      // centre glow grows as we "arrive"
      const glow = ctx!.createRadialGradient(cx, cy, 0, cx, cy, maxR * (0.1 + ease * 0.5));
      glow.addColorStop(0, `hsla(200, 80%, 80%, ${0.05 + ease * 0.25})`);
      glow.addColorStop(1, "transparent");
      ctx!.fillStyle = glow;
      ctx!.fillRect(0, 0, w, h);

      if (p < 1) raf = requestAnimationFrame(frame);
      else doneRef.current();
    }
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, []);

  return (
    <canvas
      ref={ref}
      aria-hidden="true"
      data-testid="canvas-warp"
      className="pointer-events-none fixed inset-0 z-[100]"
    />
  );
}
