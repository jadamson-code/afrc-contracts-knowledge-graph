---
title: Geographic map layers
description: How to overlay sigma on Leaflet or MapLibre maps.
sidebar:
  label: "Map layers"
---

Sigma.js can render graphs on top of geographic maps using the `@sigma/layer-leaflet` or `@sigma/layer-maplibre` packages. Both work the same way: they synchronize a map layer with sigma's camera so that nodes are positioned by latitude and longitude.

## Installation

Pick the package that matches your preferred map provider:

```bash
# Leaflet
npm install @sigma/layer-leaflet leaflet

# MapLibre
npm install @sigma/layer-maplibre maplibre-gl
```

## Basic usage with Leaflet

```typescript
import Graph from "graphology";
import Sigma from "sigma";
import bindLeafletLayer from "@sigma/layer-leaflet";

const graph = new Graph();
graph.addNode("paris", {
  label: "Paris",
  x: 0,
  y: 0,
  size: 10,
  latitude: 48.8566,
  longitude: 2.3522,
});
graph.addNode("london", {
  label: "London",
  x: 0,
  y: 0,
  size: 10,
  latitude: 51.5074,
  longitude: -0.1278,
});
graph.addEdge("paris", "london");

const renderer = new Sigma(graph, document.getElementById("container"));

const { clean, map } = bindLeafletLayer(renderer, {
  getNodeLatLng: (attrs) => ({ lat: attrs.latitude, lng: attrs.longitude }),
});
```

Set `x: 0, y: 0` on every node -- the map layer overwrites these coordinates with projected positions. If you omit `getNodeLatLng`, the layer reads `lat` and `lng` directly from node attributes.

## Basic usage with MapLibre

```typescript
import bindMaplibreLayer from "@sigma/layer-maplibre";

const { clean, map } = bindMaplibreLayer(renderer, {
  getNodeLatLng: (attrs) => ({ lat: attrs.latitude, lng: attrs.longitude }),
  mapOptions: {
    style: "https://basemaps.cartocdn.com/gl/positron-gl-style/style.json",
  },
});
```

The `mapOptions` object is passed directly to the MapLibre `Map` constructor (minus a few keys sigma controls internally).

## Custom tile layer (Leaflet)

By default, `@sigma/layer-leaflet` uses OpenStreetMap tiles. You can provide a different tile source:

```typescript
bindLeafletLayer(renderer, {
  tileLayer: {
    urlTemplate: "https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png",
    attribution: '&copy; <a href="https://carto.com/">CARTO</a>',
  },
  getNodeLatLng: (attrs) => ({ lat: attrs.lat, lng: attrs.lng }),
});
```

## Cleanup

Both `bindLeafletLayer` and `bindMaplibreLayer` return a `clean` function that removes the map layer and restores sigma's original settings:

```typescript
const { clean } = bindLeafletLayer(renderer, { /* ... */ });

// Later, to remove the map:
clean();
```

## Key constraints

- **Camera rotation is disabled** while the map layer is active.
- **Stage padding is set to 0** so that sigma and the map share the same bounding box.
- Both constraints are restored when you call `clean()`.
