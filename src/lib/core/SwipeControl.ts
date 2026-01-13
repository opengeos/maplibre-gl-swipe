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
const DEFAULT_OPTIONS: Required<Omit<SwipeControlOptions, 'className'>> & {
  className: string;
} = {
  orientation: 'vertical',
  position: 50,
  leftLayers: [],
  rightLayers: [],
  showPanel: true,
  collapsed: true,
  title: 'Layer Swipe',
  panelWidth: 280,
  className: '',
  mousemove: false,
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
  private _options: Required<Omit<SwipeControlOptions, 'className'>> & {
    className: string;
  };
  private _state: SwipeState;
  private _eventHandlers: EventHandlersMap = new globalThis.Map();
  private _bounds?: DOMRect;

  // Event handler references for cleanup
  private _resizeHandler: (() => void) | null = null;
  private _mapResizeHandler: (() => void) | null = null;
  private _moveHandler: ((e: MouseEvent | TouchEvent) => void) | null = null;
  private _endHandler: (() => void) | null = null;
  private _clickOutsideHandler: ((e: MouseEvent) => void) | null = null;
  private _mouseMoveHandler: ((e: MouseEvent) => void) | null = null;
  private _syncMoveHandler: (() => void) | null = null;
  private _syncMoveEndHandler: (() => void) | null = null;
  private _isSyncing: boolean = false;

  /**
   * Creates a new SwipeControl instance.
   *
   * @param options - Configuration options for the control
   */
  constructor(options?: Partial<SwipeControlOptions>) {
    this._options = { ...DEFAULT_OPTIONS, ...options } as Required<
      Omit<SwipeControlOptions, 'className'>
    > & { className: string };
    this._state = {
      collapsed: this._options.collapsed,
      position: this._options.position,
      orientation: this._options.orientation,
      leftLayers: [...this._options.leftLayers],
      rightLayers: [...this._options.rightLayers],
      isDragging: false,
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

    if (this._options.showPanel) {
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

    // Initial panel state
    if (this._panel && !this._state.collapsed) {
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
   * Gets information about all layers in the map.
   *
   * @returns Array of layer information
   */
  getLayers(): LayerInfo[] {
    if (!this._map) return [];

    const style = this._map.getStyle();
    if (!style || !style.layers) return [];

    return style.layers.map((layer) => ({
      id: layer.id,
      type: layer.type,
      source: (layer as { source?: string }).source || '',
      visible: this._map!.getLayoutProperty(layer.id, 'visibility') !== 'none',
    }));
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

    // Create comparison map with the same style
    const mapOptions: MapOptions = {
      container: this._comparisonContainer,
      style: currentStyle || 'https://demotiles.maplibre.org/style.json',
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

    const allLayers = this.getLayers();
    const leftSet = new Set(this._state.leftLayers);
    const rightSet = new Set(this._state.rightLayers);

    // Update main map: show left layers, hide right-only layers
    allLayers.forEach((layer) => {
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

    const position = this._state.position;

    if (this._state.orientation === 'vertical') {
      // Clip to show only the right portion (from slider to right edge)
      this._clipContainer.style.clipPath = `inset(0 0 0 ${position}%)`;
    } else {
      // Clip to show only the bottom portion (from slider to bottom edge)
      this._clipContainer.style.clipPath = `inset(${position}% 0 0 0)`;
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
      itemLabel.textContent = layer.id;
      itemLabel.title = `Type: ${layer.type}, Source: ${layer.source}`;

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

    this.setPosition(position);
  }

  /**
   * Handles the end of a drag operation.
   */
  private _onDragEnd(): void {
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
    if (this._state.isDragging || !this._bounds) return;

    let position: number;
    if (this._state.orientation === 'vertical') {
      position = ((e.clientX - this._bounds.left) / this._bounds.width) * 100;
    } else {
      position = ((e.clientY - this._bounds.top) / this._bounds.height) * 100;
    }

    this.setPosition(position);
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
    if (!this._slider || !this._bounds) return;

    if (this._state.orientation === 'vertical') {
      const x = (this._state.position / 100) * this._bounds.width;
      this._slider.style.left = `${x}px`;
      this._slider.style.top = '0';
      this._slider.style.transform = 'translateX(-50%)';
    } else {
      const y = (this._state.position / 100) * this._bounds.height;
      this._slider.style.top = `${y}px`;
      this._slider.style.left = '0';
      this._slider.style.transform = 'translateY(-50%)';
    }
  }

  /**
   * Updates the slider orientation.
   */
  private _updateSliderOrientation(): void {
    if (!this._slider) return;
    this._slider.className = `swipe-slider swipe-slider-${this._state.orientation}`;
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
}
