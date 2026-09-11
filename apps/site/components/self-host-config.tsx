"use client";

import { useState, type ReactNode } from "react";
import { Check, Copy, Terminal } from "lucide-react";
import { FaGithub } from "react-icons/fa";
import { cn } from "@/lib/cn";

export type ConfigFile = {
  id: string;
  /** Filename shown in the tab. */
  label: string;
  /** Link to the real file on GitHub. */
  url: string;
  /** Raw text, for the copy button. */
  code: string;
  /** Pre-highlighted block (a ServerCodeBlock with its chrome flattened). */
  block: ReactNode;
};

/**
 * A compact code viewer with filename TABS (click to switch files, e.g. docker-compose.yml vs
 * .env.example) and a toolbar whose right side sits a GitHub link next to the copy button. Both files stay
 * mounted (server-highlighted); switching just toggles which is shown, so there's no re-highlight flash.
 * Used on the home page's self-host section.
 */
export function SelfHostConfig({ files }: { files: ConfigFile[] }) {
  const [activeId, setActiveId] = useState(files[0]?.id);
  const [copied, setCopied] = useState(false);
  const active = files.find((f) => f.id === activeId) ?? files[0];

  const copy = () => {
    if (!active) return;
    navigator.clipboard
      ?.writeText(active.code)
      .then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      })
      .catch(() => {});
  };

  return (
    <div className="overflow-hidden rounded-xl border bg-fd-secondary text-sm shadow-sm">
      {/* Toolbar: terminal icon + filename tabs on the left; GitHub link + copy on the right. */}
      <div className="flex h-10 items-center gap-1 border-b px-2 text-fd-muted-foreground">
        <Terminal className="mx-1 size-3.5 shrink-0" />
        {files.map((f) => (
          <button
            key={f.id}
            type="button"
            onClick={() => setActiveId(f.id)}
            className={cn(
              "cursor-pointer rounded px-2 py-1 font-mono text-xs transition-colors",
              f.id === active?.id ? "text-fd-primary" : "hover:text-fd-accent-foreground",
            )}
          >
            {f.label}
          </button>
        ))}
        <div className="ml-auto flex items-center gap-0.5">
          {active ? (
            <a
              href={active.url}
              target="_blank"
              rel="noreferrer"
              aria-label={`View ${active.label} on GitHub`}
              title="View on GitHub"
              className="inline-flex size-7 items-center justify-center rounded-lg transition-colors hover:bg-fd-accent hover:text-fd-accent-foreground"
            >
              <FaGithub className="size-3.5" />
            </a>
          ) : null}
          <button
            type="button"
            onClick={copy}
            aria-label="Copy to clipboard"
            title="Copy"
            className="inline-flex size-7 cursor-pointer items-center justify-center rounded-lg transition-colors hover:bg-fd-accent hover:text-fd-accent-foreground"
          >
            {copied ? <Check className="size-3.5 text-fd-primary" /> : <Copy className="size-3.5" />}
          </button>
        </div>
      </div>

      {/* Both blocks stay mounted; only the active one is shown. */}
      {files.map((f) => (
        <div key={f.id} hidden={f.id !== active?.id}>
          {f.block}
        </div>
      ))}
    </div>
  );
}
