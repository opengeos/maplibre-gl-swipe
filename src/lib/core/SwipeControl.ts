import maplibregl from 'maplibre-gl';
import type { IControl, Map as MapLibreMap, MapOptions } from 'maplibre-gl';
import type {
  SwipeControlOptions,
  SwipeState,
  SwipeControlEvent,
  SwipeControlEventHandler,
  SwipeControlEventData,
  SwipeOrientation,
  LayerInfo,
} from './types';

/**
 * Default options for the SwipeControl
 */
const DEFAULT_OPTIONS: Required<Omit<SwipeControlOptions, 'className' | 'basemapStyle' | 'excludeLayers'>> & {
  className: string;
  basemapStyle: string | undefined;
  excludeLayers: string[];
} = {
  orientation: 'vertical',
  position: 50,
  leftLayers: [],
  rightLayers: [],
  showPanel: true,
  collapsed: true,
  title: 'Layer Swipe',
  panelWidth: 280,
  maxHeight: 500,
  className: '',
  mousemove: false,
  active: true,
  basemapStyle: undefined,
  excludeLayers: [],
};

/**
 * Event handlers map type
 */
type EventHandlersMap = globalThis.Map<
  SwipeControlEvent,
  Set<SwipeControlEventHandler>
>;

/**
 * A MapLibre GL control for swiping between layers to compare them side by side.
 * Uses a dual-map approach with CSS clip-path for true split-screen comparison.
 *
 * @example
 * ```typescript
 * const swipe = new SwipeControl({
 *   orientation: 'vertical',
 *   position: 50,
 *   leftLayers: ['satellite-layer'],
 *   rightLayers: ['streets-layer'],
 * });
 * map.addControl(swipe, 'top-right');
 * ```
 */
export class SwipeControl implements IControl {
  private _map?: MapLibreMap;
  private _comparisonMap?: MapLibreMap;
  private _mapContainer?: HTMLElement;
  private _container?: HTMLElement;
  private _panel?: HTMLElement;
  private _slider?: HTMLElement;
  private _sliderHandle?: HTMLElement;
  private _clipContainer?: HTMLElement;
  private _comparisonContainer?: HTMLElement;
  private _options: Required<Omit<SwipeControlOptions, 'className' | 'basemapStyle' | 'excludeLayers'>> & {
    className: string;
    basemapStyle: string | undefined;
    excludeLayers: string[];
  };
  private _state: SwipeState;
  private _basemapLayerIds: Set<string> = new Set();
  private _eventHandlers: EventHandlersMap = new globalThis.Map();
  private _bounds?: DOMRect;
  private _rafHandle: number | null = null;
  private _rafPendingPosition: number | null = null;

  // Event handler references for cleanup
  private _resizeHandler: (() => void) | null = null;
  private _mapResizeHandler: (() => void) | null = null;
  private _moveHandler: ((e: MouseEvent | TouchEvent) => void) | null = null;
  private _endHandler: (() => void) | null = null;
  private _clickOutsideHandler: ((e: MouseEvent) => void) | null = null;
  private _mouseMoveHandler: ((e: MouseEvent) => void) | null = null;
  private _syncMoveHandler: (() => void) | null = null;
  private _syncMoveEndHandler: (() => void) | null = null;
  private _styleDataHandler: (() => void) | null = null;
  private _isSyncing: boolean = false;

  /**
   * Creates a new SwipeControl instance.
   *
   * @param options - Configuration options for the control
   */
  constructor(options?: Partial<SwipeControlOptions>) {
    this._options = { ...DEFAULT_OPTIONS, ...options } as Required<
      Omit<SwipeControlOptions, 'className' | 'basemapStyle' | 'excludeLayers'>
    > & { className: string; basemapStyle: string | undefined; excludeLayers: string[] };
    this._state = {
      collapsed: this._options.collapsed,
      position: this._options.position,
      orientation: this._options.orientation,
      leftLayers: [...this._options.leftLayers],
      rightLayers: [...this._options.rightLayers],
      isDragging: false,
      active: this._options.active,
    };
  }

  /**
   * Called when the control is added to the map.
   * Implements the IControl interface.
   *
   * @param map - The MapLibre GL map instance
   * @returns The control's container element
   */
  onAdd(map: MapLibreMap): HTMLElement {
    this._map = map;
    this._mapContainer = map.getContainer();

    // Get initial bounds first (needed for slider positioning)
    this._updateBounds();

    // Create the comparison map overlay
    this._createComparisonMap();

    // Create UI elements
    this._container = this._createContainer();
    this._slider = this._createSlider();

    // Load basemap style if provided, then create panel
    if (this._options.basemapStyle) {
      this._loadBasemapStyle(this._options.basemapStyle).then(() => {
        if (this._options.showPanel && this._mapContainer) {
          this._panel = this._createPanel();
          this._mapContainer.appendChild(this._panel);
          if (!this._state.collapsed) {
            this._panel.classList.add('expanded');
            requestAnimationFrame(() => {
              this._updatePanelPosition();
            });
          }
        }
      });
    } else if (this._options.showPanel) {
      this._panel = this._createPanel();
      this._mapContainer.appendChild(this._panel);
    }

    // Append slider to map container
    this._mapContainer.appendChild(this._slider);

    // Setup event listeners
    this._setupEventListeners();

    // Apply initial clip and layer visibility
    this._updateClip();
    this._updateLayerVisibility();

    // Apply initial active state
    if (!this._state.active) {
      if (this._slider) this._slider.style.display = 'none';
      if (this._clipContainer) this._clipContainer.style.display = 'none';
    }

    // Initial panel state (only if basemapStyle not provided, otherwise handled above)
    if (!this._options.basemapStyle && this._panel && !this._state.collapsed) {
      this._panel.classList.add('expanded');
      requestAnimationFrame(() => {
        this._updatePanelPosition();
      });
    }

    return this._container;
  }

