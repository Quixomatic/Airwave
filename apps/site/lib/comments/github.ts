import { GITHUB_GRAPHQL, commentsConfig } from "./config";

/**
 * GitHub Discussions GraphQL — SERVER ONLY. Ported from giscus's `services/github/*`, trimmed to what
 * the blog needs and fetching raw `body` Markdown (not `bodyHTML`) so we can rebuild the editor doc.
 * Every call takes an explicit token: the signed-in reader's OAuth token for writes and viewer-scoped
 * reads, or the server read token for anonymous listing.
 */

export interface GReactionGroup {
  content: string;
  reactors?: { totalCount: number };
  users?: { totalCount: number };
  viewerHasReacted: boolean;
}

export interface GAuthor {
  login: string;
  avatarUrl: string;
  url: string;
}

export interface GComment {
  id: string;
  body: string;
  createdAt: string;
  lastEditedAt: string | null;
  deletedAt: string | null;
  isMinimized: boolean;
  author: GAuthor | null;
  viewerDidAuthor: boolean;
  reactionGroups: GReactionGroup[];
  replyTo?: { id: string } | null;
  replies?: { totalCount: number; nodes: GComment[] };
}

export interface GDiscussion {
  id: string;
  title: string;
  url: string;
  locked: boolean;
  comments: { totalCount: number; nodes: GComment[] };
}

async function gql<T>(query: string, variables: Record<string, unknown>, token: string): Promise<T> {
  const res = await fetch(GITHUB_GRAPHQL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      "User-Agent": "airwave-comments",
    },
    body: JSON.stringify({ query, variables }),
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`GitHub GraphQL ${res.status}: ${await res.text()}`);
  const json = (await res.json()) as { data?: T; errors?: { message: string }[] };
  if (json.errors?.length) {
    throw new Error(`GitHub GraphQL errors: ${json.errors.map((e) => e.message).join("; ")}`);
  }
  if (!json.data) throw new Error("GitHub GraphQL: empty response");
  return json.data;
}

const COMMENT_FIELDS = /* GraphQL */ `
  id
  body
  createdAt
  lastEditedAt
  deletedAt
  isMinimized
  author { login avatarUrl url }
  viewerDidAuthor
  reactionGroups { content viewerHasReacted reactors { totalCount } }
`;

const DISCUSSION_FIELDS = /* GraphQL */ `
  id
  title
  url
  locked
  comments(first: 100) {
    totalCount
    nodes {
      ${COMMENT_FIELDS}
      replies(first: 100) {
        totalCount
        nodes {
          ${COMMENT_FIELDS}
          replyTo { id }
        }
      }
    }
  }
`;

const SEARCH_QUERY = /* GraphQL */ `
  query ($query: String!) {
    viewer { login }
    search(type: DISCUSSION, first: 10, query: $query) {
      nodes { ... on Discussion { ${DISCUSSION_FIELDS} } }
    }
  }
`;

export interface DiscussionResult {
  viewerLogin: string | null;
  discussion: GDiscussion | null;
}

/**
 * Find the discussion whose title exactly equals `term` (our canonical per-post title). GitHub search
 * is fuzzy, so we search within the configured category and then match the title exactly among results.
 */
export async function findDiscussion(term: string, token: string): Promise<DiscussionResult> {
  const repo = commentsConfig.repo.toLowerCase();
  const categoryQuery = commentsConfig.category ? `category:${JSON.stringify(commentsConfig.category)}` : "";
  const query = `repo:${repo} ${categoryQuery} in:title ${JSON.stringify(term)}`;
  const data = await gql<{
    viewer: { login: string } | null;
    search: { nodes: (GDiscussion | Record<string, never>)[] };
  }>(SEARCH_QUERY, { query }, token);

  const match =
    data.search.nodes.find((n): n is GDiscussion => "title" in n && n.title === term) ?? null;
  return { viewerLogin: data.viewer?.login ?? null, discussion: match };
}

const CREATE_DISCUSSION = /* GraphQL */ `
  mutation ($repositoryId: ID!, $categoryId: ID!, $title: String!, $body: String!) {
    createDiscussion(
      input: { repositoryId: $repositoryId, categoryId: $categoryId, title: $title, body: $body }
    ) {
      discussion { ${DISCUSSION_FIELDS} }
    }
  }
`;

