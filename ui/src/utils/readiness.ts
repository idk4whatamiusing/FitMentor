import type { DailyLog } from "@fitmentor/shared";

export const WATER_TARGET = 8;
export const SLEEP_TARGET = 8;
export const STEP_TARGET = 8000;

export type ReadinessBand = "prime" | "steady" | "recover";

export type Readiness = {
  score: number | null;
  band: ReadinessBand;
  verdict: "Push" | "Train" | "Recover";
  parts: {
    sleep: number | null;
    hydration: number | null;
    protein: number | null;
    steps: number | null;
    recovery: number | null;
  };
};

const clamp = (value: number) => Math.max(0, Math.min(1, value));

function pct(value: number, target: number): number {
  return target > 0 ? clamp(value / target) : 0;
}

/**
 * Readiness is derived from the logs we actually have — never inferred
 * biometrics. Missing inputs are excluded, not treated as failures.
 */
export function computeReadiness(
  log: DailyLog,
  {
    proteinTarget,
    trainedYesterday,
  }: {
    proteinTarget: number;
    trainedYesterday: boolean | null;
  },
): Readiness {
  const parts = {
    sleep: log.sleep > 0 ? pct(log.sleep, SLEEP_TARGET) : null,
    hydration: log.water > 0 ? pct(log.water, WATER_TARGET) : null,
    protein:
      log.proteinG > 0 && proteinTarget > 0 ? pct(log.proteinG, proteinTarget) : null,
    steps: log.steps > 0 ? pct(log.steps, STEP_TARGET) : null,
    recovery: trainedYesterday === null ? null : trainedYesterday ? 0.5 : 1,
  };

  // Recovery is a modifier, not a score on its own. Without at least one
  // logged body signal today, show a dash rather than a fake 100.
  if (
    parts.sleep === null &&
    parts.hydration === null &&
    parts.protein === null &&
    parts.steps === null
  ) {
    return { score: null, band: "steady", verdict: "Train", parts };
  }

  const weights: Array<[number, number | null]> = [
    [35, parts.sleep],
    [20, parts.hydration],
    [20, parts.protein],
    [15, parts.steps],
    [10, parts.recovery],
  ];

  let earned = 0;
  let available = 0;
  for (const [weight, value] of weights) {
    if (value === null) continue;
    earned += weight * value;
    available += weight;
  }

  if (available === 0) {
    return {
      score: null,
      band: "steady",
      verdict: "Train",
      parts,
    };
  }

  const score = Math.round((earned / available) * 100);
  const band: ReadinessBand = score >= 80 ? "prime" : score >= 60 ? "steady" : "recover";

  return {
    score,
    band,
    verdict: band === "prime" ? "Push" : band === "steady" ? "Train" : "Recover",
    parts,
  };
}

export function readinessBandLabel(band: ReadinessBand): string {
  return band === "prime" ? "Prime" : band === "steady" ? "Steady" : "Recover";
}
