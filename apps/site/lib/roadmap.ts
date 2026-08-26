import { createHash } from "node:crypto";

/**
 * Roadmap data layer — SERVER ONLY (never import from a client component; it reads a secret token
 * from `process.env` and uses `node:crypto`). Only the page + the vote route handler import this.
 *
 * The roadmap content AND its votes live in a **GitHub Project (v2)** — no separate database:
 *   - Each roadmap entry is a **draft item** (title + a `Description` Text field + a `Status`
 *     single-select field). James manages these directly in the Project UI; it IS the CMS.
 *   - Votes are stored as hashed voter ids inside each draft item's **body**, in a delimited
 *     HTML-comment block (invisible in GitHub's rendered view). Voting = editing that body.
 *
 * All GitHub calls go through a server-only `project`-scoped token (`GITHUB_PROJECT_TOKEN`).
 * See `.plans/roadmap-voting.md` for the full design + accepted trade-offs (append/edit race,
 * cookie+IP dedup, 64 KB body cap).
 */

const GITHUB_GRAPHQL = "https://api.github.com/graphql";

const TOKEN = process.env.GITHUB_PROJECT_TOKEN;
const OWNER = process.env.ROADMAP_PROJECT_OWNER;
const NUMBER = process.env.ROADMAP_PROJECT_NUMBER ? Number(process.env.ROADMAP_PROJECT_NUMBER) : NaN;
const SALT = process.env.VOTE_SALT ?? "";

/** True when every env needed to talk to the Project is present. Pages degrade gracefully otherwise. */
export function roadmapConfigured(): boolean {
  return Boolean(TOKEN && OWNER && Number.isFinite(NUMBER));
}

export type RoadmapStatus = string; // the Project's Status single-select option name, or "" if unset

export type RoadmapItem = {
  /** DraftIssue node id — the vote target (what `updateProjectV2DraftIssue` + the vote route key on). */
  id: string;
  title: string;
  description: string;
  status: RoadmapStatus;
  voteCount: number;
  hasVoted: boolean;
};

// ── Vote-block parsing ──────────────────────────────────────────────────────────────────────────
// Delimited so any human notes elsewhere in the body are preserved on every edit.
//   <!-- roadmap-votes
//   h:<sha256>
//   h:<sha256>
//   -->
const BLOCK_RE = /<!--\s*roadmap-votes\b[\s\S]*?-->/;

/** Extract the set of voter hashes from a draft body. */
export function parseVotes(body: string | null | undefined): Set<string> {
  const set = new Set<string>();
  const m = body?.match(BLOCK_RE);
  if (!m) return set;
  for (const line of m[0].split("\n")) {
    const t = line.trim();
    if (t.startsWith("h:")) {
      const h = t.slice(2).trim();
      if (h) set.add(h);
    }
  }
  return set;
}

/** Re-emit a body with the vote block replaced (or removed when there are no votes). */
export function serializeVotes(body: string | null | undefined, hashes: Set<string>): string {
  const base = (body ?? "").replace(BLOCK_RE, "").trimEnd();
  if (hashes.size === 0) return base;
  const block = ["<!-- roadmap-votes", ...[...hashes].map((h) => `h:${h}`), "-->"].join("\n");
  return base ? `${base}\n\n${block}` : block;
}

// ── Voter identity ──────────────────────────────────────────────────────────────────────────────
/**
 * Stable-per-browser voter hash = sha256(rmv_id : clientIp : VOTE_SALT), computed server-side.
 * Storing only the hash (never the raw cookie/IP) keeps the body free of PII; the salt keeps the
 * hash non-reversible/non-portable. Same inputs used by the page (for `hasVoted`) and the vote route.
 */
export function voterHash(rmvId: string, clientIp: string): string {
  return createHash("sha256").update(`${rmvId}:${clientIp}:${SALT}`).digest("hex");
}

// ── GitHub GraphQL ──────────────────────────────────────────────────────────────────────────────
async function gql<T>(query: string, variables: Record<string, unknown>): Promise<T> {
  const res = await fetch(GITHUB_GRAPHQL, {
    method: "POST",
    headers: {
      Authorization: `bearer ${TOKEN}`,
      "Content-Type": "application/json",
      "User-Agent": "airwave-roadmap",
    },
    body: JSON.stringify({ query, variables }),
    // Votes must reflect instantly and `hasVoted` is per-visitor, so never cache the GitHub calls.
    cache: "no-store",
  });
  if (!res.ok) {
    throw new Error(`GitHub GraphQL ${res.status}: ${await res.text()}`);
  }
  const json = (await res.json()) as { data?: T; errors?: { message: string }[] };
  if (json.errors?.length) {
    throw new Error(`GitHub GraphQL errors: ${json.errors.map((e) => e.message).join("; ")}`);
  }
  if (!json.data) throw new Error("GitHub GraphQL: empty response");
  return json.data;
}