export async function createDiscussion(term: string, url: string, token: string): Promise<GDiscussion> {
  const body = `Comment thread for the Airwave blog post [${term}](${url}).\n\nPosted through getairwave.tv.`;
  const data = await gql<{ createDiscussion: { discussion: GDiscussion } }>(
    CREATE_DISCUSSION,
    { repositoryId: commentsConfig.repoId, categoryId: commentsConfig.categoryId, title: term, body },
    token,
  );
  return data.createDiscussion.discussion;
}

const ADD_COMMENT = /* GraphQL */ `
  mutation ($discussionId: ID!, $body: String!, $replyToId: ID) {
    addDiscussionComment(input: { discussionId: $discussionId, body: $body, replyToId: $replyToId }) {
      comment {
        ${COMMENT_FIELDS}
        replyTo { id }
        replies(first: 100) { totalCount nodes { id } }
      }
    }
  }
`;

export async function addComment(
  discussionId: string,
  body: string,
  token: string,
  replyToId?: string,
): Promise<GComment> {
  const data = await gql<{ addDiscussionComment: { comment: GComment } }>(
    ADD_COMMENT,
    { discussionId, body, replyToId: replyToId ?? null },
    token,
  );
  return data.addDiscussionComment.comment;
}

const UPDATE_COMMENT = /* GraphQL */ `
  mutation ($commentId: ID!, $body: String!) {
    updateDiscussionComment(input: { commentId: $commentId, body: $body }) {
      comment { id }
    }
  }
`;

export async function updateComment(commentId: string, body: string, token: string): Promise<void> {
  await gql(UPDATE_COMMENT, { commentId, body }, token);
}

const DELETE_COMMENT = /* GraphQL */ `
  mutation ($id: ID!) {
    deleteDiscussionComment(input: { id: $id }) {
      comment { id }
    }
  }
`;

export async function deleteComment(commentId: string, token: string): Promise<void> {
  await gql(DELETE_COMMENT, { id: commentId }, token);
}

const REACTION = (mode: "add" | "remove") => /* GraphQL */ `
  mutation ($subjectId: ID!, $content: ReactionContent!) {
    ${mode}Reaction(input: { subjectId: $subjectId, content: $content }) { clientMutationId }
  }
`;

/** Best-effort: add/remove a reaction; ignore "already exists" / "not found" style errors. */
export async function setReaction(
  subjectId: string,
  content: "THUMBS_UP" | "THUMBS_DOWN",
  mode: "add" | "remove",
  token: string,
): Promise<void> {
  try {
    await gql(REACTION(mode), { subjectId, content }, token);
  } catch (err) {
    // Toggling to a state it's already in is not an error worth surfacing.
    if (process.env.NODE_ENV !== "production") console.warn("[comments] reaction", mode, err);
  }
}

const VIEWER_QUERY = /* GraphQL */ `query { viewer { login } }`;

export async function getViewerLogin(token: string): Promise<string | null> {
  const data = await gql<{ viewer: { login: string } | null }>(VIEWER_QUERY, {}, token);
  return data.viewer?.login ?? null;
}

const VIEWER_REACTIONS = /* GraphQL */ `
  query ($id: ID!) {
    node(id: $id) {
      ... on DiscussionComment {
        reactionGroups { content viewerHasReacted }
      }
    }
  }
`;

/**
 * Which of 👍/👎 the current viewer has on a comment — so we only ever add a reaction they lack or
 * remove one they have. (GitHub's `removeReaction` errors with a misleading "does not have the correct
 * permissions" when the reaction isn't actually there.)
 */
export async function getViewerReactions(
  commentId: string,
  token: string,
): Promise<{ up: boolean; down: boolean }> {
  const data = await gql<{
    node: { reactionGroups?: { content: string; viewerHasReacted: boolean }[] } | null;
  }>(VIEWER_REACTIONS, { id: commentId }, token);
  const groups = data.node?.reactionGroups ?? [];
  const has = (c: string) => groups.find((g) => g.content === c)?.viewerHasReacted ?? false;
  return { up: has("THUMBS_UP"), down: has("THUMBS_DOWN") };
}
