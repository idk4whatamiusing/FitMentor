import { getCloudflareEnv } from "@/utils/session";

export function getEnv(name: string): string {
  const fromProcess = process.env[name];
  if (fromProcess) return fromProcess;
  const cfEnv = getCloudflareEnv() as Record<string, string> | null;
  if (cfEnv && cfEnv[name]) return cfEnv[name];
  return "";
}