import { useEffect, useRef, useState } from "react";
import { Dumbbell, Brain, Apple, TrendingUp, ChevronRight } from "lucide-react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";

if (typeof window !== "undefined") {
  gsap.registerPlugin(ScrollTrigger);
}

function ParticleCanvas() {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d", { alpha: true });
    if (!ctx) return;
    let raf = 0;
    const dpr = Math.min(window.devicePixelRatio, 1.5);
    const particles = Array.from({ length: 42 }, () => ({
      x: Math.random(),
      y: Math.random(),
      r: 0.6 + Math.random() * 1.8,
      vx: -0.00025 - Math.random() * 0.0005,
      vy: -0.0001 + Math.random() * 0.0002,
      a: 0.25 + Math.random() * 0.5,
    }));
    const resize = () => {
      const { clientWidth: w, clientHeight: h } = canvas;
      canvas.width = w * dpr;
      canvas.height = h * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    window.addEventListener("resize", resize);
    const draw = () => {
      const w = canvas.clientWidth, h = canvas.clientHeight;
      ctx.clearRect(0, 0, w, h);
      for (const p of particles) {
        p.x += p.vx;
        p.y += p.vy;
        if (p.x < -0.02) p.x = 1.02;
        if (p.y < -0.02) p.y = 1.02;
        if (p.y > 1.02) p.y = -0.02;
        ctx.beginPath();
        ctx.arc(p.x * w, p.y * h, p.r, 0, Math.PI * 2);
        ctx.fillStyle = `oklch(0.72 0.16 195 / ${p.a})`;
        ctx.shadowBlur = 8;
        ctx.shadowColor = "oklch(0.68 0.14 205)";
        ctx.fill();
        ctx.shadowBlur = 0;
      }
      raf = requestAnimationFrame(draw);
    };
    draw();
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
    };
  }, []);
  return <canvas ref={ref} className="absolute inset-0 h-full w-full" style={{ width: "100%", height: "100%" }} />;
}

