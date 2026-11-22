import { createFileRoute } from "@tanstack/react-router";
import { AuthScreen } from "@/components/AuthScreen";

export const Route = createFileRoute("/signup")({
  head: () => ({ meta: [{ title: "Create account — FitMentor" }] }),
  component: () => <AuthScreen mode="signup" />,
});
