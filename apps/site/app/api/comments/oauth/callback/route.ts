import { commentsOAuth } from "@/lib/comments";

/** GET /api/comments/oauth/callback → exchange the code, set the encrypted cookie, redirect back. */
export const GET = commentsOAuth().callback;
