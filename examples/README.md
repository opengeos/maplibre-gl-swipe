# Examples

This directory contains example implementations of the MapLibre GL Swipe plugin.

## Basic Example

A vanilla JavaScript/TypeScript example showing how to use the SwipeControl directly.

[View Basic Example](./basic/)

Features demonstrated:
- Adding the SwipeControl to a map
- Configuring left and right layers
- Listening to events (slide, layerchange, orientationchange)
- Programmatic control

## React Example

A React example demonstrating the React wrapper component and custom hooks.

[View React Example](./react/)

Features demonstrated:
- Using `SwipeControlReact` component
- Using `useSwipeState` hook for state management
- Syncing external controls with the swipe control
- Two-way data binding

## Running Examples Locally

```bash
# Install dependencies
npm install

# Start development server
npm run dev

# Open in browser
# http://localhost:5173/
```

## Building Examples

```bash
# Build examples for deployment
npm run build:examples

# Preview built examples
npm run preview
```