export function AbyssalWrap({ children }: { children: React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const depthRef = useRef<HTMLSpanElement>(null);
  const [depth, setDepth] = useState(0);

  useEffect(() => {
    if (!ref.current || !depthRef.current) return;
    const trigger = ScrollTrigger.create({
      trigger: ref.current,
      start: "top bottom",
      end: "bottom top",
      scrub: 0.6,
      onUpdate: (self) => {
        const d = Math.round(self.progress * 240);
        setDepth(d);
      },
    });
    const els = ref.current.querySelectorAll("[data-abyss]");
    els.forEach((el, i) => {
      gsap.fromTo(
        el as HTMLElement,
        { y: 28, opacity: 0 },
        {
          y: 0,
          opacity: 1,
          duration: 0.7,
          ease: "power3.out",
          scrollTrigger: {
            trigger: el as HTMLElement,
            start: "top 88%",
            toggleActions: "play none none reverse",
          },
          delay: i * 0.04,
        }
      );
    });
    return () => {
      trigger.kill();
      ScrollTrigger.getAll().forEach((t) => t.kill());
    };
  }, []);

  return (
    <div ref={ref} className="relative overflow-hidden bg-gradient-abyss">
      <div className="pointer-events-none absolute inset-0 opacity-40">
        <ParticleCanvas />
      </div>
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-transparent via-transparent to-[oklch(0.06_0.05_265/0.6)]" />
      {/* depth counter */}
      <div className="pointer-events-none sticky top-0 z-10 flex justify-end px-5 pt-4 lg:px-10">
        <div className="flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-white/70 backdrop-blur">
          <span className="h-1.5 w-1.5 rounded-full bg-[oklch(0.72_0.16_195)] shadow-[0_0_8px_oklch(0.68_0.14_205)]" />
          <span ref={depthRef} className="tabular-nums">{depth.toString().padStart(3, "0")}m</span>
          <span className="opacity-50">depth</span>
        </div>
      </div>
      {children}
    </div>
  );
}

function AbyssCard({ icon, title, desc }: { icon: React.ReactNode; title: string; desc: string }) {
  return (
    <div
      data-abyss
      className="group relative overflow-hidden rounded-[1.7rem] border border-white/10 bg-[oklch(0.16_0.03_250/0.8)] p-6 backdrop-blur-xl transition hover:border-[oklch(0.68_0.14_205/0.3)] hover:shadow-abyss"
    >
      <div className="absolute -right-10 -top-10 h-28 w-28 rounded-full bg-[oklch(0.68_0.14_205/0.12)] blur-2xl transition group-hover:bg-[oklch(0.72_0.16_195/0.18)]" />
      <div className="relative flex h-11 w-11 items-center justify-center rounded-2xl bg-[oklch(0.68_0.14_205)] text-white shadow-[0_8px_24px_oklch(0.68_0.14_205/0.3)]">
        {icon}
      </div>
      <h3 className="relative mt-4 text-sm font-bold text-white">{title}</h3>
      <p className="relative mt-1.5 text-xs leading-relaxed text-white/60">{desc}</p>
    </div>
  );
}

function AbyssStep({ n, title, desc }: { n: number; title: string; desc: string }) {
  return (
    <div data-abyss className="flex items-start gap-4">
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[oklch(0.68_0.14_205)] text-sm font-bold text-white shadow-[0_8px_24px_oklch(0.68_0.14_205/0.3)]">
        {n}
      </div>
      <div className="pt-1.5">
        <p className="font-semibold text-white">{title}</p>
        <p className="mt-1 text-sm text-white/60">{desc}</p>
      </div>
    </div>
  );
}

export function AbyssalFeatures() {
  return (
    <section className="relative px-5 py-20 lg:px-10 lg:py-24">
      <div className="mx-auto max-w-6xl">
        <div data-abyss className="mx-auto max-w-2xl text-center">
          <p className="text-xs uppercase tracking-[0.2em] text-[oklch(0.72_0.16_195)]">Where nobody else has looked</p>
          <h2 className="mt-3 text-3xl font-bold tracking-tight text-white lg:text-4xl">Drift below the noise</h2>
          <p className="mx-auto mt-3 max-w-xl text-sm leading-relaxed text-white/60">Bioluminescent particles find their way in water that has never seen daylight. Your data does the same — scattered logs become a figure you can navigate by.</p>
        </div>
        <div className="mx-auto mt-12 grid max-w-5xl grid-cols-2 gap-4 lg:grid-cols-4">
          <AbyssCard icon={<Brain className="h-5 w-5" />} title="AI Coach" desc="A trainer that learns your limits, not your hashtags." />
          <AbyssCard icon={<Dumbbell className="h-5 w-5" />} title="Workout Plans" desc="Personalized for your place, your days, your bar." />
          <AbyssCard icon={<Apple className="h-5 w-5" />} title="Indian Meals" desc="Dal, soya, eggs — affordable and yours." />
          <AbyssCard icon={<TrendingUp className="h-5 w-5" />} title="Progress" desc="Streaks and habits, glowing as you surface." />
        </div>
      </div>
    </section>
  );
}

export function AbyssalHowItWorks() {
  return (
    <section className="relative px-5 py-20 lg:px-10">
      <div className="mx-auto max-w-6xl lg:flex lg:items-start lg:justify-between lg:gap-12">
        <div data-abyss className="lg:w-[420px]">
          <p className="text-xs uppercase tracking-[0.2em] text-[oklch(0.72_0.16_195)]">How it moves</p>
          <h2 className="mt-3 text-3xl font-bold tracking-tight text-white">Three strokes to the surface</h2>
          <p className="mt-3 text-sm leading-relaxed text-white/60">Scroll is the tide. Each section rises as you fall, like light finding you.</p>
          <div className="mt-8 flex items-center gap-2 text-xs text-white/50">
            <ChevronRight className="h-4 w-4" /> Scroll to feel the drift
          </div>
        </div>
        <div className="mx-auto mt-10 max-w-md space-y-7 lg:mx-0 lg:mt-0">
          <AbyssStep n={1} title="You exhale — we listen" desc="Age, weight, goal, diet — 30 seconds, no jargon." />
          <AbyssStep n={2} title="We chart the current" desc="AI builds workouts and meals around your real week." />
          <AbyssStep n={3} title="You surface, daily" desc="Log, see the glow, keep the streak." />
        </div>
      </div>
    </section>
  );
}

export function AbyssalCTA({ loggedIn, checking }: { loggedIn: boolean; checking: boolean }) {
  return (
    <section className="relative px-5 py-20 text-center lg:px-10">
      <div
        data-abyss
        className="relative mx-auto max-w-2xl overflow-hidden rounded-[2rem] border border-white/10 bg-[oklch(0.14_0.03_250/0.7)] p-10 backdrop-blur-xl shadow-abyss"
      >
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_0%,oklch(0.68_0.14_205/0.15),transparent_60%)]" />
        <div className="relative">
          <p className="text-xs uppercase tracking-[0.2em] text-[oklch(0.72_0.16_195)]">Ready to drift?</p>
          <h2 className="mt-3 text-3xl font-bold text-white">Stop adding. Start surfacing.</h2>
          <p className="mx-auto mt-3 max-w-md text-sm leading-relaxed text-white/60">You don’t need another dashboard. You need one that gets out of your way — until it glows.</p>
          {checking ? null : (
            <a
              href={loggedIn ? "/dashboard" : "/signin"}
              className="mt-8 inline-flex items-center gap-2 rounded-full bg-white px-8 py-4 text-base font-semibold text-[oklch(0.11_0.04_250)] shadow-[0_12px_32px_oklch(0.72_0.16_195/0.25)] transition hover:opacity-90 active:scale-95"
            >
              {loggedIn ? "Go to Dashboard" : "Start for free"} <ChevronRight className="h-4 w-4" />
            </a>
          )}
          <p className="mt-3 text-xs text-white/40">No credit card • Calm by design</p>
        </div>
      </div>
    </section>
  );
}