  /**
   * Called when the control is removed from the map.
   * Implements the IControl interface.
   */
  onRemove(): void {
    // Remove event listeners
    this._removeEventListeners();
    if (this._rafHandle !== null) {
      cancelAnimationFrame(this._rafHandle);
      this._rafHandle = null;
    }
    this._rafPendingPosition = null;

    // Remove comparison map
    if (this._comparisonMap) {
      this._comparisonMap.remove();
      this._comparisonMap = undefined;
    }

    // Remove comparison container
    this._comparisonContainer?.parentNode?.removeChild(this._comparisonContainer);
    this._clipContainer?.parentNode?.removeChild(this._clipContainer);

    // Remove DOM elements
    this._slider?.parentNode?.removeChild(this._slider);
    this._panel?.parentNode?.removeChild(this._panel);
    this._container?.parentNode?.removeChild(this._container);

    this._map = undefined;
    this._mapContainer = undefined;
    this._container = undefined;
    this._slider = undefined;
    this._panel = undefined;
    this._clipContainer = undefined;
    this._comparisonContainer = undefined;
    this._eventHandlers.clear();
  }

  /**
   * Gets the current slider position as percentage (0-100).
   *
   * @returns The current position
   */
  getPosition(): number {
    return this._state.position;
  }

  /**
   * Sets the slider position.
   *
   * @param position - The position as percentage (0-100)
   */
  setPosition(position: number): void {
    const clampedPosition = Math.max(0, Math.min(100, position));
    if (clampedPosition !== this._state.position) {
      this._state.position = clampedPosition;
      this._updateSliderPosition();
      this._updateClip();
      this._emit('slide');
      this._emit('statechange');
    }
  }

  /**
   * Gets the current state of the control.
   *
   * @returns The current state
   */
  getState(): SwipeState {
    return { ...this._state };
  }

  /**
   * Sets the layers for the left/top side.
   *
   * @param layerIds - Array of layer IDs
   */
  setLeftLayers(layerIds: string[]): void {
    this._state.leftLayers = [...layerIds];
    this._updateLayerVisibility();
    this._updateLayerCheckboxes();
    this._emit('layerchange');
    this._emit('statechange');
  }

  /**
   * Sets the layers for the right/bottom side.
   *
   * @param layerIds - Array of layer IDs
   */
  setRightLayers(layerIds: string[]): void {
    this._state.rightLayers = [...layerIds];
    this._updateLayerVisibility();
    this._updateLayerCheckboxes();
    this._emit('layerchange');
    this._emit('statechange');
  }

  /**
   * Sets the orientation of the swipe control.
   *
   * @param orientation - The orientation ('vertical' or 'horizontal')
   */
  setOrientation(orientation: SwipeOrientation): void {
    if (orientation !== this._state.orientation) {
      this._state.orientation = orientation;
      this._updateSliderOrientation();
      this._updateClip();
      this._updateOrientationSelect();
      this._emit('orientationchange');
      this._emit('statechange');
    }
  }

  /**
   * Loads the basemap style JSON and extracts layer IDs.
   *
   * @param styleUrl - The URL of the basemap style JSON
   */
  private async _loadBasemapStyle(styleUrl: string): Promise<void> {
    try {
      const response = await fetch(styleUrl);
      if (!response.ok) {
        console.warn(`Failed to load basemap style from ${styleUrl}`);
        return;
      }
      const style = await response.json();
      if (style.layers && Array.isArray(style.layers)) {
        this._basemapLayerIds = new Set(
          style.layers.map((layer: { id: string }) => layer.id)
        );
      }
    } catch (error) {
      console.warn(`Error loading basemap style: ${error}`);
    }
  }

  /**
   * Gets information about all layers in the map.
   * When basemapStyle is provided, basemap layers are grouped as a single "Basemap" entry.
   *
   * @returns Array of layer information
   */
  /**
   * Checks if a layer ID matches any of the exclude patterns.
   * Supports glob-style wildcards (* matches any characters).
   *
   * @param layerId - The layer ID to check
   * @returns Whether the layer should be excluded
   */
  private _isLayerExcluded(layerId: string): boolean {
    for (const pattern of this._options.excludeLayers) {
      // Convert glob pattern to regex
      const regexPattern = pattern
        .replace(/[.+^${}()|[\]\\]/g, '\\$&') // Escape special regex chars except *
        .replace(/\*/g, '.*'); // Convert * to .*
      const regex = new RegExp(`^${regexPattern}$`);
      if (regex.test(layerId)) {
        return true;
      }
    }
    return false;
  }

  getLayers(): LayerInfo[] {
    if (!this._map) return [];

    const style = this._map.getStyle();
    if (!style || !style.layers) return [];

    const layers: LayerInfo[] = [];
    let hasBasemap = false;

    for (const layer of style.layers) {
      // Check if this layer should be excluded
      if (this._isLayerExcluded(layer.id)) {
        continue;
      }

      // Check if this layer belongs to the basemap
      if (this._basemapLayerIds.has(layer.id)) {
        // Add a single "Basemap" entry for all basemap layers
        if (!hasBasemap) {
          hasBasemap = true;
          layers.push({
            id: '__basemap__',
            type: 'basemap',
            source: '',
            visible: true,
          });
        }
        // Skip adding individual basemap layers
        continue;
      }

      layers.push({
        id: layer.id,
        type: layer.type,
        source: (layer as { source?: string }).source || '',
        visible: this._map!.getLayoutProperty(layer.id, 'visibility') !== 'none',
      });
    }

    return layers;
  }

