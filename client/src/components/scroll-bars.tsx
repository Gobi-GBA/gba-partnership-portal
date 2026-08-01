/**
 * v7.0 / v7.02 — scroll awareness
 *
 * ScrollProgressBar: thin gradient bar at the very top showing scroll progress,
 * with a section-label pill that appears briefly on route change.
 * (The contextual bottom action bar was removed in v7.02 — it only duplicated
 * the top nav and added no value; the sticky header now collapses on scroll
 * instead, which is the more useful behaviour.)
 */

import { useEffect, useState } from "react";
import { motion, AnimatePresence, useScroll, useSpring, useTransform } from "framer-motion";
import { useLocation } from "wouter";

/* ---------------- Top scroll progress bar ---------------- */

const SECTION_LABELS: Record<string, { en: string; cn: string }> = {
  "/": { en: "Directory", cn: "合作目录" },
  "/submit": { en: "Submit", cn: "提交" },
  "/advisors": { en: "Advisors", cn: "顾问" },
  "/updates": { en: "Updates", cn: "更新" },
  "/admin": { en: "Admin", cn: "管理" },
  "/rd": { en: "R&D Planner", cn: "研发规划" },
  "/network": { en: "Network", cn: "网络图" },
  "/scoreboard": { en: "Scoreboard", cn: "积分榜" },
  "/advisor-approval": { en: "Approval", cn: "审批" },
};

export function ScrollProgressBar() {
  const { scrollYProgress } = useScroll();
  const scaleX = useSpring(scrollYProgress, {
    stiffness: 120,
    damping: 30,
    restDelta: 0.001,
  });
  const width = useTransform(scaleX, [0, 1], ["0%", "100%"]);
  const [location] = useLocation();
  const [sectionLabel, setSectionLabel] = useState("");
  const [visible, setVisible] = useState(false);

  // Find the matching section label
  useEffect(() => {
    const matchKey = Object.keys(SECTION_LABELS).find((key) =>
      location.startsWith(key)
    );
    if (matchKey) {
      setSectionLabel(SECTION_LABELS[matchKey].en);
    } else {
      setSectionLabel("");
    }
  }, [location]);

  // Show the label briefly when the route changes, then fade
  useEffect(() => {
    if (!sectionLabel) return;
    setVisible(true);
    const timer = setTimeout(() => setVisible(false), 2000);
    return () => clearTimeout(timer);
  }, [sectionLabel]);

  return (
    <>
      {/* The progress bar itself — sits at the very top, above the header */}
      <div className="fixed top-0 left-0 right-0 z-[60] h-0.5 bg-transparent pointer-events-none">
        <motion.div
          className="h-full origin-left"
          style={{
            width,
            background: "linear-gradient(90deg, hsl(193 52% 53%), hsl(42 63% 55%))",
          }}
        />
      </div>

      {/* Floating section label — appears briefly on route change */}
      <AnimatePresence>
        {visible && sectionLabel && (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 200, ease: "easeOut" }}
            className="fixed top-20 left-1/2 -translate-x-1/2 z-[55] pointer-events-none"
          >
            <div className="glass-bar rounded-full px-4 py-1.5 text-xs font-medium text-foreground/80">
              {sectionLabel}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
