// React entry point
export { SwipeControlReact } from './lib/core/SwipeControlReact';

// React hooks
export { useSwipeState } from './lib/hooks';

// Re-export types for React consumers
export type {
  SwipeControlOptions,
  SwipeState,
  SwipeControlReactProps,
  SwipeControlEvent,
  SwipeControlEventHandler,
  SwipeOrientation,
} from './lib/core/types';
