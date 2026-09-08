const KEY = "fitmentor.theme.v1";

export type { Theme } from "@fitmentor/shared";
import type { Theme } from "@fitmentor/shared";

export function loadTheme(): Theme {
  if (typeof window === "undefined") return "dark";
  const stored = localStorage.getItem(KEY) as Theme | null;
  if (stored === "light" || stored === "dark") return stored;
  return window.matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark";
}

export function saveTheme(t: Theme) {
  localStorage.setItem(KEY, t);
  document.documentElement.classList.toggle("dark", t === "dark");
}
