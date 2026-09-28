import { OpenAPIHono, createRoute, z } from "@hono/zod-openapi";

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
} from "@airwave/api/services/webhooks";

import type { PublicVars } from "../context";
import { apiKeySecurity, errorResponses } from "../dtos";

// ── DTOs ──────────────────────────────────────────────────────────────────────────
const WebhookDTO = z
  .object({
    id: z.string(),
    url: z.string(),
    eventTypes: z.array(z.string()).describe("Subscribed event types; an empty array means every event."),
    description: z.string().nullable(),
    enabled: z.boolean(),
    disabledAt: z.string().nullable().describe("Set if the endpoint was auto-disabled after repeated failures."),
    disabledReason: z.string().nullable(),
    createdAt: z.string(),
    updatedAt: z.string(),
  })
  .openapi("Webhook", {
    example: {
      id: "clx9wh01",
      url: "https://example.com/airwave-hook",
      eventTypes: ["playback.started", "playback.stopped"],
      description: "Living-room automation",
      enabled: true,
      disabledAt: null,
      disabledReason: null,
      createdAt: "2026-09-28T15:00:00.000Z",
      updatedAt: "2026-09-28T15:00:00.000Z",
    },
  });

const WebhookWithSecretDTO = WebhookDTO.extend({
  secret: z
    .string()
    .describe("The signing secret (whsec_...). Shown ONCE, here only. Store it now — you can't retrieve it again."),
}).openapi("WebhookWithSecret");

const DeliveryDTO = z
  .object({
    id: z.string(),
    eventId: z.string().describe("Also sent as the webhook-id header (consumer dedupe)."),
    eventType: z.string(),
    status: z.string().describe("pending | delivered | failed."),
    attempt: z.number().int(),
    responseCode: z.number().int().nullable(),
    error: z.string().nullable(),
    durationMs: z.number().int().nullable(),
    nextAttemptAt: z.string(),
    deliveredAt: z.string().nullable(),
    createdAt: z.string(),
  })
  .openapi("WebhookDelivery");

const eventTypeEnum = z.enum(WEBHOOK_EVENT_TYPES);

const CreateBody = z.object({
  url: z.string().url().openapi({ example: "https://example.com/airwave-hook" }),
  eventTypes: z.array(eventTypeEnum).default([]).openapi({ example: ["playback.started", "playback.stopped"] }),
  description: z.string().optional(),
});

const PatchBody = z.object({
  url: z.string().url().optional(),
  eventTypes: z.array(eventTypeEnum).optional(),
  enabled: z.boolean().optional(),
  description: z.string().nullable().optional(),
});

// ── mapping ───────────────────────────────────────────────────────────────────────
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const toWebhook = (w: any): z.infer<typeof WebhookDTO> => ({
  id: w.id,
  url: w.url,
  eventTypes: w.eventTypes,
  description: w.description ?? null,
  enabled: w.enabled,
  disabledAt: w.disabledAt ? new Date(w.disabledAt).toISOString() : null,
  disabledReason: w.disabledReason ?? null,
  createdAt: new Date(w.createdAt).toISOString(),
  updatedAt: new Date(w.updatedAt).toISOString(),
});

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const toDelivery = (d: any): z.infer<typeof DeliveryDTO> => ({
  id: d.id,
  eventId: d.eventId,
  eventType: d.eventType,
  status: d.status,
  attempt: d.attempt,
  responseCode: d.responseCode ?? null,
  error: d.error ?? null,
  durationMs: d.durationMs ?? null,
  nextAttemptAt: new Date(d.nextAttemptAt).toISOString(),
  deliveredAt: d.deliveredAt ? new Date(d.deliveredAt).toISOString() : null,
  createdAt: new Date(d.createdAt).toISOString(),
});

// ── router ────────────────────────────────────────────────────────────────────────
export const webhookRoutes = new OpenAPIHono<{ Variables: PublicVars }>();

// Webhook management is server-wide config — admin keys only.
webhookRoutes.use("/webhooks/*", async (c, next) => {
  if (!c.get("isAdmin")) {
    return c.json({ error: { code: "forbidden", message: "Webhook management requires an admin API key." } }, 403);
  }
  return next();
});

const idParam = z.object({ id: z.string().openapi({ example: "clx9wh01" }) });

