import { useEffect, useRef } from 'react';
import { SwipeControl } from './SwipeControl';
import type { SwipeControlReactProps } from './types';

/**
 * React wrapper component for SwipeControl.
 *
 * This component manages the lifecycle of a SwipeControl instance,
 * adding it to the map on mount and removing it on unmount.
 *
 * @example
 * ```tsx
 * import { SwipeControlReact } from 'maplibre-gl-swipe/react';
 *
 * function MyMap() {
 *   const [map, setMap] = useState<Map | null>(null);
 *
 *   return (
 *     <>
 *       <div ref={mapContainer} />
 *       {map && (
 *         <SwipeControlReact
 *           map={map}
 *           orientation="vertical"
 *           position={50}
 *           leftLayers={['satellite-layer']}
 *           rightLayers={['streets-layer']}
 *         />
 *       )}
 *     </>
 *   );
 * }
 * ```
 *
 * @param props - Component props including map instance and control options
 * @returns null - This component renders nothing directly
 */
export function SwipeControlReact({
  map,
  onSlide,
  onLayerChange,
  onStateChange,
  onActiveChange,
  active,
  ...options
}: SwipeControlReactProps): null {
  const controlRef = useRef<SwipeControl | null>(null);

  useEffect(() => {
    if (!map) return;

    // Create the control instance
    const control = new SwipeControl(options);
    controlRef.current = control;

    // Register event handlers
    if (onSlide) {
      control.on('slide', (event) => {
        if (event.position !== undefined) {
          onSlide(event.position);
        }
      });
    }

    if (onLayerChange) {
      control.on('layerchange', (event) => {
        onLayerChange(event.state.leftLayers, event.state.rightLayers);
      });
    }

    if (onStateChange) {
      control.on('statechange', (event) => {
        onStateChange(event.state);
      });
    }

    if (onActiveChange) {
      control.on('activate', () => {
        onActiveChange(true);
      });
      control.on('deactivate', () => {
        onActiveChange(false);
      });
    }

    // Add control to map
    map.addControl(control, 'top-right');

    // Cleanup on unmount
    return () => {
      if (map.hasControl(control)) {
        map.removeControl(control);
      }
      controlRef.current = null;
    };
  }, [map]);

  // Update position when prop changes
  useEffect(() => {
    if (controlRef.current && options.position !== undefined) {
      controlRef.current.setPosition(options.position);
    }
  }, [options.position]);

  // Update left layers when prop changes
  useEffect(() => {
    if (controlRef.current && options.leftLayers) {
      controlRef.current.setLeftLayers(options.leftLayers);
    }
  }, [options.leftLayers]);

  // Update right layers when prop changes
  useEffect(() => {
    if (controlRef.current && options.rightLayers) {
      controlRef.current.setRightLayers(options.rightLayers);
    }
  }, [options.rightLayers]);

  // Update orientation when prop changes
  useEffect(() => {
    if (controlRef.current && options.orientation) {
      controlRef.current.setOrientation(options.orientation);
    }
  }, [options.orientation]);

  // Handle collapsed state
  useEffect(() => {
    if (controlRef.current && options.collapsed !== undefined) {
      const currentState = controlRef.current.getState();
      if (options.collapsed !== currentState.collapsed) {
        if (options.collapsed) {
          controlRef.current.collapse();
        } else {
          controlRef.current.expand();
        }
      }
    }
  }, [options.collapsed]);

  // Handle active state
  useEffect(() => {
    if (controlRef.current && active !== undefined) {
      controlRef.current.setActive(active);
    }
  }, [active]);

  return null;
}
