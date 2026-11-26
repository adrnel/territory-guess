import { env } from "cloudflare:workers";

export function json(data: unknown, status = 200, headers: Record<string, string> = {}) {
  return Response.json(data, { status, headers: { "Cache-Control": "no-store", ...headers } });
}

export async function readJson(request: Request): Promise<Record<string, unknown> | null> {
  try {
    const text = await request.text();
    if (text.length > 2000) return null;
    const value: unknown = JSON.parse(text);
    return value && typeof value === "object" && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

export function isSessionId(value: unknown): value is string {
  return typeof value === "string"
    && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
}

/**
 * Per-IP rate limiting. "api" covers ordinary gameplay requests; "create"
 * is a tighter limit for things that create rows or rooms.
 * Returns a 429 response when the caller is over the limit.
 */
export async function rateLimited(request: Request, kind: "api" | "create"): Promise<Response | null> {
  const limiter = kind === "create" ? env.CREATE_LIMITER : env.API_LIMITER;
  if (!limiter) return null;
  const ip = request.headers.get("cf-connecting-ip") ?? "local";
  try {
    const { success } = await limiter.limit({ key: ip });
    if (!success) return json({ error: "Too many requests. Please slow down and try again shortly." }, 429, { "Retry-After": "30" });
  } catch (error) {
    console.error("Rate limiter unavailable", error);
  }
  return null;
}
