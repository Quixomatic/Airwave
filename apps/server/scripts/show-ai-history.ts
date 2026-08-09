import prisma from "@airwave/db";

const conv = await prisma.aiConversation.findFirst({ orderBy: { updatedAt: "desc" } });
if (!conv) {
  console.log("no conversations");
  process.exit(0);
}
console.log("=== Conversation:", conv.title, "===\n");
const msgs = await prisma.aiMessage.findMany({ where: { conversationId: conv.id }, orderBy: { createdAt: "asc" } });
for (const m of msgs) {
  const parts = (m.parts as unknown as Array<Record<string, unknown>>) ?? [];
  for (const p of parts) {
    const type = p.type as string;
    if (type === "text") console.log(`[${m.role}] ${String(p.text ?? "").slice(0, 300)}\n`);
    else if (type?.startsWith("tool-") || type === "dynamic-tool") {
      console.log(`[TOOL ${type}] state=${p.state}`);
      console.log("  input:", JSON.stringify(p.input));
      console.log("  output:", JSON.stringify(p.output ?? p.errorText).slice(0, 1200), "\n");
    }
  }
}
process.exit(0);
