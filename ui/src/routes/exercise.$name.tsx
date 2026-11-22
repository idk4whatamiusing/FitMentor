import { createFileRoute, Link } from "@tanstack/react-router";
import { MobileShell } from "@/components/MobileShell";
import { EXERCISE_LIBRARY } from "@/utils/workouts";
import { ArrowLeft, ArrowUpRight } from "lucide-react";
import { SectionLabel } from "@/components/editorial";

export const Route = createFileRoute("/exercise/$name")({
  head: ({ params }) => ({ meta: [{ title: `${params.name} — FitMentor` }] }),
  component: ExerciseDetail,
});

function ExerciseDetail() {
  const { name } = Route.useParams();
  const ex = EXERCISE_LIBRARY.find((e) => e.name === name);
  const index = EXERCISE_LIBRARY.findIndex((e) => e.name === name);

  if (!ex) {
    return (
      <MobileShell>
        <div className="flex min-h-[50vh] flex-col items-center justify-center gap-4">
          <p className="text-sm text-muted-foreground">Exercise not found.</p>
          <Link
            to="/workouts"
            className="inline-flex items-center gap-2 rounded-full bg-foreground px-5 py-2.5 text-sm font-semibold text-background"
          >
            Back to library <ArrowUpRight className="h-4 w-4 text-orange" />
          </Link>
        </div>
      </MobileShell>
    );
  }

  return (
    <MobileShell>
      <div className="px-5 pt-8 lg:px-8 lg:pt-12">
        <Link
          to="/workouts"
          className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft className="h-3.5 w-3.5" /> Library
        </Link>

        <div className="relative mt-6 overflow-hidden rounded-[2rem] bg-ink px-7 py-10 text-cream lg:px-10 lg:py-14">
          <div className="absolute -right-12 -top-12 h-48 w-48 rounded-full bg-orange/15 blur-3xl" />
          <div className="relative">
            <p className="label-micro text-orange">
              Exercise {String(index + 1).padStart(2, "0")}
            </p>
            <h1 className="mt-4 text-5xl font-semibold leading-[0.92] tracking-[-0.045em] sm:text-7xl">
              {ex.name}
            </h1>
            <p className="mt-4 text-sm text-cream/55">{ex.muscles.join(" · ")}</p>
          </div>
        </div>

        <div className="mt-4 grid gap-4 pb-4 lg:grid-cols-3">
          <Section index="01" title="How to do it">
            {ex.tips}
          </Section>
          <Section index="02" title="Common mistake">
            {ex.mistakes}
          </Section>
          <Section index="03" title="Muscles worked">
            {ex.muscles.join(", ")}
          </Section>
        </div>

        <Link
          to="/workouts"
          className="group mb-4 inline-flex items-center gap-3 rounded-full bg-foreground py-2 pl-6 pr-2 text-sm font-semibold text-background"
        >
          Back to the week
          <span className="flex h-9 w-9 items-center justify-center rounded-full bg-orange text-ink">
            <ArrowUpRight className="h-4 w-4 transition-transform group-hover:rotate-45" />
          </span>
        </Link>
      </div>
    </MobileShell>
  );
}

function Section({
  index,
  title,
  children,
}: {
  index: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-[1.75rem] border border-border bg-card p-6">
      <SectionLabel index={index}>{title}</SectionLabel>
      <p className="mt-4 text-sm leading-relaxed text-muted-foreground">{children}</p>
    </section>
  );
}