  /**
   * Gets the actual layer IDs for a given layer ID.
   * If the layer ID is '__basemap__', returns all basemap layer IDs.
   *
   * @param layerId - The layer ID
   * @returns Array of actual layer IDs
   */
  private _getActualLayerIds(layerId: string): string[] {
    if (layerId === '__basemap__') {
      return Array.from(this._basemapLayerIds);
    }
    return [layerId];
  }

  /**
   * Registers an event handler.
   *
   * @param event - The event type to listen for
   * @param handler - The callback function
   */
  on(event: SwipeControlEvent, handler: SwipeControlEventHandler): void {
    if (!this._eventHandlers.has(event)) {
      this._eventHandlers.set(event, new Set());
    }
    this._eventHandlers.get(event)!.add(handler);
  }

  /**
   * Removes an event handler.
   *
   * @param event - The event type
   * @param handler - The callback function to remove
   */
  off(event: SwipeControlEvent, handler: SwipeControlEventHandler): void {
    this._eventHandlers.get(event)?.delete(handler);
  }

  /**
   * Toggles the collapsed state of the control panel.
   */
  toggle(): void {
    this._state.collapsed = !this._state.collapsed;

    if (this._panel) {
      if (this._state.collapsed) {
        this._panel.classList.remove('expanded');
      } else {
        this._panel.classList.add('expanded');
        this._updatePanelPosition();
      }
    }

    // Emit events regardless of panel existence
    if (this._state.collapsed) {
      this._emit('collapse');
    } else {
      this._emit('expand');
    }

    this._emit('statechange');
  }

  /**
   * Expands the control panel.
   */
  expand(): void {
    if (this._state.collapsed) {
      this.toggle();
    }
  }

  /**
   * Collapses the control panel.
   */
  collapse(): void {
    if (!this._state.collapsed) {
      this.toggle();
    }
  }

  /**
   * Sets whether the swipe tool is active.
   * When inactive, the slider and comparison map are hidden and drag is disabled.
   *
   * @param active - Whether the swipe tool should be active
   */
  setActive(active: boolean): void {
    if (active === this._state.active) return;

    this._state.active = active;

    if (active) {
      // Show slider and clip container
      if (this._slider) this._slider.style.display = '';
      if (this._clipContainer) this._clipContainer.style.display = '';
      this._updateClip();
      this._emit('activate');
    } else {
      // Hide slider and clip container, remove clip-path
      if (this._slider) this._slider.style.display = 'none';
      if (this._clipContainer) this._clipContainer.style.display = 'none';
      this._emit('deactivate');
    }

    this._updateActiveToggle();
    this._emit('statechange');
  }

  /**
   * Gets whether the swipe tool is currently active.
   *
   * @returns Whether the swipe tool is active
   */
  isActive(): boolean {
    return this._state.active;
  }

  /**
   * Gets the map instance.
   *
   * @returns The MapLibre GL map instance or undefined if not added to a map
   */
  getMap(): MapLibreMap | undefined {
    return this._map;
  }

  /**
   * Gets the comparison map instance.
   *
   * @returns The comparison map instance or undefined
   */
  getComparisonMap(): MapLibreMap | undefined {
    return this._comparisonMap;
  }

  /**
   * Gets the control container element.
   *
   * @returns The container element or undefined if not added to a map
   */
  getContainer(): HTMLElement | undefined {
    return this._container;
  }

  /**
   * Emits an event to all registered handlers.
   *
   * @param event - The event type to emit
   */
  private _emit(event: SwipeControlEvent): void {
    const handlers = this._eventHandlers.get(event);
    if (handlers) {
      const eventData: SwipeControlEventData = {
        type: event,
        state: this.getState(),
        position: this._state.position,
      };
      handlers.forEach((handler) => handler(eventData));
    }
  }

  /**
   * Creates the comparison map that overlays the original map.
   * The comparison map shows the "right" layers and is clipped.
   */
  private _createComparisonMap(): void {
    if (!this._map || !this._mapContainer) return;

    // Create clip container that will hold the comparison map
    this._clipContainer = document.createElement('div');
    this._clipContainer.className = 'swipe-clip-container';
    this._clipContainer.style.cssText = `
      position: absolute;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      pointer-events: none;
      z-index: 1;
      overflow: hidden;
    `;

    // Create container for comparison map
    this._comparisonContainer = document.createElement('div');
    this._comparisonContainer.className = 'swipe-comparison-map';
    this._comparisonContainer.style.cssText = `
      position: absolute;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      pointer-events: none;
    `;

    this._clipContainer.appendChild(this._comparisonContainer);
    this._mapContainer.appendChild(this._clipContainer);

    // Get the current map's configuration
    const currentStyle = this._map.getStyle();
    const center = this._map.getCenter();
    const zoom = this._map.getZoom();
    const bearing = this._map.getBearing();
    const pitch = this._map.getPitch();

    // Only create comparison map if there's a valid style
    if (!currentStyle) {
      console.warn('SwipeControl: No map style found, comparison map not created');
      return;
    }

    // Create comparison map with the same style
    const mapOptions: MapOptions = {
      container: this._comparisonContainer,
      style: currentStyle,
      center: center,
      zoom: zoom,
      bearing: bearing,
      pitch: pitch,
      interactive: false, // No interaction - synced with main map
      attributionControl: false,
    };

    this._comparisonMap = new maplibregl.Map(mapOptions);

    // Wait for comparison map to load before syncing
    this._comparisonMap.on('load', () => {
      this._updateLayerVisibility();
      this._updateClip();
    });
  }

