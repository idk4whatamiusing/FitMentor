import { createFileRoute } from "@tanstack/react-router";
import { AuthScreen } from "@/components/AuthScreen";

export const Route = createFileRoute("/signin")({
  head: () => ({ meta: [{ title: "Sign in — FitMentor" }] }),
  component: () => <AuthScreen mode="signin" />,
});
