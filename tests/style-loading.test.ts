import { describe, it, expect, vi } from 'vitest';

// The control builds the comparison pane with `new Map(...)` unless a host
// hands it a factory, so the module has to resolve even though these tests
// supply their own.
vi.mock('maplibre-gl', () => ({
  Map: vi.fn().mockImplementation(() => comparisonMap()),
}));

import { SwipeControl } from '../src/lib/core/SwipeControl';
import type { CreateSwipeComparisonMap } from '../src/lib/core/types';

const STYLE = {
  layers: [
    { id: 'layer1', type: 'fill', source: 'source1' },
    { id: 'layer2', type: 'raster', source: 'source2' },
  ],
  sources: { source1: { type: 'geojson' }, source2: { type: 'raster' } },
};

function sizedContainer(): HTMLElement {
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
  return container;
}

/** The comparison pane's own surface; nothing here reads a loading style. */
function comparisonMap() {
  return {
    getContainer: sizedContainer,
    getCanvas: () => document.createElement('canvas'),
    getStyle: () => STYLE,
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
    on: vi.fn(),
    once: vi.fn(),
    off: vi.fn(),
    remove: vi.fn(),
  };
}

/**
 * A main map in the state mapbox-gl is in while `setStyle` is in flight:
 * `getStyle()` throws rather than answering `undefined` the way MapLibre's
 * does. `loaded` flips both that and `isStyleLoaded()` once the style lands.
 */
function loadingMainMap() {
  const container = sizedContainer();
  const styledata: (() => void)[] = [];
  const state = { loaded: false };
  return {
    state,
    styledata,
    container,
    map: {
      getContainer: () => container,
      getCanvas: () => document.createElement('canvas'),
      getStyle: () => {
        if (!state.loaded) throw new Error('Style is not done loading');
        return STYLE;
      },
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
      isStyleLoaded: () => state.loaded,
      jumpTo: vi.fn(),
      resize: vi.fn(),
      on: vi.fn(),
      once: (event: string, handler: () => void) => {
        if (event === 'styledata') styledata.push(handler);
      },
      off: vi.fn(),
      remove: vi.fn(),
    },
  };
}

describe('mounting on a map whose style is still loading', () => {
  it('mounts instead of throwing, and builds the pane once the style lands', () => {
    // mapbox-gl throws `Style is not done loading` where MapLibre answers
    // `undefined`, and a host that swaps the basemap re-mounts this control
    // mid-`setStyle`. That throw used to escape `onAdd`.
    const { map, state, styledata } = loadingMainMap();
    const pane = comparisonMap();
    const control = new SwipeControl({
      showPanel: true,
      basemapLayerIds: ['layer2'],
      createMap: (() => pane) as unknown as CreateSwipeComparisonMap,
    });

    const element = control.onAdd(map as never);
    expect(element).toBeInstanceOf(HTMLElement);
    // Deferred, exactly as on a MapLibre map that is not ready yet, and with
    // no half-built pane left on the map while it waits.
    expect(control.getComparisonMap()).toBeUndefined();

    expect(map.getContainer().querySelectorAll('.swipe-clip-container')).toHaveLength(0);

    state.loaded = true;
    expect(styledata).toHaveLength(1);
    styledata[0]();
    expect(control.getComparisonMap()).toBe(pane);
    expect(map.getContainer().querySelectorAll('.swipe-clip-container')).toHaveLength(1);

    control.onRemove();
  });

  it('lists no layers while the style is loading, and the real ones after', () => {
    const { map, state } = loadingMainMap();
    const control = new SwipeControl({
      showPanel: false,
      createMap: (() => comparisonMap()) as unknown as CreateSwipeComparisonMap,
    });
    control.onAdd(map as never);

    expect(control.getLayers()).toEqual([]);
    state.loaded = true;
    expect(control.getLayers().map((layer) => layer.id)).toEqual(['layer1', 'layer2']);

    control.onRemove();
  });
});

describe('a mount that throws part-way', () => {
  it('leaves nothing on the map', () => {
    // The host never receives an element for a mount that threw, so it has
    // nothing to call `onRemove` on: whatever the mount already appended --
    // the clipped pane and its comparison map, a live WebGL context -- would
    // stay on the map forever.
    const { map, state, container } = loadingMainMap();
    state.loaded = true;
    const pane = comparisonMap();
    const control = new SwipeControl({
      showPanel: true,
      basemapLayerIds: ['layer2'],
      createMap: (() => pane) as unknown as CreateSwipeComparisonMap,
      layerProvider: {
        getLayers: () => {
          throw new Error('provider exploded');
        },
        applySide: vi.fn(),
      },
    });

    expect(() => control.onAdd(map as never)).toThrow('provider exploded');
    expect(container.querySelectorAll('.swipe-clip-container')).toHaveLength(0);
    expect(container.querySelectorAll('.swipe-comparison-map')).toHaveLength(0);
    expect(container.querySelectorAll('.swipe-slider')).toHaveLength(0);
    expect(pane.remove).toHaveBeenCalled();
    expect(control.getComparisonMap()).toBeUndefined();
  });
});
