import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { checkSession } from "@/utils/oauth";
import { OasisHero } from "@/components/landing/OasisHero";
import { AbyssalWrap, AbyssalFeatures, AbyssalHowItWorks, AbyssalCTA } from "@/components/landing/AbyssalSection";
import Lenis from "lenis";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "FitMentor AI — Your Pocket Fitness Coach" },
      {
        name: "description",
        content:
          "AI-powered fitness coach for Indian beginners. Personalized workouts, affordable meal plans, and progress tracking.",
      },
    ],
  }),
  component: Landing,
});

function Landing() {
  const [loggedIn, setLoggedIn] = useState(false);
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    checkSession().then((s) => {
      setLoggedIn(s.ok);
      setChecking(false);
    });
  }, []);

  useEffect(() => {
    const lenis = new Lenis({ lerp: 0.075, smoothWheel: true });
    let rafId = 0;
    const raf = (time: number) => {
      lenis.raf(time);
      rafId = requestAnimationFrame(raf);
    };
    rafId = requestAnimationFrame(raf);
    return () => {
      cancelAnimationFrame(rafId);
      lenis.destroy();
    };
  }, []);

  return (
    <div className="min-h-screen bg-oasis text-foreground">
      <OasisHero loggedIn={loggedIn} checking={checking} />
      <AbyssalWrap>
        <AbyssalFeatures />
        <AbyssalHowItWorks />
        <AbyssalCTA loggedIn={loggedIn} checking={checking} />
        <footer className="border-t border-white/5 px-5 py-8 text-center text-xs text-white/50 lg:px-10">
          <p>FitMentor AI — Built in India 🇮🇳 • Scroll-driven • Oasis + Abyssal</p>
          <div className="mt-3 flex justify-center gap-4">
            <Link to="/signup" className="text-white/70 hover:text-white transition">Get Started</Link>
            <span className="text-white/20">•</span>
            <span>Cloudflare Pages • Scroll like tide</span>
          </div>
        </footer>
      </AbyssalWrap>
    </div>
  );
}