  /**
   * Updates layer visibility on both maps.
   * Main map shows left layers, comparison map shows right layers.
   */
  private _updateLayerVisibility(): void {
    if (!this._map) return;

    // Expand __basemap__ to actual layer IDs
    const expandLayers = (layerIds: string[]): Set<string> => {
      const expanded = new Set<string>();
      for (const id of layerIds) {
        for (const actualId of this._getActualLayerIds(id)) {
          expanded.add(actualId);
        }
      }
      return expanded;
    };

    const leftSet = expandLayers(this._state.leftLayers);
    const rightSet = expandLayers(this._state.rightLayers);

    const style = this._map.getStyle();
    if (!style || !style.layers) return;

    // Update main map: show left layers, hide right-only layers
    style.layers.forEach((layer) => {
      const isLeft = leftSet.has(layer.id);
      const isRight = rightSet.has(layer.id);

      try {
        if (isLeft) {
          // Show on main map
          this._map!.setLayoutProperty(layer.id, 'visibility', 'visible');
        } else if (isRight && !isLeft) {
          // Hide on main map (shown on comparison map instead)
          this._map!.setLayoutProperty(layer.id, 'visibility', 'none');
        }
        // Layers not in either list keep their original visibility
      } catch {
        // Layer may not exist
      }
    });

    // Update comparison map: show right layers, hide left-only layers
    if (this._comparisonMap && this._comparisonMap.isStyleLoaded()) {
      try {
        const compStyle = this._comparisonMap.getStyle();
        if (compStyle && compStyle.layers) {
          compStyle.layers.forEach((layer) => {
            const isLeft = leftSet.has(layer.id);
            const isRight = rightSet.has(layer.id);

            try {
              if (isRight) {
                // Show on comparison map
                this._comparisonMap!.setLayoutProperty(
                  layer.id,
                  'visibility',
                  'visible'
                );
              } else if (isLeft && !isRight) {
                // Hide on comparison map (shown on main map instead)
                this._comparisonMap!.setLayoutProperty(
                  layer.id,
                  'visibility',
                  'none'
                );
              }
            } catch {
              // Layer may not exist on comparison map
            }
          });
        }
      } catch {
        // Style may not be loaded yet
      }
    }
  }

  /**
   * Updates the clip-path on the comparison map container.
   */
  private _updateClip(): void {
    if (!this._clipContainer || !this._bounds) return;

    const snapped = this._getSnappedPosition();
    if (snapped === null) return;
    const width = this._bounds.width;
    const height = this._bounds.height;

    // Clear any legacy clip-path styles for stability.
    this._clipContainer.style.clipPath = '';
    (this._clipContainer.style as CSSStyleDeclaration & {
      webkitClipPath?: string;
    }).webkitClipPath = '';

    if (this._state.orientation === 'vertical') {
      const left = Math.max(0, Math.min(width, snapped));
      const visibleWidth = Math.max(0, width - left);
      this._clipContainer.style.left = `${left}px`;
      this._clipContainer.style.top = '0px';
      this._clipContainer.style.width = `${visibleWidth}px`;
      this._clipContainer.style.height = `${height}px`;
      if (this._comparisonContainer) {
        this._comparisonContainer.style.left = `${-left}px`;
        this._comparisonContainer.style.top = '0px';
        this._comparisonContainer.style.width = `${width}px`;
        this._comparisonContainer.style.height = `${height}px`;
      }
    } else {
      const top = Math.max(0, Math.min(height, snapped));
      const visibleHeight = Math.max(0, height - top);
      this._clipContainer.style.left = '0px';
      this._clipContainer.style.top = `${top}px`;
      this._clipContainer.style.width = `${width}px`;
      this._clipContainer.style.height = `${visibleHeight}px`;
      if (this._comparisonContainer) {
        this._comparisonContainer.style.left = '0px';
        this._comparisonContainer.style.top = `${-top}px`;
        this._comparisonContainer.style.width = `${width}px`;
        this._comparisonContainer.style.height = `${height}px`;
      }
    }
  }

  private _getSnappedPosition(): number | null {
    if (!this._bounds) return null;
    const ratio =
      typeof window !== 'undefined' && window.devicePixelRatio
        ? window.devicePixelRatio
        : 1;
    const axis =
      this._state.orientation === 'vertical'
        ? this._bounds.width
        : this._bounds.height;
    const positionPx = (this._state.position / 100) * axis;
    return Math.round(positionPx * ratio) / ratio;
  }

  private _queuePositionUpdate(position: number): void {
    this._rafPendingPosition = position;
    if (this._rafHandle !== null) return;
    this._rafHandle = window.requestAnimationFrame(() => {
      this._rafHandle = null;
      if (this._rafPendingPosition === null) return;
      const pending = this._rafPendingPosition;
      this._rafPendingPosition = null;
      this.setPosition(pending);
    });
  }

  private _flushPositionUpdate(): void {
    if (this._rafHandle !== null) {
      cancelAnimationFrame(this._rafHandle);
      this._rafHandle = null;
    }
    if (this._rafPendingPosition !== null) {
      const pending = this._rafPendingPosition;
      this._rafPendingPosition = null;
      this.setPosition(pending);
    }
  }

