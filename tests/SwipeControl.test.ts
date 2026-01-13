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
});
