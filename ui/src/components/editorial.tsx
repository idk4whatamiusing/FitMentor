import { Link } from "@tanstack/react-router";
import { ArrowUpRight, ArrowRight } from "lucide-react";
import type { ComponentProps, ReactNode } from "react";
import { cn } from "@/utils/cn";

type LinkTo = ComponentProps<typeof Link>["to"];

export function Wordmark({
  className,
  href,
}: {
  className?: string;
  href?: LinkTo;
}) {
  const mark = (
    <span className={cn("inline-flex items-baseline gap-1 font-wordmark text-[13px] leading-none", className)}>
      FITMENTOR
      <span className="inline-block h-[5px] w-[5px] translate-y-[-1px] bg-orange" aria-hidden />
    </span>
  );
  if (href) {
    return (
      <Link to={href} className="inline-flex">
        {mark}
      </Link>
    );
  }
  return mark;
}

export function SectionLabel({
  index,
  children,
  className,
}: {
  index?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <p className={cn("label-micro flex items-center gap-2.5 text-muted-foreground", className)}>
      {index ? (
        <>
          <span className="text-orange">{index}</span>
          <span className="h-px w-7 bg-border" aria-hidden />
        </>
      ) : null}
      <span>{children}</span>
    </p>
  );
}

export function Pill({
  children,
  className,
  tone = "outline",
}: {
  children: ReactNode;
  className?: string;
  tone?: "outline" | "orange" | "ink" | "cream";
}) {
  const tones = {
    outline: "border-border text-muted-foreground",
    orange: "border-transparent bg-orange text-ink",
    ink: "border-transparent bg-ink text-cream",
    cream: "border-transparent bg-cream text-ink",
  } as const;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.14em]",
        tones[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}

export function PrimaryLink({
  to,
  children,
  className,
  arrow = "up",
}: {
  to: LinkTo;
  children: ReactNode;
  className?: string;
  arrow?: "up" | "right" | "none";
}) {
  return (
    <Link
      to={to}
      className={cn(
        "group inline-flex items-center gap-3 rounded-full bg-foreground py-2 pl-6 pr-2 text-sm font-semibold text-background transition-transform duration-300 hover:-translate-y-0.5",
        className,
      )}
    >
      <span>{children}</span>
      {arrow !== "none" ? (
        <span className="flex h-9 w-9 items-center justify-center rounded-full bg-orange text-ink transition-transform duration-300 group-hover:rotate-45">
          {arrow === "up" ? <ArrowUpRight className="h-4 w-4" /> : <ArrowRight className="h-4 w-4" />}
        </span>
      ) : null}
    </Link>
  );
}

export function PrimaryButton({
  children,
  className,
  arrow = "up",
  ...props
}: ComponentProps<"button"> & { arrow?: "up" | "right" | "none" }) {
  return (
    <button
      {...props}
      className={cn(
        "group inline-flex items-center gap-3 rounded-full bg-foreground py-2 pl-6 pr-2 text-sm font-semibold text-background transition-transform duration-300 hover:-translate-y-0.5 disabled:pointer-events-none disabled:opacity-50",
        className,
      )}
    >
      <span>{children}</span>
      {arrow !== "none" ? (
        <span className="flex h-9 w-9 items-center justify-center rounded-full bg-orange text-ink transition-transform duration-300 group-hover:rotate-45">
          {arrow === "up" ? <ArrowUpRight className="h-4 w-4" /> : <ArrowRight className="h-4 w-4" />}
        </span>
      ) : null}
    </button>
  );
}

export function StatBlock({
  label,
  value,
  unit,
  hint,
  className,
  invert,
}: {
  label: string;
  value: ReactNode;
  unit?: string;
  hint?: ReactNode;
  className?: string;
  invert?: boolean;
}) {
  return (
    <div
      className={cn(
        "rounded-3xl border border-border p-5",
        invert ? "border-white/12 bg-ink text-cream" : "bg-card",
        className,
      )}
    >
      <p className={cn("label-micro", invert ? "text-cream/50" : "text-muted-foreground")}>{label}</p>
      <div className="mt-4 flex items-baseline gap-1.5">
        <span className="text-4xl font-medium leading-none tracking-tight tabular-nums">{value}</span>
        {unit ? (
          <span className={cn("text-xs", invert ? "text-cream/50" : "text-muted-foreground")}>{unit}</span>
        ) : null}
      </div>
      {hint ? (
        <div className={cn("mt-2 text-xs", invert ? "text-cream/60" : "text-muted-foreground")}>{hint}</div>
      ) : null}
    </div>
  );
}

export function MediaCard({
  src,
  alt,
  children,
  className,
  overlay = true,
}: {
  src: string;
  alt: string;
  children?: ReactNode;
  className?: string;
  overlay?: boolean;
}) {
  return (
    <div className={cn("relative overflow-hidden rounded-[2rem] bg-ink", className)}>
      <img src={src} alt={alt} className="absolute inset-0 h-full w-full object-cover" loading="lazy" />
      {overlay ? (
        <div className="absolute inset-0 bg-gradient-to-t from-ink via-ink/25 to-transparent" />
      ) : null}
      <div className="relative flex h-full flex-col justify-end p-6 text-cream">{children}</div>
    </div>
  );
}

export function PageHeader({
  label,
  title,
  description,
  action,
  className,
}: {
  label?: string;
  title: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <header className={cn("flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between", className)}>
      <div>
        {label ? <SectionLabel>{label}</SectionLabel> : null}
        <h1 className="mt-3 text-[2.5rem] font-semibold leading-[0.95] tracking-[-0.04em] sm:text-6xl">
          {title}
        </h1>
        {description ? (
          <p className="mt-4 max-w-xl text-sm leading-relaxed text-muted-foreground">{description}</p>
        ) : null}
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </header>
  );
}

export function ProgressBar({
  value,
  className,
  tone = "orange",
}: {
  value: number;
  className?: string;
  tone?: "orange" | "ink" | "cream";
}) {
  const bars = {
    orange: "bg-orange",
    ink: "bg-ink dark:bg-cream",
    cream: "bg-cream",
  } as const;
  return (
    <div className={cn("h-1.5 w-full overflow-hidden rounded-full bg-muted", className)}>
      <div
        className={cn("h-full rounded-full transition-[width] duration-500", bars[tone])}
        style={{ width: `${Math.max(0, Math.min(100, value))}%` }}
      />
    </div>
  );
}

export function HairlineRow({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return <div className={cn("border-t border-border py-4", className)}>{children}</div>;
}
