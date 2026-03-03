---
title: Rendering
description: How sigma uses WebGL to render nodes and edges.
---

:::caution[Work in progress]
This page is being rewritten for sigma.js v4's new primitives/layers rendering architecture.
:::

Sigma.js utilizes WebGL to render nodes and edges efficiently. WebGL is a JavaScript API designed for rendering 2D and 3D graphics in web browsers without requiring plugins.

## Core rendering

At its core, WebGL operates using two main components:

- **Vertex Shaders**: Process each vertex and determine its position on the screen.
- **Fragment Shaders**: Determine the color of each pixel in the area bounded by vertices.

## Picking

To detect collision between the mouse cursor and nodes or edges, sigma uses **[GPU picking](https://webglfundamentals.org/webgl/lessons/webgl-picking.html)**: it draws a hidden image where each element has a unique color, then reads the pixel at the mouse position to identify which element is there.

## Additional packages

Some programs are published as additional packages:

- **`@sigma/node-image`**: Image-filled nodes
- **`@sigma/node-border`**: Bordered nodes
- **`@sigma/node-piechart`**: Pie chart nodes
- **`@sigma/edge-curve`**: Curved edges

Additional layers for contextual information:

- **`@sigma/layer-leaflet`**: Leaflet map integration
- **`@sigma/layer-maplibre`**: MapLibre map integration
- **`@sigma/layer-webgl`**: Custom WebGL layers
