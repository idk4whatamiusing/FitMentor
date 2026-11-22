import { useServerFn } from "@tanstack/react-start";
import { useEffect, useRef, useState } from "react";
import { Link } from "@tanstack/react-router";
import { askCoach } from "@/services/coach-functions";
import { loadProfile, calcTargets } from "@/utils/profile";
import { ArrowUpRight, Sparkles } from "lucide-react";
import ReactMarkdown from "react-markdown";
import { Pill, SectionLabel } from "@/components/editorial";

type Msg = { role: "user" | "assistant"; content: string };

const STARTERS = [
  "How much protein do I need?",
  "I missed gym for 3 days, what now?",
  "Is my workout plan good?",
];

export function CoachChat() {
  const ask = useServerFn(askCoach);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
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
    } catch {
      setMessages([
        ...newMsgs,
        { role: "assistant", content: "Coach is unavailable right now. Try again in a moment." },
      ]);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex h-full flex-col rounded-[1.75rem] border border-border bg-card p-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <SectionLabel>Coach</SectionLabel>
          <p className="mt-2 text-lg font-semibold">Ask about your plan</p>
        </div>
        <Link
          to="/coach"
          className="flex h-9 w-9 items-center justify-center rounded-full bg-ink text-cream transition-transform hover:rotate-45 dark:bg-cream dark:text-ink"
          aria-label="Open full coach chat"
        >
          <ArrowUpRight className="h-4 w-4" />
        </Link>
      </div>

      {messages.length === 0 ? (
        <div className="mt-6 flex-1">
          <p className="max-w-sm text-sm leading-relaxed text-muted-foreground">
            Training, food, recovery, or the week you just missed. The coach already knows
            your targets.
          </p>
          <div className="mt-5 flex flex-wrap gap-2">
            {STARTERS.map((s) => (
              <button
                key={s}
                onClick={() => send(s)}
                className="rounded-full border border-border px-3 py-1.5 text-xs text-muted-foreground transition-colors hover:border-foreground/30 hover:text-foreground"
              >
                {s}
              </button>
            ))}
          </div>
        </div>
      ) : (
        <div className="mt-5 max-h-72 flex-1 space-y-3 overflow-y-auto pr-1">
          {messages.map((m, i) => (
            <div key={i} className={m.role === "user" ? "flex justify-end" : "flex justify-start"}>
              <div
                className={`max-w-[85%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed ${
                  m.role === "user"
                    ? "rounded-br-md bg-foreground text-background"
                    : "rounded-bl-md bg-secondary text-foreground"
                }`}
              >
                {m.role === "assistant" ? (
                  <div className="[&_p]:my-1 [&_ul]:my-1 [&_ul]:list-disc [&_ul]:pl-4">
                    <ReactMarkdown>{m.content}</ReactMarkdown>
                  </div>
                ) : (
                  m.content
                )}
              </div>
            </div>
          ))}
          {loading ? (
            <div className="flex justify-start">
              <div className="flex gap-1 rounded-2xl rounded-bl-md bg-secondary px-4 py-3">
                <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-orange [animation-delay:-0.3s]" />
                <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-orange [animation-delay:-0.15s]" />
                <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-orange" />
              </div>
            </div>
          ) : null}
          <div ref={endRef} />
        </div>
      )}

      <form
        onSubmit={(e) => {
          e.preventDefault();
          send(input);
        }}
        className="mt-5 flex items-center gap-2 rounded-full border border-border bg-background p-1.5 pl-4"
      >
        <Sparkles className="h-3.5 w-3.5 shrink-0 text-orange" />
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Ask your coach…"
          className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
        />
        <button
          type="submit"
          disabled={loading || !input.trim()}
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-orange text-ink transition-transform hover:scale-105 disabled:opacity-40"
          aria-label="Send message"
        >
          <ArrowUpRight className="h-4 w-4" />
        </button>
      </form>
    </div>
  );
}
