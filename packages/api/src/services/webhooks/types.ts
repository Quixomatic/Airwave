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
  // Viewing sessions — from the per-device watch-session store. A session begins when a device starts watching
  // and ends when it stops; channel.tuned fires when a device changes channel within a session.
  "session.started",
  "session.ended",
  "channel.tuned",
  // Playback state — emitted when the client reports its player state (playbackState in the heartbeat). Clients
  // that don't report it simply won't fire these (older clients / some platforms).
  "playback.started",
  "playback.stopped",
  "playback.paused",
  "playback.resumed",
  // Test
  "ping",
] as const;

export type WebhookEventType = (typeof WEBHOOK_EVENT_TYPES)[number];

/** Subscribable but not emitted yet. Empty now that playback.* fire from the client's reported playback state. */
export const RESERVED_WEBHOOK_EVENT_TYPES: WebhookEventType[] = [];

/** Grouping for the Settings → Webhooks event-type checkboxes and the docs catalog. `reserved` = coming soon. */
export const WEBHOOK_EVENT_GROUPS: { group: string; types: WebhookEventType[]; reserved?: boolean }[] = [
  { group: "Viewing sessions", types: ["session.started", "session.ended", "channel.tuned"] },
  { group: "Playback state", types: ["playback.started", "playback.stopped", "playback.paused", "playback.resumed"] },
  { group: "Test", types: ["ping"] },
];

/** The Standard Webhooks payload envelope. `id` is also sent as the `webhook-id` header (consumer dedupe). */
export type EventEnvelope<T = unknown> = {
  id: string;
  type: WebhookEventType;
  timestamp: string; // ISO-8601 UTC
  data: T;
};
