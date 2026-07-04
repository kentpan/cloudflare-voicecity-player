/**
 * Authentication utilities: JWT-based sessions for the admin user.
 *
 * In this lite version there is only ONE admin user (the person who knows
 * ADMIN_SECRET or has registered a passkey). No database is needed —
 * the JWT itself carries the user identity.
 */
import jwt from "jsonwebtoken";
import { cookies } from "next/headers";

const JWT_SECRET = process.env.JWT_SECRET || "voicecity-lite-dev-secret-change-me";
const TOKEN_COOKIE = "voicecity_token";
const TOKEN_TTL_SECONDS = 60 * 60 * 24 * 7; // 7 days

export interface AuthUser {
  id: string;
  username: string;
  name: string | null;
  role: string;
  email: string | null;
}

export interface AuthToken {
  sub: string;
  username: string;
  role: string;
  iat: number;
  exp: number;
}

/** The single admin user in this lite app */
export const ADMIN_USER: AuthUser = {
  id: "admin",
  username: "admin",
  name: "管理员",
  role: "ADMIN",
  email: null,
};

export function signToken(user: AuthUser): string {
  return jwt.sign(
    { sub: user.id, username: user.username, role: user.role },
    JWT_SECRET,
    { expiresIn: TOKEN_TTL_SECONDS }
  );
}

export function verifyToken(token: string): AuthToken | null {
  try {
    return jwt.verify(token, JWT_SECRET) as AuthToken;
  } catch {
    return null;
  }
}

export async function setSessionCookie(user: AuthUser): Promise<void> {
  const token = signToken(user);
  const store = await cookies();
  store.set(TOKEN_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: TOKEN_TTL_SECONDS,
  });
}

export async function clearSessionCookie(): Promise<void> {
  const store = await cookies();
  store.delete(TOKEN_COOKIE);
}

export async function getSessionToken(): Promise<string | undefined> {
  const store = await cookies();
  return store.get(TOKEN_COOKIE)?.value;
}

export async function getCurrentUser(): Promise<AuthUser | null> {
  const token = await getSessionToken();
  if (!token) return null;
  const payload = verifyToken(token);
  if (!payload) return null;
  // In lite mode, any valid JWT = admin user
  return { ...ADMIN_USER, id: payload.sub, username: payload.username, role: payload.role };
}

export function isAdmin(user: AuthUser | null): boolean {
  return user?.role === "ADMIN" || user?.role === "SUPER_ADMIN";
}

/**
 * Require an authenticated admin user; throws an API-friendly error otherwise.
 */
export async function requireAdmin(): Promise<AuthUser> {
  const user = await getCurrentUser();
  if (!user || !isAdmin(user)) {
    const err = new Error("Unauthorized");
    (err as Error & { status: number }).status = 401;
    throw err;
  }
  return user;
}
