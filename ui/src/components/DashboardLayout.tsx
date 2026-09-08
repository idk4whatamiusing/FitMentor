import { type ReactNode } from "react";
import { MobileShell } from "@/components/MobileShell";
import type { Profile } from "@/utils/profile";
import { useAuth } from "@/utils/auth";

export function DashboardLayout({
  children,
  profile,
}: {
  children: ReactNode;
  profile?: Profile | null;
}) {
  const auth = useAuth();
  return (
    <MobileShell>
      {/* Top bar with greeting — ponytail: reuses MobileShell for nav, adds greeting */}
      <div className="px-5 pt-14 pb-2">
        <p className="text-[11px] font-medium uppercase tracking-[0.2em] text-muted-foreground">
          <span suppressHydrationWarning>
            {new Date().toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "short" })}
          </span>
          {auth?.user?.email && (
            <span className="ml-2 lowercase normal-case tracking-normal text-primary">· {auth.user.email}</span>
          )}
        </p>
        {profile && (
          <h1 className="mt-1 text-3xl font-bold tracking-tight">
            Hey, <span className="text-gradient">{profile.name.split(" ")[0]}</span>
          </h1>
        )}
      </div>
      {children}
    </MobileShell>
  );
}
