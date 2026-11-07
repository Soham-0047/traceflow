import { describe, expect, it, vi } from 'vitest';
import { cached } from '../src/backend/cache';
import type { KVLike } from '../src/backend/cache';

function memoryKV(seeded: Record<string, unknown> = {}): KVLike {
  const store = new Map(Object.entries(seeded));
  return {
    async get(key) {
      return store.get(key);
    },
    async set(key, value) {
      store.set(key, value);
    },
  };
}

describe('cached', () => {
  it('loads once and serves the cached value until the TTL expires', async () => {
    vi.useFakeTimers();
    const kv = memoryKV();
    const load = vi.fn(async () => ({ answer: 42 }));

    const first = await cached(kv, 'k', 300, load);
    const second = await cached(kv, 'k', 300, load);

    expect(first).toEqual({ answer: 42 });
    expect(second).toEqual({ answer: 42 });
    expect(load).toHaveBeenCalledTimes(1);

    vi.advanceTimersByTime(301_000);
    const third = await cached(kv, 'k', 300, load);
    expect(third).toEqual({ answer: 42 });
    expect(load).toHaveBeenCalledTimes(2);
    vi.useRealTimers();
  });

  it('reloads when the stored envelope is stale even if the store never expires it', async () => {
    const kv = memoryKV({ k: { expiresAt: Date.now() - 1000, data: 'stale' } });
    const load = vi.fn(async () => 'fresh');
    await expect(cached(kv, 'k', 300, load)).resolves.toBe('fresh');
    expect(load).toHaveBeenCalledTimes(1);
  });

  it('ignores values that are not cache envelopes', async () => {
    const kv = memoryKV({ k: 'somebody else\u2019s value' });
    const load = vi.fn(async () => ({ a: 1 }));
    await expect(cached(kv, 'k', 300, load)).resolves.toEqual({ a: 1 });
    expect(load).toHaveBeenCalledTimes(1);
  });

  it('does not cache a failed load', async () => {
    const kv = memoryKV();
    let fail = true;
    const load = vi.fn(async () => {
      if (fail) throw new Error('Boom.');
      return 'ok';
    });
    await expect(cached(kv, 'k', 300, load)).rejects.toThrow('Boom.');
    fail = false;
    await expect(cached(kv, 'k', 300, load)).resolves.toBe('ok');
    expect(kv.get('k')).resolves.toEqual({ expiresAt: expect.any(Number), data: 'ok' });
  });
});
