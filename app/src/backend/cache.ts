/**
 * A small TTL cache over a key-value store, written so the logic is testable
 * without Forge (the store is injected; `kvs.ts` wires it to @forge/kvs).
 *
 * $0 guardrail (docs/PLAN.md §11): every resolver result is cached with a short
 * TTL so repeat visits do not re-fan-out to Jira and Confluence.
 *
 * The cache is an optimisation, never a dependency: a value too large for the
 * store (Forge KVS caps a value at 240 KiB) or a failed write is logged and the
 * freshly loaded value is still returned.
 */
export interface KVLike {
  get(key: string): Promise<unknown>;
  set(key: string, value: unknown, options?: { ttl?: { value: number; unit: 'SECONDS' } }): Promise<void>;
}

/** Stay under the Forge KVS value cap (240 KiB) with room for the envelope and encoding. */
export const MAX_CACHED_BYTES = 230 * 1024;

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

export interface CacheOptions {
  maxBytes?: number;
  log?: (message: string) => void;
}

/** Return the cached value if fresh, otherwise load, store (when it fits) and return it. */
export async function cached<T>(
  kv: KVLike,
  key: string,
  ttlSeconds: number,
  load: () => Promise<T>,
  options: CacheOptions = {},
): Promise<T> {
  const log = options.log ?? ((message: string) => console.warn(message));
  const now = Date.now();
  let found: unknown;
  try {
    found = await kv.get(key);
  } catch (err) {
    log(`traceflow: cache read failed for ${key}; loading fresh (${err instanceof Error ? err.message : String(err)})`);
  }
  if (isEnvelope<T>(found) && found.expiresAt > now) {
    return found.data;
  }
  const data = await load();
  const envelope: Envelope<T> = { expiresAt: now + ttlSeconds * 1000, data };
  const bytes = new TextEncoder().encode(JSON.stringify(envelope)).length;
  if (bytes > (options.maxBytes ?? MAX_CACHED_BYTES)) {
    log(`traceflow: ${key} is ${bytes} bytes, over the cache cap; serving it uncached`);
    return data;
  }
  try {
    await kv.set(key, envelope, { ttl: { value: ttlSeconds, unit: 'SECONDS' } });
  } catch (err) {
    log(`traceflow: cache write failed for ${key}; serving it uncached (${err instanceof Error ? err.message : String(err)})`);
  }
  return data;
}