  /**
   * Creates the main container element for the control.
   *
   * @returns The container element
   */
  private _createContainer(): HTMLElement {
    const container = document.createElement('div');
    container.className = `maplibregl-ctrl maplibregl-ctrl-group swipe-control${
      this._options.className ? ` ${this._options.className}` : ''
    }`;

    const toggleBtn = document.createElement('button');
    toggleBtn.className = 'swipe-control-toggle';
    toggleBtn.type = 'button';
    toggleBtn.setAttribute('aria-label', this._options.title);
    toggleBtn.innerHTML = `
      <span class="swipe-control-icon">
        <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2">
          <rect x="3" y="3" width="7" height="18" rx="1"/>
          <rect x="14" y="3" width="7" height="18" rx="1"/>
          <line x1="12" y1="7" x2="12" y2="17"/>
          <polyline points="9 10 12 7 15 10"/>
          <polyline points="9 14 12 17 15 14"/>
        </svg>
      </span>
    `;
    toggleBtn.addEventListener('click', () => this.toggle());

    container.appendChild(toggleBtn);
    return container;
  }

  /**
   * Creates the slider element.
   *
   * @returns The slider element
   */
  private _createSlider(): HTMLElement {
    const slider = document.createElement('div');
    slider.className = `swipe-slider swipe-slider-${this._state.orientation}`;

    const handle = document.createElement('div');
    handle.className = 'swipe-slider-handle';

    // Add arrow icons to handle
    handle.innerHTML = `
      <svg class="swipe-handle-icon" viewBox="0 0 24 24" width="20" height="20" fill="currentColor">
        <path d="M8 5l-5 7 5 7v-4h8v4l5-7-5-7v4H8V5z"/>
      </svg>
    `;

    slider.appendChild(handle);
    this._sliderHandle = handle;

    // Assign to instance variable so _updateSliderPosition can access it
    this._slider = slider;

    // Set initial position
    this._updateSliderPosition();

    return slider;
  }

  /**
   * Creates the panel element with header and content areas.
   *
   * @returns The panel element
   */
  private _createPanel(): HTMLElement {
    const panel = document.createElement('div');
    panel.className = 'swipe-control-panel';
    panel.style.width = `${this._options.panelWidth}px`;
    panel.style.maxHeight = `${this._options.maxHeight}px`;

    // Header
    const header = document.createElement('div');
    header.className = 'swipe-control-header';

    const title = document.createElement('span');
    title.className = 'swipe-control-title';
    title.textContent = this._options.title;

    const closeBtn = document.createElement('button');
    closeBtn.className = 'swipe-control-close';
    closeBtn.type = 'button';
    closeBtn.setAttribute('aria-label', 'Close panel');
    closeBtn.innerHTML = '&times;';
    closeBtn.addEventListener('click', () => this.collapse());

    header.appendChild(title);
    header.appendChild(closeBtn);

    // Content
    const content = document.createElement('div');
    content.className = 'swipe-control-content';

    // Active toggle switch
    const toggleGroup = this._createActiveToggle();
    content.appendChild(toggleGroup);

    // Divider after toggle
    const toggleDivider = document.createElement('div');
    toggleDivider.className = 'swipe-control-divider';
    content.appendChild(toggleDivider);

    // Orientation selector
    const orientationGroup = this._createOrientationSelector();
    content.appendChild(orientationGroup);

    // Divider
    const divider = document.createElement('div');
    divider.className = 'swipe-control-divider';
    content.appendChild(divider);

    // Left layers selector
    const leftGroup = this._createLayerSelector('left', 'Left Layers');
    content.appendChild(leftGroup);

    // Right layers selector
    const rightGroup = this._createLayerSelector('right', 'Right Layers');
    content.appendChild(rightGroup);

    panel.appendChild(header);
    panel.appendChild(content);

    return panel;
  }

  /**
   * Creates the orientation selector.
   *
   * @returns The orientation selector element
   */
  private _createOrientationSelector(): HTMLElement {
    const group = document.createElement('div');
    group.className = 'swipe-control-group';

    const label = document.createElement('label');
    label.className = 'swipe-control-label';
    label.textContent = 'Orientation';

    const select = document.createElement('select');
    select.className = 'swipe-control-select';
    select.dataset.orientationSelect = 'true';
    select.innerHTML = `
      <option value="vertical" ${this._state.orientation === 'vertical' ? 'selected' : ''}>Vertical (Left/Right)</option>
      <option value="horizontal" ${this._state.orientation === 'horizontal' ? 'selected' : ''}>Horizontal (Top/Bottom)</option>
    `;
    select.addEventListener('change', (e) => {
      this.setOrientation(
        (e.target as HTMLSelectElement).value as SwipeOrientation
      );
    });

    group.appendChild(label);
    group.appendChild(select);
    return group;
  }

  /**
   * Creates a layer selector for left or right side.
   *
   * @param side - 'left' or 'right'
   * @param labelText - The label text
   * @returns The layer selector element
   */
  private _createLayerSelector(
    side: 'left' | 'right',
    labelText: string
  ): HTMLElement {
    const group = document.createElement('div');
    group.className = 'swipe-control-group';
    group.dataset.side = side;

    const label = document.createElement('label');
    label.className = 'swipe-control-label';
    label.textContent = labelText;

    const layerList = document.createElement('div');
    layerList.className = 'swipe-layer-list';
    layerList.dataset.layerList = side;

    // Populate layer checkboxes
    const layers = this.getLayers();
    const selectedLayers =
      side === 'left' ? this._state.leftLayers : this._state.rightLayers;

    layers.forEach((layer) => {
      const item = document.createElement('div');
      item.className = 'swipe-layer-item';

      const checkbox = document.createElement('input');
      checkbox.type = 'checkbox';
      checkbox.id = `swipe-${side}-${layer.id}`;
      checkbox.dataset.layerId = layer.id;
      checkbox.dataset.side = side;
      checkbox.checked = selectedLayers.includes(layer.id);
      checkbox.addEventListener('change', () => {
        this._handleLayerToggle(side, layer.id, checkbox.checked);
      });

      const itemLabel = document.createElement('label');
      itemLabel.htmlFor = checkbox.id;
      // Display "Basemap" for the grouped basemap layer
      itemLabel.textContent = layer.id === '__basemap__' ? 'Basemap' : layer.id;
      itemLabel.title = layer.id === '__basemap__'
        ? 'All basemap layers grouped together'
        : `Type: ${layer.type}, Source: ${layer.source}`;

      item.appendChild(checkbox);
      item.appendChild(itemLabel);
      layerList.appendChild(item);
    });

    group.appendChild(label);
    group.appendChild(layerList);
    return group;
  }

