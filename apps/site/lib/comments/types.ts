/**
 * Local mirrors of the shapes the `@fuma-comment/react` client fetches over its REST contract
 * (see `.refs/fuma-comment/packages/server/src/types.ts`). We re-declare them here so our route
 * handlers don't import the heavy `@fuma-comment/server` package at runtime — we only need the
 * JSON shapes the UI expects on the wire.
 */

/** A tiptap/ProseMirror content node (what the editor emits and `ContentRenderer` renders). */
export interface JSONContent {
  type?: string;
  text?: string;
  marks?: { type: string; attrs?: Record<string, unknown> }[];
  attrs?: Record<string, unknown>;
  content?: JSONContent[];
}

export interface UserProfile {
  id: string;
  name: string;
  image?: string;
}

/** One comment as the fuma-comment UI expects it (`SerializedComment`). `timestamp` is an ISO string over JSON. */
export interface SerializedComment {
  id: string;
  /** Present only on replies; the id of the top-level comment it belongs to. */
  threadId?: string;
  page: string;
  author: UserProfile;
  content: JSONContent;
  likes: number;
  dislikes: number;
  replies: number;
  timestamp: string;
  /** true = liked, false = disliked, undefined = no rating from the current viewer. */
  liked?: boolean;
}

export interface Role {
  name: string;
  canDelete: boolean;
}

/** `GET /api/comments/:page/auth` response. */
export interface AuthInfoWithRole {
  id: string;
  role: Role | null;
}
