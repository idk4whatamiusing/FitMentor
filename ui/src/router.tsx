import { QueryClient } from "@tanstack/react-query";
import { createRouter } from "@tanstack/react-router";
import { routeTree } from "./routeTree.gen";
import { platformName } from "@/utils/platform";

// Lets CSS and components branch on the shell without waiting for hydration.
if (typeof document !== "undefined") {
  document.documentElement.dataset.platform = platformName();
}

export const getRouter = () => {
  const queryClient = new QueryClient();

  const router = createRouter({
    routeTree,
    context: { queryClient },
    scrollRestoration: true,
    defaultPreloadStaleTime: 0,
  });

  return router;
};
