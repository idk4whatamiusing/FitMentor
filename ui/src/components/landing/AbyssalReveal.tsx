import { useEffect, useRef } from "react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";

if (typeof window !== "undefined") {
  gsap.registerPlugin(ScrollTrigger);
}

// TODO: drop the real clip in at ui/public/videos/abyssal-reveal.mp4 — placeholder path until then.
const REVEAL_VIDEO_SRC = "/videos/abyssal-reveal.mp4";

export function AbyssalReveal() {
  const sectionRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!sectionRef.current || !panelRef.current) return;
    const ctx = gsap.context(() => {
      gsap.fromTo(
        panelRef.current,
        { width: "38vw", height: "34vh", borderRadius: "2rem" },
        {
          width: "100vw",
          height: "86vh",
          borderRadius: "0rem",
          ease: "none",
          scrollTrigger: {
            trigger: sectionRef.current,
            start: "top top",
            end: "+=120%",
            pin: true,
            scrub: 0.8,
            anticipatePin: 1,
            invalidateOnRefresh: true,
          },
        }
      );
    }, sectionRef);
    return () => ctx.revert();
  }, []);

  return (
    <div ref={sectionRef} className="relative min-h-screen bg-gradient-abyss">
      <p className="pointer-events-none absolute left-5 top-6 z-10 text-xs uppercase tracking-[0.2em] text-white/50 lg:left-10">
        Now, in the deep
      </p>
      <div className="flex h-screen items-center justify-center overflow-hidden">
        <div
          ref={panelRef}
          className="relative overflow-hidden border border-white/10 bg-gradient-abyss shadow-abyss"
        >
          <video
            className="h-full w-full object-cover"
            src={REVEAL_VIDEO_SRC}
            autoPlay
            muted
            loop
            playsInline
          />
        </div>
      </div>
    </div>
  );
}
