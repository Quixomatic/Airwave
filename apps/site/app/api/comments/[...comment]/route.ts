import { NextComment } from "@fuma-comment/server/next";

import { commentsAdapter } from "@/lib/comments";

/**
 * Blog comment API — fuma-comment's Next binding wired to the GitHub Discussions adapter
 * (`fuma-comment-github-discussions`). Handles GET/POST/PATCH/DELETE for list, post, edit, delete,
 * and reactions under `/api/comments/*`. `role: "database"` routes moderation through the adapter's
 * `getRole` so `GITHUB_COMMENTS_OWNER_LOGIN` can delete any comment.
 */
export const { GET, POST, PATCH, DELETE } = NextComment({
  role: "database",
  mention: { enabled: true }, // @mention autocomplete via the adapter's queryUsers (mentionableUsers)
  ...commentsAdapter(),
});
