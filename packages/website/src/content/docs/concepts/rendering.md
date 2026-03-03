---
title: Rendering
description: How sigma uses WebGL to render nodes and edges.
---

Sigma.js uses WebGL to render graphs efficiently, achieving smooth performance with tens of thousands of nodes and edges. This page explains the core rendering architecture.

## WebGL rendering

At its core, WebGL operates using two types of shaders:

- **Vertex shaders** process each vertex and determine its position on the screen.
- **Fragment shaders** determine the color of each pixel in the area bounded by vertices.

Sigma generates its shaders from the [primitives declaration](/concepts/styles-and-primitives/). When you declare shapes, layers, paths, and extremities, sigma compiles them into optimized WebGL programs. A single program can handle multiple shapes (circle, square, triangle, diamond) and multiple layers (fill, border, image, piechart) -- each node selects which shape and layers it uses through style properties.

## Node rendering

Each node is rendered as a quad (two triangles forming a rectangle) positioned at the node's coordinates and scaled to its size. The fragment shader uses **signed distance functions** (SDFs) to draw the node's shape with pixel-perfect anti-aliasing. The SDF approach means shapes scale cleanly at any zoom level without jagged edges.

Layers are composited within the fragment shader itself. For example, a node with a fill layer, a border layer, and an image layer runs all three fragment computations for every pixel, compositing them from back to front. Layers that have no data for a given node (for example, an image layer on a node without an `image` attribute) output transparent pixels automatically.

## Canvas layers

Not everything is rendered with WebGL. Sigma uses a stack of HTML elements layered on top of each other:

- **Edge WebGL layers** -- render edges
- **Edge label Canvas layer** -- render edge labels as text
- **Node WebGL layers** -- render nodes
- **Node label Canvas layer** -- render node labels as text
- **Hover Canvas layer** -- render backdrop highlights behind hovered/highlighted labels
- **Top node WebGL layer** -- re-render hovered/highlighted nodes on top
- **Mouse layer** -- captures mouse and touch interactions

Labels are drawn on Canvas because text rendering with WebGL is limited. Sigma uses an SDF-based text atlas for efficient label rendering with font shaping and glyph caching.

For more details on the layer stack, see [Layers](/concepts/layers/).

## Picking

To detect which node or edge is under the mouse cursor, sigma uses **[GPU picking](https://webglfundamentals.org/webgl/lessons/webgl-picking.html)**. It draws a hidden framebuffer where each element is rendered with a unique color encoding its identity. When the user moves the mouse, sigma reads the pixel at the cursor position from this framebuffer to identify which element is there.

This approach is efficient because it reuses the same vertex positions as the visible render -- only the fragment shader changes to output ID colors instead of visual colors. The picking framebuffer is rendered at a lower resolution (controlled by the `pickingDownSizingRatio` setting) to save memory.

Edge events use the same picking mechanism but are disabled by default for performance. Enable them with the `enableEdgeEvents` setting.

## Data textures

Node and edge attributes are uploaded to the GPU via **data textures** -- large textures where each pixel stores attribute values for one element. This allows the vertex and fragment shaders to look up any node's or edge's data by index, which is essential for features like edge clamping (adjusting edge endpoints to the boundary of non-circular shapes).

## Depth layers

Rendering order is controlled through the `depthLayers` array in the primitives declaration. Elements assigned to later depth layers are drawn on top of earlier ones. The default depth layers are:

1. `edges` -- regular edges
2. `edgeLabels` -- edge labels
3. `nodes` -- regular nodes
4. `nodeLabels` -- node labels
5. `topNodes` -- highlighted/hovered nodes
6. `topNodeLabels` -- highlighted/hovered node labels

Each depth layer gets its own WebGL draw call, with elements sorted by z-index within each layer. The `maxDepthLevels` setting controls how many depth levels sigma allocates (default: 20).

## Additional packages

Some rendering features are published as separate packages that extend the primitives system:

### Node layer packages

- **`@sigma/node-border`** -- adds the `border` layer type for configurable concentric borders
- **`@sigma/node-image`** -- adds the `image` layer type for images and pictograms inside nodes
- **`@sigma/node-piechart`** -- adds the `piechart` layer type for pie chart nodes

These packages export factory functions that you pass directly in the `layers` array:

```typescript
import { layerBorder } from "@sigma/node-border";
import { layerFill } from "sigma/rendering";

const renderer = new Sigma(graph, container, {
  primitives: {
    nodes: {
      layers: [layerFill(), layerBorder({ borders: [{ size: 0.1, color: "#333" }] })],
    },
  },
});
```

### Map layer packages

- **`@sigma/layer-leaflet`** -- integrates a [Leaflet](https://leafletjs.com/) map behind the graph
- **`@sigma/layer-maplibre`** -- integrates a [MapLibre](https://maplibre.org/) map behind the graph

### Other packages

- **`@sigma/layer-webgl`** -- custom WebGL layers (contours, heatmaps, etc.)
- **`@sigma/export-image`** -- export the current graph view as a PNG image
