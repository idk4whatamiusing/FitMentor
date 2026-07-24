import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useCallback, useEffect, useRef, useState } from "react";
import { MobileShell } from "@/components/MobileShell";
import { askCoach } from "@/services/coach-functions";
import { useProfile, calcTargets } from "@/utils/profile";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Sparkles, Send, Menu, Plus, Trash2, History, MessageSquare } from "lucide-react";
import { toast } from "sonner";
import ReactMarkdown from "react-markdown";
import { getClient } from "@/lib/graphql/client";
import {
  COACH_SESSIONS_QUERY,
  COACH_SESSION_QUERY,
} from "@/lib/graphql/queries";
import {
  CREATE_COACH_SESSION_MUTATION,
  DELETE_COACH_SESSION_MUTATION,
} from "@/lib/graphql/mutations";

export const Route = createFileRoute("/coach")({
  head: () => ({ meta: [{ title: "AI Coach — FitMentor" }] }),
  component: Coach,
});

type Msg = { role: "user" | "assistant"; content: string };

type SessionListItem = {
  id: string;
  title: string;
  messageCount: number;
};

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
  const [activeId, setActiveId] = useState<string | null>(null);
  const [sessions, setSessions] = useState<SessionListItem[]>([]);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [sessionsLoading, setSessionsLoading] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);
  const { profile } = useProfile();

  const loadSessions = useCallback(async () => {
    setSessionsLoading(true);
    try {
      const client = getClient();
      const data = await client.request<{ coachSessions: SessionListItem[] }>(COACH_SESSIONS_QUERY);
      setSessions(data.coachSessions);
    } catch { /* ignore */ }
    setSessionsLoading(false);
  }, []);

  useEffect(() => {
    loadSessions();
  }, [loadSessions]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  async function switchSession(id: string) {
    try {
      const client = getClient();
      const data = await client.request<{ coachSession: { messages: Array<{ role: string; content: string }> } | null }>(
        COACH_SESSION_QUERY,
        { id },
      );
      const full = data.coachSession;
      if (!full) {
        toast.error("Could not load session");
        return;
      }
      const msgs: Msg[] = (full.messages || []).map((m) => ({
        role: m.role as "user" | "assistant",
        content: m.content,
      }));
      setMessages(msgs);
      setActiveId(id);
      setSheetOpen(false);
    } catch {
      toast.error("Could not load session");
    }
  }

  async function newSession() {
    setMessages([]);
    setActiveId(null);
    setSheetOpen(false);
  }

  async function removeSession(e: React.MouseEvent, id: string) {
    e.stopPropagation();
    try {
      const client = getClient();
      await client.request<{ deleteCoachSession: boolean }>(DELETE_COACH_SESSION_MUTATION, { id });
      if (activeId === id) {
        setMessages([]);
        setActiveId(null);
      }
      setSessions((prev) => prev.filter((s) => s.id !== id));
    } catch {
      toast.error("Could not delete session");
    }
  }

  async function send(text: string) {
    const q = text.trim();
    if (!q || loading) return;
    const profileWithTargets = profile ? { ...profile, ...calcTargets(profile) } : undefined;

    let sid = activeId;
    if (!sid) {
      try {
        const client = getClient();
        const data = await client.request<{ createCoachSession: { id: string } }>(CREATE_COACH_SESSION_MUTATION);
        sid = data.createCoachSession.id;
        setActiveId(sid);
      } catch {
        toast.error("Could not create session");
        return;
      }
    }

    const newMsgs: Msg[] = [...messages, { role: "user", content: q }];
    setMessages(newMsgs);
    setInput("");
    setLoading(true);
    try {
      const res = await ask({
        data: { session_id: sid, messages: newMsgs, profile: profileWithTargets },
      });
      setMessages([...newMsgs, { role: "assistant", content: res.reply }]);
      loadSessions();
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Coach is unavailable right now.";
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  }

  function formatDate(iso: string) {
    const d = new Date(iso);
    const now = new Date();
    const diffMs = now.getTime() - d.getTime();
    const diffDays = Math.floor(diffMs / 86400000);
    if (diffDays === 0) return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    if (diffDays === 1) return "Yesterday";
    if (diffDays < 7) return `${diffDays}d ago`;
    return d.toLocaleDateString([], { day: "numeric", month: "short" });
  }

  return (
    <MobileShell>
      <div className="sticky top-0 z-10 border-b border-white/5 bg-background/70 px-5 pb-4 pt-14 backdrop-blur-2xl">
        <div className="flex items-center gap-3">
          <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
            <SheetTrigger asChild>
              <button className="-ml-1 flex h-9 w-9 items-center justify-center rounded-xl text-muted-foreground hover:bg-accent">
                <Menu className="h-5 w-5" />
              </button>
            </SheetTrigger>
            <SheetContent side="left" className="w-72 p-0">
              <SheetHeader className="border-b border-border/60 px-4 py-4">
                <SheetTitle className="flex items-center gap-2 text-base">
                  <History className="h-4 w-4" /> Recents
                </SheetTitle>
              </SheetHeader>
              <div className="p-3">
                <button
                  onClick={newSession}
                  className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-primary transition hover:bg-primary/10"
                >
                  <Plus className="h-4 w-4" />
                  New Chat
                </button>
              </div>
              <div className="flex-1 overflow-y-auto px-3 pb-4">
                {sessions.length === 0 && (
                  <p className="px-3 py-6 text-center text-xs text-muted-foreground">
                    {sessionsLoading ? "Loading…" : "No conversations yet"}
                  </p>
                )}
                {sessions.map((s) => (
                  <button
                    key={s.id}
                    onClick={() => switchSession(s.id)}
                    className={`w-full rounded-lg px-3 py-2.5 text-left text-sm transition hover:bg-accent ${
                      activeId === s.id ? "bg-accent" : ""
                    }`}
                  >
                    <div className="flex items-start gap-2">
                      <MessageSquare className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-medium">{s.title}</p>
                        <p className="text-xs text-muted-foreground">
                          {s.title} · {s.messageCount} messages
                        </p>
                      </div>
                      <button
                        onClick={(e) => removeSession(e, s.id)}
                        className="mt-0.5 shrink-0 rounded p-1 text-muted-foreground opacity-0 transition hover:text-destructive group-hover:opacity-100"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </button>
                ))}
              </div>
            </SheetContent>
          </Sheet>

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
                I know your goals, diet, and budget — so my answers are made just for you.
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
