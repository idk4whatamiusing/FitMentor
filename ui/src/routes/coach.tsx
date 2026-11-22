import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { MobileShell } from "@/components/MobileShell";
import { useProfile, calcTargets } from "@/utils/profile";
import { useAuth } from "@/utils/oauth";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import {
  ArrowUp,
  History,
  MessageSquare,
  Pencil,
  Plus,
  Sparkles,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import ReactMarkdown from "react-markdown";
import {
  proxyCoachSessions,
  proxyCoachSession,
  proxyCreateCoachSession,
  proxyDeleteCoachSession,
  proxyRenameCoachSession,
} from "@/services/api-proxy";
import { askCoach, generateChatTitle } from "@/services/coach-functions";
import { useServerFn } from "@tanstack/react-start";
import { SectionLabel } from "@/components/editorial";
import { cn } from "@/utils/cn";

export const Route = createFileRoute("/coach")({
  head: () => ({ meta: [{ title: "Coach — FitMentor" }] }),
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

function buildSystemPrompt(p: Record<string, any> | undefined): string {
  if (!p) return "User has not completed onboarding yet.";
  const h = p.healthConditions?.length
    ? `- Health conditions: ${p.healthConditions.join(", ")}`
    : "";
  return `User profile:
- Name: ${p.name ?? "Friend"}
- Age: ${p.age}, Gender: ${p.gender}
- Height: ${p.heightCm} cm, Weight: ${p.weightKg} kg
- Goal: ${p.goal}, Experience: ${p.experience}
- Trains: ${p.place} (${p.daysPerWeek} days/week)
- Diet: ${p.diet}, Food budget: ₹${p.budgetPerDay}/day
${h}
- Daily targets: ${p.calories} kcal, ${p.protein} g protein`;
}

function buildChatMessages(
  messages: Msg[],
  profile: Record<string, any> | undefined,
): { role: string; content: string }[] {
  const system = `You are FitMentor, a warm, no-nonsense AI fitness coach for Indian gym beginners and students.
Rules:
- Be concise. Use short paragraphs and bullet points. Never write essays.
- Use simple words. No fitness jargon unless you explain it.
- Suggest affordable Indian foods (dal, eggs, paneer, soya, milk, chicken, rice, roti).
- Default currency: INR. Default units: kg, cm, ml.
- Never recommend extreme diets or unsafe lifts. Suggest seeing a doctor for medical issues.
- Don't push supplements. Whey is optional, not required.
- Always end with one clear next step the user can do today.

${buildSystemPrompt(profile)}`;
  return [
    { role: "system", content: system },
    ...messages.map((m) => ({ role: m.role, content: m.content })),
  ];
}

function Coach() {
  const ask = useServerFn(askCoach);
  const genTitle = useServerFn(generateChatTitle);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [sessions, setSessions] = useState<SessionListItem[]>([]);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [sessionsLoading, setSessionsLoading] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);
  const { profile } = useProfile();
  const authUser = useAuth();

  const loadSessions = useCallback(async () => {
    setSessionsLoading(true);
    try {
      const rows = (await proxyCoachSessions()) as Array<{
        id: string;
        title: string;
        message_count: number;
      }>;
      setSessions(rows.map((r) => ({ id: r.id, title: r.title, messageCount: r.message_count })));
    } catch {
      /* ignore */
    }
    setSessionsLoading(false);
  }, []);

  useEffect(() => {
    loadSessions();
  }, [loadSessions]);

  useEffect(() => {
    if (!activeId && sessions.length > 0) {
      switchSession(sessions[0].id);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessions]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [messages, loading]);

  async function switchSession(id: string) {
    try {
      const full = (await proxyCoachSession({ data: { id } })) as {
        messages: Array<{ role: string; content: string }>;
      } | null;
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
      await proxyDeleteCoachSession({ data: { id } });
      if (activeId === id) {
        setMessages([]);
        setActiveId(null);
      }
      setSessions((prev) => prev.filter((s) => s.id !== id));
    } catch {
      toast.error("Could not delete session");
    }
  }

  const isFirstMessage = messages.length === 0;

  async function maybeGenerateTitle(
    sid: string,
    userText: string,
    currentTitle: string | undefined,
  ) {
    if (currentTitle && currentTitle !== "New Chat") return;
    try {
      const { title } = await genTitle({ data: { userMessage: userText } });
      await proxyRenameCoachSession({ data: { id: sid, title } });
      loadSessions();
    } catch {
      // non-critical
    }
  }

  async function send(text: string) {
    const q = text.trim();
    if (!q || loading) return;
    const profileWithTargets = profile ? { ...profile, ...calcTargets(profile) } : undefined;

    let sid = activeId;
    let createdNow = false;
    if (!sid) {
      try {
        const created = (await proxyCreateCoachSession({ data: {} })) as { id: string } | null;
        if (!created) throw new Error("create failed");
        sid = created.id;
        setActiveId(sid);
        createdNow = true;
      } catch {
        toast.error("Could not create session");
        return;
      }
    }

    const curTitle = sessions.find((s) => s.id === sid)?.title;
    const shouldTitle = createdNow || isFirstMessage || curTitle === "New Chat" || !curTitle;

    const newMsgs: Msg[] = [...messages, { role: "user", content: q }];
    setMessages(newMsgs);
    setInput("");
    setLoading(true);

    try {
      const res = await ask({
        data: {
          session_id: sid,
          messages: newMsgs,
          profile: profileWithTargets,
          user_sub: authUser?.sub,
          user_email: authUser?.email,
        },
      });
      setMessages([...newMsgs, { role: "assistant", content: res.reply }]);
      loadSessions();
      if (shouldTitle) maybeGenerateTitle(sid, q, curTitle);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Coach is unavailable right now.";
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  }

  async function renameSession(id: string) {
    const cur = sessions.find((s) => s.id === id)?.title ?? "";
    const next = window.prompt("Rename chat", cur);
    if (next === null) return;
    const clean = next.trim().slice(0, 40);
    if (!clean || clean === cur) return;
    try {
      await proxyRenameCoachSession({ data: { id, title: clean } });
      setSessions((prev) => prev.map((s) => (s.id === id ? { ...s, title: clean } : s)));
    } catch {
      toast.error("Could not rename");
    }
  }

  const sessionList = (
    <div className="space-y-1">
      <button
        onClick={newSession}
        className="mb-3 flex w-full items-center gap-2 rounded-full border border-border px-4 py-2.5 text-xs font-semibold uppercase tracking-[0.1em] transition-colors hover:border-foreground/30"
      >
        <Plus className="h-3.5 w-3.5 text-orange" /> New chat
      </button>
      {sessionsLoading && sessions.length === 0 ? (
        <p className="px-3 py-6 text-center text-xs text-muted-foreground">Loading…</p>
      ) : null}
      {!sessionsLoading && sessions.length === 0 ? (
        <p className="px-3 py-6 text-center text-xs text-muted-foreground">No conversations yet.</p>
      ) : null}
      {sessions.map((s) => (
        <div
          key={s.id}
          className={cn(
            "group flex items-center gap-2 rounded-2xl px-3 py-2.5 transition-colors",
            activeId === s.id ? "bg-secondary" : "hover:bg-secondary/60",
          )}
        >
          <MessageSquare className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
          <button onClick={() => switchSession(s.id)} className="min-w-0 flex-1 text-left">
            <p className="truncate text-sm font-medium">{s.title}</p>
            <p className="text-[10px] text-muted-foreground">{s.messageCount} messages</p>
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation();
              renameSession(s.id);
            }}
            className="shrink-0 rounded p-1 text-muted-foreground opacity-0 transition hover:text-foreground group-hover:opacity-100"
            title="Rename"
          >
            <Pencil className="h-3.5 w-3.5" />
          </button>
          <button
            onClick={(e) => removeSession(e, s.id)}
            className="shrink-0 rounded p-1 text-muted-foreground opacity-0 transition hover:text-destructive group-hover:opacity-100"
            title="Delete"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      ))}
    </div>
  );

  return (
    <MobileShell wide>
      <div className="px-5 pt-8 lg:px-8 lg:pt-12">
        <div className="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <SectionLabel index="03">Coach</SectionLabel>
            <h1 className="mt-3 text-4xl font-semibold leading-[0.95] tracking-[-0.04em] sm:text-6xl">
              Ask the <span className="text-orange">coach.</span>
            </h1>
            <p className="mt-3 max-w-md text-sm text-muted-foreground">
              Your profile, targets, and training history are already in the room.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
              <SheetTrigger asChild>
                <button className="inline-flex items-center gap-2 rounded-full border border-border px-4 py-2 text-xs font-semibold uppercase tracking-[0.1em] text-muted-foreground transition-colors hover:border-foreground/30 hover:text-foreground lg:hidden">
                  <History className="h-3.5 w-3.5" /> Recents
                </button>
              </SheetTrigger>
              <SheetContent side="left" className="w-80 p-0">
                <SheetHeader className="border-b border-border px-5 py-4">
                  <SheetTitle className="flex items-center gap-2 text-base">
                    <History className="h-4 w-4" /> Recents
                  </SheetTitle>
                </SheetHeader>
                <div className="p-4">{sessionList}</div>
              </SheetContent>
            </Sheet>
            <button
              onClick={newSession}
              className="inline-flex items-center gap-2 rounded-full bg-foreground px-4 py-2 text-xs font-semibold uppercase tracking-[0.1em] text-background"
            >
              <Plus className="h-3.5 w-3.5 text-orange" /> New
            </button>
          </div>
        </div>

        <div className="mt-8 grid gap-4 pb-4 lg:grid-cols-[0.28fr_0.72fr]">
          <aside className="hidden rounded-[1.75rem] border border-border bg-card p-4 lg:block">
            <SectionLabel className="px-2">Conversations</SectionLabel>
            <div className="mt-4">{sessionList}</div>
          </aside>

          <section className="flex min-h-[540px] flex-col overflow-hidden rounded-[2rem] border border-border bg-card">
            <div className="flex items-center justify-between border-b border-border px-5 py-4 sm:px-6">
              <div className="flex items-center gap-3">
                <span className="flex h-9 w-9 items-center justify-center rounded-full bg-orange text-ink">
                  <Sparkles className="h-4 w-4" />
                </span>
                <div>
                  <p className="text-sm font-semibold">FitMentor Coach</p>
                  <p className="flex items-center gap-1.5 text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
                    <span className="h-1.5 w-1.5 rounded-full bg-orange" /> Online
                  </p>
                </div>
              </div>
              <span className="hidden text-[10px] uppercase tracking-[0.14em] text-muted-foreground sm:block">
                {messages.length} messages
              </span>
            </div>

            <div className="flex-1 overflow-y-auto px-5 py-6 sm:px-6">
              {messages.length === 0 ? (
                <div className="mx-auto max-w-lg">
                  <p className="text-2xl font-medium leading-snug tracking-[-0.02em] sm:text-3xl">
                    What do you want to fix this week?
                  </p>
                  <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
                    Training, food, recovery, or the week you just missed. Start with one of
                    these or type your own.
                  </p>
                  <div className="mt-6 grid gap-2 sm:grid-cols-2">
                    {STARTERS.map((s) => (
                      <button
                        key={s}
                        onClick={() => send(s)}
                        className="rounded-2xl border border-border px-4 py-3 text-left text-sm transition-colors hover:border-orange hover:bg-orange/5"
                      >
                        {s}
                      </button>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="space-y-4">
                  {messages.map((m, i) => (
                    <div
                      key={i}
                      className={m.role === "user" ? "flex justify-end" : "flex justify-start"}
                    >
                      {m.role === "assistant" ? (
                        <div className="max-w-[92%] rounded-2xl rounded-bl-md bg-secondary px-4 py-3 sm:max-w-[85%]">
                          <p className="label-micro mb-2 text-orange">Coach</p>
                          <div className="space-y-2 text-sm leading-relaxed [&_code]:rounded [&_code]:bg-background [&_code]:px-1 [&_code]:py-0.5 [&_code]:text-xs [&_li]:my-0.5 [&_ol]:list-decimal [&_ol]:pl-5 [&_p]:leading-relaxed [&_strong]:font-semibold [&_ul]:list-disc [&_ul]:pl-5">
                            <ReactMarkdown>{m.content}</ReactMarkdown>
                          </div>
                        </div>
                      ) : (
                        <div className="max-w-[85%] rounded-2xl rounded-br-md bg-foreground px-4 py-3 text-sm leading-relaxed text-background">
                          {m.content}
                        </div>
                      )}
                    </div>
                  ))}
                  {loading ? (
                    <div className="flex justify-start">
                      <div className="flex gap-1 rounded-2xl rounded-bl-md bg-secondary px-4 py-4">
                        <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-orange [animation-delay:-0.3s]" />
                        <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-orange [animation-delay:-0.15s]" />
                        <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-orange" />
                      </div>
                    </div>
                  ) : null}
                  <div ref={endRef} />
                </div>
              )}
            </div>

            <form
              onSubmit={(e) => {
                e.preventDefault();
                send(input);
              }}
              className="border-t border-border p-3 sm:p-4"
            >
              <div className="flex items-center gap-2 rounded-full border border-border bg-background p-1.5 pl-4">
                <Sparkles className="h-3.5 w-3.5 shrink-0 text-orange" />
                <input
                  id="coach-message"
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  placeholder="Ask your coach…"
                  className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
                />
                <button
                  type="submit"
                  disabled={loading || !input.trim()}
                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-orange text-ink transition-transform hover:scale-105 disabled:opacity-40"
                  aria-label="Send message"
                >
                  <ArrowUp className="h-4 w-4" />
                </button>
              </div>
            </form>
          </section>
        </div>
      </div>
    </MobileShell>
  );
}