webhookRoutes.openapi(
  createRoute({
    method: "get",
    path: "/webhooks",
    tags: ["Webhooks"],
    summary: "List webhook endpoints",
    security: apiKeySecurity,
    responses: {
      200: { description: "Webhooks.", content: { "application/json": { schema: z.object({ webhooks: z.array(WebhookDTO) }) } } },
      401: errorResponses[401],
      403: errorResponses[403],
    },
  }),
  async (c) => c.json({ webhooks: (await listWebhooks()).map(toWebhook) }, 200),
);

webhookRoutes.openapi(
  createRoute({
    method: "post",
    path: "/webhooks",
    tags: ["Webhooks"],
    summary: "Create a webhook endpoint",
    description: "Registers an endpoint. The response includes the signing secret ONCE — store it now.",
    security: apiKeySecurity,
    request: { body: { content: { "application/json": { schema: CreateBody } } } },
    responses: {
      201: { description: "Created.", content: { "application/json": { schema: WebhookWithSecretDTO } } },
      401: errorResponses[401],
      403: errorResponses[403],
      422: errorResponses[422],
    },
  }),
  async (c) => {
    const body = c.req.valid("json");
    try {
      const { webhook, secret } = await createWebhook({
        url: body.url,
        eventTypes: body.eventTypes,
        description: body.description ?? null,
      });
      return c.json({ ...toWebhook(webhook), secret }, 201);
    } catch (e) {
      return c.json({ error: { code: "invalid_request", message: e instanceof Error ? e.message : "Invalid." } }, 422);
    }
  },
);

// Registered BEFORE /webhooks/{id} so the static path isn't captured as id="event-types".
webhookRoutes.openapi(
  createRoute({
    method: "get",
    path: "/webhooks/event-types",
    tags: ["Webhooks"],
    summary: "Subscribable event types",
    description: "The catalog of event types you can subscribe to, grouped for display.",
    security: apiKeySecurity,
    responses: {
      200: {
        description: "Event types.",
        content: {
          "application/json": {
            schema: z.object({
              eventTypes: z.array(z.string()),
              groups: z.array(z.object({ group: z.string(), types: z.array(z.string()) })),
            }),
          },
        },
      },
      401: errorResponses[401],
      403: errorResponses[403],
    },
  }),
  async (c) => c.json({ eventTypes: [...WEBHOOK_EVENT_TYPES], groups: WEBHOOK_EVENT_GROUPS }, 200),
);

webhookRoutes.openapi(
  createRoute({
    method: "get",
    path: "/webhooks/{id}",
    tags: ["Webhooks"],
    summary: "Get a webhook",
    security: apiKeySecurity,
    request: { params: idParam },
    responses: {
      200: { description: "Webhook.", content: { "application/json": { schema: WebhookDTO } } },
      401: errorResponses[401],
      403: errorResponses[403],
      404: errorResponses[404],
    },
  }),
  async (c) => {
    const w = await getWebhook(c.req.valid("param").id);
    if (!w) return c.json({ error: { code: "not_found", message: "Webhook not found." } }, 404);
    return c.json(toWebhook(w), 200);
  },
);

webhookRoutes.openapi(
  createRoute({
    method: "patch",
    path: "/webhooks/{id}",
    tags: ["Webhooks"],
    summary: "Update a webhook",
    description: "Change the URL, subscribed events, description, or enabled state. Re-enabling clears the auto-disable state.",
    security: apiKeySecurity,
    request: { params: idParam, body: { content: { "application/json": { schema: PatchBody } } } },
    responses: {
      200: { description: "Updated.", content: { "application/json": { schema: WebhookDTO } } },
      401: errorResponses[401],
      403: errorResponses[403],
      404: errorResponses[404],
      422: errorResponses[422],
    },
  }),
  async (c) => {
    try {
      const w = await updateWebhook(c.req.valid("param").id, c.req.valid("json"));
      if (!w) return c.json({ error: { code: "not_found", message: "Webhook not found." } }, 404);
      return c.json(toWebhook(w), 200);
    } catch (e) {
      return c.json({ error: { code: "invalid_request", message: e instanceof Error ? e.message : "Invalid." } }, 422);
    }
  },
);

