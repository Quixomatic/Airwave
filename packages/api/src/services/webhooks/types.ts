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
  // Viewing sessions — emitted straight from the watch-session store. A session begins when a user starts
  // watching a channel and ends when they stop; a channel change is a real stop + start (the client ends and
  // recreates the session), so it surfaces as session.ended then session.started. These fire today.
  "session.started",
  "session.ended",
  // Playback state — RESERVED. Defined + subscribable, but not emitted yet: the heartbeat reports the schedule
  // slot, not the player's actual play/pause state. They'll fire once the client reports real playback state.
  "playback.started",
  "playback.stopped",
  "playback.paused",
  "playback.resumed",
  // Test
  "ping",
] as const;

export type WebhookEventType = (typeof WEBHOOK_EVENT_TYPES)[number];

/** Subscribable but not emitted yet (see the note above). Marked "coming soon" in the UI + docs. */
export const RESERVED_WEBHOOK_EVENT_TYPES: WebhookEventType[] = [
  "playback.started",
  "playback.stopped",
  "playback.paused",
  "playback.resumed",
];

/** Grouping for the Settings → Webhooks event-type checkboxes and the docs catalog. `reserved` = coming soon. */
export const WEBHOOK_EVENT_GROUPS: { group: string; types: WebhookEventType[]; reserved?: boolean }[] = [
  { group: "Viewing sessions", types: ["session.started", "session.ended"] },
  {
    group: "Playback state",
    types: ["playback.started", "playback.stopped", "playback.paused", "playback.resumed"],
    reserved: true,
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
