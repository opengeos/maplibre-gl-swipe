# maplibre-gl-swipe

[![npm version](https://img.shields.io/npm/v/maplibre-gl-swipe.svg)](https://www.npmjs.com/package/maplibre-gl-swipe)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Open in CodeSandbox](https://img.shields.io/badge/Open%20in-CodeSandbox-blue?logo=codesandbox)](https://codesandbox.io/p/github/opengeos/maplibre-gl-swipe)
[![Open in StackBlitz](https://img.shields.io/badge/Open%20in-StackBlitz-blue?logo=stackblitz)](https://stackblitz.com/github/opengeos/maplibre-gl-swipe)

A MapLibre GL plugin for swiping layers to compare them side by side.

## Features

- **Draggable slider** - Interactive slider to compare layers
- **Vertical and horizontal orientation** - Compare left/right or top/bottom
- **Programmatic API** - Set layers and position via code
- **Interactive GUI** - Panel to select layers for comparison
- **React support** - React wrapper component and hooks
- **TypeScript** - Full type definitions included
- **Customizable** - CSS classes for styling

## Installation

```bash
npm install maplibre-gl-swipe
```

## Quick Start

### Vanilla JavaScript

```typescript
import maplibregl from "maplibre-gl";
import { SwipeControl } from "maplibre-gl-swipe";
import "maplibre-gl-swipe/style.css";

const map = new maplibregl.Map({
  container: "map",
  style: "https://demotiles.maplibre.org/style.json",
  center: [-74.5, 40],
  zoom: 9,
});

map.on("load", () => {
  // Add your layers first...

  // Create swipe control
  const swipe = new SwipeControl({
    orientation: "vertical",
    position: 50,
    leftLayers: ["satellite-layer"],
    rightLayers: ["streets-layer"],
  });

  map.addControl(swipe, "top-right");

  // Listen for events
  swipe.on("slide", (e) => console.log("Position:", e.position));
});
```

### React

```tsx
import { useState, useEffect, useRef } from "react";
import maplibregl from "maplibre-gl";
import { SwipeControlReact, useSwipeState } from "maplibre-gl-swipe/react";
import "maplibre-gl-swipe/style.css";

function MapComponent() {
  const mapContainer = useRef(null);
  const [map, setMap] = useState(null);
  const { state, setPosition, setOrientation } = useSwipeState({
    position: 50,
    orientation: "vertical",
    leftLayers: ["satellite-layer"],
    rightLayers: ["streets-layer"],
  });

  useEffect(() => {
    const mapInstance = new maplibregl.Map({
      container: mapContainer.current,
      style: "https://demotiles.maplibre.org/style.json",
    });

    mapInstance.on("load", () => setMap(mapInstance));
    return () => mapInstance.remove();
  }, []);

  return (
    <>
      <div ref={mapContainer} style={{ width: "100%", height: "100%" }} />
      {map && (
        <SwipeControlReact
          map={map}
          position={state.position}
          orientation={state.orientation}
          leftLayers={state.leftLayers}
          rightLayers={state.rightLayers}
          onSlide={setPosition}
        />
      )}
    </>
  );
}
```

## API Reference

### SwipeControl

The main control class that implements MapLibre's `IControl` interface.

#### Constructor Options

| Option        | Type                         | Default         | Description                     |
| ------------- | ---------------------------- | --------------- | ------------------------------- |
| `orientation` | `'vertical' \| 'horizontal'` | `'vertical'`    | Slider orientation              |
| `position`    | `number`                     | `50`            | Initial slider position (0-100) |
| `leftLayers`  | `string[]`                   | `[]`            | Layer IDs for left/top side     |
| `rightLayers` | `string[]`                   | `[]`            | Layer IDs for right/bottom side |
| `showPanel`   | `boolean`                    | `true`          | Show layer selection panel      |
| `collapsed`   | `boolean`                    | `true`          | Panel starts collapsed          |
| `title`       | `string`                     | `'Layer Swipe'` | Panel title                     |
| `panelWidth`  | `number`                     | `280`           | Panel width in pixels           |
| `className`   | `string`                     | `''`            | Custom CSS class                |
| `mousemove`   | `boolean`                    | `false`         | Slider follows mouse            |

#### Methods

| Method                        | Description                             |
| ----------------------------- | --------------------------------------- |
| `getPosition()`               | Returns current slider position (0-100) |
| `setPosition(position)`       | Sets slider position (0-100)            |
| `getState()`                  | Returns current state object            |
| `setLeftLayers(layerIds)`     | Sets left/top side layers               |
| `setRightLayers(layerIds)`    | Sets right/bottom side layers           |
| `setOrientation(orientation)` | Sets slider orientation                 |
| `getLayers()`                 | Returns all map layers info             |
| `toggle()`                    | Toggles panel visibility                |
| `expand()`                    | Expands the panel                       |
| `collapse()`                  | Collapses the panel                     |
| `on(event, handler)`          | Registers event handler                 |
| `off(event, handler)`         | Removes event handler                   |
| `getMap()`                    | Returns map instance                    |

#### Events

| Event               | Description                    |
| ------------------- | ------------------------------ |
| `slidestart`        | Fired when slider drag starts  |
| `slide`             | Fired during slider movement   |
| `slideend`          | Fired when slider drag ends    |
| `layerchange`       | Fired when layers are changed  |
| `orientationchange` | Fired when orientation changes |
| `collapse`          | Fired when panel collapses     |
| `expand`            | Fired when panel expands       |
| `statechange`       | Fired on any state change      |

### SwipeControlReact

React wrapper component for SwipeControl.

#### Props

All `SwipeControlOptions` plus:

| Prop            | Type                                        | Description                      |
| --------------- | ------------------------------------------- | -------------------------------- |
| `map`           | `Map`                                       | MapLibre map instance (required) |
| `onSlide`       | `(position: number) => void`                | Callback for position changes    |
| `onLayerChange` | `(left: string[], right: string[]) => void` | Callback for layer changes       |
| `onStateChange` | `(state: SwipeState) => void`               | Callback for state changes       |

### useSwipeState

React hook for managing swipe control state.

```typescript
const {
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
} = useSwipeState(initialState);
```

## Examples

- [Basic Example](./examples/basic/) - Vanilla JavaScript/TypeScript
- [React Example](./examples/react/) - React integration

## Development

```bash
# Install dependencies
npm install

# Start dev server
npm run dev

# Build library
npm run build

# Run tests
npm test

# Build examples
npm run build:examples
```

## Docker

Run the examples using Docker:

```bash
# Pull from GitHub Container Registry
docker pull ghcr.io/opengeos/maplibre-gl-swipe:latest

# Run the container
docker run -p 8080:80 ghcr.io/opengeos/maplibre-gl-swipe:latest
```

Then open http://localhost:8080/maplibre-gl-swipe/ in your browser.

### Build locally

```bash
# Build the Docker image
docker build -t maplibre-gl-swipe .

# Run the container
docker run -p 8080:80 maplibre-gl-swipe
```

## License

MIT License - see [LICENSE](./LICENSE) for details.
