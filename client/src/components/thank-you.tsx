// v6.01 — auto-fading thank-you notes. Contribution events (submissions,
// suggestions, feedback, advisor activity, photo uploads, profile saves)
// dispatch a window event; the host renders a right-hand side note that
// fades out by itself (~3.5s) — zero clicks, pointer-events pass through.
import { useEffect, useRef, useState } from "react";
import { Sparkles } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { useLang } from "@/lib/i18n";

const EVENT = "portal:thankyou";

/** Fire a thank-you note (safe to call anywhere, no-op without a host). */
export function thankYou() {
  window.dispatchEvent(new CustomEvent(EVENT));
}

// Rotating warm copy — {name} is replaced with the user's first name.
const NOTES: Array<{ en: string; cn: string }> = [
  { en: "Thank you, {name} — your contribution keeps the network growing.", cn: "谢谢你，{name} — 你的贡献让网络不断成长。" },
  { en: "Nicely done, {name}. The constellation just got brighter.", cn: "干得好，{name}，星图又亮了一点。" },
  { en: "Received with thanks, {name}.", cn: "已收到，谢谢你，{name}。" },
  { en: "Every record counts — thank you, {name}.", cn: "每一条记录都很重要 — 谢谢你，{name}。" },
  { en: "Appreciated, {name} — the team sees your work.", cn: "感谢你，{name} — 团队看得见你的付出。" },
];

let rotation = 0;

export function ThankYouHost() {
  const { user } = useAuth();
  const { lang } = useLang();
  const [note, setNote] = useState<string | null>(null);
  const [nonce, setNonce] = useState(0);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const userRef = useRef(user);
  userRef.current = user;
  const langRef = useRef(lang);
  langRef.current = lang;

  useEffect(() => {
    const onEvent = () => {
      const u = userRef.current;
      const firstName = (u?.name ?? "").trim().split(/\s+/)[0] || "friend";
      const pick = NOTES[rotation++ % NOTES.length];
      const text = (langRef.current === "cn" ? pick.cn : pick.en).replace("{name}", firstName);
      setNote(text);
      setNonce((n) => n + 1); // re-key to restart the fade animation
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => setNote(null), 3600);
    };
    window.addEventListener(EVENT, onEvent);
    return () => {
      window.removeEventListener(EVENT, onEvent);
      if (timer.current) clearTimeout(timer.current);
    };
  }, []);

  if (!note) return null;

  return (
    <div
      key={nonce}
      aria-live="polite"
      data-testid="toast-thankyou"
      className="pointer-events-none fixed right-4 top-20 z-[95] max-w-xs"
      style={{ animation: "thankyou-note 3.6s ease forwards" }}
    >
      <div className="flex items-start gap-2.5 rounded-lg border border-[hsl(43,55%,55%)]/35 bg-[hsl(214,68%,12%)]/90 px-4 py-3 shadow-lg backdrop-blur-sm">
        <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-[hsl(43,55%,60%)]" />
        <p className="text-sm leading-snug text-white/95">{note}</p>
      </div>
    </div>
  );
}
