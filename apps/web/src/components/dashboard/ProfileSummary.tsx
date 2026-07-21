import { Link } from "@tanstack/react-router";
import { ArrowRight, Flame } from "lucide-react";
import { loadProfile, calcTargets, GOAL_LABEL } from "@/utils/profile";
import type { Profile } from "@/utils/profile";

// ponytail: reads profile directly — no prop drilling, same pattern as dashboard.tsx
export function ProfileSummary({ profile }: { profile: Profile }) {
  const t = calcTargets(profile);

  return (
    <div className="rounded-2xl border border-border/60 bg-card p-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-hero text-sm font-bold text-primary-foreground shadow-glow">
            {profile.name.charAt(0).toUpperCase()}
          </div>
          <div>
            <p className="text-sm font-semibold">{profile.name}</p>
            <p className="text-[11px] text-muted-foreground">
              {GOAL_LABEL[profile.goal]} • {profile.experience}
            </p>
          </div>
        </div>
        <Link to="/profile" className="flex items-center gap-1 text-xs text-primary hover:underline">
          Edit <ArrowRight className="h-3 w-3" />
        </Link>
      </div>

      <div className="mt-3 grid grid-cols-4 gap-2">
        <MacroBadge label="Cal" value={`${t.calories}`} unit="kcal" />
        <MacroBadge label="Prot" value={`${t.protein}`} unit="g" highlight />
        <MacroBadge label="Carbs" value={`${t.carbs}`} unit="g" />
        <MacroBadge label="Fat" value={`${t.fat}`} unit="g" />
      </div>
    </div>
  );
}

function MacroBadge({ label, value, unit, highlight }: { label: string; value: string; unit: string; highlight?: boolean }) {
  return (
    <div className={`rounded-xl p-2 text-center ${highlight ? "bg-primary/15" : "bg-secondary/60"}`}>
      <p className="text-[10px] text-muted-foreground">{label}</p>
      <p className={`text-sm font-bold leading-tight ${highlight ? "text-primary" : ""}`}>{value}</p>
      <p className="text-[9px] text-muted-foreground">{unit}</p>
    </div>
  );
}
