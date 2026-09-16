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

describe('SwipeControl basemapLayerIds', () => {
  it('groups the named layers without fetching a style', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    const control = new SwipeControl({
      showPanel: true,
      // A `mapbox://` URL has no HTTP form, so a host on Mapbox has ids but no
      // fetchable style. Both are passed; the ids win.
      basemapStyle: 'mapbox://styles/mapbox/standard',
      basemapLayerIds: ['layer1'],
      createMap: (() => fakeMap()) as unknown as CreateSwipeComparisonMap,
    });
    control.onAdd(fakeMap() as never);

    expect(fetchSpy, 'a mapbox:// style must not be fetched').not.toHaveBeenCalled();
    // layer1 is the basemap, so it is grouped away; layer2 is listed on its own.
    const ids = control.getLayers().map((layer) => layer.id);
    expect(ids).toContain('__basemap__');
    expect(ids).toContain('layer2');
    expect(ids).not.toContain('layer1');

    control.onRemove();
    fetchSpy.mockRestore();
  });

  it('still fetches when only a style URL is given', async () => {
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue({
        ok: true,
        json: async () => ({ layers: [{ id: 'layer1' }] }),
      } as Response);
    const control = new SwipeControl({
      showPanel: true,
      basemapStyle: 'https://example.test/style.json',
      createMap: (() => fakeMap()) as unknown as CreateSwipeComparisonMap,
    });
    control.onAdd(fakeMap() as never);
    await vi.waitFor(() => expect(fetchSpy).toHaveBeenCalledWith('https://example.test/style.json'));

    control.onRemove();
    fetchSpy.mockRestore();
  });
});

describe('SwipeControl remount', () => {
  it('tears the previous mount down instead of orphaning it in the container', () => {
    // A host that repositions a control removes and re-adds the *same*
    // instance, and some engines re-add plugin controls after a style change.
    // Every element reference below is overwritten by onAdd, so a leftover
    // slider or clipped pane — with a live comparison map inside it — would sit
    // in the map container with nothing able to remove it.
    const comparisons: ReturnType<typeof fakeMap>[] = [];
    const control = new SwipeControl({
      showPanel: true,
      createMap: (() => {
        const map = fakeMap();
        comparisons.push(map);
        return map;
      }) as unknown as CreateSwipeComparisonMap,
    });

    const host = fakeMap();
    const container = host.getContainer();
    control.onAdd(host as never);
    expect(container.querySelectorAll('.swipe-clip-container')).toHaveLength(1);
    expect(container.querySelectorAll('.swipe-slider')).toHaveLength(1);

    control.onAdd(host as never);
    expect(container.querySelectorAll('.swipe-clip-container')).toHaveLength(1);
    expect(container.querySelectorAll('.swipe-slider')).toHaveLength(1);
    // And the first comparison map was actually destroyed, not just detached.
    expect(comparisons).toHaveLength(2);
    expect(comparisons[0].remove).toHaveBeenCalled();

    control.onRemove();
    expect(container.querySelectorAll('.swipe-clip-container')).toHaveLength(0);
  });

  it('still mounts cleanly the first time', () => {
    const control = new SwipeControl({ showPanel: false });
    const host = fakeMap();
    const element = control.onAdd(host as never);
    expect(element.className).toContain('swipe-control');
    control.onRemove();
  });
});
