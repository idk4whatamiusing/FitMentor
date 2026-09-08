import { Link } from "@tanstack/react-router";
import { ArrowRight } from "lucide-react";
import { motion, useScroll, useTransform } from "framer-motion";
import { useRef } from "react";
import logoImg from "@/assets/logo-v2.png";

export function OasisHero({ loggedIn, checking }: { loggedIn: boolean; checking: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({
    target: ref,
    offset: ["start start", "end start"],
  });
  const y = useTransform(scrollYProgress, [0, 1], ["0%", "30%"]);
  const opacity = useTransform(scrollYProgress, [0, 0.6], [1, 0]);
  const scale = useTransform(scrollYProgress, [0, 0.5], [1, 0.95]);

  return (
    <section ref={ref} className="relative overflow-hidden bg-gradient-oasis">
      {/* Oasis warm wash */}
      <div className="pointer-events-none absolute inset-0 bg-gradient-mesh opacity-60" />
      <motion.div style={{ y }} className="pointer-events-none absolute -top-24 right-[-8%] h-[520px] w-[520px] rounded-full bg-[radial-gradient(circle_at_center,oklch(0.82_0.08_75/0.22),transparent_70%)] blur-2xl" />
      <motion.div style={{ y }} className="pointer-events-none absolute top-[28%] -left-[10%] h-[420px] w-[420px] rounded-full bg-[radial-gradient(circle_at_center,oklch(0.68_0.14_205/0.14),transparent_70%)] blur-2xl" />

      {/* Nav */}
      <nav className="relative z-10 flex items-center justify-between px-5 pt-6 pb-4 lg:px-10 lg:pt-8">
        <div className="flex items-center gap-2.5">
          <img src={logoImg} alt="FitMentor AI" className="h-9 w-9 object-contain" />
          <span className="text-lg font-bold tracking-tight">FitMentor AI</span>
        </div>
        {checking ? null : (
          <Link
            to={loggedIn ? "/dashboard" : "/signin"}
            className="rounded-full bg-foreground px-5 py-2 text-sm font-semibold text-background transition hover:opacity-90 active:scale-95"
          >
            {loggedIn ? "Dashboard" : "Get Started"}
          </Link>
        )}
      </nav>

      {/* Hero content - Oasis: generous whitespace, second-person, relief */}
      <motion.div style={{ opacity, scale }} className="relative z-10 mx-auto max-w-6xl px-5 pb-24 pt-12 lg:flex lg:items-center lg:gap-12 lg:px-10 lg:pb-32 lg:pt-16">
        <div className="mx-auto max-w-xl text-center lg:mx-0 lg:max-w-[560px] lg:text-left">
          <motion.span
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, ease: "easeOut" }}
            className="inline-flex items-center gap-2 rounded-full border border-foreground/10 bg-white/60 px-4 py-1.5 text-xs font-medium backdrop-blur"
          >
            <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
            Relief, not more noise — for you
          </motion.span>
          <motion.h1
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, delay: 0.1, ease: "easeOut" }}
            className="mt-6 text-[2.6rem] font-bold leading-[0.95] tracking-tight lg:text-[3.6rem]"
          >
            You deserve
            <br />
            <span className="font-light tracking-[-0.03em]">a pocket of calm</span>
            <br />
            <span className="text-gradient">in your fitness</span>
          </motion.h1>
          <motion.p
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.2 }}
            className="mx-auto mt-5 max-w-md text-[15px] leading-relaxed text-muted-foreground lg:mx-0"
          >
            You’re tired of dashboards that shout. FitMentor removes the clutter — gentle workouts, affordable Indian meals, and a coach who remembers your name. The space itself is the promise.
          </motion.p>
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.3 }}
            className="mt-8 flex flex-col items-center gap-3 lg:items-start"
          >
            {checking ? null : (
              <Link
                to={loggedIn ? "/dashboard" : "/signin"}
                className="inline-flex items-center gap-2 rounded-full bg-foreground px-8 py-4 text-base font-semibold text-background shadow-abyss transition hover:opacity-90 active:scale-95"
              >
                {loggedIn ? "Go to Dashboard" : "Start for free"} <ArrowRight className="h-4 w-4" />
              </Link>
            )}
            <p className="text-xs text-muted-foreground">Warm words, second-person • No optimisation jargon • Just you, less</p>
          </motion.div>
        </div>

        {/* Oasis visual — warm card with breathing space */}
        <motion.div
          initial={{ opacity: 0, y: 24, scale: 0.98 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ duration: 0.8, delay: 0.25, ease: "easeOut" }}
          className="relative mx-auto mt-12 max-w-sm lg:mx-0 lg:mt-0 lg:w-[420px] lg:max-w-none"
        >
          <div className="relative overflow-hidden rounded-[2rem] border border-white/20 bg-card/80 p-6 shadow-card backdrop-blur-xl">
            <div className="absolute -right-12 -top-12 h-40 w-40 rounded-full bg-[oklch(0.82_0.08_75/0.18)] blur-2xl" />
            <p className="relative text-xs uppercase tracking-[0.18em] text-muted-foreground">Today • For you</p>
            <div className="relative mt-4 grid grid-cols-3 gap-3 text-center">
              <div className="rounded-2xl bg-secondary/60 p-3">
                <p className="text-xs text-muted-foreground">Focus</p>
                <p className="mt-1 text-lg font-bold">4.2h</p>
                <p className="text-[11px] text-emerald-600">+18% calm</p>
              </div>
              <div className="rounded-2xl bg-primary/10 p-3 ring-1 ring-primary/15">
                <p className="text-xs text-muted-foreground">Streak</p>
                <p className="mt-1 text-lg font-bold">12 days</p>
                <p className="text-[11px] text-primary">You kept it</p>
              </div>
              <div className="rounded-2xl bg-secondary/60 p-3">
                <p className="text-xs text-muted-foreground">Meals</p>
                <p className="mt-1 text-lg font-bold">₹127</p>
                <p className="text-[11px] text-muted-foreground">avg/day</p>
              </div>
            </div>
            <div className="relative mt-5 rounded-2xl bg-foreground px-4 py-3 text-background">
              <p className="text-xs opacity-70">Your coach whispers</p>
              <p className="mt-1 text-sm leading-relaxed">“You don’t need more. You need enough — done well, today.”</p>
            </div>
          </div>
          <div className="pointer-events-none absolute -bottom-6 -right-6 -z-10 h-32 w-32 rounded-full bg-[oklch(0.72_0.12_75/0.12)] blur-2xl" />
        </motion.div>
      </motion.div>

      <div className="relative flex justify-center pb-6">
        <motion.div
          animate={{ y: [0, 6, 0] }}
          transition={{ duration: 2.2, repeat: Infinity, ease: "easeInOut" }}
          className="flex flex-col items-center gap-1.5 text-[11px] uppercase tracking-[0.2em] text-muted-foreground"
        >
          <span>Scroll</span>
          <span className="h-8 w-px bg-foreground/20" />
        </motion.div>
      </div>
    </section>
  );
}
