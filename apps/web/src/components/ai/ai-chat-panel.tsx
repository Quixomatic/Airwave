import { useChat } from "@ai-sdk/react";
import { env } from "@ChannelGuide/env/web";
import { Button } from "@ChannelGuide/ui/components/button";
import { Select, SelectItem, SelectPopup, SelectTrigger, SelectValue } from "@ChannelGuide/ui/components/select";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
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
  PromptInputFooter,
  PromptInputSubmit,
  PromptInputTextarea,
  PromptInputTools,
} from "@/components/ai-elements/prompt-input";
import { Reasoning, ReasoningContent, ReasoningTrigger } from "@/components/ai-elements/reasoning";
import { Response } from "@/components/ai-elements/response";
import { Tool, ToolContent, ToolHeader, ToolInput, ToolOutput, type ToolState } from "@/components/ai-elements/tool";
import { PanelHeaderTitle } from "@/context/panel-header-provider";
import { cn } from "@/lib/utils";
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

const Title = () => (
  <PanelHeaderTitle>
    <span className="flex items-center gap-2">
      <Sparkles className="text-primary h-4 w-4" />
      AI Assistant
    </span>
  </PanelHeaderTitle>
);

export function AiChatPanel() {
  const navigate = useNavigate();
  const [activeId, setActiveId] = useState<string>(() => crypto.randomUUID());
  const [showHistory, setShowHistory] = useState(false);
  const conversations = useQuery(trpc.ai.conversations.queryOptions());
  const connections = useQuery(trpc.ai.list.queryOptions());

  // No model configured yet → an empty state over the whole panel with a link to set one up.
  if (connections.data && connections.data.length === 0) {
    return (
      <>
        <Title />
        <div className="flex h-full flex-col items-center justify-center gap-3 p-8 text-center">
          <div className="bg-primary/10 flex size-14 items-center justify-center rounded-2xl">
            <Sparkles className="text-primary size-7" />
          </div>
          <div className="text-base font-semibold">No model connected</div>
          <p className="text-muted-foreground max-w-xs text-sm">
            Connect an AI model to build channels from your library just by chatting.
          </p>
          <Button onClick={() => void navigate({ to: "/settings/ai" })}>Set up a model</Button>
        </div>
      </>
    );
  }

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
      <Title />

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
  const { messages, sendMessage, status, addToolApprovalResponse } = useChat({ id: conversationId, messages: initialMessages, transport });

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
          {messages.map((m) => {
            const from = m.role === "user" ? "user" : "assistant";
            return (
              <Message key={m.id} from={from}>
                <div className={cn("flex min-w-0 flex-col gap-2", from === "user" ? "items-end" : "w-full items-stretch")}>
                  {m.parts.map((part, i) => {
                    if (part.type === "text") {
                      return part.text ? (
                        <MessageContent key={i}>
                          <Response>{part.text}</Response>
                        </MessageContent>
                      ) : null;
                    }
                    if (part.type === "reasoning") {
                      const text = (part as { text?: string }).text ?? "";
                      return text ? (
                        <Reasoning key={i}>
                          <ReasoningTrigger />
                          <ReasoningContent>{text}</ReasoningContent>
                        </Reasoning>
                      ) : null;
                    }
                    if (part.type.startsWith("tool-") || part.type === "dynamic-tool") {
                      const p = part as unknown as {
                        type: string;
                        toolName?: string;
                        state: ToolState;
                        input?: unknown;
                        output?: unknown;
                        errorText?: string;
                        approval?: { id: string };
                      };
                      const name = p.type === "dynamic-tool" ? `tool-${p.toolName ?? "tool"}` : p.type;
                      const awaiting = p.state === "approval-requested";
                      return (
                        <Tool key={i} defaultOpen={awaiting || p.state === "output-error"}>
                          <ToolHeader type={name} state={p.state} />
                          <ToolContent>
                            <ToolInput input={p.input} />
                            {awaiting && p.approval && (
                              <div className="flex items-center justify-between gap-2 border-t p-2">
                                <span className="text-muted-foreground text-xs">Apply this change?</span>
                                <div className="flex gap-1">
                                  <Button size="sm" variant="outline" onClick={() => void addToolApprovalResponse({ id: p.approval!.id, approved: false })}>
                                    Deny
                                  </Button>
                                  <Button size="sm" onClick={() => void addToolApprovalResponse({ id: p.approval!.id, approved: true })}>
                                    Approve
                                  </Button>
                                </div>
                              </div>
                            )}
                            <ToolOutput output={p.output} errorText={p.errorText} />
                          </ToolContent>
                        </Tool>
                      );
                    }
                    return null;
                  })}
                </div>
              </Message>
            );
          })}
        </ConversationContent>
        <ConversationScrollButton />
      </Conversation>

      <div className="shrink-0 p-3">
        <PromptInput onSubmit={(msg) => sendMessage({ text: msg.text })}>
          <PromptInputBody>
            <PromptInputTextarea placeholder="Ask about building channels…" />
          </PromptInputBody>
          <PromptInputFooter>
            <PromptInputTools>
              <ModelBadge />
            </PromptInputTools>
            <PromptInputSubmit status={status} disabled={busy} />
          </PromptInputFooter>
        </PromptInput>
      </div>
    </div>
  );
}

/** Footer badge showing the active model — click to switch the active connection (AI Elements' model-selector vibe). */
function ModelBadge() {
  const list = useQuery(trpc.ai.list.queryOptions());
  const conns = list.data ?? [];
  if (!conns.length) return null;
  const active = conns.find((c) => c.isActive);
  const setActive = async (id: string) => {
    await trpcClient.ai.setActive.mutate({ id });
    await list.refetch();
  };
  return (
    <Select value={active?.id ?? ""} onValueChange={(v) => void setActive(v as string)}>
      <SelectTrigger
        size="sm"
        className="text-muted-foreground hover:bg-accent h-7 gap-1.5 border-none bg-transparent px-2 text-xs shadow-none"
      >
        <Sparkles className="size-3.5" />
        <SelectValue>{(v) => conns.find((c) => c.id === v)?.model ?? "Select model"}</SelectValue>
      </SelectTrigger>
      <SelectPopup>
        {conns.map((c) => (
          <SelectItem key={c.id} value={c.id}>
            {c.name} · {c.model}
          </SelectItem>
        ))}
      </SelectPopup>
    </Select>
  );
}
