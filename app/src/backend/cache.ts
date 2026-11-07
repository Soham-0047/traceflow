/**
 * A small TTL cache over a key-value store, written so the logic is testable
 * without Forge (the store is injected; `kvs.ts` wires it to @forge/kvs).
 *
 * $0 guardrail (docs/PLAN.md §11): every resolver result is cached with a short
 * TTL so repeat visits do not re-fan-out to Jira and Confluence.
 */
export interface KVLike {
  get(key: string): Promise<unknown>;
  set(key: string, value: unknown, options?: { ttl?: { value: number; unit: 'SECONDS' } }): Promise<void>;
}

interface Envelope<T> {
  /** Wall-clock expiry in ms, so a store without native TTL support still expires. */
  expiresAt: number;
  data: T;
}

function isEnvelope<T>(value: unknown): value is Envelope<T> {
  return (
    typeof value === 'object' &&
    value !== null &&
    'expiresAt' in value &&
    typeof (value as Envelope<T>).expiresAt === 'number' &&
    'data' in value
  );
}

/** Return the cached value if fresh, otherwise load, store and return it. */
export async function cached<T>(
  kv: KVLike,
  key: string,
  ttlSeconds: number,
  load: () => Promise<T>,
): Promise<T> {
  const now = Date.now();
  const found = await kv.get(key);
  if (isEnvelope<T>(found) && found.expiresAt > now) {
    return found.data;
  }
  const data = await load();
  const envelope: Envelope<T> = { expiresAt: now + ttlSeconds * 1000, data };
  await kv.set(key, envelope, { ttl: { value: ttlSeconds, unit: 'SECONDS' } });
  return data;
}