  /**
   * Handles layer toggle from the panel checkboxes.
   *
   * @param side - 'left' or 'right'
   * @param layerId - The layer ID
   * @param checked - Whether the checkbox is checked
   */
  private _handleLayerToggle(
    side: 'left' | 'right',
    layerId: string,
    checked: boolean
  ): void {
    const layers =
      side === 'left' ? this._state.leftLayers : this._state.rightLayers;

    if (checked && !layers.includes(layerId)) {
      layers.push(layerId);
    } else if (!checked) {
      const index = layers.indexOf(layerId);
      if (index > -1) layers.splice(index, 1);
    }

    this._updateLayerVisibility();
    this._emit('layerchange');
    this._emit('statechange');
  }

  /**
   * Updates layer checkboxes to reflect current state.
   */
  private _updateLayerCheckboxes(): void {
    if (!this._panel) return;

    const checkboxes = this._panel.querySelectorAll<HTMLInputElement>(
      'input[type="checkbox"][data-layer-id]'
    );

    checkboxes.forEach((checkbox) => {
      const layerId = checkbox.dataset.layerId;
      const side = checkbox.dataset.side as 'left' | 'right';
      if (!layerId) return;

      const layers =
        side === 'left' ? this._state.leftLayers : this._state.rightLayers;
      checkbox.checked = layers.includes(layerId);
    });
  }

  /**
   * Refreshes the layer list in the panel when map layers change.
   * Called when styledata events fire to detect new/removed layers.
   */
  private _refreshLayerList(): void {
    if (!this._panel) return;

    const currentLayers = this.getLayers();
    const currentLayerIds = new Set(currentLayers.map((l) => l.id));

    // Update both left and right layer lists
    (['left', 'right'] as const).forEach((side) => {
      const layerList = this._panel!.querySelector<HTMLElement>(
        `[data-layer-list="${side}"]`
      );
      if (!layerList) return;

      const selectedLayers =
        side === 'left' ? this._state.leftLayers : this._state.rightLayers;

      // Get existing layer IDs in the UI
      const existingCheckboxes = layerList.querySelectorAll<HTMLInputElement>(
        'input[type="checkbox"][data-layer-id]'
      );
      const existingLayerIds = new Set<string>();
      existingCheckboxes.forEach((cb) => {
        if (cb.dataset.layerId) {
          existingLayerIds.add(cb.dataset.layerId);
        }
      });

      // Remove checkboxes for layers that no longer exist
      existingCheckboxes.forEach((cb) => {
        const layerId = cb.dataset.layerId;
        if (layerId && !currentLayerIds.has(layerId)) {
          const item = cb.closest('.swipe-layer-item');
          if (item) item.remove();
          // Also remove from selected layers state
          const idx = selectedLayers.indexOf(layerId);
          if (idx > -1) selectedLayers.splice(idx, 1);
        }
      });

      // Add checkboxes for new layers
      currentLayers.forEach((layer) => {
        if (!existingLayerIds.has(layer.id)) {
          const item = document.createElement('div');
          item.className = 'swipe-layer-item';

          const checkbox = document.createElement('input');
          checkbox.type = 'checkbox';
          checkbox.id = `swipe-${side}-${layer.id}`;
          checkbox.dataset.layerId = layer.id;
          checkbox.dataset.side = side;
          checkbox.checked = selectedLayers.includes(layer.id);
          checkbox.addEventListener('change', () => {
            this._handleLayerToggle(side, layer.id, checkbox.checked);
          });

          const itemLabel = document.createElement('label');
          itemLabel.htmlFor = checkbox.id;
          itemLabel.textContent = layer.id;
          itemLabel.title = `Type: ${layer.type}, Source: ${layer.source}`;

          item.appendChild(checkbox);
          item.appendChild(itemLabel);
          layerList.appendChild(item);
        }
      });
    });
  }

  /**
   * Updates the orientation select to reflect current state.
   */
  private _updateOrientationSelect(): void {
    if (!this._panel) return;

    const select = this._panel.querySelector<HTMLSelectElement>(
      'select[data-orientation-select]'
    );
    if (select) {
      select.value = this._state.orientation;
    }
  }

  /**
   * Creates the active toggle switch element.
   *
   * @returns The toggle switch container element
   */
  private _createActiveToggle(): HTMLElement {
    const group = document.createElement('div');
    group.className = 'swipe-control-group swipe-toggle-group';

    const row = document.createElement('div');
    row.className = 'swipe-toggle-switch';
    row.dataset.activeToggle = 'true';

    const label = document.createElement('label');
    label.className = 'swipe-toggle-label';
    label.textContent = 'Swipe Enabled';
    label.htmlFor = 'swipe-active-toggle';

    const switchContainer = document.createElement('label');
    switchContainer.className = 'swipe-toggle-slider';

    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.id = 'swipe-active-toggle';
    checkbox.checked = this._state.active;
    checkbox.addEventListener('change', () => {
      this.setActive(checkbox.checked);
    });

    const slider = document.createElement('span');
    slider.className = 'swipe-toggle-track';

    switchContainer.appendChild(checkbox);
    switchContainer.appendChild(slider);

    row.appendChild(label);
    row.appendChild(switchContainer);
    group.appendChild(row);

    return group;
  }

