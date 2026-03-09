---
title: Layers
description: How sigma's multi-layer rendering stack works.
---

Sigma renders the graph using **multiple layers** stacked inside the container element. Each layer is an HTML canvas with `position: absolute; inset: 0;`.

## Built-in layers

Sigma creates four layers:

- **`stage`** (WebGL): The main rendering surface. All nodes, edges, backdrops, and GPU-rendered labels are drawn here. A hidden picking framebuffer handles hit detection.
- **`edgeLabels`** (Canvas): Edge labels rendered via SDF text.
- **`labels`** (Canvas): Node labels rendered via Canvas 2D.
- **`mouse`**: A transparent layer on top that captures all interaction events (mouse, touch).

Depth ordering within the `stage` layer is controlled by **depth layers** declared in `primitives.depthLayers`. The defaults are:

```typescript
["edges", "edgeLabels", "nodes", "nodeLabels", "topNodes", "topNodeLabels"];
```

Style properties like `depth` and `labelDepth` assign elements to specific depth layers. For example, highlighted nodes can be rendered on top by setting `depth: "topNodes"`.

## Adding custom layers

### HTML overlays

The simplest approach is to insert an HTML element next to the sigma container. To keep interactions working, put the `mouse` layer back on top with `z-index`:

```css
.sigma-mouse {
  z-index: 1;
}
```

This is used in the [cluster labels](/examples/cluster-labels/) example to display HTML labels over the graph.

### Custom Canvas or WebGL layers

Sigma exposes `createCanvas()` to insert a new canvas into the layer stack:

```typescript
const canvas = renderer.createCanvas("my-layer", { afterLayer: "labels" });
const ctx = canvas.getContext("2d");
```

The `beforeLayer` and `afterLayer` options control where the canvas is inserted relative to existing layers. Layers created this way are automatically cleaned up when `kill()` is called.

For WebGL layers, use `createWebGLContext()` and `createCanvasContext()` which also set up the rendering context.
