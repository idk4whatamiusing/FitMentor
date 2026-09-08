import { proxyGraphQL } from "@/services/api-proxy";

export function getClient() {
  return {
    async request<T = any>(query: string, variables?: Record<string, unknown>): Promise<T> {
      const result = await proxyGraphQL({ data: { query, variables } });
      if (result.errors) {
        throw new Error(result.errors[0]?.message ?? "GraphQL error");
      }
      return result.data as T;
    },
  };
}
