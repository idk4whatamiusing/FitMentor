import { GraphQLClient } from "graphql-request";

const API_URL = import.meta.env.VITE_API_URL ?? "https://16-112-132-239.sslip.io";

let token: string | null = null;

export function setAuthToken(t: string | null) {
  token = t;
}

export function getClient() {
  return new GraphQLClient(`${API_URL}/graphql`, {
    headers: () => {
      const h: Record<string, string> = {};
      if (token) {
        h["Authorization"] = `Bearer ${token}`;
        h["cf-access-jwt-assertion"] = token;
      }
      return h;
    },
  });
}
