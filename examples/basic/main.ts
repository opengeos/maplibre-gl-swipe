import maplibregl from 'maplibre-gl';
import { SwipeControl } from '../../src/index';
import '../../src/index.css';
import 'maplibre-gl/dist/maplibre-gl.css';

// Create map
const map = new maplibregl.Map({
  container: 'map',
  style: 'https://demotiles.maplibre.org/style.json',
  center: [-74.5, 40],
  zoom: 9,
});

// Add navigation controls
map.addControl(new maplibregl.NavigationControl(), 'top-left');

// Add fullscreen control
map.addControl(new maplibregl.FullscreenControl(), 'top-left');

// Add swipe control and layers when map loads
map.on('load', () => {
  // Add a satellite raster layer for comparison
  map.addSource('satellite', {
    type: 'raster',
    tiles: [
      'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
    ],
    tileSize: 256,
    attribution:
      'Tiles &copy; Esri &mdash; Source: Esri, i-cubed, USDA, USGS, AEX, GeoEye, Getmapping, Aerogrid, IGN, IGP, UPR-EGP, and the GIS User Community',
  });

  map.addLayer({
    id: 'satellite-layer',
    type: 'raster',
    source: 'satellite',
    paint: {
      'raster-opacity': 1,
    },
  });

  // Add OpenStreetMap raster layer
  map.addSource('osm', {
    type: 'raster',
    tiles: ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'],
    tileSize: 256,
    attribution:
      '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
  });

  map.addLayer({
    id: 'osm-layer',
    type: 'raster',
    source: 'osm',
    paint: {
      'raster-opacity': 1,
    },
  });

  // Create swipe control with satellite on left, OSM on right
  const swipe = new SwipeControl({
    orientation: 'vertical',
    position: 50,
    leftLayers: ['satellite-layer'],
    rightLayers: ['osm-layer'],
    showPanel: true,
    collapsed: false,
    title: 'Layer Comparison',
    panelWidth: 280,
    active: false,
  });

  // Add control to the map
  map.addControl(swipe, 'top-right');

});
