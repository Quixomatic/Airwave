/**
 * The webhook event catalog + envelope, shared by the emitter, the dispatcher, and (later) the SSE stream.
 * Event names are dotted and past-tense; `data` reuses the public API's DTO shapes. The set is additive-only
 * within the public v1 contract — add new types freely, never rename/repurpose an existing one.
 */

/**
 * The webhook event catalog. Deliberately tight: only events that fire from real VIEWING activity (the
 * actionable ones for home automation) plus a test ping. The catalog is additive-only within the public v1
 * contract, so it's better to add later than to advertise weak events we can't remove.
 */
export const WEBHOOK_EVENT_TYPES = [
  "session.started",
  "session.ended",
  "playback.started",
  "playback.stopped",
  "channel.tuned",
  "ping",
] as const;

export type WebhookEventType = (typeof WEBHOOK_EVENT_TYPES)[number];

/** Grouping for the Settings → Webhooks event-type checkboxes and the docs catalog. */
export const WEBHOOK_EVENT_GROUPS: { group: string; types: WebhookEventType[] }[] = [
  {
    group: "Playback",
    types: ["session.started", "session.ended", "playback.started", "playback.stopped", "channel.tuned"],
  },
  { group: "Test", types: ["ping"] },
];

/** The Standard Webhooks payload envelope. `id` is also sent as the `webhook-id` header (consumer dedupe). */
export type EventEnvelope<T = unknown> = {
  id: string;
  type: WebhookEventType;
  timestamp: string; // ISO-8601 UTC
  data: T;
};
