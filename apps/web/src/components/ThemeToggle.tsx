"use client";
import { Moon, Sun } from "lucide-react";
import { useEffect, useState } from "react";

export function useTheme(): ["dark" | "light", (t: "dark" | "light") => void] {
  const [theme, setThemeState] = useState<"dark" | "light">("dark");
  useEffect(() => {
    const read = () => setThemeState(document.documentElement.dataset.theme === "light" ? "light" : "dark");
    read();
    const obs = new MutationObserver(read);
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
    return () => obs.disconnect();
  }, []);
  const setTheme = (t: "dark" | "light") => {
    document.documentElement.dataset.theme = t;
    try { localStorage.setItem("pf-theme", t); } catch { /* storage unavailable */ }
    setThemeState(t);
  };
  return [theme, setTheme];
}

export function ThemeToggle({ className = "" }: { className?: string }) {
  const [theme, setTheme] = useTheme();
  const next = theme === "dark" ? "light" : "dark";
  return (
    <button type="button" onClick={() => setTheme(next)} aria-label={`Switch to ${next} theme`} title={`Switch to ${next} theme`}
      className={`pf-transition pf-press inline-flex h-9 w-9 items-center justify-center rounded-full text-muted hover:bg-surface-hover hover:text-fg ${className}`}>
      {theme === "dark" ? <Sun size={16} /> : <Moon size={16} />}
    </button>
  );
}
