import { NextResponse } from "next/server";

export function ok<T>(data: T, init?: ResponseInit) {
  return NextResponse.json({ success: true, data }, init);
}

export function fail(message: string, status = 400, details?: unknown) {
  return NextResponse.json({ success: false, error: message, details }, { status });
}

/**
 * Convert a thrown error into a JSON response, preserving the real error
 * message so the frontend can display it as a toast. Never swallows errors.
 *
 * - Errors with a `status` property (e.g. from requireAuth/requireAdmin) use that status.
 * - Other errors return 500 with the actual error message (not a generic "Internal server error").
 */
export function handleError(err: unknown) {
  const e = err as Error & { status?: number };
  const message = e?.message || String(err) || "未知错误";
  const status = e?.status || 500;
  // Log for server-side debugging, but still return the real message to the client
  if (status >= 500) console.error("[api error]", err);
  return fail(message, status);
}

export async function readBody<T = unknown>(req: Request): Promise<T> {
  try {
    return (await req.json()) as T;
  } catch {
    return {} as T;
  }
}