const LIST_QUERY = /* GraphQL */ `
  query ($owner: String!, $number: Int!) {
    user(login: $owner) {
      projectV2(number: $number) {
        items(first: 100) {
          nodes {
            content {
              __typename
              ... on DraftIssue {
                id
                title
                body
              }
            }
            fieldValues(first: 20) {
              nodes {
                __typename
                ... on ProjectV2ItemFieldTextValue {
                  text
                  field {
                    ... on ProjectV2FieldCommon {
                      name
                    }
                  }
                }
                ... on ProjectV2ItemFieldSingleSelectValue {
                  name
                  field {
                    ... on ProjectV2FieldCommon {
                      name
                    }
                  }
                }
              }
            }
          }
        }
      }
    }
  }
`;

type FieldValueNode = {
  __typename: string;
  text?: string;
  name?: string;
  field?: { name?: string };
};

type ItemNode = {
  content: { __typename: string; id?: string; title?: string; body?: string } | null;
  fieldValues: { nodes: FieldValueNode[] };
};

type ListResponse = {
  user: { projectV2: { items: { nodes: ItemNode[] } } | null } | null;
};

function fieldValue(nodes: FieldValueNode[], fieldName: string): string {
  for (const n of nodes) {
    if (n.field?.name?.toLowerCase() !== fieldName.toLowerCase()) continue;
    // Text fields carry `text`; single-select fields carry the option `name`.
    if (typeof n.text === "string") return n.text;
    if (typeof n.name === "string") return n.name;
  }
  return "";
}

/**
 * Read the whole roadmap and compute per-visitor `hasVoted` against the requester's hash.
 * Returns `[]` (never throws to the page) when unconfigured or GitHub is unreachable.
 */
export async function getRoadmap(requesterHash: string | null): Promise<RoadmapItem[]> {
  if (!roadmapConfigured()) return [];
  let data: ListResponse;
  try {
    data = await gql<ListResponse>(LIST_QUERY, { owner: OWNER, number: NUMBER });
  } catch (err) {
    console.error("[roadmap] list failed:", err);
    return [];
  }

  const nodes = data.user?.projectV2?.items?.nodes ?? [];
  const items: RoadmapItem[] = [];
  for (const node of nodes) {
    const content = node.content;
    // Only draft items are roadmap entries (a converted issue would have a different __typename).
    if (!content || content.__typename !== "DraftIssue" || !content.id) continue;
    const votes = parseVotes(content.body);
    items.push({
      id: content.id,
      title: content.title ?? "Untitled",
      description: fieldValue(node.fieldValues.nodes, "Description"),
      status: fieldValue(node.fieldValues.nodes, "Status"),
      voteCount: votes.size,
      hasVoted: requesterHash ? votes.has(requesterHash) : false,
    });
  }
  return items;
}

const BODY_QUERY = /* GraphQL */ `
  query ($id: ID!) {
    node(id: $id) {
      ... on DraftIssue {
        body
      }
    }
  }
`;

const UPDATE_MUTATION = /* GraphQL */ `
  mutation ($id: ID!, $body: String!) {
    updateProjectV2DraftIssue(input: { draftIssueId: $id, body: $body }) {
      draftIssue {
        id
      }
    }
  }
`;

/**
 * Toggle the requester's vote on one draft item (read body → add/remove hash → write body).
 * Read-modify-write on a single field with no lock — a simultaneous vote can clobber (accepted;
 * a reload re-reads the source of truth). Returns the fresh `{ voteCount, hasVoted }`.
 */
export async function toggleVote(
  draftId: string,
  hash: string,
): Promise<{ voteCount: number; hasVoted: boolean }> {
  const body = (await gql<{ node: { body?: string } | null }>(BODY_QUERY, { id: draftId })).node?.body ?? "";
  const votes = parseVotes(body);
  let hasVoted: boolean;
  if (votes.has(hash)) {
    votes.delete(hash);
    hasVoted = false;
  } else {
    votes.add(hash);
    hasVoted = true;
  }
  await gql(UPDATE_MUTATION, { id: draftId, body: serializeVotes(body, votes) });
  return { voteCount: votes.size, hasVoted };
}
