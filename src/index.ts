// Import styles
import './lib/styles/swipe-control.css';

// Main entry point - Core exports
export { SwipeControl } from './lib/core/SwipeControl';

// Type exports
export type {
  SwipeControlOptions,
  SwipeState,
  SwipeControlEvent,
  SwipeControlEventHandler,
  SwipeControlEventData,
  SwipeOrientation,
  LayerInfo,
} from './lib/core/types';

// Utility exports
export {
  clamp,
  formatNumericValue,
  generateId,
  debounce,
  throttle,
  classNames,
} from './lib/utils';
