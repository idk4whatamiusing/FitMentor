import { createFileRoute, Link } from "@tanstack/react-router";
import { MobileShell } from "@/components/MobileShell";
import { EXERCISE_LIBRARY } from "@/utils/workouts";
import { ChevronLeft } from "lucide-react";

export const Route = createFileRoute("/exercise/$name")({
  head: ({ params }) => ({ meta: [{ title: `${params.name} — FitMentor` }] }),
  component: ExerciseDetail,
});

function ExerciseDetail() {
  const { name } = Route.useParams();
  const ex = EXERCISE_LIBRARY.find((e) => e.name === name);
  if (!ex) {
    return (
      <MobileShell>
        <div className="p-8 text-center">
          <p>Exercise not found.</p>
          <Link to="/workouts" className="text-primary underline">Back to library</Link>
        </div>
      </MobileShell>
    );
  }
  return (
    <MobileShell>
      <div className="px-5 pt-12">
        <Link to="/workouts" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
          <ChevronLeft className="h-4 w-4" /> Library
        </Link>
        <div className="mt-6 rounded-3xl border border-border/60 bg-gradient-card p-8 text-center shadow-card">
          <div className="text-7xl">{ex.emoji}</div>
          <h1 className="mt-4 text-3xl font-bold">{ex.name}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{ex.muscles.join(" • ")}</p>
        </div>
        <Section title="✅ How to do it">{ex.tips}</Section>
        <Section title="⚠️ Common mistake">{ex.mistakes}</Section>
        <Section title="🎯 Muscles worked">{ex.muscles.join(", ")}</Section>
      </div>
    </MobileShell>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mt-4 rounded-2xl border border-border/60 bg-card p-4">
      <p className="text-xs uppercase tracking-widest text-muted-foreground">{title}</p>
      <p className="mt-2 text-sm leading-relaxed">{children}</p>
    </div>
  );
}