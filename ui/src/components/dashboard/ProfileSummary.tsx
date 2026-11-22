import { Link } from "@tanstack/react-router";
import { ArrowUpRight } from "lucide-react";
import { calcTargets, GOAL_LABEL } from "@/utils/profile";
import type { Profile } from "@/utils/profile";

export function ProfileSummary({ profile }: { profile: Profile }) {
  const t = calcTargets(profile);

  return (
    <div className="rounded-[1.75rem] border border-border bg-card p-6">
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-ink font-wordmark text-sm text-orange dark:bg-cream dark:text-ink">
            {profile.name.charAt(0).toUpperCase()}
          </div>
          <div>
            <p className="text-sm font-semibold">{profile.name}</p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {GOAL_LABEL[profile.goal]} · {profile.experience}
            </p>
          </div>
        </div>
        <Link
          to="/profile"
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-border text-muted-foreground transition-colors hover:border-foreground/30 hover:text-foreground"
          aria-label="Edit profile"
        >
          <ArrowUpRight className="h-3.5 w-3.5" />
        </Link>
      </div>

      <div className="mt-6 grid grid-cols-4 gap-2 border-t border-border pt-5">
        {[
          { label: "Cal", value: t.calories, unit: "kcal", highlight: false },
          { label: "Prot", value: t.protein, unit: "g", highlight: true },
          { label: "Carbs", value: t.carbs, unit: "g", highlight: false },
          { label: "Fat", value: t.fat, unit: "g", highlight: false },
        ].map((macro) => (
          <div key={macro.label}>
            <p className="label-micro text-muted-foreground">{macro.label}</p>
            <p
              className={`mt-2 text-lg font-medium tabular-nums ${
                macro.highlight ? "text-orange" : ""
              }`}
            >
              {macro.value}
              <span className="ml-0.5 text-[10px] text-muted-foreground">{macro.unit}</span>
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}
