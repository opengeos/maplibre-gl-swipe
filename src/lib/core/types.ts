import type { Map } from 'maplibre-gl';

/**
 * Orientation of the swipe slider
 */
export type SwipeOrientation = 'vertical' | 'horizontal';

/**
 * Options for configuring the SwipeControl
 */
export interface SwipeControlOptions {
  /**
   * Orientation of the swipe slider
   * - 'vertical': Left/right comparison (slider moves horizontally)
   * - 'horizontal': Top/bottom comparison (slider moves vertically)
   * @default 'vertical'
   */
  orientation?: SwipeOrientation;

  /**
   * Initial slider position as a percentage (0-100)
   * @default 50
   */
  position?: number;

  /**
   * Layer IDs to show on the left side (or top for horizontal orientation)
   * @default []
   */
  leftLayers?: string[];

  /**
   * Layer IDs to show on the right side (or bottom for horizontal orientation)
   * @default []
   */
  rightLayers?: string[];

  /**
   * Whether to show the GUI panel for layer selection
   * @default true
   */
  showPanel?: boolean;

  /**
   * Whether the control panel should start collapsed
   * @default true
   */
  collapsed?: boolean;

  /**
   * Title displayed in the control header
   * @default 'Layer Swipe'
   */
  title?: string;

  /**
   * Width of the control panel in pixels
   * @default 280
   */
  panelWidth?: number;

  /**
   * Maximum height of the control panel in pixels.
   * When content exceeds this height, a vertical scrollbar appears.
   * @default 500
   */
  maxHeight?: number;

  /**
   * Custom CSS class name for the control container
   */
  className?: string;

  /**
   * Enable mouse move to update slider position (no click/drag required)
   * @default false
   */
  mousemove?: boolean;

  /**
   * Whether the swipe tool starts active
   * @default true
   */
  active?: boolean;

  /**
   * URL of the basemap style JSON. When provided, all layers from this style
   * will be grouped as a single "Basemap" entry in the layer list instead of
   * being listed individually.
   */
  basemapStyle?: string;

  /**
   * Layer ID patterns to exclude from the layer list.
   * Supports glob-style wildcards (e.g., 'measure-*', 'gl-draw-*').
   * @default []
   */
  excludeLayers?: string[];

  /**
   * When `true` and no explicit `leftLayers`/`rightLayers` are provided, the
   * control preselects the visible (non-excluded) layers once the map and
   * basemap are ready: every visible layer on the left and only the basemap on
   * the right. This keeps the panel checkboxes in sync with what is rendered on
   * launch while giving an immediate overlay-vs-basemap comparison instead of
   * two identical halves. When there is no grouped basemap it falls back to the
   * bottom-most layer on the right.
   * @default false
   */
  selectVisibleByDefault?: boolean;

  /**
   * Whether clicking outside the panel collapses it. When `false` the panel
   * only collapses via its close (×) button or `collapse()`.
   * @default false
   */
  closeOnOutsideClick?: boolean;

  /**
   * When `true`, the panel's left/right layer lists only show layers that are
   * currently visible on the map, plus any layer already selected on either
   * side (so a right-only layer the control hides on the main map still
   * appears). Hidden, unselected layers are omitted, keeping the lists focused
   * on the active working set. The lists update live as layer visibility
   * changes, since visibility toggles fire `styledata`. The grouped basemap
   * entry is always shown.
   * @default false
   */
  visibleLayersOnly?: boolean;
}

/**
 * Internal state of the swipe control
 */
export interface SwipeState {
  /**
   * Whether the control panel is currently collapsed
   */
  collapsed: boolean;

  /**
   * Current slider position as percentage (0-100)
   */
  position: number;

  /**
   * Current orientation
   */
  orientation: SwipeOrientation;

  /**
   * Layer IDs on the left/top side
   */
  leftLayers: string[];

  /**
   * Layer IDs on the right/bottom side
   */
  rightLayers: string[];

  /**
   * Whether the slider is currently being dragged
   */
  isDragging: boolean;

  /**
   * Whether the swipe tool is currently active
   */
  active: boolean;
}

/**
 * Event types emitted by the swipe control
 */
export type SwipeControlEvent =
  | 'slidestart'
  | 'slide'
  | 'slideend'
  | 'layerchange'
  | 'orientationchange'
  | 'collapse'
  | 'expand'
  | 'activate'
  | 'deactivate'
  | 'statechange';

/**
 * Event data for swipe control events
 */
export interface SwipeControlEventData {
  /**
   * The type of event
   */
  type: SwipeControlEvent;

  /**
   * The current state of the control
   */
  state: SwipeState;

  /**
   * The current slider position (0-100)
   */
  position?: number;
}

/**
 * Event handler function type
 */
export type SwipeControlEventHandler = (event: SwipeControlEventData) => void;

/**
 * Props for the React wrapper component
 */
export interface SwipeControlReactProps extends SwipeControlOptions {
  /**
   * MapLibre GL map instance (required)
   */
  map: Map;

  /**
   * Callback fired when the slider position changes
   */
  onSlide?: (position: number) => void;

  /**
   * Callback fired when layers are changed
   */
  onLayerChange?: (leftLayers: string[], rightLayers: string[]) => void;

  /**
   * Callback fired when the state changes
   */
  onStateChange?: (state: SwipeState) => void;

  /**
   * Callback fired when the active state changes
   */
  onActiveChange?: (active: boolean) => void;

  /**
   * Whether the swipe tool is active
   * @default true
   */
  active?: boolean;
}

/**
 * Layer information for the GUI panel
 */
export interface LayerInfo {
  /**
   * The layer ID
   */
  id: string;

  /**
   * The layer type (e.g., 'raster', 'fill', 'line', 'symbol')
   */
  type: string;

  /**
   * The source ID for this layer
   */
  source: string;

  /**
   * Whether the layer is currently visible
   */
  visible: boolean;
}
