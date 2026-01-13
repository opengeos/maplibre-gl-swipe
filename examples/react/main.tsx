import { useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import maplibregl, { Map } from 'maplibre-gl';
import { SwipeControlReact, useSwipeState } from '../../src/react';
import '../../src/index.css';
import 'maplibre-gl/dist/maplibre-gl.css';

/**
 * Main App component demonstrating the React integration
 */
function App() {
  const mapContainer = useRef<HTMLDivElement>(null);
  const [map, setMap] = useState<Map | null>(null);
  const {
    state,
    setPosition,
    setOrientation,
    setLeftLayers,
    setRightLayers,
    toggle,
  } = useSwipeState({
    collapsed: false,
    position: 50,
    orientation: 'vertical',
    leftLayers: ['satellite-layer'],
    rightLayers: ['countries-fill', 'countries-boundary'],
  });

  // Initialize the map
  useEffect(() => {
    if (!mapContainer.current) return;

    const mapInstance = new maplibregl.Map({
      container: mapContainer.current,
      style: 'https://demotiles.maplibre.org/style.json',
      center: [-74.5, 40],
      zoom: 9,
    });

    // Add navigation controls
    mapInstance.addControl(new maplibregl.NavigationControl(), 'top-right');

    // Add fullscreen control
    mapInstance.addControl(new maplibregl.FullscreenControl(), 'top-right');

    mapInstance.on('load', () => {
      // Add a satellite raster layer
      mapInstance.addSource('satellite', {
        type: 'raster',
        tiles: [
          'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
        ],
        tileSize: 256,
        attribution:
          'Tiles &copy; Esri &mdash; Source: Esri, i-cubed, USDA, USGS, AEX, GeoEye, Getmapping, Aerogrid, IGN, IGP, UPR-EGP, and the GIS User Community',
      });

      mapInstance.addLayer(
        {
          id: 'satellite-layer',
          type: 'raster',
          source: 'satellite',
          paint: {
            'raster-opacity': 1,
          },
        },
        'countries-fill'
      );

      setMap(mapInstance);
    });

    return () => {
      mapInstance.remove();
    };
  }, []);

  const handleStateChange = (newState: typeof state) => {
    console.log('State changed:', newState);
  };

  const buttonStyle = {
    padding: '8px 16px',
    background: '#4a90d9',
    color: 'white',
    border: 'none',
    borderRadius: '4px',
    cursor: 'pointer',
    fontWeight: 500,
    fontSize: '12px',
  };

  return (
    <div style={{ width: '100%', height: '100%', position: 'relative' }}>
      <div ref={mapContainer} style={{ width: '100%', height: '100%' }} />

      {/* External controls */}
      <div
        style={{
          position: 'absolute',
          top: 10,
          left: 10,
          zIndex: 1,
          display: 'flex',
          flexDirection: 'column',
          gap: 8,
          background: 'white',
          padding: 12,
          borderRadius: 4,
          boxShadow: '0 2px 10px rgba(0,0,0,0.2)',
        }}
      >
        <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 4 }}>
          External Controls
        </div>

        <button onClick={toggle} style={buttonStyle}>
          {state.collapsed ? 'Show Panel' : 'Hide Panel'}
        </button>

        <button
          onClick={() =>
            setOrientation(
              state.orientation === 'vertical' ? 'horizontal' : 'vertical'
            )
          }
          style={buttonStyle}
        >
          {state.orientation === 'vertical'
            ? 'Switch to Horizontal'
            : 'Switch to Vertical'}
        </button>

        <div style={{ fontSize: 11, color: '#666' }}>
          Position: {state.position.toFixed(0)}%
        </div>
        <input
          type="range"
          min="0"
          max="100"
          value={state.position}
          onChange={(e) => setPosition(Number(e.target.value))}
          style={{ width: '100%' }}
        />

        <div style={{ fontSize: 10, color: '#888', marginTop: 8 }}>
          Left: {state.leftLayers.join(', ') || 'None'}
          <br />
          Right: {state.rightLayers.join(', ') || 'None'}
        </div>
      </div>

      {/* Swipe control */}
      {map && (
        <SwipeControlReact
          map={map}
          title="Layer Comparison"
          position={state.position}
          orientation={state.orientation}
          leftLayers={state.leftLayers}
          rightLayers={state.rightLayers}
          collapsed={state.collapsed}
          onSlide={setPosition}
          onLayerChange={(left, right) => {
            setLeftLayers(left);
            setRightLayers(right);
          }}
          onStateChange={handleStateChange}
        />
      )}
    </div>
  );
}

// Mount the app
const root = createRoot(document.getElementById('root')!);
root.render(<App />);
