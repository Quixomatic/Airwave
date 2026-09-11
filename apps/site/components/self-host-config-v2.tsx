"use client";

import { createContext, useContext, useState, type ReactNode } from "react";
import { FaGithub } from "react-icons/fa";
import { cn } from "@/lib/cn";

const SourceUrlContext = createContext<string>("");

/** Wraps a ServerCodeBlock so the SourceActions rendered inside it can read that file's GitHub URL. */
export function SourceScope({ url, children }: { url: string; children: ReactNode }) {
  return <SourceUrlContext.Provider value={url}>{children}</SourceUrlContext.Provider>;
}

/**
 * Passed as the fumadocs CodeBlock `Actions` render-prop: a GitHub source link sitting next to the built-in
 * copy button (`children`), both hovering over the top-right of the code (the default overlay position).
 */
export function SourceActions({ className, children }: { className?: string; children?: ReactNode }) {
  const url = useContext(SourceUrlContext);
  return (
    <div className={cn(className, "flex items-center")}>
      {url ? (
        <a
          href={url}
          target="_blank"
          rel="noreferrer"
          aria-label="View source on GitHub"
          title="View source on GitHub"
          className="inline-flex size-6 items-center justify-center rounded-md transition-colors hover:text-fd-accent-foreground [&_svg]:size-3.5"
        >
          <FaGithub />
        </a>
      ) : null}
      {children}
    </div>
  );
}

export type ConfigFileV2 = {
  id: string;
  label: string;
  icon: ReactNode;
  block: ReactNode;
};

/**
 * V2 of the home-page self-host config viewer. Plain filename tabs, each with its own icon, sit side by side
 * with NO filled header background; clicking one switches the view. The code block keeps its rounded card, and
 * the copy + GitHub-source buttons hover over the top-right of the content (the fumadocs default overlay).
 * Both blocks stay mounted so switching never re-highlights.
 */
export function SelfHostConfigV2({ files }: { files: ConfigFileV2[] }) {
  const [activeId, setActiveId] = useState(files[0]?.id);
  const active = files.find((f) => f.id === activeId) ?? files[0];

  return (
    <div className="min-w-0">
      <div className="mb-3 flex flex-row items-center gap-5 text-fd-muted-foreground">
        {files.map((f) => (
          <button
            key={f.id}
            type="button"
            onClick={() => setActiveId(f.id)}
            className={cn(
              "flex cursor-pointer items-center gap-2 font-mono text-xs transition-colors [&_svg]:size-4",
              f.id === active?.id ? "text-fd-foreground" : "hover:text-fd-accent-foreground",
            )}
          >
            {f.icon}
            {f.label}
          </button>
        ))}
      </div>
      {files.map((f) => (
        <div key={f.id} hidden={f.id !== active?.id}>
          {f.block}
        </div>
      ))}
    </div>
  );
}
