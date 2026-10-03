const channelTails = new Map<string, Promise<void>>();

/**
 * Serialize materialized-schedule mutations for one channel while allowing
 * unrelated channels to build in parallel.
 */
export async function withChannelScheduleLock<T>(
  channelId: string,
  mutate: () => Promise<T>,
): Promise<T> {
  const previous = channelTails.get(channelId) ?? Promise.resolve();
  let release!: () => void;
  const current = new Promise<void>((resolve) => {
    release = resolve;
  });
  channelTails.set(channelId, current);

  await previous;
  try {
    return await mutate();
  } finally {
    release();
    if (channelTails.get(channelId) === current) channelTails.delete(channelId);
  }
}
