import { describe, it, expect, vi } from 'vitest';

// The control imports `Map` as a named value, so the mock must provide it: this
// file's whole point is which constructor builds the comparison map.
const maplibreMapCalls: unknown[] = [];
vi.mock('maplibre-gl', () => ({
  Map: vi.fn().mockImplementation((options: unknown) => {
    maplibreMapCalls.push(options);
    return fakeMap();
  }),
}));

import { SwipeControl } from '../src/lib/core/SwipeControl';
import type { CreateSwipeComparisonMap } from '../src/lib/core/types';

/** The comparison-map surface the control drives, on either engine. */
function fakeMap() {
  const container = document.createElement('div');
  container.getBoundingClientRect = () => ({
    width: 800,
    height: 600,
    top: 0,
    left: 0,
    bottom: 600,
    right: 800,
    x: 0,
    y: 0,
    toJSON: () => ({}),
  });
  document.body.appendChild(container);
  return {
    getContainer: () => container,
    getCanvas: () => document.createElement('canvas'),
    getStyle: () => ({
      layers: [
        { id: 'layer1', type: 'fill', source: 'source1' },
        { id: 'layer2', type: 'raster', source: 'source2' },
      ],
      sources: { source1: { type: 'geojson' }, source2: { type: 'raster' } },
    }),
    getCenter: () => ({ lng: 0, lat: 0 }),
    getZoom: () => 5,
    getBearing: () => 0,
    getPitch: () => 0,
    getProjection: () => ({ type: 'mercator' }),
    setProjection: vi.fn(),
    getLayoutProperty: () => 'visible',
    setLayoutProperty: vi.fn(),
    getSource: vi.fn(),
    addSource: vi.fn(),
    addLayer: vi.fn(),
    isStyleLoaded: () => true,
    jumpTo: vi.fn(),
    resize: vi.fn(),
    addControl: vi.fn(),
    removeControl: vi.fn(),
    hasControl: () => true,
    on: vi.fn(),
    once: vi.fn(),
    off: vi.fn(),
    remove: vi.fn(),
  };
}

describe('SwipeControl createMap', () => {
  it('builds the comparison map with maplibre-gl by default', async () => {
    maplibreMapCalls.length = 0;
    const control = new SwipeControl({ showPanel: false });
    control.onAdd(fakeMap() as never);

    expect(maplibreMapCalls).toHaveLength(1);
    expect(control.getComparisonMap()).toBeDefined();
    control.onRemove();
  });

  it('builds it with the supplied factory instead, and never touches maplibre-gl', () => {
    maplibreMapCalls.length = 0;
    const comparison = fakeMap();
    const createMap = vi.fn(() => comparison) as unknown as CreateSwipeComparisonMap;

    const control = new SwipeControl({ showPanel: false, createMap });
    control.onAdd(fakeMap() as never);

    expect(createMap).toHaveBeenCalledTimes(1);
    expect(maplibreMapCalls, 'maplibre-gl must not be constructed').toHaveLength(0);
    expect(control.getComparisonMap()).toBe(comparison);
    control.onRemove();
  });

  it('hands the factory only options both Style Spec engines accept', () => {
    const comparison = fakeMap();
    let seen: Record<string, unknown> | undefined;
    const createMap = ((options: Record<string, unknown>) => {
      seen = options;
      return comparison;
    }) as unknown as CreateSwipeComparisonMap;

    const control = new SwipeControl({ showPanel: false, createMap });
    control.onAdd(fakeMap() as never);

    expect(Object.keys(seen!).sort()).toEqual([
      'attributionControl',
      'bearing',
      'center',
      'container',
      'interactive',
      'pitch',
      'style',
      'zoom',
    ]);
    // The comparison map is driven from the main map and the main map already
    // carries the attribution, so both are always off.
    expect(seen!.interactive).toBe(false);
    expect(seen!.attributionControl).toBe(false);
    expect((seen!.container as HTMLElement).className).toBe('swipe-comparison-map');
    control.onRemove();
  });

  it('removes the map the factory built when the control goes away', () => {
    const comparison = fakeMap();
    const control = new SwipeControl({
      showPanel: false,
      createMap: (() => comparison) as unknown as CreateSwipeComparisonMap,
    });
    control.onAdd(fakeMap() as never);
    control.onRemove();

    expect(comparison.remove).toHaveBeenCalled();
    expect(control.getComparisonMap()).toBeUndefined();
  });
});
