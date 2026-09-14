import { cookies } from "next/headers";

import { TOKEN_COOKIE, commentsConfig } from "./config";
import { decrypt } from "./crypto";

/**
 * The signed-in reader's GitHub token lives encrypted in an httpOnly cookie (`awc_gh`), so client JS
 * never sees it and every GitHub call is made server-side on the user's behalf. These helpers read it;
 * the OAuth callback route writes it and logout clears it (both via the NextResponse cookie API).
 */

const ONE_YEAR = 60 * 60 * 24 * 365;

/** Read + decrypt the current user's GitHub token, or null if signed out / cookie invalid. */
export async function readUserToken(): Promise<string | null> {
  const raw = (await cookies()).get(TOKEN_COOKIE)?.value;
  if (!raw) return null;
  try {
    return decrypt(raw, commentsConfig.tokenSecret);
  } catch {
    return null;
  }
}

/** Cookie attributes shared by the set (callback) and clear (logout) paths. */
export function tokenCookie(value: string, maxAge: number) {
  return {
    name: TOKEN_COOKIE,
    value,
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
    maxAge,
  };
}

export const TOKEN_MAX_AGE = ONE_YEAR;
