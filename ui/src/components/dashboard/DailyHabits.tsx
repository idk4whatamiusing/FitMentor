import { Droplet, Beef, Plus } from "lucide-react";
import { ProgressBar, SectionLabel } from "@/components/editorial";
import { saveLog, ensureToday } from "@/utils/habits";
import type { DailyLog } from "@fitmentor/shared";

const WATER_TARGET = 8;

export function DailyHabits({
  log,
  onLogChange,
  proteinTarget = 100,
}: {
  log: DailyLog;
  onLogChange: () => void;
  proteinTarget?: number;
}) {
  function update(patch: Partial<DailyLog>) {
    saveLog({ ...ensureToday(), ...log, ...patch });
    onLogChange();
  }

  const waterPct = Math.min(100, Math.round((log.water / WATER_TARGET) * 100));
  const proteinPct = Math.min(100, Math.round((log.proteinG / proteinTarget) * 100));

  return (
    <div className="rounded-[1.75rem] border border-border bg-card p-6">
      <div className="flex items-center justify-between">
        <SectionLabel>Daily habits</SectionLabel>
        <span className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
          {Math.round((waterPct + proteinPct) / 2)}%
        </span>
      </div>

      <div className="mt-6 space-y-6">
        <div>
          <div className="flex items-baseline justify-between">
            <span className="flex items-center gap-2 text-sm font-medium">
              <Droplet className="h-4 w-4 text-orange" /> Water
            </span>
            <span className="text-sm tabular-nums text-muted-foreground">
              {log.water}
              <span className="text-xs"> / {WATER_TARGET}</span>
            </span>
          </div>
          <ProgressBar value={waterPct} className="mt-3" />
          <button
            type="button"
            onClick={() => update({ water: log.water + 1 })}
            className="mt-3 inline-flex items-center gap-1.5 rounded-full border border-border px-3 py-1.5 text-xs font-medium transition-colors hover:border-foreground/30"
          >
            <Plus className="h-3 w-3" /> One glass
          </button>
        </div>

        <div className="border-t border-border pt-6">
          <div className="flex items-baseline justify-between">
            <span className="flex items-center gap-2 text-sm font-medium">
              <Beef className="h-4 w-4 text-orange" /> Protein
            </span>
            <span className="text-sm tabular-nums text-muted-foreground">
              {log.proteinG}
              <span className="text-xs"> / {proteinTarget} g</span>
            </span>
          </div>
          <ProgressBar value={proteinPct} tone="ink" className="mt-3" />
          <button
            type="button"
            onClick={() => update({ proteinG: log.proteinG + 20 })}
            className="mt-3 inline-flex items-center gap-1.5 rounded-full border border-border px-3 py-1.5 text-xs font-medium transition-colors hover:border-foreground/30"
          >
            <Plus className="h-3 w-3" /> 20 g protein
          </button>
        </div>
      </div>
    </div>
  );
}
