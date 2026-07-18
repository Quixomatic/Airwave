import { Sparkles } from "lucide-react";

import { PanelHeaderTitle } from "@/context/panel-header-provider";

/**
 * The AI assistant — a global side panel (the reserved "chat" panel type). Placeholder for now: the
 * next arc wires it up with the Vercel AI SDK (`useChat` + streaming), the channel-building tool
 * layer, and the provider/model config. The panel SYSTEM it plugs into is the BTT-ported side panel.
 */
export function AiChatPanel() {
  return (
    <>
      <PanelHeaderTitle>
        <span className="flex items-center gap-2">
          <Sparkles className="text-primary h-4 w-4" />
          AI Assistant
        </span>
      </PanelHeaderTitle>

      <div className="text-muted-foreground flex h-full flex-col items-center justify-center gap-3 p-6 text-center">
        <Sparkles className="text-muted-foreground/50 h-8 w-8" />
        <div className="text-sm font-medium">Channel-building assistant</div>
        <p className="max-w-xs text-xs">
          Coming soon — connect a model and build channels from your library by chatting. This panel is the home it'll live in.
        </p>
      </div>
    </>
  );
}
