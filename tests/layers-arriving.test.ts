import { describe, it, expect, vi } from 'vitest';

// The control builds the comparison pane with `new Map(...)` unless a host
// hands it a factory, so the module has to resolve even though these tests
// supply their own.
vi.mock('maplibre-gl', () => ({ Map: vi.fn() }));

import { SwipeControl } from '../src/lib/core/SwipeControl';
import type { CreateSwipeComparisonMap } from '../src/lib/core/types';

interface StyleLayer {
  id: string;
  type: string;
  source: string;
  layout?: { visibility?: string };
}

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

/**
 * A loaded map whose style layers can be added after the control mounts, the
 * way an engine re-adds its own layers once a new style has loaded. Layout
 * edits and `addLayer` fire `styledata`, as they do on both engines.
 */
function styleMap(initial: StyleLayer[]) {
  const layers = initial.map((layer) => ({ ...layer, layout: { ...layer.layout } }));
  const styledata = new Set<() => void>();
  const styleLoad = new Set<() => void>();
  const fire = () => [...styledata].forEach((handler) => handler());
  const map = {
    layers,
    fire,
    /** Swap in a new style whose layers carry their own visibility. */
    replaceStyle: (next: StyleLayer[]) => {
      const fresh = next.map((layer) => ({ ...layer, layout: { ...layer.layout } }));
      layers.splice(0, layers.length, ...fresh);
      [...styleLoad].forEach((handler) => handler());
      fire();
    },
    getContainer: () => sizedContainer(),
    getCanvas: () => document.createElement('canvas'),
    getStyle: () => ({
      layers: layers.map((layer) => ({ ...layer })),
      sources: { data: { type: 'geojson' }, basemap: { type: 'raster' } },
    }),
    getCenter: () => ({ lng: 0, lat: 0 }),
    getZoom: () => 5,
    getBearing: () => 0,
    getPitch: () => 0,
    getProjection: () => ({ type: 'mercator' }),
    setProjection: vi.fn(),
    getLayoutProperty: (id: string) => layers.find((layer) => layer.id === id)?.layout?.visibility,
    setLayoutProperty: (id: string, _name: string, value: string) => {
      const layer = layers.find((candidate) => candidate.id === id);
      if (!layer) throw new Error(`no layer ${id}`);
      layer.layout = { ...layer.layout, visibility: value };
      fire();
    },
    getSource: (id: string) => (id === 'data' || id === 'basemap' ? {} : undefined),
    addSource: vi.fn(),
    addLayer: (spec: StyleLayer) => {
      layers.push({ ...spec, layout: { ...spec.layout } });
      fire();
    },
    isStyleLoaded: () => true,
    jumpTo: vi.fn(),
    resize: vi.fn(),
    on: (event: string, handler: () => void) => {
      if (event === 'styledata') styledata.add(handler);
      if (event === 'style.load') styleLoad.add(handler);
    },
    once: vi.fn(),
    off: (event: string, handler: () => void) => {
      if (event === 'styledata') styledata.delete(handler);
      if (event === 'style.load') styleLoad.delete(handler);
    },
    remove: vi.fn(),
  };
  return map;
}

const visibility = (map: ReturnType<typeof styleMap>, id: string) =>
  map.layers.find((layer) => layer.id === id)?.layout?.visibility ?? 'absent';

describe('side-assigned layers that reach the map after the control mounts', () => {
  it('applies the sides once the host adds them, on the main map and the pane', () => {
    // The control is mounted on a style that has only the basemap; the host
    // re-adds its own layers afterwards. The mount's pass had nothing to
    // assign, and before opengeos/GeoLibre#2434 no later pass ran: the right
    // layer stayed drawn on the main map and never reached the pane.
    const basemap = { id: 'basemap', type: 'raster', source: 'basemap' };
    const main = styleMap([basemap]);
    const pane = styleMap([basemap]);
    const control = new SwipeControl({
      showPanel: false,
      leftLayers: ['west'],
      rightLayers: ['east'],
      createMap: (() => pane) as unknown as CreateSwipeComparisonMap,
    });
    control.onAdd(main as never);

    main.addLayer({ id: 'west', type: 'fill', source: 'data' });
    main.addLayer({ id: 'east', type: 'fill', source: 'data' });

    expect(visibility(main, 'west')).toBe('visible');
    expect(visibility(main, 'east')).toBe('none');
    expect(visibility(pane, 'east')).toBe('visible');
    expect(visibility(pane, 'west')).toBe('absent');

    control.onRemove();
  });

  it('applies the sides again when a replaced style keeps the same layer ids', () => {
    // Same ids before and after, so only the style replacement itself can say
    // the new layers came back with their style's own visibility.
    const layers = [
      { id: 'west', type: 'fill', source: 'data' },
      { id: 'east', type: 'fill', source: 'data' },
    ];
    const main = styleMap(layers);
    const pane = styleMap([]);
    const control = new SwipeControl({
      showPanel: false,
      leftLayers: ['west'],
      rightLayers: ['east'],
      createMap: (() => pane) as unknown as CreateSwipeComparisonMap,
    });
    control.onAdd(main as never);
    expect(visibility(main, 'east')).toBe('none');

    main.replaceStyle(layers);
    expect(visibility(main, 'east')).toBe('none');

    control.onRemove();
  });

  it("leaves a host's own visibility edit alone when no assigned layer came or went", () => {
    const main = styleMap([
      { id: 'basemap', type: 'raster', source: 'basemap' },
      { id: 'west', type: 'fill', source: 'data' },
    ]);
    const pane = styleMap([]);
    const control = new SwipeControl({
      showPanel: false,
      leftLayers: ['west'],
      createMap: (() => pane) as unknown as CreateSwipeComparisonMap,
    });
    control.onAdd(main as never);
    expect(visibility(main, 'west')).toBe('visible');

    // A layer panel hiding the layer fires `styledata` as well; re-running the
    // sides on every one of those would switch it straight back on.
    main.setLayoutProperty('west', 'visibility', 'none');
    expect(visibility(main, 'west')).toBe('none');

    control.onRemove();
  });
});
