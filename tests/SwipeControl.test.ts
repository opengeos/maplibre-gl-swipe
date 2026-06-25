import { describe, it, expect, beforeEach, vi } from 'vitest';

// Mock maplibre-gl
vi.mock('maplibre-gl', () => ({
  default: {
    Map: vi.fn().mockImplementation(() => ({
      getContainer: () => {
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
        return container;
      },
      getCanvas: () => document.createElement('canvas'),
      getStyle: () => ({
        layers: [
          { id: 'layer1', type: 'fill', source: 'source1' },
          { id: 'layer2', type: 'raster', source: 'source2' },
          { id: 'layer3', type: 'line', source: 'source1' },
        ],
      }),
      getLayoutProperty: () => 'visible',
      setLayoutProperty: vi.fn(),
      addControl: vi.fn(),
      removeControl: vi.fn(),
      hasControl: () => true,
      on: vi.fn(),
      off: vi.fn(),
    })),
  },
}));

import maplibregl from 'maplibre-gl';
import { SwipeControl } from '../src/lib/core/SwipeControl';

describe('SwipeControl', () => {
  let control: SwipeControl;

  beforeEach(() => {
    control = new SwipeControl({
      position: 50,
      orientation: 'vertical',
    });
  });

  describe('constructor', () => {
    it('should create with default options', () => {
      const defaultControl = new SwipeControl();
      const state = defaultControl.getState();
      expect(state.position).toBe(50);
      expect(state.orientation).toBe('vertical');
      expect(state.collapsed).toBe(true);
      expect(state.leftLayers).toEqual([]);
      expect(state.rightLayers).toEqual([]);
    });

    it('should create with custom options', () => {
      const customControl = new SwipeControl({
        position: 75,
        orientation: 'horizontal',
        collapsed: false,
        leftLayers: ['layer1'],
        rightLayers: ['layer2'],
      });
      const state = customControl.getState();
      expect(state.position).toBe(75);
      expect(state.orientation).toBe('horizontal');
      expect(state.collapsed).toBe(false);
      expect(state.leftLayers).toEqual(['layer1']);
      expect(state.rightLayers).toEqual(['layer2']);
    });

    it('should defer selectVisibleByDefault until the map is ready', () => {
      const autoControl = new SwipeControl({ selectVisibleByDefault: true });
      const state = autoControl.getState();
      // The selection is applied in onAdd once the map is available, not in the
      // constructor, so the initial state is still empty.
      expect(state.leftLayers).toEqual([]);
      expect(state.rightLayers).toEqual([]);
    });
  });

  describe('selectVisibleByDefault', () => {
    it('should put all visible layers on the left and only the basemap on the right', () => {
      const autoControl = new SwipeControl({ selectVisibleByDefault: true });
      const map = new maplibregl.Map();
      // Simulate the map being attached, then run the deferred default-selection
      // step the way onAdd does once the style/basemap are ready.
      (autoControl as unknown as { _map: typeof map })._map = map;
      // Treat layer1 as a basemap layer so it groups into the "__basemap__"
      // entry, the way a real basemap style would.
      (autoControl as unknown as { _basemapLayerIds: Set<string> })._basemapLayerIds =
        new Set(['layer1']);
      const applied = (
        autoControl as unknown as {
          _applyDefaultSelectionIfPending: () => boolean;
        }
      )._applyDefaultSelectionIfPending();

      expect(applied).toBe(true);
      const state = autoControl.getState();
      expect(state.leftLayers).toEqual(['__basemap__', 'layer2', 'layer3']);
      expect(state.rightLayers).toEqual(['__basemap__']);
    });

    it('should fall back to the bottom-most layer on the right when there is no basemap', () => {
      const autoControl = new SwipeControl({ selectVisibleByDefault: true });
      const map = new maplibregl.Map();
      (autoControl as unknown as { _map: typeof map })._map = map;
      const applied = (
        autoControl as unknown as {
          _applyDefaultSelectionIfPending: () => boolean;
        }
      )._applyDefaultSelectionIfPending();

      expect(applied).toBe(true);
      const state = autoControl.getState();
      expect(state.leftLayers).toEqual(['layer1', 'layer2', 'layer3']);
      expect(state.rightLayers).toEqual(['layer1']);
    });

    it('should not override an explicit layer selection', () => {
      const autoControl = new SwipeControl({
        selectVisibleByDefault: true,
        leftLayers: ['layer1'],
      });
      const map = new maplibregl.Map();
      (autoControl as unknown as { _map: typeof map })._map = map;
      const applied = (
        autoControl as unknown as {
          _applyDefaultSelectionIfPending: () => boolean;
        }
      )._applyDefaultSelectionIfPending();

      expect(applied).toBe(false);
      expect(autoControl.getState().leftLayers).toEqual(['layer1']);
    });

    it('should leave selection empty when the option is off', () => {
      const plainControl = new SwipeControl();
      const map = new maplibregl.Map();
      (plainControl as unknown as { _map: typeof map })._map = map;
      const applied = (
        plainControl as unknown as {
          _applyDefaultSelectionIfPending: () => boolean;
        }
      )._applyDefaultSelectionIfPending();

      expect(applied).toBe(false);
      expect(plainControl.getState().leftLayers).toEqual([]);
    });
  });

  describe('visibleLayersOnly', () => {
    // Builds a fake map whose layer visibility is controlled per id, so the
    // panel-filtering logic can be exercised without a real MapLibre instance.
    const makeMapWithVisibility = (hidden: Set<string>) => ({
      getStyle: () => ({
        layers: [
          { id: 'layer1', type: 'fill', source: 'source1' },
          { id: 'layer2', type: 'raster', source: 'source2' },
          { id: 'layer3', type: 'line', source: 'source1' },
        ],
      }),
      getLayoutProperty: (id: string) => (hidden.has(id) ? 'none' : 'visible'),
    });

    const panelLayerIds = (ctrl: SwipeControl): string[] =>
      (
        ctrl as unknown as { _getPanelLayers: () => { id: string }[] }
      )._getPanelLayers().map((l) => l.id);

    it('returns every layer when the option is off (default)', () => {
      const ctrl = new SwipeControl();
      (ctrl as unknown as { _map: unknown })._map = makeMapWithVisibility(
        new Set(['layer2'])
      );
      expect(panelLayerIds(ctrl)).toEqual(['layer1', 'layer2', 'layer3']);
    });

    it('omits hidden, unselected layers when the option is on', () => {
      const ctrl = new SwipeControl({ visibleLayersOnly: true });
      (ctrl as unknown as { _map: unknown })._map = makeMapWithVisibility(
        new Set(['layer2'])
      );
      expect(panelLayerIds(ctrl)).toEqual(['layer1', 'layer3']);
    });

    it('keeps a hidden layer that is still selected on either side', () => {
      const ctrl = new SwipeControl({
        visibleLayersOnly: true,
        rightLayers: ['layer2'],
      });
      // layer2 is hidden on the main map (the control shows it on the right via
      // the comparison map), but it must stay listed so the user can deselect it.
      (ctrl as unknown as { _map: unknown })._map = makeMapWithVisibility(
        new Set(['layer2'])
      );
      expect(panelLayerIds(ctrl)).toEqual(['layer1', 'layer2', 'layer3']);
    });
  });

  describe('getPosition / setPosition', () => {
    it('should return initial position', () => {
      expect(control.getPosition()).toBe(50);
    });

    it('should set position within bounds', () => {
      control.setPosition(75);
      expect(control.getPosition()).toBe(75);
    });

    it('should clamp position to max 100', () => {
      control.setPosition(150);
      expect(control.getPosition()).toBe(100);
    });

    it('should clamp position to min 0', () => {
      control.setPosition(-10);
      expect(control.getPosition()).toBe(0);
    });

    it('should handle decimal positions', () => {
      control.setPosition(33.33);
      expect(control.getPosition()).toBe(33.33);
    });
  });

  describe('setLeftLayers / setRightLayers', () => {
    it('should set left layers', () => {
      control.setLeftLayers(['layer1', 'layer2']);
      const state = control.getState();
      expect(state.leftLayers).toEqual(['layer1', 'layer2']);
    });

    it('should set right layers', () => {
      control.setRightLayers(['layer3']);
      const state = control.getState();
      expect(state.rightLayers).toEqual(['layer3']);
    });

    it('should not share array references', () => {
      const layers = ['layer1'];
      control.setLeftLayers(layers);
      layers.push('layer2');
      expect(control.getState().leftLayers).toEqual(['layer1']);
    });
  });

  describe('setOrientation', () => {
    it('should set orientation to horizontal', () => {
      control.setOrientation('horizontal');
      expect(control.getState().orientation).toBe('horizontal');
    });

    it('should set orientation to vertical', () => {
      control.setOrientation('horizontal');
      control.setOrientation('vertical');
      expect(control.getState().orientation).toBe('vertical');
    });

    it('should not emit event if orientation unchanged', () => {
      const handler = vi.fn();
      control.on('orientationchange', handler);
      control.setOrientation('vertical'); // Already vertical
      expect(handler).not.toHaveBeenCalled();
    });
  });

  describe('toggle / expand / collapse', () => {
    it('should toggle collapsed state', () => {
      expect(control.getState().collapsed).toBe(true);
      control.toggle();
      expect(control.getState().collapsed).toBe(false);
      control.toggle();
      expect(control.getState().collapsed).toBe(true);
    });

    it('should expand when collapsed', () => {
      control.expand();
      expect(control.getState().collapsed).toBe(false);
    });

    it('should not change state when expanding already expanded', () => {
      control.expand();
      control.expand();
      expect(control.getState().collapsed).toBe(false);
    });

    it('should collapse when expanded', () => {
      control.expand();
      control.collapse();
      expect(control.getState().collapsed).toBe(true);
    });

    it('should not change state when collapsing already collapsed', () => {
      control.collapse();
      expect(control.getState().collapsed).toBe(true);
    });
  });

  describe('events', () => {
    it('should emit slide event on position change', () => {
      const handler = vi.fn();
      control.on('slide', handler);
      control.setPosition(60);
      expect(handler).toHaveBeenCalled();
      expect(handler.mock.calls[0][0].position).toBe(60);
    });

    it('should emit layerchange event on layer change', () => {
      const handler = vi.fn();
      control.on('layerchange', handler);
      control.setLeftLayers(['layer1']);
      expect(handler).toHaveBeenCalled();
    });

    it('should emit orientationchange event', () => {
      const handler = vi.fn();
      control.on('orientationchange', handler);
      control.setOrientation('horizontal');
      expect(handler).toHaveBeenCalled();
    });

    it('should emit statechange event', () => {
      const handler = vi.fn();
      control.on('statechange', handler);
      control.setPosition(60);
      expect(handler).toHaveBeenCalled();
    });

    it('should emit collapse event on toggle when expanded', () => {
      // Panel only exists when added to map, so collapse/expand events
      // require toggling state which is tracked regardless of panel
      control.toggle(); // expand (collapsed -> not collapsed)
      const handler = vi.fn();
      control.on('collapse', handler);
      control.toggle(); // collapse
      expect(handler).toHaveBeenCalled();
    });

    it('should emit expand event on toggle when collapsed', () => {
      const handler = vi.fn();
      control.on('expand', handler);
      control.toggle(); // expand
      expect(handler).toHaveBeenCalled();
    });

    it('should remove event handler with off', () => {
      const handler = vi.fn();
      control.on('slide', handler);
      control.off('slide', handler);
      control.setPosition(60);
      expect(handler).not.toHaveBeenCalled();
    });
  });

  describe('getState', () => {
    it('should return a copy of state', () => {
      const state1 = control.getState();
      const state2 = control.getState();
      expect(state1).not.toBe(state2);
      expect(state1).toEqual(state2);
    });

    it('should not allow state mutation', () => {
      const state = control.getState();
      state.position = 99;
      expect(control.getPosition()).toBe(50);
    });
  });

  describe('panel display order', () => {
    it('reverses the paint order so the top-of-stack layer is listed first', () => {
      const ctrl = new SwipeControl();
      (ctrl as unknown as { _map: unknown })._map = new maplibregl.Map();
      const ids = (
        ctrl as unknown as { _getDisplayLayers: () => { id: string }[] }
      )
        ._getDisplayLayers()
        .map((l) => l.id);
      // getLayers() follows MapLibre's bottom-to-top paint order
      // (layer1, layer2, layer3); the panel reverses it so the top layer is
      // first, mirroring a host layer manager.
      expect(ids).toEqual(['layer3', 'layer2', 'layer1']);
    });

    it('places the grouped basemap entry at the bottom of the list', () => {
      const ctrl = new SwipeControl();
      (ctrl as unknown as { _map: unknown })._map = new maplibregl.Map();
      (
        ctrl as unknown as { _basemapLayerIds: Set<string> }
      )._basemapLayerIds = new Set(['layer1']);
      const ids = (
        ctrl as unknown as { _getDisplayLayers: () => { id: string }[] }
      )
        ._getDisplayLayers()
        .map((l) => l.id);
      // layer1 groups into __basemap__ at the bottom of the stack, so after the
      // reversal it sits last, where the host shows its base layer.
      expect(ids).toEqual(['layer3', 'layer2', '__basemap__']);
    });
  });

  describe('setActive', () => {
    // Attach the DOM nodes setActive touches, since the control is not added to
    // a real map in these unit tests.
    const attachElements = (ctrl: SwipeControl) => {
      const slider = document.createElement('div');
      slider.className = 'swipe-slider swipe-slider-vertical';
      const clip = document.createElement('div');
      (ctrl as unknown as { _slider: HTMLElement })._slider = slider;
      (ctrl as unknown as { _clipContainer: HTMLElement })._clipContainer =
        clip;
      return { slider, clip };
    };

    it('keeps the comparison overlay visible and locks the slider when deactivated', () => {
      const ctrl = new SwipeControl({ active: true });
      const { slider, clip } = attachElements(ctrl);
      ctrl.setActive(false);
      expect(ctrl.isActive()).toBe(false);
      // The split view stays on screen; only the slider is locked. See #842.
      expect(clip.style.display).not.toBe('none');
      expect(slider.classList.contains('swipe-slider-locked')).toBe(true);
    });

    it('unlocks the slider and keeps the overlay visible when reactivated', () => {
      const ctrl = new SwipeControl({ active: false });
      const { slider, clip } = attachElements(ctrl);
      slider.classList.add('swipe-slider-locked');
      ctrl.setActive(true);
      expect(ctrl.isActive()).toBe(true);
      expect(clip.style.display).not.toBe('none');
      expect(slider.classList.contains('swipe-slider-locked')).toBe(false);
    });

    it('does not start a drag while inactive', () => {
      const ctrl = new SwipeControl({ active: false });
      const handler = vi.fn();
      ctrl.on('slidestart', handler);
      (
        ctrl as unknown as { _onDragStart: (e: MouseEvent) => void }
      )._onDragStart(new MouseEvent('mousedown'));
      expect(handler).not.toHaveBeenCalled();
    });
  });

  describe('comparison overlay stacking', () => {
    it('places the overlay just above a base-map canvas with a raised z-index', () => {
      // A host may lift the base map canvas above its default stacking (e.g. to
      // layer effect canvases beneath it under globe projection); the overlay
      // must sit above it or the base map paints over the comparison map.
      const canvas = document.createElement('canvas');
      canvas.style.zIndex = '4';
      const ctrl = new SwipeControl();
      (ctrl as unknown as { _map: unknown })._map = { getCanvas: () => canvas };
      expect(
        (ctrl as unknown as { _getOverlayZIndex(): number })._getOverlayZIndex(),
      ).toBe(5);
    });

    it('falls back to z-index 1 when the canvas uses default stacking', () => {
      const canvas = document.createElement('canvas');
      const ctrl = new SwipeControl();
      (ctrl as unknown as { _map: unknown })._map = { getCanvas: () => canvas };
      expect(
        (ctrl as unknown as { _getOverlayZIndex(): number })._getOverlayZIndex(),
      ).toBe(1);
    });
  });
});
