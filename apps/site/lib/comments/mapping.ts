import { markdownToDoc } from "./content";
import type { GComment, GDiscussion } from "./github";
import type { SerializedComment } from "./types";

/**
 * Map GitHub Discussion comments onto the fuma-comment `SerializedComment` shape and do the list
 * shaping (thread selection, sort, cursor, limit) in memory. A blog thread is small enough that we
 * fetch the whole discussion (100 comments x 100 replies) once and slice per request.
 */

function reaction(c: GComment, content: "THUMBS_UP" | "THUMBS_DOWN") {
  const g = c.reactionGroups?.find((r) => r.content === content);
  return {
    count: g?.reactors?.totalCount ?? g?.users?.totalCount ?? 0,
    viewer: g?.viewerHasReacted ?? false,
  };
}

export function mapComment(c: GComment, page: string, threadId?: string): SerializedComment {
  const up = reaction(c, "THUMBS_UP");
  const down = reaction(c, "THUMBS_DOWN");
  return {
    id: c.id,
    threadId: threadId ?? c.replyTo?.id ?? undefined,
    page,
    author: {
      // login is the stable identity used both here and by /auth, so edit/delete gating lines up.
      id: c.author?.login ?? "ghost",
      name: c.author?.login ?? "ghost",
      image: c.author?.avatarUrl,
    },
    content: markdownToDoc(c.body),
    likes: up.count,
    dislikes: down.count,
    replies: c.replies?.totalCount ?? 0,
    timestamp: c.createdAt,
    liked: up.viewer ? true : down.viewer ? false : undefined,
  };
}

function visible(c: GComment): boolean {
  return !c.deletedAt && !c.isMinimized;
}

export interface ListParams {
  thread?: string;
  sort?: "newest" | "oldest";
  before?: number;
  after?: number;
  limit?: number;
}

/**
 * Build the comment page the UI asked for. `thread` absent → top-level comments; `thread=<id>` →
 * that comment's replies. `before`/`after` are timestamp cursors (ms) matching fuma-comment's paging.
 */
export function buildList(
  discussion: GDiscussion | null,
  page: string,
  params: ListParams,
): SerializedComment[] {
  if (!discussion) return [];
  const top = discussion.comments.nodes.filter(visible);

  let source: SerializedComment[];
  if (params.thread) {
    const parent = top.find((c) => c.id === params.thread);
    source = (parent?.replies?.nodes ?? [])
      .filter(visible)
      .map((r) => mapComment(r, page, params.thread));
  } else {
    source = top.map((c) => mapComment(c, page));
  }

  const sort = params.sort ?? "newest";
  source.sort((a, b) => {
    const ta = new Date(a.timestamp).getTime();
    const tb = new Date(b.timestamp).getTime();
    return sort === "newest" ? tb - ta : ta - tb;
  });

  if (typeof params.before === "number") {
    source = source.filter((c) => new Date(c.timestamp).getTime() < params.before!);
  }
  if (typeof params.after === "number") {
    source = source.filter((c) => new Date(c.timestamp).getTime() > params.after!);
  }

  const limit = params.limit ?? 40;
  return source.slice(0, limit);
}