webhookRoutes.openapi(
  createRoute({
    method: "delete",
    path: "/webhooks/{id}",
    tags: ["Webhooks"],
    summary: "Delete a webhook",
    security: apiKeySecurity,
    request: { params: idParam },
    responses: {
      200: { description: "Deleted.", content: { "application/json": { schema: z.object({ deleted: z.boolean() }) } } },
      401: errorResponses[401],
      403: errorResponses[403],
      404: errorResponses[404],
    },
  }),
  async (c) => {
    const ok = await deleteWebhook(c.req.valid("param").id);
    if (!ok) return c.json({ error: { code: "not_found", message: "Webhook not found." } }, 404);
    return c.json({ deleted: true }, 200);
  },
);

webhookRoutes.openapi(
  createRoute({
    method: "post",
    path: "/webhooks/{id}/rotate-secret",
    tags: ["Webhooks"],
    summary: "Rotate the signing secret",
    description: "Issues a new signing secret (returned once). The old secret stops signing immediately.",
    security: apiKeySecurity,
    request: { params: idParam },
    responses: {
      200: { description: "New secret.", content: { "application/json": { schema: z.object({ secret: z.string() }) } } },
      401: errorResponses[401],
      403: errorResponses[403],
      404: errorResponses[404],
    },
  }),
  async (c) => {
    const res = await rotateWebhookSecret(c.req.valid("param").id);
    if (!res) return c.json({ error: { code: "not_found", message: "Webhook not found." } }, 404);
    return c.json(res, 200);
  },
);

webhookRoutes.openapi(
  createRoute({
    method: "post",
    path: "/webhooks/{id}/test",
    tags: ["Webhooks"],
    summary: "Send a test event",
    description: "Queues a synthetic `ping` delivery to this endpoint so you can verify the URL + signature.",
    security: apiKeySecurity,
    request: { params: idParam },
    responses: {
      202: { description: "Test queued.", content: { "application/json": { schema: z.object({ queued: z.boolean() }) } } },
      401: errorResponses[401],
      403: errorResponses[403],
      404: errorResponses[404],
    },
  }),
  async (c) => {
    const ok = await sendTestEvent(c.req.valid("param").id);
    if (!ok) return c.json({ error: { code: "not_found", message: "Webhook not found." } }, 404);
    return c.json({ queued: true }, 202);
  },
);

webhookRoutes.openapi(
  createRoute({
    method: "get",
    path: "/webhooks/{id}/deliveries",
    tags: ["Webhooks"],
    summary: "Delivery log",
    description: "Recent delivery attempts for this endpoint, newest first, cursor-paginated.",
    security: apiKeySecurity,
    request: {
      params: idParam,
      query: z.object({
        limit: z.coerce.number().int().min(1).max(100).optional().openapi({ example: 25 }),
        cursor: z.string().optional(),
      }),
    },
    responses: {
      200: {
        description: "Deliveries.",
        content: {
          "application/json": {
            schema: z.object({ deliveries: z.array(DeliveryDTO), nextCursor: z.string().nullable() }),
          },
        },
      },
      401: errorResponses[401],
      403: errorResponses[403],
    },
  }),
  async (c) => {
    const { id } = c.req.valid("param");
    const q = c.req.valid("query");
    const { deliveries, nextCursor } = await listDeliveries(id, { limit: q.limit, cursor: q.cursor });
    return c.json({ deliveries: deliveries.map(toDelivery), nextCursor }, 200);
  },
);

webhookRoutes.openapi(
  createRoute({
    method: "post",
    path: "/webhooks/{id}/deliveries/{deliveryId}/redeliver",
    tags: ["Webhooks"],
    summary: "Redeliver a past delivery",
    security: apiKeySecurity,
    request: { params: z.object({ id: z.string(), deliveryId: z.string() }) },
    responses: {
      202: { description: "Re-queued.", content: { "application/json": { schema: z.object({ queued: z.boolean() }) } } },
      401: errorResponses[401],
      403: errorResponses[403],
      404: errorResponses[404],
    },
  }),
  async (c) => {
    const ok = await redeliver(c.req.valid("param").deliveryId);
    if (!ok) return c.json({ error: { code: "not_found", message: "Delivery not found." } }, 404);
    return c.json({ queued: true }, 202);
  },
);
