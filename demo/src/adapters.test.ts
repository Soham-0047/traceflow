import { sampleGraph } from '@traceflow/core';
import { createDemoAdapter } from './adapters';

describe('createDemoAdapter', () => {
  it('serves the sample graph by default', async () => {
    expect(await createDemoAdapter('', 0).loadGraph()).toBe(sampleGraph);
  });

  it('serves an empty graph for ?demo=empty', async () => {
    const graph = await createDemoAdapter('?demo=empty', 0).loadGraph();
    expect(graph.people).toHaveLength(0);
    expect(graph.workItems).toHaveLength(0);
  });

  it('rejects for ?demo=error', async () => {
    await expect(createDemoAdapter('?demo=error').loadGraph()).rejects.toThrow('sample data request failed');
  });

  it('never settles for ?demo=loading', async () => {
    const settled = await Promise.race([
      createDemoAdapter('?demo=loading').loadGraph().then(() => 'settled'),
      new Promise((resolve) => setTimeout(() => resolve('pending'), 50)),
    ]);
    expect(settled).toBe('pending');
  });
});
