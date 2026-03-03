---
title: Edge labels
sidebar:
  label: "Labels"
---

Sigma v4 renders edge labels directly on the GPU using SDF text. Labels follow the edge path geometry and support multiple positioning modes, visibility control, and text borders.

## Enabling edge labels

Edge labels are disabled by default. Turn them on with the `renderEdgeLabels` setting:

```typescript
new Sigma(graph, container, {
  settings: {
    renderEdgeLabels: true,
  },
});
```

Label text comes from the edge's `label` attribute in graph data:

```typescript
graph.addEdge("a", "b", { label: "connects to" });
```

## Label position

Edge labels can be placed in four positions relative to the edge path:

| Position | Description |
|----------|-------------|
| `"over"` | Centered directly on the edge path |
| `"above"` | Offset above the edge path |
| `"below"` | Offset below the edge path |
| `"auto"` | GPU picks above or below based on which node is leftmost on screen |

Set the position globally via styles, or read it per-edge from an attribute:

```typescript
new Sigma(graph, container, {
  settings: { renderEdgeLabels: true },
  styles: {
    edges: [
      { labelPosition: "above" },
    ],
  },
});
```

To set position per-edge:

```typescript
graph.addEdge("a", "b", { label: "above", labelPosition: "above" });
graph.addEdge("b", "c", { label: "below", labelPosition: "below" });

new Sigma(graph, container, {
  settings: { renderEdgeLabels: true },
  styles: {
    edges: [
      { labelPosition: { attribute: "labelPosition" } },
    ],
  },
});
```

## Label visibility

By default, edge labels follow the same auto-visibility logic as node labels — sigma shows or hides them based on available space. To force a specific edge label to always display, use the `labelVisibility` style:

```typescript
new Sigma(graph, container, {
  settings: { renderEdgeLabels: true },
  styles: {
    edges: [
      { labelVisibility: "visible" },
    ],
  },
});
```

The possible values are `"auto"` (default), `"visible"` (always shown), and `"hidden"` (never shown). You can also read this per-edge from an attribute, or use a conditional style rule to show labels only on hover.

## Font size modes

Edge labels support two font size modes:

- **`"fixed"`** (default) — Labels stay at a constant pixel size regardless of zoom level.
- **`"scaled"`** — Labels scale with the camera zoom, growing when you zoom in and shrinking when you zoom out.

Font size mode is configured at the primitives level when setting up edge label rendering options.

## Text border for "over" labels

When labels are positioned `"over"` the edge, they can be hard to read against the edge color. The `textBorder` option adds an SDF-rendered border around each character for better legibility:

```typescript
import { createEdgeLabelProgram } from "sigma/rendering";

// When configuring edge label options:
{
  textBorder: {
    width: 2,
    color: "#ffffff",
  },
}
```

This renders a white outline around each character, making the label readable against any edge color.
