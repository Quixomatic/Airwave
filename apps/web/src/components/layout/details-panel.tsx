import { useEffect } from "react";

import { useDetailsPanel, useResolvedPanel } from "@/context/details-panel-provider";
import { PanelFooterSlot, PanelHeaderMetaSlot, PanelHeaderTitleSlot } from "@/context/panel-header-provider";
import { cn } from "@/lib/utils";
import { SidePanelBody, SidePanelClose, SidePanelHeader } from "@ChannelGuide/ui/components/side-panel";

/**
 * Slide-in side panel — an `<aside>` sibling to the inset `<main>` card. The sliding chrome lives on
 * the outer aside (width/margin transition); title / meta / footer are published by the panel CONTENT
 * through the panel-header portals (the slot divs below are the portal destinations).
 */
export function DetailsPanel() {
  const { isOpen, closePanel } = useDetailsPanel();
  const panel = useResolvedPanel();

  useEffect(() => {
    if (!isOpen) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") closePanel();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [isOpen, closePanel]);

  const showing = isOpen && panel !== undefined;
  const variant = panel?.variant ?? "default";

  return (
    <aside
      role="complementary"
      aria-hidden={!showing}
      className={cn(
        "bg-background flex flex-col overflow-hidden transition-[width,margin] duration-300 ease-in-out",
        showing ? "m-2 mt-0 ml-0 w-[400px] rounded-md border shadow-sm" : "m-0 w-0 border-0",
      )}
    >
      {panel && (
        <>
          <SidePanelHeader>
            <SidePanelClose onClick={closePanel} />
            <PanelHeaderTitleSlot data-slot="side-panel-header-title" className="flex min-w-0 items-center truncate text-sm font-semibold" />
            <PanelHeaderMetaSlot data-slot="side-panel-header-meta" className="text-muted-foreground flex shrink-0 items-center text-xs empty:hidden" />
          </SidePanelHeader>

          {variant === "full" ? <SidePanelBody className="gap-0 p-0">{panel.content}</SidePanelBody> : <SidePanelBody>{panel.content}</SidePanelBody>}

          <PanelFooterSlot
            data-slot="side-panel-footer"
            className="border-border bg-muted/30 flex shrink-0 items-center justify-end gap-2 border-t px-3 py-2 empty:hidden"
          />
        </>
      )}
    </aside>
  );
}
