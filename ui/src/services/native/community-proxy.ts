// Native replacement for `@/services/community-proxy`.
import { requestOrNull } from "./http";

export async function proxyCommunityGraphQL(opts: {
  data: { query: string; variables?: Record<string, unknown> };
}): Promise<unknown> {
  const body = await requestOrNull<Record<string, unknown>>(
    "/v1/community/graphql",
    { method: "POST", body: JSON.stringify(opts.data) },
  );
  return body ?? { errors: [{ message: "Unauthorized" }] };
}
