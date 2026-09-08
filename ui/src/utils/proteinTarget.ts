const KEY = "fitmentor.protein-target.v1";

export function loadCustomProteinTarget(): number | null {
  if (typeof window === "undefined" || typeof localStorage === "undefined") return null;
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? Number(raw) : null;
  } catch {
    return null;
  }
}

export function saveCustomProteinTarget(value: number) {
  if (typeof window === "undefined" || typeof localStorage === "undefined") return;
  localStorage.setItem(KEY, String(value));
  window.dispatchEvent(new Event("fitmentor:protein-target"));
}
