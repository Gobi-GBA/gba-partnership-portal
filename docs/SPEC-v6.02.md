# Portal Upgrade — Development Spec (v6.02)

Patch release. Two bugs reported against v6.01, each specified with root cause and acceptance criteria.

---

## Item 1 — Star map: clicking "Gobi Partners" must always reset the view

**Report.** "When I click Gobi Partners, no reset of views?" (screenshot: partner network graph, zoomed in on Macau/MIECF, gold central hub visible).

**Root cause.** The reset handler exists and works — but only for a surgically still click. Both star maps (partner network graph and advisor map) attach a d3-drag behavior to every node with the library default `clickDistance = 0`. Any mouse movement between press and release — even one pixel of natural hand jitter, common on trackpads and high-DPI mice — reclassifies the gesture as a drag, and d3 suppresses the click event entirely. The reset never fires. The same fragility silently affects every node click: opening partner details, advisor profiles, and region toggles.

**Fix.**
- Set `clickDistance(8)` on the drag behavior of both graphs (partner network + advisor map): presses that travel ≤ 8 px still count as clicks; real drags (> 8 px) behave exactly as before.
- Set `clickDistance(8)` on both zoom behaviors for the same reason (background pan vs. background click).
- No other behavioral change: dragging nodes, panning, and pinch/wheel zoom are untouched.

**Acceptance.**
- Zoom in on the partner map, press the Gobi hub, wiggle the pointer a few pixels while pressed, release → view animates back to the default framing (300 ms).
- Same on the advisor map hub.
- Node drags beyond 8 px still drag; partner/advisor/region node clicks still open their targets.

## Item 2 — Background play: sun and moon react with a blink-blink and a heart

**Report.** "Background interaction missed the moon and sun. Maybe (+ heart) effect, blink blink one."

**Root cause.** The v6.01 click hit-test only covers caravan members, palm crowns, and night stars. The sun (day) and moon (night) — both drawn at (0.78 w, 0.20 h) — were never added as click targets.

**Fix.** Extend the one-shot reaction system in `galaxy-bg.tsx`:

- **Hit test.** New reaction kind `celestial`. Pick radius 64 px around the sun/moon centre; active in both themes (sun in light mode, moon in dark mode). Same exclusion rules as all reactions (ignores clicks on links, buttons, inputs, dialogs, SVGs).
- **Blink-blink.** For the 1.2 s reaction window the celestial body pulses its glow twice — brightness follows two sine pulses (peaks near 12% and 62% of the timeline), reading as a friendly double wink. Implemented as two extra translucent arcs over the existing sun/moon draw; no new layers, no allocation in the render loop.
- **Heart.** A small heart (canvas bézier path, ~12 px) rises about 34 px from just above the body and fades out over the same 1.2 s. Warm gold by day (matches the sun), pale moonlight blue by night.
- **Same discipline as v6.01 reactions:** one reaction at a time, self-expiring, zero cost when idle, no timers in the render loop.
- **Reduced motion.** A single static heart frame near the body, cleared after 1.2 s — no pulsing.

**Acceptance.**
- Light mode: click on/near the sun → glow winks twice, gold heart floats up and fades.
- Dark mode: click on/near the moon → same reaction in moonlight tones.
- Clicking the sun through an open dialog or on a button does nothing.
- Caravan, palm, and star reactions unchanged; idle CPU unchanged.

## Non-goals

- No changes to graph layout, physics, tooltips, or zoom-button behavior.
- No new reaction targets beyond sun/moon.
- No server or schema changes.

## Release

Version bump to 6.02 with bilingual changelog (two entries). Standard release train: secret scan, storage-literal scan on built assets, teammate-commit check, push to org repo + private mirror, Vercel production verification, preview redeploy.