  /**
   * Syncs the active toggle checkbox in the panel with the current state.
   */
  private _updateActiveToggle(): void {
    if (!this._panel) return;

    const checkbox = this._panel.querySelector<HTMLInputElement>(
      '#swipe-active-toggle'
    );
    if (checkbox) {
      checkbox.checked = this._state.active;
    }
  }

  /**
   * Setup event listeners for slider and panel.
   */
  private _setupEventListeners(): void {
    // Slider drag events
    if (this._sliderHandle) {
      this._sliderHandle.addEventListener(
        'mousedown',
        this._onDragStart.bind(this)
      );
      this._sliderHandle.addEventListener(
        'touchstart',
        this._onDragStart.bind(this)
      );
    }

    // Click outside to close
    this._clickOutsideHandler = (e: MouseEvent) => {
      const target = e.target as Node;
      if (
        this._container &&
        this._panel &&
        !this._container.contains(target) &&
        !this._panel.contains(target)
      ) {
        this.collapse();
      }
    };
    document.addEventListener('click', this._clickOutsideHandler);

    // Window resize
    this._resizeHandler = () => {
      this._updateBounds();
      this._updateSliderPosition();
      this._updateClip();
      if (!this._state.collapsed && this._panel) {
        this._updatePanelPosition();
      }
    };
    window.addEventListener('resize', this._resizeHandler);

    // Map resize
    this._mapResizeHandler = () => {
      this._updateBounds();
      this._updateSliderPosition();
      this._updateClip();
      if (this._comparisonMap) {
        this._comparisonMap.resize();
      }
      if (!this._state.collapsed && this._panel) {
        this._updatePanelPosition();
      }
    };
    this._map?.on('resize', this._mapResizeHandler);

    // Sync comparison map with main map
    this._setupMapSync();

    // Listen for layer changes to refresh the layer list
    this._styleDataHandler = () => {
      this._refreshLayerList();
    };
    this._map?.on('styledata', this._styleDataHandler);

    // Mousemove option
    if (this._options.mousemove && this._mapContainer) {
      this._mouseMoveHandler = this._onMouseMove.bind(this);
      this._mapContainer.addEventListener('mousemove', this._mouseMoveHandler);
    }
  }

  /**
   * Sets up synchronization between main map and comparison map.
   */
  private _setupMapSync(): void {
    if (!this._map || !this._comparisonMap) return;

    this._syncMoveHandler = () => {
      if (this._isSyncing || !this._comparisonMap) return;
      this._isSyncing = true;

      this._comparisonMap.jumpTo({
        center: this._map!.getCenter(),
        zoom: this._map!.getZoom(),
        bearing: this._map!.getBearing(),
        pitch: this._map!.getPitch(),
      });

      this._isSyncing = false;
    };

    this._syncMoveEndHandler = () => {
      if (!this._comparisonMap) return;
      this._comparisonMap.jumpTo({
        center: this._map!.getCenter(),
        zoom: this._map!.getZoom(),
        bearing: this._map!.getBearing(),
        pitch: this._map!.getPitch(),
      });
    };

    // Sync on move events
    this._map.on('move', this._syncMoveHandler);
    this._map.on('moveend', this._syncMoveEndHandler);
  }

  /**
   * Remove all event listeners.
   */
  private _removeEventListeners(): void {
    if (this._clickOutsideHandler) {
      document.removeEventListener('click', this._clickOutsideHandler);
      this._clickOutsideHandler = null;
    }
    if (this._resizeHandler) {
      window.removeEventListener('resize', this._resizeHandler);
      this._resizeHandler = null;
    }
    if (this._mapResizeHandler && this._map) {
      this._map.off('resize', this._mapResizeHandler);
      this._mapResizeHandler = null;
    }
    if (this._syncMoveHandler && this._map) {
      this._map.off('move', this._syncMoveHandler);
      this._syncMoveHandler = null;
    }
    if (this._syncMoveEndHandler && this._map) {
      this._map.off('moveend', this._syncMoveEndHandler);
      this._syncMoveEndHandler = null;
    }
    if (this._styleDataHandler && this._map) {
      this._map.off('styledata', this._styleDataHandler);
      this._styleDataHandler = null;
    }
    if (this._moveHandler) {
      document.removeEventListener('mousemove', this._moveHandler);
      document.removeEventListener('touchmove', this._moveHandler);
      this._moveHandler = null;
    }
    if (this._endHandler) {
      document.removeEventListener('mouseup', this._endHandler);
      document.removeEventListener('touchend', this._endHandler);
      this._endHandler = null;
    }
    if (this._mouseMoveHandler && this._mapContainer) {
      this._mapContainer.removeEventListener(
        'mousemove',
        this._mouseMoveHandler
      );
      this._mouseMoveHandler = null;
    }
  }

  /**
   * Handles the start of a drag operation.
   *
   * @param e - The mouse or touch event
   */
  private _onDragStart(e: MouseEvent | TouchEvent): void {
    if (!this._state.active) return;
    e.preventDefault();
    this._state.isDragging = true;
    this._slider?.classList.add('dragging');
    this._emit('slidestart');

    this._moveHandler = this._onDragMove.bind(this);
    this._endHandler = this._onDragEnd.bind(this);

    document.addEventListener('mousemove', this._moveHandler);
    document.addEventListener('touchmove', this._moveHandler);
    document.addEventListener('mouseup', this._endHandler);
    document.addEventListener('touchend', this._endHandler);
  }

