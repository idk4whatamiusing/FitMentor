const SESSION_TTL = 0; // no expiry
const REMEMBER_TTL = 0; // no expiry
const TOKEN_MAX_AGE = 0; // no expiry
const ENCRYPTION_IV_LENGTH = 12; // 96-bit IV for AES-GCM

export function getCloudflareEnv(): Record<string, unknown> | null {
  // 1. Try globalThis.__cf_env first (set from env in server.ts, full bindings)
  const fromGlobal = (globalThis as any).__cf_env;
  if (fromGlobal) return fromGlobal;
  // 2. Try TanStack Start ALS event storage
  try {
    const key = Symbol.for("tanstack-start:event-storage");
    const store = (globalThis as any)[key]?.getStore?.();
    const event: any = store?.h3Event;
    if (event?.context?.cloudflare?.env) return event.context.cloudflare.env;
    if (event?.context?.env) return event.context.env;
    if (event?.req?.runtime?.cloudflare?.env) return event.req.runtime.cloudflare.env;
  } catch {}
  // 3. Try Nitro event context directly
  try {
    const key = Symbol.for("nitro:event-context");
    const store = (globalThis as any)[key]?.getStore?.();
    const event: any = store?.event;
    if (event?.context?.cloudflare?.env) return event.context.cloudflare.env;
    if (event?.context?.cf) return event.context.cf;
  } catch {}
  return null;
}

export function getKV(): any | null {
  const env = getCloudflareEnv();
  if (!env) return null;
  return env.fitmentor_sessions ?? null;
}

function getSecret(): string {
  // Try process.env first (works in local dev / Node)
  const fromProcess = process.env.SESSION_SECRET;
  if (fromProcess) return fromProcess;
  // Fall back to Cloudflare env binding (works in Workers runtime)
  const cfEnv = getCloudflareEnv() as Record<string, string> | null;
  const fromCf = cfEnv?.SESSION_SECRET;
  if (fromCf) return fromCf;
  throw new Error("SESSION_SECRET not set");
}

async function deriveEncryptionKey(secret: string): Promise<CryptoKey> {
  const keyMaterial = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(secret));
  return crypto.subtle.importKey("raw", keyMaterial, { name: "AES-GCM" }, false, ["encrypt", "decrypt"]);
}

export async function deriveKey(sid: string): Promise<string> {
  let secret: string | undefined;
  try {
    secret = getSecret();
  } catch {
    return sid;
  }
  const data = new TextEncoder().encode(sid + secret);
  const hash = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(hash)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

export interface SessionData {
  sub: string;
  email: string;
  name: string;
  provider: string;
}

// --- Signed token helpers ---
// Cookie format: base64url(payload).hex(hmac)
// Payload: { sid, sub, email, exp } — session data embedded for KV-free reads

function base64urlEncode(buf: ArrayBuffer): string {
  return btoa(String.fromCharCode(...new Uint8Array(buf)))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

function base64urlDecode(str: string): ArrayBuffer {
  let base64 = str.replace(/-/g, "+").replace(/_/g, "/");
  while (base64.length % 4) base64 += "=";
  const bin = atob(base64);
  const buf = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) buf[i] = bin.charCodeAt(i);
  return buf.buffer;
}

async function createSignedToken(sid: string, ip?: string, rememberToken?: string): Promise<string> {
  try {
    const secret = getSecret();
    const payload = JSON.stringify({ sid, ip: ip || "", rememberToken: rememberToken || "", exp: Math.floor(Date.now() / 1000) + 365 * 24 * 60 * 60 });
    const key = await deriveEncryptionKey(secret);
    const iv = crypto.getRandomValues(new Uint8Array(ENCRYPTION_IV_LENGTH));
    const encrypted = await crypto.subtle.encrypt(
      { name: "AES-GCM", iv },
      key,
      new TextEncoder().encode(payload),
    );
    const combined = new Uint8Array(ENCRYPTION_IV_LENGTH + encrypted.byteLength);
    combined.set(iv, 0);
    combined.set(new Uint8Array(encrypted), ENCRYPTION_IV_LENGTH);
    return base64urlEncode(combined.buffer);
  } catch {
    return sid;
  }
}

export interface SignedTokenPayload {
  sid: string;
  ip: string;
  rememberToken?: string;
  exp: number;
}

async function verifySignedToken(token: string): Promise<SignedTokenPayload | null> {
  try {
    const secret = getSecret();

    // Old format (with dot separator — HMAC-signed base64 payload)
    if (token.includes(".")) {
      const dot = token.lastIndexOf(".");
      const payloadB64 = token.slice(0, dot);
      const payload = JSON.parse(new TextDecoder().decode(base64urlDecode(payloadB64)));
      if (!payload.sid) return null;
      return payload as SignedTokenPayload;
    }

    // New format — AES-GCM encrypted
    const decoded = base64urlDecode(token);
    if (decoded.byteLength < ENCRYPTION_IV_LENGTH + 1) return null;
    const iv = decoded.slice(0, ENCRYPTION_IV_LENGTH);
    const encrypted = decoded.slice(ENCRYPTION_IV_LENGTH);
    const key = await deriveEncryptionKey(secret);
    const decrypted = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, encrypted);
    const payload = JSON.parse(new TextDecoder().decode(decrypted));
    if (!payload.sid) return null;
    return payload as SignedTokenPayload;
  } catch {
    return null;
  }
}

