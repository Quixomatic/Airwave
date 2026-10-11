import { loadSession } from "./auth";

/** Wait for every hydration task to settle before retrying. Promise.all's early rejection
 * otherwise lets a retry overlap still-running hydration and overwrite newer state. */
export async function initializeApp(otherHydrations: Array<() => Promise<void>>): Promise<void> {
  const results = await Promise.allSettled([loadSession(), ...otherHydrations.map((load) => load())]);
  if (results.some((result) => result.status === "rejected")) {
    // Native/storage errors can contain sensitive values. Surface only a fixed message.
    throw new Error("Could not read saved settings. Please retry.");
  }
}
