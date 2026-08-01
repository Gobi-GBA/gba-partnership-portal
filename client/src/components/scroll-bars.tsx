/**
 * v7.0 — Perplexity-style scroll bars
 *
 * 1. ScrollProgressBar: thin top bar showing scroll position + section label
 * 2. ContextualActionBar: bottom floating glass bar with contextual actions
 *    that morph between sections. Collapses to a minimal pill when idle.
 */

import { useEffect, useRef, useState, type ReactNode } from "react";
import { motion, AnimatePresence, useScroll, useSpring, useTransform } from "framer-motion";
import { useLocation } from "wouter";
import { cn } from "@/lib/utils";

/* ---------------- 1. Top scroll progress bar ---------------- */

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

/* ---------------- 2. Bottom contextual action bar ---------------- */

export interface ActionBarAction {
  id: string;
  label: string;
  icon?: ReactNode;
  onClick: () => void;
  variant?: "default" | "accent" | "ghost";
}

interface ContextualActionBarProps {
  actions: ActionBarAction[];
  /** Optional summary text shown on the left (e.g., "12 partnerships") */
  summary?: string;
}

export function ContextualActionBar({ actions, summary }: ContextualActionBarProps) {
  const [idle, setIdle] = useState(false);
  const idleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Collapse to pill after 4 seconds of no interaction
  const resetIdle = () => {
    setIdle(false);
    if (idleTimer.current) clearTimeout(idleTimer.current);
    idleTimer.current = setTimeout(() => setIdle(true), 4000);
  };

  useEffect(() => {
    resetIdle();
    return () => {
      if (idleTimer.current) clearTimeout(idleTimer.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [actions]);

  // Don't render if there are no actions
  if (!actions || actions.length === 0) return null;

  return (
    <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-50 flex justify-center px-4 pointer-events-none">
      <motion.div
        layout
        initial={{ opacity: 0, y: 24 }}
        animate={{
          opacity: 1,
          y: 0,
          width: idle ? "auto" : "auto",
        }}
        exit={{ opacity: 0, y: 24 }}
        transition={{ type: "spring", stiffness: 300, damping: 30 }}
        className="glass-bar pointer-events-auto rounded-full shadow-lg"
        onMouseEnter={() => setIdle(false)}
        onMouseLeave={resetIdle}
        onClick={resetIdle}
      >
        <motion.div
          layout
          className="flex items-center gap-1.5 px-3 py-2"
          animate={{
            padding: idle ? "0.375rem 0.875rem" : "0.5rem 0.75rem",
          }}
          transition={{ type: "spring", stiffness: 300, damping: 30 }}
        >
          {/* Summary chip — only when expanded */}
          <AnimatePresence>
            {!idle && summary && (
              <motion.span
                initial={{ opacity: 0, width: 0 }}
                animate={{ opacity: 1, width: "auto" }}
                exit={{ opacity: 0, width: 0 }}
                transition={{ duration: 200 }}
                className="text-xs font-medium text-muted-foreground whitespace-nowrap px-1.5 hidden sm:inline-block"
              >
                {summary}
              </motion.span>
            )}
          </AnimatePresence>

          {/* Action buttons */}
          {actions.slice(0, idle ? 1 : 5).map((action) => (
            <motion.button
              key={action.id}
              layout
              whileTap={{ scale: 0.92 }}
              onClick={(e) => {
                e.stopPropagation();
                action.onClick();
                resetIdle();
              }}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition-colors",
                action.variant === "accent"
                  ? "bg-primary/15 text-primary hover:bg-primary/25"
                  : action.variant === "ghost"
                    ? "text-muted-foreground hover:text-foreground hover:bg-muted/50"
                    : "text-foreground hover:bg-muted/50",
              )}
            >
              {action.icon}
              <span className={cn(idle && "hidden sm:inline")}>
                {action.label}
              </span>
            </motion.button>
          ))}

          {/* Expand indicator when idle */}
          {idle && actions.length > 1 && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="flex items-center gap-0.5 px-1 text-muted-foreground/60"
            >
              {[0, 1, 2].map((i) => (
                <span
                  key={i}
                  className="h-1 w-1 rounded-full bg-current"
                  style={{ opacity: 1 - i * 0.3 }}
                />
              ))}
            </motion.div>
          )}
        </motion.div>
      </motion.div>
    </div>
  );
}
