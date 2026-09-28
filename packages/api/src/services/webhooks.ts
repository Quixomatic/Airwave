/**
 * Webhooks service (public facade) — a first-party push channel using the Standard Webhooks spec, delivered via
 * a transactional outbox drained by a dedicated in-process worker. Implementation lives in ./webhooks/*; this
 * file is the single directly-importable entry point (`@airwave/api/services/webhooks`).
 * See .plans/public-api-and-webhooks.md.
 *
 *  - `emitEvent(type, data)`  — the fire-and-forget hook business logic calls (cheap when idle).
 *  - dispatcher                — the worker; started once at boot, poked by emitEvent.
 *  - subscriptions             — the in-memory "is anyone listening?" cache.
 *  - manage                    — CRUD + rotate + test + delivery log (used by the API + Settings tab).
 */
export { emitEvent } from "./webhooks/emit";
export { startWebhookDispatcher, stopWebhookDispatcher, wakeDispatcher } from "./webhooks/dispatcher";
export { refreshWebhookSubscriptions, hasWebhookSubscribers } from "./webhooks/subscriptions";
export {
  listWebhooks,
  getWebhook,
  createWebhook,
  updateWebhook,
  deleteWebhook,
  rotateWebhookSecret,
  sendTestEvent,
  listDeliveries,
  redeliver,
  type WebhookPublic,
  type DeliveryPublic,
} from "./webhooks/manage";
export {
  WEBHOOK_EVENT_TYPES,
  WEBHOOK_EVENT_GROUPS,
  RESERVED_WEBHOOK_EVENT_TYPES,
  type WebhookEventType,
  type EventEnvelope,
} from "./webhooks/types";