/**
 * Extract session data from the signed token and look up in KV.
 * Verifies IP binding if present in token.
 */
export async function resolveSessionFromToken(cookieValue: string, currentIp?: string): Promise<{ sub: string; email: string } | null> {
  if (!cookieValue) return null;

  let sid: string | null = null;
  let tokenIp: string | undefined;

  if (cookieValue.startsWith("sess_")) {
    sid = cookieValue; // legacy raw sid
  } else {
    const payload = await verifySignedToken(cookieValue);
    if (!payload) return null;
    sid = payload.sid;
    tokenIp = payload.ip;
  }

  // IP binding check: if token has an IP, it must match the current request IP
  if (tokenIp && currentIp && tokenIp !== currentIp) {
    return null; // IP mismatch — possible token theft
  }

  // Look up session data from KV
  const kv = getKV();
  if (!kv) return null;
  try {
    const key = await deriveKey(sid);
    const raw = await kv.get(key);
    if (raw) {
      const data = JSON.parse(raw);
      return { sub: data.sub, email: data.email };
    }
    // Fallback: try raw sid
    const rawFallback = await kv.get(sid);
    if (rawFallback) {
      const data = JSON.parse(rawFallback);
      return { sub: data.sub, email: data.email };
    }
  } catch {}
  return null;
}

/**
 * Extract the raw session ID from any cookie value.
 */
export async function extractSessionId(cookieValue: string): Promise<string | null> {
  if (!cookieValue) return null;
  if (cookieValue.startsWith("sess_")) return cookieValue;
  const payload = await verifySignedToken(cookieValue);
  return payload?.sid ?? null;
}

export async function createSession(data: SessionData & { ip?: string }): Promise<string | null> {
  const kv = getKV();
  if (!kv) return null;
  const sid = `sess_${crypto.randomUUID()}`;
  const rememberToken = `rem_${crypto.randomUUID()}`;
  try {
    const key = await deriveKey(sid);
    await kv.put(key, JSON.stringify({ ...data, rememberToken, createdAt: Date.now() }));
    await kv.put(`remember:${rememberToken}`, JSON.stringify({ sub: data.sub, email: data.email, name: data.name, provider: data.provider }));
    return createSignedToken(sid, data.ip, rememberToken);
  } catch {
    return null;
  }
}

export async function getSession(sid: string): Promise<(SessionData & { rememberToken: string }) | null> {
  const kv = getKV();
  if (!kv) return null;
  try {
    // Try hashed key first (new format — SESSION_SECRET was set)
    const key = await deriveKey(sid);
    const raw = await kv.get(key);
    if (raw) {
      const data = JSON.parse(raw);
      return { sub: data.sub, email: data.email, name: data.name, provider: data.provider, rememberToken: data.rememberToken };
    }
    // Fallback: try raw sid as key (legacy sessions created when SESSION_SECRET was missing)
    const rawFallback = await kv.get(sid);
    if (rawFallback) {
      const data = JSON.parse(rawFallback);
      // Migrate: re-store with hashed key so future lookups work
      await kv.put(key, rawFallback);
      await kv.delete(sid);
      return { sub: data.sub, email: data.email, name: data.name, provider: data.provider, rememberToken: data.rememberToken };
    }
    return null;
  } catch {
    return null;
  }
}

export async function renewSession(sid: string): Promise<string | null> {
  const kv = getKV();
  if (!kv) return null;
  try {
    const key = await deriveKey(sid);
    const raw = await kv.get(key);
    if (!raw) return null;
    const data = JSON.parse(raw);
    const rememberToken = data.rememberToken;
    if (!rememberToken) return null;
    const remRaw = await kv.get(`remember:${rememberToken}`);
    if (!remRaw) return null;
    const remData = JSON.parse(remRaw);
    const newSid = `sess_${crypto.randomUUID()}`;
    const newKey = await deriveKey(newSid);
    await kv.put(newKey, JSON.stringify({ ...remData, rememberToken, createdAt: Date.now() }));
    return createSignedToken(newSid);
  } catch {
    return null;
  }
}

export async function deleteSession(sid: string): Promise<void> {
  const kv = getKV();
  if (!kv) return;
  try {
    const key = await deriveKey(sid);
    await kv.delete(key);
    await kv.delete(sid); // also delete legacy raw-key entry
  } catch {
  }
}

export async function deleteRememberToken(rememberToken: string): Promise<void> {
  const kv = getKV();
  if (!kv) return;
  try {
    await kv.delete(`remember:${rememberToken}`);
  } catch {
  }
}