  /**
   * Handles drag movement.
   *
   * @param e - The mouse or touch event
   */
  private _onDragMove(e: MouseEvent | TouchEvent): void {
    if (!this._state.isDragging || !this._bounds) return;

    const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
    const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;

    let position: number;
    if (this._state.orientation === 'vertical') {
      position = ((clientX - this._bounds.left) / this._bounds.width) * 100;
    } else {
      position = ((clientY - this._bounds.top) / this._bounds.height) * 100;
    }

    this._queuePositionUpdate(position);
  }

  /**
   * Handles the end of a drag operation.
   */
  private _onDragEnd(): void {
    this._flushPositionUpdate();
    this._state.isDragging = false;
    this._slider?.classList.remove('dragging');
    this._emit('slideend');

    if (this._moveHandler) {
      document.removeEventListener('mousemove', this._moveHandler);
      document.removeEventListener('touchmove', this._moveHandler);
      this._moveHandler = null;
    }
    if (this._endHandler) {
      document.removeEventListener('mouseup', this._endHandler);
      document.removeEventListener('touchend', this._endHandler);
      this._endHandler = null;
    }
  }

  /**
   * Handles mouse move for the mousemove option.
   *
   * @param e - The mouse event
   */
  private _onMouseMove(e: MouseEvent): void {
    if (!this._state.active || this._state.isDragging || !this._bounds) return;

    let position: number;
    if (this._state.orientation === 'vertical') {
      position = ((e.clientX - this._bounds.left) / this._bounds.width) * 100;
    } else {
      position = ((e.clientY - this._bounds.top) / this._bounds.height) * 100;
    }

    this._queuePositionUpdate(position);
  }

  /**
   * Updates the bounds based on the map container.
   */
  private _updateBounds(): void {
    if (this._mapContainer) {
      this._bounds = this._mapContainer.getBoundingClientRect();
    }
  }

  /**
   * Updates the slider position based on the current state.
   */
  private _updateSliderPosition(): void {
    if (!this._slider) return;

    const snapped = this._getSnappedPosition();
    if (this._state.orientation === 'vertical') {
      this._slider.style.left =
        snapped !== null ? `${snapped}px` : `${this._state.position}%`;
      // top is set via CSS class, don't override inline
    } else {
      this._slider.style.top =
        snapped !== null ? `${snapped}px` : `${this._state.position}%`;
      // left is set via CSS class, don't override inline
    }
  }

  /**
   * Updates the slider orientation.
   */
  private _updateSliderOrientation(): void {
    if (!this._slider) return;
    this._slider.className = `swipe-slider swipe-slider-${this._state.orientation}`;
    // Clear inline styles from previous orientation before applying new position
    if (this._state.orientation === 'vertical') {
      this._slider.style.top = '';
    } else {
      this._slider.style.left = '';
    }
    this._updateSliderPosition();
  }

  /**
   * Detects which corner the control is positioned in.
   *
   * @returns The position
   */
  private _getControlPosition():
    | 'top-left'
    | 'top-right'
    | 'bottom-left'
    | 'bottom-right' {
    const parent = this._container?.parentElement;
    if (!parent) return 'top-right';

    if (parent.classList.contains('maplibregl-ctrl-top-left')) return 'top-left';
    if (parent.classList.contains('maplibregl-ctrl-top-right'))
      return 'top-right';
    if (parent.classList.contains('maplibregl-ctrl-bottom-left'))
      return 'bottom-left';
    if (parent.classList.contains('maplibregl-ctrl-bottom-right'))
      return 'bottom-right';

    return 'top-right';
  }

  /**
   * Updates the panel position based on button location and control corner.
   */
  private _updatePanelPosition(): void {
    if (!this._container || !this._panel || !this._mapContainer) return;

    const button = this._container.querySelector('.swipe-control-toggle');
    if (!button) return;

    const buttonRect = button.getBoundingClientRect();
    const mapRect = this._mapContainer.getBoundingClientRect();
    const position = this._getControlPosition();

    const buttonTop = buttonRect.top - mapRect.top;
    const buttonBottom = mapRect.bottom - buttonRect.bottom;
    const buttonLeft = buttonRect.left - mapRect.left;
    const buttonRight = mapRect.right - buttonRect.right;

    const panelGap = 5;

    // Reset all positioning
    this._panel.style.top = '';
    this._panel.style.bottom = '';
    this._panel.style.left = '';
    this._panel.style.right = '';

    switch (position) {
      case 'top-left':
        this._panel.style.top = `${buttonTop + buttonRect.height + panelGap}px`;
        this._panel.style.left = `${buttonLeft}px`;
        break;

      case 'top-right':
        this._panel.style.top = `${buttonTop + buttonRect.height + panelGap}px`;
        this._panel.style.right = `${buttonRight}px`;
        break;

      case 'bottom-left':
        this._panel.style.bottom = `${buttonBottom + buttonRect.height + panelGap}px`;
        this._panel.style.left = `${buttonLeft}px`;
        break;

      case 'bottom-right':
        this._panel.style.bottom = `${buttonBottom + buttonRect.height + panelGap}px`;
        this._panel.style.right = `${buttonRight}px`;
        break;
    }
  }

  getPanelElement(): HTMLElement | null {
    return this._panel ?? null;
  }
}
