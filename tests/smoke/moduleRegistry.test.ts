import type { WebGPURenderer } from 'three/webgpu';
import { describe, expect, it, vi } from 'vitest';
import { createConfigStore } from '../../src/config';
import { createAppContext, ModuleRegistry, type ModuleInstance } from '../../src/context';

const createStubRenderer = (): WebGPURenderer => {
  return {
    domElement: {} as HTMLCanvasElement,
  } as unknown as WebGPURenderer;
};

describe('ModuleRegistry', () => {
  it('initializes, updates, and disposes modules respecting priority', async () => {
    const registry = new ModuleRegistry();
    const config = createConfigStore({ persist: false });
    const renderer = createStubRenderer();
    const context = createAppContext(renderer, config, registry);

    const events: string[] = [];

    const makeModule = (id: string, priority: number, updatePriority: number): ModuleInstance => ({
      id,
      init: vi.fn(() => {
        events.push(`init:${id}`);
      }),
      update: vi.fn((tick) => {
        events.push(`update:${id}`);
        tick.setRenderOverride(async () => {
          events.push(`override:${id}`);
        }, updatePriority);
      }),
      dispose: vi.fn(() => {
        events.push(`dispose:${id}`);
      }),
    });

    registry
      .register({
        id: 'early',
        priority: -10,
        autoStart: true,
        factory: () => makeModule('early', -10, 10),
      })
      .register({
        id: 'late',
        priority: 20,
        autoStart: true,
        factory: () => makeModule('late', 20, 100),
      });

    await registry.initAll(context);
    expect(events.slice(0, 2)).toEqual(['init:early', 'init:late']);

    const tick = await registry.update(context, 0.016, 1.0);
    expect(events).toContain('update:early');
    expect(events).toContain('update:late');
    expect(tick.renderOverride?.priority).toBe(100);

    await tick.renderOverride?.fn(tick);
    expect(events).toContain('override:late');

    await registry.disposeAll(context);
    expect(events.slice(-2)).toEqual(['dispose:late', 'dispose:early']);
  });
});
