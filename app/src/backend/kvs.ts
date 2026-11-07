import { kvs } from '@forge/kvs';
import type { KVLike } from './cache';

/**
 * Wire the cache to Forge KVS. The call shapes follow @forge/kvs 2.x typings;
 * they have not been run against a real app yet (needs `forge deploy`, see app/README.md).
 */
export const kvStore: KVLike = {
  async get(key) {
    return kvs.get(key);
  },
  async set(key, value, options) {
    await kvs.set(key, value, options);
  },
};
