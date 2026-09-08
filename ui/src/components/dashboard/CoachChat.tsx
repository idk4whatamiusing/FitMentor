import { useServerFn } from "@tanstack/react-start";
import { useEffect, useRef, useState } from "react";
import { Link } from "@tanstack/react-router";
import { askCoach } from "@/services/coach-functions";
import { loadProfile, calcTargets } from "@/utils/profile";
import { Button } from "@/components/ui/button";
import { Sparkles, Send, ArrowRight } from "lucide-react";
import ReactMarkdown from "react-markdown";

type Msg = { role: "user" | "assistant"; content: string };

const STARTERS = [
  "How much protein do I need?",
  "I missed gym for 3 days, what now?",
  "Is my workout plan good?",
];

// ponytail: inline chat — no need for a separate page link, but keeps the option open
export function CoachChat() {
  const ask = useServerFn(askCoach);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  async function send(text: string) {
    const q = text.trim();
    if (!q || loading) return;
    const profile = loadProfile();
    const profileWithTargets = profile ? { ...profile, ...calcTargets(profile) } : undefined;
    const newMsgs: Msg[] = [...messages, { role: "user", content: q }];
    setMessages(newMsgs);
    setInput("");
    setLoading(true);
    try {
      const res = await ask({ data: { messages: newMsgs, profile: profileWithTargets } });
      setMessages([...newMsgs, { role: "assistant", content: res.reply }]);
    } catch (e) {
      // ponytail: just swallow — toast is noisy on dashboard, user sees no response
      setMessages([...newMsgs, { role: "assistant", content: "Coach is unavailable right now. Try again in a moment." }]);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="rounded-2xl border border-border/60 bg-card p-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-gradient-hero text-primary-foreground shadow-glow">
            <Sparkles className="h-4 w-4" />
          </div>
          <div>
            <p className="text-sm font-semibold">AI Coach</p>
            <p className="text-[10px] text-muted-foreground">Ask anything</p>
          </div>
        </div>
        <Link to="/coach" className="flex items-center gap-1 text-xs text-primary hover:underline">
          Full chat <ArrowRight className="h-3 w-3" />
        </Link>
      </div>

      {messages.length === 0 && (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {STARTERS.map((s) => (
            <button
              key={s}
              onClick={() => send(s)}
              className="rounded-full border border-border/60 bg-secondary/60 px-2.5 py-1 text-[11px] text-muted-foreground transition hover:border-primary/40 hover:text-foreground"
            >
              {s}
            </button>
          ))}
        </div>
      )}

      {messages.length > 0 && (
        <div className="mt-3 max-h-64 space-y-2 overflow-y-auto">
          {messages.map((m, i) => (
            <div key={i} className={m.role === "user" ? "flex justify-end" : "flex justify-start"}>
              <div
                className={`max-w-[85%] rounded-2xl px-3 py-2 text-xs leading-relaxed ${
                  m.role === "user"
                    ? "rounded-br-md bg-primary text-primary-foreground"
                    : "rounded-bl-md border border-border/60 bg-secondary/60"
                }`}
              >
                {m.role === "assistant" ? (
                  <div className="[&>p]:my-0.5 [&>p]:leading-relaxed">
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
              <div className="flex gap-1 rounded-2xl rounded-bl-md border border-border/60 bg-secondary/60 px-3 py-2">
                <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-primary [animation-delay:-0.3s]" />
                <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-primary [animation-delay:-0.15s]" />
                <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-primary" />
              </div>
            </div>
          )}
          <div ref={endRef} />
        </div>
      )}

      <form
        onSubmit={(e) => { e.preventDefault(); send(input); }}
        className="mt-3 flex items-center gap-2"
      >
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Ask your coach…"
          className="flex-1 rounded-xl border border-border/60 bg-secondary/60 px-3 py-2 text-xs outline-none placeholder:text-muted-foreground focus:border-primary/40"
        />
        <Button type="submit" size="icon" disabled={loading || !input.trim()} className="h-8 w-8 shrink-0 bg-gradient-hero shadow-glow">
          <Send className="h-3.5 w-3.5" />
        </Button>
      </form>
    </div>
  );
}
