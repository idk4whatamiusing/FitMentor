import { Droplet, Beef, Dumbbell } from "lucide-react";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import { ensureToday, saveLog } from "@/utils/habits";
import type { DailyLog } from "@fitmentor/shared";

// ponytail: water target hardcoded — could come from profile, but 8 glasses is universal enough
const WATER_TARGET = 8;

export function DailyHabits({ log, onLogChange }: { log: DailyLog; onLogChange: () => void }) {
  function update(patch: Partial<DailyLog>) {
    saveLog({ ...log, ...patch });
    onLogChange();
  }

  const waterPct = Math.min(100, Math.round((log.water / WATER_TARGET) * 100));

  return (
    <div className="rounded-2xl border border-border/60 bg-card p-4">
      <p className="text-xs uppercase tracking-widest text-muted-foreground">Daily Habits</p>

      {/* Water */}
      <div className="mt-3">
        <div className="flex items-center justify-between">
          <span className="flex items-center gap-1.5 text-sm font-medium">
            <Droplet className="h-4 w-4 text-blue-400" /> Water
          </span>
          <span className="text-xs text-muted-foreground">{log.water}/{WATER_TARGET} glasses</span>
        </div>
        <Progress value={waterPct} className="mt-1.5 h-1.5 bg-blue-400/20 [&_[data-slot=progress-indicator]]:bg-blue-400" />
        <Button
          variant="outline"
          size="sm"
          className="mt-2 h-7 text-xs"
          onClick={() => update({ water: log.water + 1 })}
        >
          +1 glass
        </Button>
      </div>

      {/* Protein */}
      <div className="mt-4">
        <div className="flex items-center justify-between">
          <span className="flex items-center gap-1.5 text-sm font-medium">
            <Beef className="h-4 w-4 text-orange-400" /> Protein
          </span>
          <span className="text-xs text-muted-foreground">{log.proteinG}g</span>
        </div>
        <Progress value={Math.min(100, Math.round((log.proteinG / 100) * 100))} className="mt-1.5 h-1.5 bg-orange-400/20 [&_[data-slot=progress-indicator]]:bg-orange-400" />
        <Button
          variant="outline"
          size="sm"
          className="mt-2 h-7 text-xs"
          onClick={() => update({ proteinG: log.proteinG + 20 })}
        >
          +20g protein
        </Button>
      </div>

      {/* Workout */}
      <div className="mt-4 flex items-center justify-between">
        <span className="flex items-center gap-1.5 text-sm font-medium">
          <Dumbbell className="h-4 w-4 text-primary" /> Workout
        </span>
        <button
          onClick={() => update({ workoutDone: !log.workoutDone })}
          className={`relative h-6 w-11 rounded-full transition-colors ${log.workoutDone ? "bg-primary" : "bg-muted"}`}
        >
          <span
            className={`absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ${log.workoutDone ? "translate-x-5" : ""}`}
          />
        </button>
      </div>
    </div>
  );
}
