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
   *
   * Ignored when {@link basemapLayerIds} is given.
   */
  basemapStyle?: string;

  /**
   * The basemap's layer ids, for a host that already knows them.
   *
   * Same effect as {@link basemapStyle} — those layers are grouped as a single
   * "Basemap" entry — without the fetch. Use it when the style cannot be
   * fetched at all: a `mapbox://` URL has no HTTP form, and a style assembled
   * in memory or behind an authenticated endpoint has no URL to give. Takes
   * precedence over `basemapStyle`, so passing both is not ambiguous.
   */
  basemapLayerIds?: string[];

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

  /**
   * A provider for layers the control cannot discover through
   * `map.getStyle()`. MapLibre omits custom layers (deck.gl overlays and other
   * runtime `type: 'custom'` layers) from the serialized style, so the dual-map
   * clip cannot list, hide, or copy them. A provider bridges that gap: it lists
   * its layers for the panel and applies each side assignment itself. The
   * comparison map's canvas is already clipped to the swipe region, so a
   * provider that renders onto the comparison map gets clipping for free and
   * only decides which side(s) to draw on. Optional and fully backward
   * compatible: without it the control behaves exactly as before.
   */
  layerProvider?: SwipeLayerProvider;

  /**
   * Build the comparison map the control clips to the swipe region.
   *
   * Defaults to `new maplibregl.Map(options)`. Supply a factory to build it
   * with another Style Spec engine: the control reads and writes the comparison
   * map only through the surface `maplibre-gl` and `mapbox-gl` share
   * (`getStyle`, `addSource`, `addLayer`, `setLayoutProperty`, `jumpTo`,
   * `resize`, `isStyleLoaded`, `get`/`setProjection`, `on`, `remove`), so a
   * host rendering with Mapbox GL JS passes
   * `(options) => new mapboxgl.Map(options)` here and the swipe works unchanged.
   *
   * The options handed to the factory are the subset both libraries accept, and
   * the returned map is presented through MapLibre's types — an honest cast for
   * the members above, which is the same trade the control already makes when a
   * host hands it a map through `onAdd`.
   */
  createMap?: CreateSwipeComparisonMap;
}

/**
 * The map options {@link CreateSwipeComparisonMap} is called with: the subset
 * of `MapOptions` that `maplibre-gl` and `mapbox-gl` both accept with the same
 * meaning.
 */
export interface SwipeComparisonMapOptions {
  /** The clipped container the comparison map paints into. */
  container: HTMLElement;
  /** The main map's current style, as `getStyle()` returned it. */
  style: NonNullable<ReturnType<Map['getStyle']>>;
  center: ReturnType<Map['getCenter']>;
  zoom: number;
  bearing: number;
  pitch: number;
  /** Always `false`: the comparison map is driven from the main map. */
  interactive: false;
  /** Always `false`: the main map already carries the attribution. */
  attributionControl: false;
}

/**
 * Factory for {@link SwipeControlOptions.createMap}. Returns the new map
 * through MapLibre's types; see that option for why the cast is honest.
 */
export type CreateSwipeComparisonMap = (options: SwipeComparisonMapOptions) => Map;

/**
 * Which side(s) of the swipe a provider layer should render on, resolved from
 * the panel's left/right selection: `left` (left only), `right` (right only,
 * i.e. the comparison side), `both` (selected on both sides), or `none` (not
 * selected on either).
 */
export type SwipeLayerSide = 'left' | 'right' | 'both' | 'none';

/**
 * A custom/overlay layer contributed by a {@link SwipeLayerProvider}. Mirrors
 * the fields the panel needs from a native {@link LayerInfo}.
 */
export interface SwipeProviderLayer {
  /** Unique layer id, used as the panel row id and for left/right selection. */
  id: string;
  /** Display type chip shown in the panel (e.g. `'raster'`). */
  type: string;
  /** Current visibility, honored by the `visibleLayersOnly` panel filter. */
  visible: boolean;
}

/**
 * Lets a host contribute layers the control cannot see through
 * `map.getStyle()` -- e.g. deck.gl / custom layers, which MapLibre omits from
 * the serialized style. The provider lists its layers for the panel and applies
 * each side assignment itself, because the control's dual-map clipping only
 * understands serializable style layers.
 */
export interface SwipeLayerProvider {
  /**
   * The provider's layers, in bottom-to-top paint order (matching
   * `getStyle().layers`). They are appended after the native style layers, so
   * overlays that draw on top of the map should appear last.
   */
  getLayers(): SwipeProviderLayer[];

  /**
   * Render or toggle one provider layer for the resolved side assignment.
   * Called on every visibility update and whenever the comparison map is
   * (re)created, so the provider can (re)mount whatever it renders onto it.
   *
   * @param layerId - The provider layer id.
   * @param side - The resolved side: `left`, `right`, `both`, or `none`.
   * @param comparisonMap - The current comparison map, or `undefined` when none
   *   exists yet (the provider should then render on the main map only).
   */
  applySide(
    layerId: string,
    side: SwipeLayerSide,
    comparisonMap: Map | undefined
  ): void;

  /**
   * Optional teardown, called when the comparison map is destroyed (the control
   * is removed) so the provider can drop any overlay it mounted on it.
   */
  detachComparison?(): void;
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
