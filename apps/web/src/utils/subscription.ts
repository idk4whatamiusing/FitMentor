const KEY = "fitmentor.subscription.v1";

export type { PlanTier, Subscription } from "@fitmentor/shared";
import type { PlanTier, Subscription } from "@fitmentor/shared";
import { syncSubscription } from "@/services/sync.server";

export function loadSubscription(): Subscription | null {
  if (typeof window === "undefined") return null;
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? "null");
  } catch {
    return null;
  }
}

export function saveSubscription(sub: Subscription) {
  localStorage.setItem(KEY, JSON.stringify(sub));
  window.dispatchEvent(new Event("fitmentor:subscription"));

  // Sync to API (fire-and-forget)
  syncSubscription({
    data: {
      tier: sub.tier,
      status: "active",
    },
  }).catch(() => {});
}

export function clearSubscription() {
  localStorage.removeItem(KEY);
  window.dispatchEvent(new Event("fitmentor:subscription"));
}

export function isPremium(): boolean {
  const sub = loadSubscription();
  if (!sub || sub.tier === "free") return false;
  return new Date(sub.expiryDate) > new Date();
}

export function getPlanName(tier: PlanTier): string {
  return tier === "pro" ? "Pro" : tier === "premium" ? "Premium" : "Free";
}
