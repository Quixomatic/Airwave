import { useChat } from "@ai-sdk/react";
import { env } from "@ChannelGuide/env/web";
import { Button } from "@ChannelGuide/ui/components/button";
import { useQuery } from "@tanstack/react-query";
import { DefaultChatTransport, type UIMessage } from "ai";
import { History, Loader2, MessageSquarePlus, Sparkles, Trash2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import {
  Conversation,
  ConversationContent,
  ConversationScrollButton,
} from "@/components/ai-elements/conversation";
import { Message, MessageContent } from "@/components/ai-elements/message";
import {
  PromptInput,
  PromptInputBody,
  PromptInputSubmit,
  PromptInputTextarea,
  PromptInputToolbar,
  PromptInputTools,
} from "@/components/ai-elements/prompt-input";
import { Response } from "@/components/ai-elements/response";
import { PanelHeaderTitle } from "@/context/panel-header-provider";
import { trpc, trpcClient } from "@/utils/trpc";

/**
 * The AI assistant — the reserved `chat` global side panel. Streams from the active AI connection
 * (Vercel AI SDK `useChat` → `/api/ai/chat`), persists to the conversation history, and lets you
 * start a new chat or resume a past one. Built on our base-lyra AI Elements components.
 */

const serverBase = () => {
  const u = env.VITE_SERVER_URL;
  return u.startsWith("/") && typeof window !== "undefined" ? `${window.location.origin}${u}` : u;
};

export function AiChatPanel() {
  const [activeId, setActiveId] = useState<string>(() => crypto.randomUUID());
  const [showHistory, setShowHistory] = useState(false);
  const conversations = useQuery(trpc.ai.conversations.queryOptions());

  const newChat = () => {
    setActiveId(crypto.randomUUID());
    setShowHistory(false);
  };
  const del = async (id: string) => {
    await trpcClient.ai.deleteConversation.mutate({ id });
    await conversations.refetch();
    if (id === activeId) newChat();
  };

  return (
    <>
      <PanelHeaderTitle>
        <span className="flex items-center gap-2">
          <Sparkles className="text-primary h-4 w-4" />
          AI Assistant
        </span>
      </PanelHeaderTitle>

      <div className="flex h-full flex-col">
        <div className="flex items-center gap-1 border-b p-2">
          <Button size="sm" variant="ghost" onClick={newChat}>
            <MessageSquarePlus className="h-4 w-4" />
            New chat
          </Button>
          <Button size="sm" variant={showHistory ? "secondary" : "ghost"} onClick={() => setShowHistory((v) => !v)}>
            <History className="h-4 w-4" />
            History
          </Button>
        </div>

        {showHistory ? (
          <div className="flex-1 overflow-y-auto p-2">
            {conversations.data?.length ? (
              conversations.data.map((cv) => (
                <div key={cv.id} className="group hover:bg-accent flex items-center gap-2 rounded-md p-2">
                  <button
                    className="min-w-0 flex-1 truncate text-left text-sm"
                    onClick={() => {
                      setActiveId(cv.id);
                      setShowHistory(false);
                    }}
                  >
                    {cv.title ?? "Untitled"}
                  </button>
                  <Button size="icon" variant="ghost" className="opacity-0 group-hover:opacity-100" aria-label="Delete" onClick={() => void del(cv.id)}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              ))
            ) : (
              <p className="text-muted-foreground p-3 text-sm">No conversations yet.</p>
            )}
          </div>
        ) : (
          <ChatLoader key={activeId} conversationId={activeId} onActivity={() => void conversations.refetch()} />
        )}
      </div>
    </>
  );
}

/** Loads a conversation's persisted messages, then mounts the streaming thread with them as initial. */
function ChatLoader({ conversationId, onActivity }: { conversationId: string; onActivity: () => void }) {
  const initial = useQuery(trpc.ai.messages.queryOptions({ id: conversationId }));
  if (initial.isPending) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <Loader2 className="text-muted-foreground h-5 w-5 animate-spin" />
      </div>
    );
  }
  return <Thread conversationId={conversationId} initialMessages={(initial.data ?? []) as unknown as UIMessage[]} onActivity={onActivity} />;
}

function Thread({
  conversationId,
  initialMessages,
  onActivity,
}: {
  conversationId: string;
  initialMessages: UIMessage[];
  onActivity: () => void;
}) {
  const transport = useMemo(() => new DefaultChatTransport({ api: `${serverBase()}/api/ai/chat`, credentials: "include" }), []);
  const { messages, sendMessage, status } = useChat({ id: conversationId, messages: initialMessages, transport });

  // Refresh the history list (titles / order) when a turn settles.
  useEffect(() => {
    if (status === "ready") onActivity();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status]);

  const busy = status === "streaming" || status === "submitted";

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <Conversation>
        <ConversationContent>
          {messages.length === 0 && (
            <div className="text-muted-foreground flex flex-col items-center gap-2 p-8 text-center text-sm">
              <Sparkles className="text-muted-foreground/50 h-7 w-7" />
              <p>Ask me to help design channels from your library — e.g. "build a toddler channel with Bluey and Sesame Street."</p>
            </div>
          )}
          {messages.map((m) => (
            <Message key={m.id} from={m.role === "user" ? "user" : "assistant"}>
              <MessageContent>
                {m.parts.map((p, i) => (p.type === "text" ? <Response key={i}>{p.text}</Response> : null))}
              </MessageContent>
            </Message>
          ))}
        </ConversationContent>
        <ConversationScrollButton />
      </Conversation>

      <div className="p-2">
        <PromptInput onSubmit={(msg) => sendMessage({ text: msg.text })}>
          <PromptInputBody>
            <PromptInputTextarea placeholder="Ask about building channels…" disabled={busy} />
          </PromptInputBody>
          <PromptInputToolbar>
            <PromptInputTools />
            <PromptInputSubmit status={status} disabled={busy} />
          </PromptInputToolbar>
        </PromptInput>
      </div>
    </div>
  );
}
