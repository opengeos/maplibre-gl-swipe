import { useState, useCallback } from 'react';
import type { SwipeState, SwipeOrientation } from '../core/types';

/**
 * Default initial state for the swipe control
 */
const DEFAULT_STATE: SwipeState = {
  collapsed: true,
  position: 50,
  orientation: 'vertical',
  leftLayers: [],
  rightLayers: [],
  isDragging: false,
};

/**
 * Custom hook for managing swipe control state in React applications.
 *
 * This hook provides a simple way to track and update the state
 * of a SwipeControl from React components.
 *
 * @example
 * ```tsx
 * function MyComponent() {
 *   const {
 *     state,
 *     setPosition,
 *     setOrientation,
 *     setLeftLayers,
 *     setRightLayers,
 *     toggle
 *   } = useSwipeState({
 *     position: 50,
 *     orientation: 'vertical',
 *   });
 *
 *   return (
 *     <div>
 *       <input
 *         type="range"
 *         min="0"
 *         max="100"
 *         value={state.position}
 *         onChange={(e) => setPosition(Number(e.target.value))}
 *       />
 *       <SwipeControlReact
 *         map={map}
 *         position={state.position}
 *         orientation={state.orientation}
 *         leftLayers={state.leftLayers}
 *         rightLayers={state.rightLayers}
 *         collapsed={state.collapsed}
 *         onSlide={setPosition}
 *       />
 *     </div>
 *   );
 * }
 * ```
 *
 * @param initialState - Optional initial state values
 * @returns Object containing state and update functions
 */
export function useSwipeState(initialState?: Partial<SwipeState>) {
  const [state, setState] = useState<SwipeState>({
    ...DEFAULT_STATE,
    ...initialState,
  });

  /**
   * Sets the slider position (0-100)
   */
  const setPosition = useCallback((position: number) => {
    setState((prev) => ({
      ...prev,
      position: Math.max(0, Math.min(100, position)),
    }));
  }, []);

  /**
   * Sets the orientation
   */
  const setOrientation = useCallback((orientation: SwipeOrientation) => {
    setState((prev) => ({ ...prev, orientation }));
  }, []);

  /**
   * Sets the left/top layers
   */
  const setLeftLayers = useCallback((leftLayers: string[]) => {
    setState((prev) => ({ ...prev, leftLayers: [...leftLayers] }));
  }, []);

  /**
   * Sets the right/bottom layers
   */
  const setRightLayers = useCallback((rightLayers: string[]) => {
    setState((prev) => ({ ...prev, rightLayers: [...rightLayers] }));
  }, []);

  /**
   * Sets the collapsed state
   */
  const setCollapsed = useCallback((collapsed: boolean) => {
    setState((prev) => ({ ...prev, collapsed }));
  }, []);

  /**
   * Toggles the collapsed state
   */
  const toggle = useCallback(() => {
    setState((prev) => ({ ...prev, collapsed: !prev.collapsed }));
  }, []);

  /**
   * Resets the state to default values
   */
  const reset = useCallback(() => {
    setState({ ...DEFAULT_STATE, ...initialState });
  }, [initialState]);

  /**
   * Adds a layer to the left side
   */
  const addLeftLayer = useCallback((layerId: string) => {
    setState((prev) => {
      if (prev.leftLayers.includes(layerId)) return prev;
      return { ...prev, leftLayers: [...prev.leftLayers, layerId] };
    });
  }, []);

  /**
   * Removes a layer from the left side
   */
  const removeLeftLayer = useCallback((layerId: string) => {
    setState((prev) => ({
      ...prev,
      leftLayers: prev.leftLayers.filter((id) => id !== layerId),
    }));
  }, []);

  /**
   * Adds a layer to the right side
   */
  const addRightLayer = useCallback((layerId: string) => {
    setState((prev) => {
      if (prev.rightLayers.includes(layerId)) return prev;
      return { ...prev, rightLayers: [...prev.rightLayers, layerId] };
    });
  }, []);

  /**
   * Removes a layer from the right side
   */
  const removeRightLayer = useCallback((layerId: string) => {
    setState((prev) => ({
      ...prev,
      rightLayers: prev.rightLayers.filter((id) => id !== layerId),
    }));
  }, []);

  return {
    state,
    setState,
    setPosition,
    setOrientation,
    setLeftLayers,
    setRightLayers,
    setCollapsed,
    toggle,
    reset,
    addLeftLayer,
    removeLeftLayer,
    addRightLayer,
    removeRightLayer,
  };
}
