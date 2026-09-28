import { TRPCError } from "@trpc/server";
import { z } from "zod";

import { adminProcedure, router } from "../index";
import {
  createWebhook,
  deleteWebhook,
  getWebhook,
  listDeliveries,
  listWebhooks,
  redeliver,
  rotateWebhookSecret,
  sendTestEvent,
  updateWebhook,
  WEBHOOK_EVENT_GROUPS,
  WEBHOOK_EVENT_TYPES,
} from "../services/webhooks";

/**
 * Admin webhook management — the internal surface behind the Settings → Webhooks tab (cookie-authed admin).
 * Deliberately NOT on the public API: creating an outbound HTTP caller is server configuration, not something
 * a read-only integration key should do. The public API only advertises webhook support via /capabilities.
 * All logic lives in services/webhooks (surface-agnostic); this router is a thin admin wrapper.
 */
const eventType = z.enum(WEBHOOK_EVENT_TYPES);

export const webhooksRouter = router({
  list: adminProcedure.query(() => listWebhooks()),

  eventTypes: adminProcedure.query(() => ({ eventTypes: [...WEBHOOK_EVENT_TYPES], groups: WEBHOOK_EVENT_GROUPS })),

  get: adminProcedure.input(z.object({ id: z.string() })).query(async ({ input }) => {
    const w = await getWebhook(input.id);
    if (!w) throw new TRPCError({ code: "NOT_FOUND", message: "Webhook not found." });
    return w;
  }),

  create: adminProcedure
    .input(
      z.object({
        url: z.string().url(),
        eventTypes: z.array(eventType).default([]),
        description: z.string().optional(),
      }),
    )
    .mutation(async ({ input }) => {
      try {
        // Returns { webhook, secret } — the secret is shown to the admin ONCE, right after creation.
        return await createWebhook({ url: input.url, eventTypes: input.eventTypes, description: input.description ?? null });
      } catch (e) {
        throw new TRPCError({ code: "BAD_REQUEST", message: e instanceof Error ? e.message : "Invalid webhook." });
      }
    }),

  update: adminProcedure
    .input(
      z.object({
        id: z.string(),
        url: z.string().url().optional(),
        eventTypes: z.array(eventType).optional(),
        enabled: z.boolean().optional(),
        description: z.string().nullable().optional(),
      }),
    )
    .mutation(async ({ input }) => {
      const { id, ...patch } = input;
      try {
        const w = await updateWebhook(id, patch);
        if (!w) throw new TRPCError({ code: "NOT_FOUND", message: "Webhook not found." });
        return w;
      } catch (e) {
        if (e instanceof TRPCError) throw e;
        throw new TRPCError({ code: "BAD_REQUEST", message: e instanceof Error ? e.message : "Invalid webhook." });
      }
    }),

  delete: adminProcedure.input(z.object({ id: z.string() })).mutation(async ({ input }) => {
    const ok = await deleteWebhook(input.id);
    if (!ok) throw new TRPCError({ code: "NOT_FOUND", message: "Webhook not found." });
    return { ok: true };
  }),

  rotateSecret: adminProcedure.input(z.object({ id: z.string() })).mutation(async ({ input }) => {
    const res = await rotateWebhookSecret(input.id);
    if (!res) throw new TRPCError({ code: "NOT_FOUND", message: "Webhook not found." });
    return res; // { secret } — shown once
  }),

  sendTest: adminProcedure.input(z.object({ id: z.string() })).mutation(async ({ input }) => {
    const ok = await sendTestEvent(input.id);
    if (!ok) throw new TRPCError({ code: "NOT_FOUND", message: "Webhook not found." });
    return { queued: true };
  }),

  deliveries: adminProcedure
    .input(z.object({ id: z.string(), limit: z.number().int().min(1).max(100).optional(), cursor: z.string().optional() }))
    .query(({ input }) => listDeliveries(input.id, { limit: input.limit, cursor: input.cursor })),

  redeliver: adminProcedure.input(z.object({ deliveryId: z.string() })).mutation(async ({ input }) => {
    const ok = await redeliver(input.deliveryId);
    if (!ok) throw new TRPCError({ code: "NOT_FOUND", message: "Delivery not found." });
    return { queued: true };
  }),
});
