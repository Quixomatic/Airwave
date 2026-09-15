"use client";

import { useEffect, useState } from "react";
import { Comments } from "@fuma-comment/react";
import { FaGithub } from "react-icons/fa";

/**
 * Blog comments — the fuma-comment UI, backed by GitHub Discussions through our `/api/comments`
 * routes. Sign-in lives top-right in the panel header; the account is the reader's own GitHub. The
 * navy theme comes from the `.airwave-comments` fc→fd token mapping in `global.css`.
 *
 * This is a client island so the blog post itself stays statically rendered: it fetches its own
 * auth state (rather than the page reading the cookie, which would force dynamic rendering).
 */
export function BlogComments({ slug }: { slug: string }) {
  const [user, setUser] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let active = true;
    fetch(`/api/comments/${encodeURIComponent(slug)}/auth`)
      .then((r) => (r.ok ? (r.json() as Promise<{ id: string }>) : null))
      .then((data) => {
        if (active) setUser(data?.id ?? null);
      })
      .catch(() => {})
      .finally(() => {
        if (active) setLoaded(true);
      });
    return () => {
      active = false;
    };
  }, [slug]);

  const here = () => (typeof window !== "undefined" ? window.location.href : "/blog");
  const signIn = () => {
    window.location.href = `/api/comments/oauth/login?return=${encodeURIComponent(here())}`;
  };
  const signOut = () => {
    window.location.href = `/api/comments/oauth/logout?return=${encodeURIComponent(here())}`;
  };

  const header = (
    <div className="flex items-center justify-between gap-3 border-b border-fd-border px-4 py-3">
      <h2 className="text-sm font-semibold text-fd-foreground">Comments</h2>
      {loaded && user ? (
        <span className="flex items-center gap-2 text-xs text-fd-muted-foreground">
          Signed in as <span className="font-medium text-fd-foreground">@{user}</span>
          <button
            type="button"
            onClick={signOut}
            className="rounded-md px-2 py-1 font-medium text-fd-muted-foreground transition-colors hover:bg-fd-accent hover:text-fd-foreground"
          >
            Sign out
          </button>
        </span>
      ) : (
        <button
          type="button"
          onClick={signIn}
          className="inline-flex items-center gap-2 rounded-md bg-fd-primary px-3 py-1.5 text-xs font-medium text-fd-primary-foreground transition-opacity hover:opacity-90"
        >
          <FaGithub className="size-4" />
          Sign in with GitHub
        </button>
      )}
    </div>
  );

  return (
    <div className="airwave-comments not-prose">
      <Comments
        page={slug}
        apiUrl="/api/comments"
        auth={{ type: "api", signIn }}
        mention={{ enabled: true }}
        title={header}
      />
    </div>
  );
}
