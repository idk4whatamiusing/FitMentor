import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useRef, useState } from "react";
import { MobileShell } from "@/components/MobileShell";
import { askCoach } from "@/services/coach-functions";
import { useProfile, calcTargets } from "@/utils/profile";
import { Button } from "@/components/ui/button";
import { Sparkles, Send } from "lucide-react";
import { toast } from "sonner";
import ReactMarkdown from "react-markdown";

export const Route = createFileRoute("/coach")({
  head: () => ({ meta: [{ title: "AI Coach — FitMentor" }] }),
  component: Coach,
});

type Msg = { role: "user" | "assistant"; content: string };

const STARTERS = [
  "How much protein do I need?",
  "I missed gym for 3 days, what now?",
  "My weight is not increasing",
  "Can I build muscle without whey?",
  "Is my workout plan good?",
];

function Coach() {
  const ask = useServerFn(askCoach);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);
  const { profile } = useProfile();

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  async function send(text: string) {
    const q = text.trim();
    if (!q || loading) return;
    const profileWithTargets = profile ? { ...profile, ...calcTargets(profile) } : undefined;
    const newMsgs: Msg[] = [...messages, { role: "user", content: q }];
    setMessages(newMsgs);
    setInput("");
    setLoading(true);
    try {
      const res = await ask({ data: { messages: newMsgs, profile: profileWithTargets } });
      setMessages([...newMsgs, { role: "assistant", content: res.reply }]);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Coach is unavailable right now.";
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  }

  return (
    <MobileShell>
      <div className="sticky top-0 z-10 border-b border-white/5 bg-background/70 px-5 pb-4 pt-14 backdrop-blur-2xl">
        <div className="flex items-center gap-3">
          <div className="relative flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-hero text-primary-foreground shadow-glow">
            <Sparkles className="h-5 w-5" />
            <span className="absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-background bg-emerald-400" />
          </div>
          <div>
            <h1 className="text-lg font-bold leading-tight">FitMentor Coach</h1>
            <p className="text-xs text-muted-foreground">Online • Ready when you are</p>
          </div>
        </div>
      </div>

      <div className="space-y-4 px-5 py-4">
        {messages.length === 0 && (
          <div className="space-y-3">
            <div className="rounded-2xl border border-border/60 bg-card p-4">
              <p className="text-sm">
                Hey! I'm your coach. Ask me anything about training, nutrition, or your plan.
                I know your goals, diet, and budget — so my answers are made just for you. 💪
              </p>
            </div>
            <p className="px-1 text-xs uppercase tracking-widest text-muted-foreground">Try asking</p>
            <div className="flex flex-wrap gap-2">
              {STARTERS.map((s) => (
                <button
                  key={s}
                  onClick={() => send(s)}
                  className="rounded-full border border-border/60 bg-card px-3 py-1.5 text-xs text-foreground transition hover:border-primary/40"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((m, i) => (
          <div key={i} className={m.role === "user" ? "flex justify-end" : "flex justify-start"}>
            <div
              className={
                m.role === "user"
                  ? "max-w-[85%] rounded-2xl rounded-br-md bg-primary px-4 py-2.5 text-sm text-primary-foreground"
                  : "max-w-[90%] rounded-2xl rounded-bl-md border border-border/60 bg-card px-4 py-3 text-sm leading-relaxed"
              }
            >
              {m.role === "assistant" ? (
                <div className="space-y-2 [&_p]:leading-relaxed [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:list-decimal [&_ol]:pl-5 [&_li]:my-0.5 [&_strong]:font-semibold [&_strong]:text-primary [&_code]:rounded [&_code]:bg-secondary [&_code]:px-1 [&_code]:py-0.5 [&_code]:text-xs">
                  <ReactMarkdown>{m.content}</ReactMarkdown>
                </div>
              ) : (
                m.content
              )}
            </div>
          </div>
        ))}

        {loading && (
          <div className="flex justify-start">
            <div className="flex gap-1 rounded-2xl rounded-bl-md border border-border/60 bg-card px-4 py-3">
              <span className="h-2 w-2 animate-bounce rounded-full bg-primary [animation-delay:-0.3s]" />
              <span className="h-2 w-2 animate-bounce rounded-full bg-primary [animation-delay:-0.15s]" />
              <span className="h-2 w-2 animate-bounce rounded-full bg-primary" />
            </div>
          </div>
        )}
        <div ref={endRef} />
      </div>

      <div className="fixed inset-x-0 bottom-24 z-40 mx-auto w-full max-w-md px-5">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            send(input);
          }}
          className="flex items-center gap-2 rounded-2xl border border-border/60 bg-card/95 p-2 shadow-card backdrop-blur"
        >
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Ask your coach…"
            className="flex-1 bg-transparent px-3 text-sm outline-none placeholder:text-muted-foreground"
          />
          <Button type="submit" size="icon" disabled={loading || !input.trim()} className="h-10 w-10 bg-gradient-hero shadow-glow">
            <Send className="h-4 w-4" />
          </Button>
        </form>
      </div>
    </MobileShell>
  );
}