import { beforeEach, describe, expect, it, vi } from 'vitest';
import { sampleGraph } from '@traceflow/core';
import { createForgeAdapter } from '../src/frontend/src/forge-adapter';

const invoke = vi.fn();

vi.mock('@forge/bridge', () => ({
  invoke: (...args: unknown[]) => invoke(...args),
}));

describe('createForgeAdapter', () => {
  beforeEach(() => {
    invoke.mockReset();
  });

  it('returns the resolver graph through the DataAdapter interface', async () => {
    invoke.mockResolvedValue(sampleGraph);
    const adapter = createForgeAdapter();
    expect(adapter.name).toBe('forge');
    await expect(adapter.loadGraph()).resolves.toEqual(sampleGraph);
    expect(invoke).toHaveBeenCalledWith('getGraph');
  });

  it('rejects a malformed resolver response instead of rendering half a graph', async () => {
    invoke.mockResolvedValue({ people: 'nope' });
    await expect(createForgeAdapter().loadGraph()).rejects.toThrow('unexpected response');
  });

  it('propagates resolver errors to the four-state UI (error state, retry)', async () => {
    invoke.mockRejectedValue(new Error('Forbidden'));
    await expect(createForgeAdapter().loadGraph()).rejects.toThrow('Forbidden');
  });
});
